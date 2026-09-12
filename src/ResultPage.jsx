import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, DownloadSimple, PencilSimple, Sparkle } from '@phosphor-icons/react';

const providerNames = { openai: 'OpenAI', deepseek: 'DeepSeek', qwen: '通义千问' };
const canonicalHeading = heading => /^(专业技能|核心技能|技能清单|专业能力|技能)$/.test(heading?.trim()) ? '技能' : heading;
const genericSkillTitle = title => /^(专业技能|核心技能|技能清单|专业能力|技能)$/.test(title?.trim());
const presentBullet = bullet => {
  const text = typeof bullet === 'string' ? bullet : bullet?.text || '';
  const inferredTitle = text.split(/[：:，,。；;]/, 1)[0].replace(/^(负责|参与|协助|主导)/, '').trim().slice(0, 18);
  return { title: typeof bullet === 'object' && bullet?.title?.trim() ? bullet.title : inferredTitle, text };
};

function AutoTextarea({ value, onChange, className, maxLength, label }) {
  const field = useRef(null);
  useEffect(() => {
    if (!field.current) return;
    field.current.style.height = '0px';
    field.current.style.height = `${field.current.scrollHeight}px`;
  }, [value]);
  return <textarea ref={field} className={className} value={value} maxLength={maxLength} aria-label={label} onChange={event => onChange(event.target.value)} />;
}

function SectionEditControl({ editing, label, onToggle }) {
  return <button className="result-section-edit" type="button" aria-label={`${editing ? '完成' : '编辑'}${label}`} onClick={onToggle}><PencilSimple size={14} />{editing ? '完成编辑' : '编辑本部分'}</button>;
}

