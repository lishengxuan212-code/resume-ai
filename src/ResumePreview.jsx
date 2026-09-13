import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, CircleNotch, DownloadSimple, FilePdf, Layout, Minus, Plus, Sparkle, WarningCircle, X } from '@phosphor-icons/react';
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

function PdfDocument({ blob, modal = false }) {
  const [document, setDocument] = useState(null);
  const [pdfjs, setPdfjs] = useState(null);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(modal ? 1 : 1.13);
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
    return () => { cancelled = true; loadingTask?.destroy(); loadedDocument?.destroy(); };
  }, [blob]);
  if (error) return <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{error}</span></div>;
  if (!document || !pdfjs) return <div className="resume-preview-message"><FilePdf size={20} /><span>正在准备 PDF 页面。</span></div>;
  return <div className={`resume-preview-viewer ${modal ? 'is-modal-viewer' : ''}`}><div className="resume-preview-zoom" aria-label="预览缩放"><button type="button" aria-label="缩小预览" onClick={() => setScale(current => Math.max(0.8, Number((current - 0.12).toFixed(2))))}><Minus size={15} /></button><span>{Math.round(scale * 100)}%</span><button type="button" aria-label="放大预览" onClick={() => setScale(current => Math.min(1.5, Number((current + 0.12).toFixed(2))))}><Plus size={15} /></button></div><div className="resume-preview-pages">{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={`${document.fingerprint}-${index + 1}-${scale}`} document={document} TextLayer={pdfjs.TextLayer} pageNumber={index + 1} scale={scale} />)}</div></div>;
}

const templateCopy = {
  recommended: ['推荐', '右上方形头像、顶部教育信息、经历粗分隔线'],
  classic: ['经典', '宋体风格、稳妥单栏、适合通用投递'],
  minimal: ['简约', '留白更充足、层级更舒展'],
  sidebar: ['紧凑', '信息密度更高、仍保持单栏阅读'],
};

function ExampleBlock({ title, children }) {
  return <section className="template-example-section"><h5>{title}</h5>{children}</section>;
}

function TemplateThumbnail({ id }) {
  return <div className={`template-thumbnail is-${id}`} aria-label="匿名简历排版示意"><div className="template-example-header"><div><strong>周晨</strong><span>产品运营实习生</span><small>138 0000 0000 · demo@example.com</small></div>{id !== 'minimal' && <i aria-hidden="true" />}</div><ExampleBlock title="教育背景"><p><b>北京大学</b><em>2020.09 – 2024.06</em></p><small>新闻与传播学 · 本科</small></ExampleBlock><ExampleBlock title="实习经历"><p><b>产品运营实习生</b><em>2024.03 – 至今</em></p><small>星河科技</small><ul><li>用户洞察与活动复盘</li><li>会员分层与转化跟进</li></ul></ExampleBlock><ExampleBlock title="项目经历"><p><b>校园增长项目</b></p><ul><li>梳理需求并推进上线</li></ul></ExampleBlock></div>;
}

function PreviewModal({ preview, onClose, onDownload }) {
  return <div className="resume-preview-modal" role="dialog" aria-modal="true" aria-label="PDF 排版预览"><div className="resume-preview-modal-backdrop" onClick={onClose} /><section className="resume-preview-modal-surface"><header><div><p className="result-label">PDF 排版预览</p><h3>{preview.loading ? '正在生成你的简历' : '与你下载的 PDF 完全一致'}</h3></div><button type="button" className="resume-preview-close" aria-label="关闭 PDF 预览" onClick={onClose}><X size={20} /></button></header><div className="resume-preview-modal-body">{preview.loading && <div className="resume-preview-loading"><CircleNotch size={30} weight="bold" /><strong>正在排版并生成 PDF</strong><span>文字会自然换行和分页，完成后直接在这里展示。</span></div>}{preview.error && <div className="resume-preview-message" role="alert"><WarningCircle size={20} /><span>{preview.error} 返回模板库后可以重新生成。</span></div>}{preview.current && preview.blob && <PdfDocument blob={preview.blob} modal />}<aside className="resume-preview-modal-actions">{preview.current && preview.blob ? <><span><CheckCircle weight="fill" size={17} />PDF 已就绪</span><button className="button primary" type="button" onClick={onDownload}><DownloadSimple size={18} />下载 PDF</button><small>下载内容与左侧预览完全一致。</small></> : <span>{preview.loading ? '生成完成后可直接下载。' : '预览未生成。'}</span>}</aside></div></section></div>;
}

export function ResumePreview({ facts, resume, templateId, templates, presentation, onTemplateId, onPdf, onDownload }) {
  const preview = useResumePreview(facts, resume, templateId, presentation);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { onPdf?.(preview.current && !preview.loading && !preview.error ? preview.blob : null); }, [onPdf, preview.blob, preview.current, preview.error, preview.loading]);
  const selected = templates.find(template => template.id === templateId);
  const generate = () => { setModalOpen(true); void preview.generate(); };
  return <section className="resume-preview" id="result-preview" aria-label="排版预览"><div className="resume-preview-toolbar"><div><p className="result-label">排版预览</p><p>选择模板后生成真实 PDF；修改内容不会自动重复排版。</p></div><button className="template-library-trigger" type="button" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(open => !open)}><Layout size={16} />{libraryOpen ? '收起模板库' : '打开模板库'}</button></div>{libraryOpen && <section className="template-library" aria-label="选择简历模板"><div className="template-library-heading"><div><p className="result-label">模板库</p><h3>选择一个排版方向</h3><p>每张卡片展示真实信息层级和版式；选择不会关闭模板库。</p></div><Sparkle size={22} /></div><div className="template-grid">{templates.map(template => { const [fallbackName, description] = templateCopy[template.id] ?? [template.name, '单栏中文简历模板']; const active = template.id === templateId; return <button type="button" className={`template-card ${active ? 'is-selected' : ''}`} key={template.id} aria-pressed={active} onClick={() => onTemplateId(template.id)}><TemplateThumbnail id={template.id} /><span><strong>{template.name || fallbackName}</strong><small>{description}</small></span>{active && <CheckCircle weight="fill" size={18} />}</button>; })}</div><div className="template-library-actions"><span>{preview.cached ? '当前内容的这套模板已生成过，可直接打开。' : `已选择：${selected?.name || '模板'}`}</span><button className="button primary" type="button" disabled={preview.loading} onClick={generate}>{preview.cached ? '打开已有 PDF' : '生成预览 PDF'}<FilePdf size={17} /></button></div></section>}{modalOpen && <PreviewModal preview={preview} onClose={() => setModalOpen(false)} onDownload={() => onDownload?.()} />}</section>;
}
