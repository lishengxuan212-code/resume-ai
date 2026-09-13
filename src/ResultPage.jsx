import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, PencilSimple, Sparkle } from '@phosphor-icons/react';
import { ResumePreview } from './ResumePreview';
import { withoutEducationBackground } from '../shared/resume/summary.js';

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

function AvatarField({ avatarDataUrl, onAvatarFile, onRemoveAvatar }) {
  const fileInput = useRef(null);
  return <div className="result-avatar-field"><p className="result-label">头像 <span className="optional">选填</span></p><div className="result-avatar-actions">{avatarDataUrl ? <img className="result-avatar-image" src={avatarDataUrl} alt="当前简历头像" /> : <span className="result-avatar-placeholder">头像</span>}<div><button className="result-avatar-button" type="button" onClick={() => fileInput.current?.click()}>{avatarDataUrl ? '更换头像' : '上传头像'}</button>{avatarDataUrl && <button className="result-avatar-remove" type="button" onClick={onRemoveAvatar}>移除</button>}</div></div><input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void onAvatarFile(file); event.target.value = ''; }} /></div>;
}

export function ResultPage({ facts, resume, busy, downloading, status, statusText, onFacts, onResume, onBack, onDownload, presentation = { avatarDataUrl: '' }, onAvatarFile = () => {}, onRemoveAvatar = () => {} }) {
  const heading = useRef(null);
  const [editing, setEditing] = useState(false);
  const summary = withoutEducationBackground(resume.summary, facts.education);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const toggleEditing = () => setEditing(value => !value);
  const sections = [
    ['result-basics', '基本资料'],
    ...(summary || editing ? [['result-summary', '个人概述']] : []),
    ...resume.sections.map((section, index) => [`result-section-${index}`, canonicalHeading(section.heading)]),
    ['result-notes', '简历提醒'],
    ['result-preview', '排版预览'],
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
              <AvatarField avatarDataUrl={presentation.avatarDataUrl} onAvatarFile={onAvatarFile} onRemoveAvatar={onRemoveAvatar} />
              <div><p className="result-label">姓名</p>{editing ? <input className="result-basic-input result-name-input" value={facts.name} maxLength={200} aria-label="编辑姓名" onChange={event => onFacts({ ...facts, name: event.target.value })} /> : <h3>{facts.name || '未填写姓名'}</h3>}</div>
              <div><p className="result-label">联系方式</p>{editing ? <input className="result-basic-input" value={facts.contact} maxLength={12000} aria-label="编辑联系方式" onChange={event => onFacts({ ...facts, contact: event.target.value })} /> : <p>{facts.contact || '未填写联系方式'}</p>}</div>
              <div><p className="result-label">目标岗位</p>{editing ? <input className="result-basic-input" value={resume.targetRole} maxLength={200} aria-label="编辑目标岗位" onChange={event => onResume({ ...resume, targetRole: event.target.value })} /> : <p>{resume.targetRole}</p>}</div>
            </div>
          </section>
          {(summary || editing) && <section className="review-section" id="result-summary"><div className="review-section-heading"><h2>个人概述</h2><div className="result-section-actions"><span>核心定位</span><SectionEditControl editing={editing} label="个人概述" onToggle={toggleEditing} /></div></div>{editing ? <AutoTextarea className="result-inline-textarea result-summary-editor" value={summary} maxLength={1000} label="编辑个人概述" onChange={nextSummary => onResume({ ...resume, summary: nextSummary })} /> : <p className="result-summary">{summary}</p>}</section>}
          {resume.sections.map((section, sectionIndex) => {
            const sectionHeading = canonicalHeading(section.heading);
            const isSkillSection = section.type === 'skills' || sectionHeading === '技能';
            return <section className="review-section result-resume-section" id={`result-section-${sectionIndex}`} key={`${section.heading}-${sectionIndex}`}>
              <div className="review-section-heading">{editing && !isSkillSection ? <input className="result-section-title-input" value={section.heading} maxLength={200} aria-label={`编辑模块标题 ${sectionIndex + 1}`} onChange={event => updateSection(sectionIndex, { heading: event.target.value })} /> : <h2>{sectionHeading}</h2>}<div className="result-section-actions"><span>{section.entries.length} 段内容</span><SectionEditControl editing={editing} label={sectionHeading} onToggle={toggleEditing} /></div></div>
              {section.entries.map((entry, entryIndex) => {
                const entryTitle = isSkillSection && genericSkillTitle(entry.title) ? '' : entry.title;
                const hasHeader = editing || entryTitle || entry.organization || entry.dates;
                return <article className="result-entry" key={entryIndex}>
                  {hasHeader && <header className={`result-entry-header ${isSkillSection ? 'is-skill-header' : ''}`}><div>{editing ? <input className="result-entry-title-input" value={entryTitle} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 名称`} placeholder={isSkillSection ? '技能类别，如：工具' : '职位或经历名称'} onChange={event => updateEntry(sectionIndex, entryIndex, { title: event.target.value })} /> : entryTitle ? <h3>{entryTitle}</h3> : null}</div><div className={`result-entry-meta ${editing ? 'is-editing' : ''}`}>{editing ? <><input value={entry.organization} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 公司或组织`} placeholder="公司或组织" onChange={event => updateEntry(sectionIndex, entryIndex, { organization: event.target.value })} /><input value={entry.dates} maxLength={200} aria-label={`编辑经历 ${entryIndex + 1} 时间`} placeholder="时间" onChange={event => updateEntry(sectionIndex, entryIndex, { dates: event.target.value })} /></> : <>{entry.organization && <span>{entry.organization}</span>}{entry.dates && <span>{entry.dates}</span>}</>}</div></header>}
                    <div className="experience-list">{entry.bullets.map((bullet, bulletIndex) => { const item = presentBullet(bullet); return <div className={`experience-item ${isSkillSection ? 'is-skill' : ''}`} key={bulletIndex}><div>{editing ? <><div className="result-bullet-title-editor">{!isSkillSection && <span className="experience-number" aria-hidden="true">{bulletIndex + 1}.</span>}<input className="result-inline-input" value={item.title} maxLength={80} aria-label={`编辑经历标题 ${sectionIndex + 1}-${entryIndex + 1}-${bulletIndex + 1}`} onChange={event => updateBullet(sectionIndex, entryIndex, bulletIndex, { title: event.target.value })} /></div><AutoTextarea className="result-inline-textarea" value={item.text} maxLength={500} label={`编辑经历内容 ${sectionIndex + 1}-${entryIndex + 1}-${bulletIndex + 1}`} onChange={text => updateBullet(sectionIndex, entryIndex, bulletIndex, { text })} /></> : isSkillSection ? <p className="skill-line"><strong>{item.title}：</strong>{item.text}</p> : <><h4><span className="experience-number" aria-hidden="true">{bulletIndex + 1}.</span>{item.title}</h4><p>{item.text}</p></>}</div></div>; })}</div>
                </article>;
              })}
            </section>;
          })}
          <section className="review-section result-notes" id="result-notes"><div className="review-section-heading"><h2>简历提醒</h2><div className="result-section-actions"><span>不会进入正式简历</span><SectionEditControl editing={editing} label="简历内容" onToggle={toggleEditing} /></div></div>{resume.warnings?.length > 0 && <ul className="result-warnings">{resume.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}<p>{resume.quality?.reason === 'current_content_fallback' ? 'AI 的结构化改写未完整返回，当前版本已按你正在编辑的内容保留并整理，未补充或推断新信息。' : resume.quality?.substantiveChange === false ? '当前版本以完整保留已有事实为优先；你可以继续直接编辑任何表述和指标。' : `${providerNames[resume.provider] || resume.provider} 已完成表达优化，并通过来源引用和改写检查。`} 投递前请确认职位、时间、数字和成果均与你的实际情况一致。本区内容仅供当前核对，不会写入下载的正式简历。</p></section>
          <ResumePreview facts={facts} resume={resume} presentation={presentation} onPdf={onDownload?.setPreviewPdf} onDownload={onDownload?.download} />
        </article>
        <div className="review-submit-area result-submit-area"><p className={status === 'error' ? 'error' : 'processing-status'} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{statusText}</p><div className="review-actions"><button className="button secondary" type="button" disabled={busy} onClick={onBack}><PencilSimple size={17} />修改材料并重新优化</button></div></div>
      </main>
    </div>
  </div>;
}