export function ResultPage({ facts, resume, busy, downloading, status, statusText, onFacts, onResume, onBack, onDownload }) {
  const heading = useRef(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const toggleEditing = () => setEditing(value => !value);
  const sections = [
    ['result-basics', '基本资料'],
    ...(resume.summary || editing ? [['result-summary', '个人概述']] : []),
    ...resume.sections.map((section, index) => [`result-section-${index}`, canonicalHeading(section.heading)]),
    ['result-notes', '简历提醒'],
  ];
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const updateSection = (sectionIndex, patch) => onResume({ ...resume, sections: resume.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section) });
  const updateEntry = (sectionIndex, entryIndex, patch) => updateSection(sectionIndex, { entries: resume.sections[sectionIndex].entries.map((entry, index) => index === entryIndex ? { ...entry, ...patch } : entry) });
  const updateBullet = (sectionIndex, entryIndex, bulletIndex, patch) => updateEntry(sectionIndex, entryIndex, { bullets: resume.sections[sectionIndex].entries[entryIndex].bullets.map((bullet, index) => index === bulletIndex ? { ...bullet, ...patch } : bullet) });
  return <div className="review-page result-page">
    <header className="review-topbar"><div className="review-brand"><span className="wordmark">简历</span><span className="breadcrumb-divider">/</span><span>优化结果</span></div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} />返回修改材料</button></header>
    <div className="review-intro"><div><p className="eyebrow">让每一段经历，都有清晰的重点</p><h1 ref={heading} tabIndex={-1}>你的优化简历</h1><p>内容已按“标题—内容”重新组织；你可以在任一模块直接进入编辑，再下载 PDF。</p></div><div className="result-intro-actions"><div className="review-file result-badge"><Sparkle size={22} /><span>目标岗位 · {resume.targetRole}</span></div><button className="result-edit-toggle" type="button" aria-pressed={editing} onClick={toggleEditing}><PencilSimple size={16} />{editing ? '完成编辑' : '编辑简历内容'}</button></div></div>
    <div className="review-layout">
      <aside className="review-sidebar"><p className="nav-label">简历目录</p><nav aria-label="简历目录">{sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={event => { event.preventDefault(); scrollTo(id); }}>{label}<ArrowUpRight size={13} /></a>)}</nav><p className="review-side-note">每个模块都有编辑入口，<br />无需回到页面顶部。<br />修改后可直接下载。</p></aside>
      <main className="review-main result-main">
        <article aria-label="优化后的简历">
          <section className="review-section result-basics" id="result-basics">
            <div className="review-section-heading"><h2>基本资料</h2><div className="result-section-actions"><span>投递前请再次核对</span><SectionEditControl editing={editing} label="基本资料" onToggle={toggleEditing} /></div></div>
            <div className={`result-identity ${editing ? 'is-editing' : ''}`}>
              <div><p className="result-label">姓名</p>{editing ? <input className="result-basic-input result-name-input" value={facts.name} maxLength={200} aria-label="编辑姓名" onChange={event => onFacts({ ...facts, name: event.target.value })} /> : <h3>{facts.name || '未填写姓名'}</h3>}</div>
              <div><p className="result-label">联系方式</p>{editing ? <input className="result-basic-input" value={facts.contact} maxLength={12000} aria-label="编辑联系方式" onChange={event => onFacts({ ...facts, contact: event.target.value })} /> : <p>{facts.contact || '未填写联系方式'}</p>}</div>
              <div><p className="result-label">目标岗位</p>{editing ? <input className="result-basic-input" value={resume.targetRole} maxLength={200} aria-label="编辑目标岗位" onChange={event => onResume({ ...resume, targetRole: event.target.value })} /> : <p>{resume.targetRole}</p>}</div>
            </div>
          </section>
          {(resume.summary || editing) && <section className="review-section" id="result-summary"><div className="review-section-heading"><h2>个人概述</h2><div className="result-section-actions"><span>核心定位</span><SectionEditControl editing={editing} label="个人概述" onToggle={toggleEditing} /></div></div>{editing ? <AutoTextarea className="result-inline-textarea result-summary-editor" value={resume.summary} maxLength={1000} label="编辑个人概述" onChange={summary => onResume({ ...resume, summary })} /> : <p className="result-summary">{resume.summary}</p>}</section>}
          {resume.sections.map((section, sectionIndex) => {
            const sectionHeading = canonicalHeading(section.heading);
            const isSkillSection = sectionHeading === '技能';
            return <section className="review-section result-resume-section" id={`result-section-${sectionIndex}`} key={`${section.heading}-${sectionIndex}`}>
              <div className="review-section-heading">{editing && !isSkillSection ? <input className="result-section-title-input" value={section.heading} maxLength={200} aria-label={`编辑模块标题 ${sectionIndex + 1}`} onChange={event => updateSection(sectionIndex, { heading: event.target.value })} /> : <h2>{sectionHeading}</h2>}<div className="result-section-actions"><span>{section.entries.length} 段内容</span><SectionEditControl editing={editing} label={sectionHeading} onToggle={toggleEditing} /></div></div>
              {section.entries.map((entry, entryIndex) => {
                const entryTitle = isSkillSection && genericSkillTitle(entry.title) ? '' : entry.title;
                const hasHeader = editing || entryTitle || entry.organization || entry.dates;
                return <article className="result-entry" key={entryIndex}>
                  {hasHeader && <header className="result-entry-header"><div>{editing ? <input className="result-entry-title-input" value={entryTitle} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 名称`} placeholder={isSkillSection ? '技能类别，如：工具' : '职位或经历名称'} onChange={event => updateEntry(sectionIndex, entryIndex, { title: event.target.value })} /> : entryTitle ? <h3>{entryTitle}</h3> : null}</div><div className={`result-entry-meta ${editing ? 'is-editing' : ''}`}>{editing ? <><input value={entry.organization} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 公司或组织`} placeholder="公司或组织" onChange={event => updateEntry(sectionIndex, entryIndex, { organization: event.target.value })} /><input value={entry.dates} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 时间`} placeholder="时间" onChange={event => updateEntry(sectionIndex, entryIndex, { dates: event.target.value })} /></> : <>{entry.organization && <span>{entry.organization}</span>}{entry.dates && <span>{entry.dates}</span>}</>}</div></header>}
                    <div className="experience-list">{entry.bullets.map((bullet, bulletIndex) => { const item = presentBullet(bullet); return <div className={`experience-item ${isSkillSection ? 'is-skill' : ''}`} key={bulletIndex}>{!isSkillSection && <span className="experience-number">{String(bulletIndex + 1).padStart(2, '0')}</span>}<div>{editing ? <><input className="result-inline-input" value={item.title} maxLength={80} aria-label={`编辑经历标题 ${sectionIndex + 1}-${entryIndex + 1}-${bulletIndex + 1}`} onChange={event => updateBullet(sectionIndex, entryIndex, bulletIndex, { title: event.target.value })} /><AutoTextarea className="result-inline-textarea" value={item.text} maxLength={500} label={`编辑经历内容 ${sectionIndex + 1}-${entryIndex + 1}-${bulletIndex + 1}`} onChange={text => updateBullet(sectionIndex, entryIndex, bulletIndex, { text })} /></> : isSkillSection ? <p className="skill-line"><strong>{item.title}：</strong>{item.text}</p> : <><h4>{item.title}</h4><p>{item.text}</p></>}</div></div>; })}</div>
                </article>;
              })}
            </section>;
          })}
          <section className="review-section result-notes" id="result-notes"><div className="review-section-heading"><h2>简历提醒</h2><div className="result-section-actions"><span>不会进入正式简历</span><SectionEditControl editing={editing} label="简历内容" onToggle={toggleEditing} /></div></div>{resume.warnings?.length > 0 && <ul className="result-warnings">{resume.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}<p>{providerNames[resume.provider] || resume.provider} 已完成表达优化，并通过来源引用和改写检查。投递前请确认职位、时间、数字和成果均与你的实际情况一致。本区内容仅供当前核对，不会写入下载的正式简历。</p></section>
        </article>
        <div className="review-submit-area result-submit-area"><p className={status === 'error' ? 'error' : 'processing-status'} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{statusText}</p><div className="review-actions"><button className="button secondary" type="button" disabled={busy} onClick={onBack}><PencilSimple size={17} />修改材料并重新优化</button><button className="button primary" type="button" disabled={busy} onClick={onDownload}>{downloading ? '正在生成 PDF…' : '下载 PDF'}<DownloadSimple size={18} /></button></div></div>
      </main>
    </div>
  </div>;
}
