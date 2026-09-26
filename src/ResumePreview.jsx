import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, CircleNotch, DownloadSimple, FilePdf, Minus, Plus, WarningCircle, X } from '@phosphor-icons/react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { requestResumePdf } from './api';

let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ||= import('pdfjs-dist/build/pdf.mjs').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

function useResumePreview(facts, resume, templateId, presentation) {
  const snapshot = useMemo(() => JSON.stringify({ facts, resume, templateId, presentation }), [facts, resume, templateId, presentation]);
  const cache = useRef(new Map());
  const request = useRef(null);
  const [state, setState] = useState({ key: '', blob: null, loading: false, error: '' });
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    const cached = cache.current.get(snapshot);
    setState(cached ? { key: snapshot, blob: cached, loading: false, error: '' } : { key: '', blob: null, loading: false, error: '' });
  }, [snapshot]);
  const generate = useCallback(async () => {
    const cached = cache.current.get(snapshot);
    if (cached) { setState({ key: snapshot, blob: cached, loading: false, error: '' }); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ key: '', blob: null, loading: true, error: '' });
    try {
      const { facts: currentFacts, resume: currentResume, templateId: currentTemplate, presentation: currentPresentation } = JSON.parse(snapshot);
      const blob = await requestResumePdf(currentFacts, currentResume, currentTemplate, currentPresentation, controller.signal);
      if (controller.signal.aborted) return;
      cache.current.set(snapshot, blob);
      setState({ key: snapshot, blob, loading: false, error: '' });
    } catch (error) {
      if (!controller.signal.aborted) setState({ key: '', blob: null, loading: false, error: error.message || '排版预览暂时无法生成。' });
    }
  }, [snapshot]);
  return { ...state, current: state.key === snapshot, generate, cached: cache.current.has(snapshot) };
}

function PdfPage({ document, TextLayer: PdfTextLayer, pageNumber, scale }) {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = pageRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '700px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !document || !canvasRef.current || !textRef.current) return undefined;
    let cancelled = false;
    let renderTask;
    const render = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const textLayer = textRef.current;
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        textLayer.replaceChildren();
        textLayer.style.width = `${Math.ceil(viewport.width)}px`;
        textLayer.style.height = `${Math.ceil(viewport.height)}px`;
        renderTask = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, transform: [outputScale, 0, 0, outputScale, 0, 0] });
        const textTask = new PdfTextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();
        await Promise.all([renderTask.promise, textTask]);
        if (!cancelled) setError('');
      } catch (reason) {
        if (!cancelled && reason?.name !== 'RenderingCancelledException') setError('该页暂时无法显示。');
      }
    };
    void render();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, pageNumber, scale, visible]);
  return <div className="resume-preview-page" ref={pageRef} aria-label={`简历第 ${pageNumber} 页`}><canvas ref={canvasRef} /><div className="resume-preview-text-layer" ref={textRef} aria-hidden="true" />{!visible && <span className="resume-preview-page-placeholder">滚动到此处加载第 {pageNumber} 页</span>}{error && <span className="resume-preview-page-error">{error}</span>}</div>;
}

export function PdfDocument({ blob, modal = false, sample = false }) {
  const [document, setDocument] = useState(null);
  const [pdfjs, setPdfjs] = useState(null);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(sample ? 1 : modal ? 1 : 1.13);
  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    let loadedDocument;
    setDocument(null);
    const load = async () => {
      try {
        const module = await loadPdfjs();
        if (cancelled) return;
        setPdfjs(module);
        loadingTask = module.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const next = await loadingTask.promise;
        if (cancelled) { await next.destroy?.(); return; }
        loadedDocument = next;
        setDocument(next);
        setError('');
      } catch {
        if (!cancelled) setError('PDF 页面暂时无法打开。请重新生成预览后再试。');
      }
    };
    void load();
    return () => { cancelled = true; loadingTask?.destroy?.(); loadedDocument?.destroy?.(); };
  }, [blob]);
  if (error) return <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{error}</span></div>;
  if (!document || !pdfjs) return <div className="resume-preview-message"><FilePdf size={20} /><span>正在准备 PDF 页面。</span></div>;
  return <div className={`resume-preview-viewer ${modal ? 'is-modal-viewer' : ''} ${sample ? 'is-template-sample' : ''}`}>{!sample && <div className="resume-preview-zoom" aria-label="预览缩放"><button type="button" aria-label="缩小预览" onClick={() => setScale(current => Math.max(0.8, Number((current - 0.12).toFixed(2))))}><Minus size={15} /></button><span>{Math.round(scale * 100)}%</span><button type="button" aria-label="放大预览" onClick={() => setScale(current => Math.min(1.5, Number((current + 0.12).toFixed(2))))}><Plus size={15} /></button></div>}<div className="resume-preview-pages">{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={`${document.fingerprint}-${index + 1}-${scale}`} document={document} TextLayer={pdfjs.TextLayer} pageNumber={index + 1} scale={scale} />)}</div></div>;
}

