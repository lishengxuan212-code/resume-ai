import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePdf, Minus, Plus, WarningCircle } from '@phosphor-icons/react';
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
  const [state, setState] = useState({ key: '', blob: null, loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState({ key: '', blob: null, loading: true, error: '' });
      try {
        const { facts: currentFacts, resume: currentResume, templateId: currentTemplate, presentation: currentPresentation } = JSON.parse(snapshot);
        const blob = await requestResumePdf(currentFacts, currentResume, currentTemplate, currentPresentation, controller.signal);
        if (!controller.signal.aborted) setState({ key: snapshot, blob, loading: false, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message || '排版预览暂时无法更新。' }));
      }
    }, 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [snapshot]);
  return { ...state, current: state.key === snapshot };
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

  return <div className="resume-preview-page" ref={pageRef} aria-label={`简历第 ${pageNumber} 页`}>
    <canvas ref={canvasRef} />
    <div className="resume-preview-text-layer" ref={textRef} aria-hidden="true" />
    {!visible && <span className="resume-preview-page-placeholder">滚动到此处加载第 {pageNumber} 页</span>}
    {error && <span className="resume-preview-page-error">{error}</span>}
  </div>;
}

function PdfDocument({ blob }) {
  const [document, setDocument] = useState(null);
  const [pdfjs, setPdfjs] = useState(null);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1.13);
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
        if (cancelled) { await next.destroy(); return; }
        loadedDocument = next;
        setDocument(next);
        setError('');
      } catch {
        if (!cancelled) setError('PDF 页面暂时无法打开。请重新生成预览后再试。');
      }
    };
    void load();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
      loadedDocument?.destroy();
    };
  }, [blob]);
  if (error) return <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{error}</span></div>;
  if (!document || !pdfjs) return <div className="resume-preview-message"><FilePdf size={20} /><span>正在准备 PDF 页面。</span></div>;
  return <div className="resume-preview-viewer">
    <div className="resume-preview-zoom" aria-label="预览缩放">
      <button type="button" aria-label="缩小预览" onClick={() => setScale(current => Math.max(0.8, Number((current - 0.12).toFixed(2))))}><Minus size={15} /></button>
      <span>{Math.round(scale * 100)}%</span>
      <button type="button" aria-label="放大预览" onClick={() => setScale(current => Math.min(1.5, Number((current + 0.12).toFixed(2))))}><Plus size={15} /></button>
    </div>
    <div className="resume-preview-pages">{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={`${document.fingerprint}-${index + 1}-${scale}`} document={document} TextLayer={pdfjs.TextLayer} pageNumber={index + 1} scale={scale} />)}</div>
  </div>;
}

export function ResumePreview({ facts, resume, templateId, templates, presentation, onTemplateId, onPdf }) {
  const preview = useResumePreview(facts, resume, templateId, presentation);
  useEffect(() => { onPdf?.(preview.current && !preview.loading && !preview.error ? preview.blob : null); }, [onPdf, preview.blob, preview.current, preview.error, preview.loading]);
  return <section className="resume-preview" id="result-preview" aria-label="排版预览">
    <div className="resume-preview-toolbar">
      <div><p className="result-label">排版预览</p><p>{preview.loading ? '正在更新当前内容的 PDF…' : preview.error ? '预览未更新' : '预览与下载使用同一份 PDF'}</p></div>
      <label>模板<select aria-label="选择简历模板" value={templateId} onChange={event => onTemplateId(event.target.value)} disabled={preview.loading}>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    </div>
    {preview.error ? <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{preview.error} 修改内容仍保留；请稍后重试预览或直接重新下载。</span></div>
      : preview.blob ? <PdfDocument blob={preview.blob} />
        : <div className="resume-preview-message"><FilePdf size={20} /><span>正在生成真实分页预览。</span></div>}
  </section>;
}
