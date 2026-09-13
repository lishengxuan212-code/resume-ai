import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowUpRight, FileText, Plus, Trash } from '@phosphor-icons/react';
import { ReadableEditor, RequiredMark } from './ReadableEditor';

const sections = [['basics', '基本资料'], ['education', '教育背景'], ['work', '工作经历'], ['skills', '技能'], ['sources', '来源原文']];
export function ReviewPage({ facts, targetRole, jobDescription, file, fileInput, busy, status, statusText, config, configLoading, configError, onBack, onChooseFile, onFacts, onTargetRole, onJobDescription, onSkills, onEntry, onRemoveEntry, onSave, onDiagnose, onReadConfig }) {
  const heading = useRef(null);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const addEntry = collection => onFacts({ ...facts, [collection]: [...facts[collection], collection === 'education'
    ? { school: '', major: '', degree: '', dates: '', sourceIds: [] }
    : { title: '', organization: '', dates: '', description: '', sourceIds: [] }] });
  const input = (collection, index, key, label) => <label className="field" key={key}>{label}<input value={facts[collection][index][key]} maxLength={200} onChange={e => onEntry(collection, index, { [key]: e.target.value })} /></label>;
  return <div className="review-page">
    {fileInput}
    <header className="review-topbar"><div className="review-brand"><span className="wordmark">简历</span><span className="breadcrumb-divider">/</span><span>材料核对</span></div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} />返回首页</button></header>
    <div className="review-intro"><div><p className="eyebrow">你的经历，值得被认真看见</p><h1 ref={heading} tabIndex={-1}>核对你的材料</h1><p>先把事实核对好，专业表达交给我们。</p></div><div className="review-file"><FileText size={22} /><span>{file?.name || '在线填写的材料'}</span><button type="button" onClick={onChooseFile} disabled={busy}>更换文件</button></div></div>
    <div className="review-layout">
      <aside className="review-sidebar"><p className="nav-label">材料目录</p><nav aria-label="材料目录">{sections.map(([id, label]) => <a key={id} href={`#review-${id}`} onClick={e => { e.preventDefault(); document.getElementById(`review-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}<ArrowUpRight size={13} /></a>)}</nav><p className="review-side-note">逐段核对真实信息。<br />内容可编辑，无需填写<br />专业的写作指令。</p></aside>
      <main className="review-main">
        <form onSubmit={onDiagnose} aria-busy={busy}>
          <fieldset className="editor-fields" disabled={busy}>
            <section className="review-section" id="review-basics"><div className="review-section-heading"><h2>基本资料</h2><span><RequiredMark /> 为必填项</span></div>
              <div className="review-basic-grid"><label className="field">姓名<RequiredMark /><input value={facts.name} required autoComplete="name" maxLength={200} onChange={e => onFacts({ ...facts, name: e.target.value })} /></label><label className="field">联系方式 <span className="optional">手机号或邮箱</span><input value={facts.contact} maxLength={12000} onChange={e => onFacts({ ...facts, contact: e.target.value })} /></label></div>
              <label className="field target-role-field">目标岗位<RequiredMark /><input value={targetRole} required maxLength={200} placeholder="例如：商业化运营、产品助理" onChange={e => onTargetRole(e.target.value)} /></label>
              <ReadableEditor label="目标岗位说明（选填）" value={jobDescription} onChange={onJobDescription} disabled={busy} placeholder="可粘贴招聘要求。系统只会匹配已有事实，不会把招聘要求当成你已掌握的技能。" />
            </section>
            <section className="review-section" id="review-education"><div className="review-section-heading"><h2>教育背景</h2><button type="button" className="add-entry" disabled={facts.education.length >= 20} onClick={() => addEntry('education')}><Plus size={16} />添加教育</button></div>
              {!facts.education.length && <p className="empty-section">还没有教育信息，可以按需补充。</p>}
              {facts.education.map((entry, index) => <fieldset className="review-entry" key={index}><legend>教育 {index + 1}</legend><div className="entry-fields education-grid">{[['school', '学校'], ['major', '专业'], ['degree', '学历'], ['dates', '就读时间']].map(([key, label]) => input('education', index, key, label))}</div><button type="button" className="remove-entry" onClick={() => onRemoveEntry('education', index)}><Trash size={14} />删除这条教育</button></fieldset>)}
            </section>
            <section className="review-section" id="review-work"><div className="review-section-heading"><h2>工作经历</h2><button type="button" className="add-entry" disabled={facts.experiences.length >= 20} onClick={() => addEntry('experiences')}><Plus size={16} />添加工作经历</button></div>
              <p className="section-caption">核对你的职责、行动和成果，保留每一段真实经历。</p>
              {!facts.experiences.length && <p className="empty-section">还没有经历信息，可以补充实习、工作或其他实际经历。</p>}
              {facts.experiences.map((entry, index) => <fieldset className="review-entry work-entry" key={index}><legend>经历 {String(index + 1).padStart(2, '0')}</legend><div className="entry-fields work-grid">{[['organization', '公司或组织'], ['title', '职位'], ['dates', '工作时间']].map(([key, label]) => input('experiences', index, key, label))}</div><ReadableEditor label={`工作内容 ${index + 1}`} value={entry.description} onChange={description => onEntry('experiences', index, { description })} disabled={busy} placeholder="补充你具体负责的事情、采取的行动和实际成果。" /><button type="button" className="remove-entry" onClick={() => onRemoveEntry('experiences', index)}><Trash size={14} />删除这条工作经历</button></fieldset>)}
            </section>
            <section className="review-section" id="review-skills"><div className="review-section-heading"><h2>技能</h2><span>按类别呈现，更清楚</span></div><ReadableEditor label="已具备的技能" value={facts.skills.join('\n')} list onChange={onSkills} disabled={busy} placeholder="每行一项，例如：数据分析：Excel、SQL。" /></section>
            <section className="review-section source-section" id="review-sources"><details className="source-details"><summary><span><strong>来源原文</strong><small>默认收起，按需核对原始材料</small></span><span aria-hidden="true">展开</span></summary><div className="source-details-body"><p className="section-caption">原文完整保留，无需逐项勾选。你修改或补充的经历会自动记录。</p>
              {facts.sourceBlocks.map((block, index) => <div className="source-block" key={block.id}><ReadableEditor label={/^review-(entry-|skills$)/.test(block.id) ? `补充事实 ${index + 1}` : `原文 ${index + 1}${block.page ? ` · 第 ${block.page} 页` : ''}`} value={block.text} required={!/^review-(entry-|skills$)/.test(block.id)} readOnly={/^review-(entry-|skills$)/.test(block.id)} onChange={text => onFacts({ ...facts, sourceBlocks: facts.sourceBlocks.map(item => item.id === block.id ? { ...item, text } : item) })} disabled={busy} />
                {/^review-b\d+$/.test(block.id) && ![...facts.education, ...facts.experiences].some(entry => entry.sourceIds.includes(block.id)) && <button className="remove-entry" type="button" onClick={() => onFacts({ ...facts, sourceBlocks: facts.sourceBlocks.filter(item => item.id !== block.id) })}><Trash size={14} />删除原文 {index + 1}</button>}
              </div>)}
              <button type="button" className="add-entry" disabled={facts.sourceBlocks.length >= 30} onClick={() => { let number = 1; while (facts.sourceBlocks.some(block => block.id === `review-b${number}`)) number++; onFacts({ ...facts, sourceBlocks: [...facts.sourceBlocks, { id: `review-b${number}`, text: '', page: null }] }); }}><Plus size={16} />补充来源原文</button></div></details>
            </section>
          </fieldset>
          {facts.warnings.length > 0 && <ul className="section-note">{facts.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          <div className="review-submit-area">
            <p className={status === 'error' ? 'error' : 'processing-status'} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{statusText}</p>
            <div className="service-status">{configLoading ? '正在准备优化…' : configError ? '暂时无法开始优化，请稍后重试。' : config?.configured ? '已准备就绪' : '暂时无法开始优化，请稍后重试。'}{!config?.configured && <button type="button" className="text-button" disabled={busy || configLoading} onClick={onReadConfig}>重新检查</button>}</div>
            <p className="preview-note">继续后会先诊断材料并最多提出 3 个必要问题；你可以跳过问题，直接按现有事实优化。</p>
            <div className="review-actions"><button type="button" className="button secondary" disabled={busy} onClick={onSave}>保存事实修改</button><button type="submit" className="button primary" disabled={busy || configLoading || !config?.configured}>{status === 'diagnosing' ? '正在检查材料…' : '检查材料并继续'}<ArrowUpRight size={18} /></button></div>
          </div>
        </form>
      </main>
    </div>
  </div>;
}
