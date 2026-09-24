import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle, Lightbulb, Question } from '@phosphor-icons/react';

export function DiagnosisPage({ diagnosis, busy, statusText, error, optimizationUnavailable, optimizationMessage, onBack, onOptimize }) {
  const heading = useRef(null);
  const [answers, setAnswers] = useState(() => Object.fromEntries(diagnosis.questions.map(item => [item.id, ''])));
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const answered = diagnosis.questions.flatMap(item => answers[item.id]?.trim() ? [{ questionId: item.id, answer: answers[item.id].trim() }] : []);
  return <div className="review-page diagnosis-page">
    <header className="review-topbar"><div className="review-brand"><span className="wordmark">简历</span><span className="breadcrumb-divider">/</span><span>材料诊断</span></div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} />返回修改材料</button></header>
    <div className="review-intro"><div><p className="eyebrow">方法论版本 {diagnosis.methodologyVersion}</p><h1 ref={heading} tabIndex={-1}>优化前，再确认几件重要的事</h1><p>这里只询问会实质影响表达的事实；不回答也能继续。</p></div></div>
    <main className="diagnosis-workspace">
      <section className="diagnosis-card"><div className="review-section-heading"><h2>材料诊断</h2><span>{diagnosis.findings.length} 项发现</span></div>
        {!diagnosis.findings.length && <p className="empty-section"><CheckCircle size={18} />现有材料没有发现必须补充的问题，可以直接优化。</p>}
        <div className="finding-list">{diagnosis.findings.map((item, index) => <article key={`${item.dimension}-${index}`}><p className="finding-dimension">{item.dimension}</p><h3>{item.issue}</h3><p>{item.suggestedAction}</p></article>)}</div>
      </section>
      {!!diagnosis.questions.length && <section className="diagnosis-card"><div className="review-section-heading"><h2>补充问题</h2><span>仅展示确实影响表达的事实 · 均可跳过</span></div>
        {diagnosis.questions.map((item, index) => <div className="diagnosis-question" key={item.id}><span><Question size={17} />问题 {index + 1}</span><strong>{item.question}</strong><small>{item.reason}</small><div className="diagnosis-suggestion"><span><Lightbulb size={16} />可作为优化方向，最终会结合你的材料重新组织</span><p>{item.suggestedRewrite}</p><button type="button" disabled={busy} onClick={() => setAnswers({ ...answers, [item.id]: item.suggestedRewrite })}>以此为优化方向</button></div><label><span className="visually-hidden">问题 {index + 1} 的回答</span><textarea value={answers[item.id]} disabled={busy} maxLength={3000} placeholder="补充真实情况；建议表达只作方向，最终会重新组织。" onChange={event => setAnswers({ ...answers, [item.id]: event.target.value })} /></label></div>)}
      </section>}
      <section className="diagnosis-actions" aria-busy={busy}><p className={error ? 'error' : 'processing-status'}>{error || optimizationMessage || statusText}</p><div><button className="button secondary" disabled={busy || optimizationUnavailable} onClick={() => onOptimize([], true)}>跳过问题，按现有材料优化</button><button className="button primary" disabled={busy || optimizationUnavailable} onClick={() => onOptimize(answered, false)}>{busy ? '正在优化简历…' : '使用补充事实优化'}<ArrowUpRight size={18} /></button></div></section>
    </main>
  </div>;
}