function PreviewModal({ preview, onClose, onDownload }) {
  return <div className="resume-preview-modal" role="dialog" aria-modal="true" aria-label="PDF 排版预览"><div className="resume-preview-modal-backdrop" onClick={onClose} /><section className="resume-preview-modal-surface"><header><div><p className="result-label">推荐模板 · PDF 排版预览</p><h3>{preview.loading ? '正在生成你的简历' : '与你下载的 PDF 完全一致'}</h3></div><button type="button" className="resume-preview-close" aria-label="关闭 PDF 预览" onClick={onClose}><X size={20} /></button></header><div className="resume-preview-modal-body">{preview.loading && <div className="resume-preview-loading"><CircleNotch size={30} weight="bold" /><strong>正在排版并生成 PDF</strong><span>文字会自然换行和分页，完成后直接在这里展示。</span></div>}{preview.error && <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{preview.error} 请关闭后重新生成。</span></div>}{preview.current && preview.blob && <PdfDocument blob={preview.blob} modal />}<aside className="resume-preview-modal-actions">{preview.current && preview.blob ? <><span><CheckCircle weight="fill" size={17} />PDF 已就绪</span><button className="button primary" type="button" onClick={onDownload}><DownloadSimple size={18} />下载 PDF</button><small>下载内容与左侧预览完全一致。</small></> : <span>{preview.loading ? '生成完成后可直接下载。' : '预览未生成。'}</span>}</aside></div></section></div>;
}

export function ResumePreview({ facts, resume, presentation, onPdf, onDownload }) {
  const preview = useResumePreview(facts, resume, 'recommended', presentation);
  const initialGeneration = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { onPdf?.(preview.current && !preview.loading && !preview.error ? preview.blob : null); }, [onPdf, preview.blob, preview.current, preview.error, preview.loading]);
  useEffect(() => {
    if (initialGeneration.current) return;
    initialGeneration.current = true;
    void preview.generate();
  }, [preview.generate]);
  const hasCurrentPdf = preview.current && preview.blob;
  const openPreview = () => { setModalOpen(true); if (!hasCurrentPdf && !preview.loading) void preview.generate(); };
  const status = preview.loading ? '推荐模板正在后台生成 PDF。' : hasCurrentPdf ? '推荐模板 PDF 已生成，可以直接查看和下载。' : preview.error ? `${preview.error} 请重新生成。` : '推荐模板将在后台生成。';
  const action = preview.loading ? '查看生成进度' : hasCurrentPdf ? '查看并下载 PDF' : preview.error ? '重新生成 PDF' : initialGeneration.current ? '生成更新后的 PDF' : '生成 PDF';
  return <section className="resume-preview recommended-preview" id="result-preview" aria-label="推荐模板 PDF 预览"><div className="resume-preview-toolbar"><div><p className="result-label">推荐模板</p><h3>PDF 已在后台排版</h3><p>{status}</p></div><button className="button primary" type="button" onClick={openPreview}>{preview.loading && <CircleNotch size={17} className="is-spinning" />}{!preview.loading && <FilePdf size={17} />}{action}</button></div>{modalOpen && <PreviewModal preview={preview} onClose={() => setModalOpen(false)} onDownload={() => onDownload?.()} />}</section>;
}
