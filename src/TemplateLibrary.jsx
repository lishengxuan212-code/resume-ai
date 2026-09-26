import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, FilePdf, ShieldCheck } from '@phosphor-icons/react';
import { PdfDocument } from './ResumePreview';

export function TemplateLibrary({ fileInput, privacyAccepted, consentSubmitting, onAcceptPrivacy, onUse, onBack }) {
  const heading = useRef(null);
  const [preview, setPreview] = useState({ blob: null, error: '' });
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/assets/recommended-template-preview.pdf', { signal: controller.signal })
      .then(response => response.ok ? response.blob() : Promise.reject(new Error('模板预览暂时无法打开。')))
      .then(blob => setPreview({ blob, error: '' }))
      .catch(error => { if (error.name !== 'AbortError') setPreview({ blob: null, error: error.message }); });
    return () => controller.abort();
  }, []);
  return <div className="template-page">
    {fileInput}
    <header className="review-topbar template-topbar"><div className="review-brand"><span className="wordmark">简历</span><span className="breadcrumb-divider">/</span><span>模板库</span></div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} />返回</button></header>
    <main className="template-library-page">
      <div className="template-page-intro"><p className="eyebrow">先看成品，再开始整理材料</p><h1 ref={heading} tabIndex={-1}>你最终会得到这样的简历</h1><p>当前开放一套经过中文排版检查的推荐模板。实际页数和内容密度会根据你的真实材料自然变化。</p></div>
      <section className="template-showcase" aria-label="推荐简历模板">
        <div className="template-document" aria-label="推荐模板示例">
          {preview.blob && <PdfDocument blob={preview.blob} sample />}
          {!preview.blob && !preview.error && <div className="template-preview-status"><FilePdf size={24} /><span>正在打开模板预览</span></div>}
          {preview.error && <div className="template-preview-status is-error"><span>{preview.error}</span></div>}
        </div>
        <aside className="template-detail">
          <div><span className="template-kicker">推荐模板 · 已开放</span><h2>中文单栏</h2><p>白底黑字、A4 版式。姓名与联系方式置于顶部，教育、经历和技能按清晰层级呈现。</p></div>
          <ul>
            <li><CheckCircle size={18} weight="fill" />中文字体已内置</li>
            <li><CheckCircle size={18} weight="fill" />长内容自然换行与分页</li>
            <li><CheckCircle size={18} weight="fill" />预览与下载使用同一份 PDF</li>
          </ul>
          <div className="template-trust-note"><ShieldCheck size={20} /><p><strong>版式与内容分开处理</strong><span>选择模板不会改变你的经历；上传后仍会先进入材料核对。</span></p></div>
          {!privacyAccepted && <label className="privacy-consent template-privacy"><input type="checkbox" checked={false} disabled={consentSubmitting} onChange={event => { if (event.target.checked) void onAcceptPrivacy(); }} /><span>我已阅读并同意<a href="/privacy.html" target="_blank" rel="noreferrer">隐私说明</a>，了解简历文字会用于当前处理并发送至第三方文本处理平台。</span></label>}
          <button className="button primary template-use-button" type="button" disabled={!privacyAccepted || consentSubmitting} onClick={onUse}>{privacyAccepted ? '使用此模板并上传简历' : consentSubmitting ? '正在保存隐私选择' : '同意隐私说明后上传'}<ArrowRight size={18} /></button>
          <small>示例使用虚构信息，仅展示版式。当前模板不承诺所有内容都压缩在一页。</small>
        </aside>
      </section>
    </main>
  </div>;
}
