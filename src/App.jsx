import { useRef, useState } from 'react';
import { FileArrowUp } from '@phosphor-icons/react';
import '@fontsource/noto-serif-sc/400.css';
import { Modal } from './Modal';
import { validateFile, fileSize } from './intake';
import { getApiConfig, extractResume, optimizeResume, downloadResume } from './api';
import { draftToFacts, factsToDraft, prepareReviewedFacts } from './resume-state';

const emptyDraft = { name: '', contact: '', school: '', major: '', role: '', experience: '' };
const educationFields = [['school', '学校'], ['major', '专业'], ['degree', '学历'], ['dates', '就读时间']];
const experienceFields = [['title', '职位或项目名称'], ['organization', '组织或公司'], ['dates', '经历时间'], ['description', '经历内容']];

function FactEntries({ title, entries, fields, sources, onChange }) {
  const update = (index, key, value) => onChange(entries.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  return <section className="fact-section">
    <h3>{title}</h3>
    {entries.length === 0 && <p className="section-note">尚未填写，可以根据下方来源原文补充。</p>}
    {entries.map((entry, index) => <fieldset className="fact-entry" key={index}>
      <legend>{title} {index + 1}</legend>
      {fields.map(([key, label]) => <label className="field" key={key}>{label}{key === 'description'
        ? <textarea value={entry[key]} onChange={e => update(index, key, e.target.value)} rows={4} maxLength={12000} />
        : <input value={entry[key]} onChange={e => update(index, key, e.target.value)} maxLength={200} />}</label>)}
      <fieldset className="source-choices"><legend>对应的来源原文（至少一项）</legend>{sources.map((block, sourceIndex) => <label key={block.id}>
        <input type="checkbox" checked={entry.sourceIds.includes(block.id)} onChange={e => update(index, 'sourceIds', e.target.checked ? [...entry.sourceIds, block.id] : entry.sourceIds.filter(id => id !== block.id))} />
        <span>原文 {sourceIndex + 1}：{block.text.slice(0, 48) || '待补充'}</span>
      </label>)}</fieldset>
      <button type="button" className="text-button" onClick={() => onChange(entries.filter((_, i) => i !== index))}>删除这条{title}</button>
    </fieldset>)}
    <button type="button" className="button secondary" disabled={entries.length >= 20} onClick={() => onChange([...entries, { ...Object.fromEntries(fields.map(([key]) => [key, ''])), sourceIds: [] }])}>添加{title}</button>
  </section>;
}

export function App() {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const operation = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [facts, setFacts] = useState(null);
  const [targetRole, setTargetRole] = useState('');
  const [resume, setResume] = useState(null);
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = status === 'extracting' || status === 'optimizing' || downloading;
  const statusText = status === 'extracting' ? '正在识别简历' : status === 'optimizing' ? '正在优化简历' : downloading ? '正在生成 PDF' : status === 'error' ? error : notice || ({ idle: '请选择简历或在线填写。', reviewing: '请核对并编辑简历事实。', ready: '简历优化已完成，可以查看结果并下载 PDF。' }[status]);
  const close = () => setPanel(null);
  const chooseFile = () => { if (!operation.current) inputRef.current?.click(); };
  const fail = issue => { setError(issue instanceof Error ? issue.message : issue); setNotice(''); setStatus('error'); };
  async function readConfig() {
    setConfigLoading(true); setConfigError('');
    try { const next = await getApiConfig(); setConfig(next); return next; }
    catch (issue) { setConfig(null); setConfigError(issue.message); return null; }
    finally { setConfigLoading(false); }
  }
  function beginReview(nextFacts, role = targetRole) {
    setFacts(nextFacts); setTargetRole(role); setResume(null); setError(''); setNotice(''); setStatus('reviewing'); setPanel('review');
    void readConfig();
  }
  async function selectFile(nextFile) {
    if (operation.current) return;
    const issue = validateFile(nextFile);
    if (issue) { fail(issue); return; }
    operation.current = true;
    setFile(nextFile); setFacts(null); setResume(null); setError(''); setNotice(''); setStatus('extracting'); setPanel('processing');
    try { const result = await extractResume(nextFile); beginReview(result.facts); }
    catch (issue) { fail(issue); }
    finally { operation.current = false; }
  }
  function editFacts(next) { setFacts(next); setResume(null); setNotice(''); setError(''); setStatus('reviewing'); }
  function saveFacts() {
    try {
      const next = prepareReviewedFacts(facts);
      setFacts(next); setTargetRole(targetRole.trim()); setDraft(factsToDraft({ ...next, targetRole })); setError(''); setStatus('reviewing'); setNotice('事实修改已保存在当前页面。');
      return next;
    } catch (issue) { fail(issue); return null; }
  }
  async function optimize(event) {
    event.preventDefault();
    if (operation.current || configLoading) return;
    const next = saveFacts();
    if (!next) return;
    if (!targetRole.trim()) { fail('请填写目标岗位后再优化。'); return; }
    operation.current = true;
    try {
      const currentConfig = config ?? await readConfig();
      if (!currentConfig?.configured) {
        if (currentConfig) setConfigError('当前 AI 服务尚未配置。');
        return;
      }
      setError(''); setNotice(''); setStatus('optimizing');
      const result = await optimizeResume(next, targetRole.trim());
      setResume(result.resume); setStatus('ready'); setPanel('result');
    } catch (issue) { fail(issue); }
    finally { operation.current = false; }
  }
  async function download() {
    if (operation.current) return;
    operation.current = true; setDownloading(true); setError(''); setNotice(''); setStatus('ready');
    try { await downloadResume(facts, resume); setNotice('PDF 已生成，并已发起下载。'); }
    catch (issue) { fail(issue); }
    finally { operation.current = false; setDownloading(false); }
  }
  const resumePanel = () => setPanel(resume ? 'result' : facts ? 'review' : 'processing');
  const changeDraft = e => setDraft({ ...draft, [e.target.name]: e.target.value });

  return <div className="page">
    <header className="site-header"><a className="wordmark" href="/" aria-label="简历首页">简历</a><button className="login-link" onClick={() => setPanel('login')}>登录</button></header>
    <main className="hero">
      <div className="offer-stage" aria-hidden="true"><img className="offer-image" src="/assets/offer.png" alt="" width="1254" height="1254" fetchPriority="high" /></div>
      <h1><span>心仪的工作，</span><span>从好简历开始。</span></h1>
      <p className="subtitle">针对目标岗位优化简历，让你的优势更有说服力。</p>
      <div className="intake">
        <input className="visually-hidden" type="file" accept=".pdf,.docx" ref={inputRef} tabIndex={-1} disabled={busy} aria-label="选择简历文件" onChange={e => { if (e.target.files?.[0]) void selectFile(e.target.files[0]); e.target.value = ''; }} />
        <div className={`upload-panel ${dragging ? 'is-dragging' : ''}`} onDragEnter={e => { e.preventDefault(); if (!busy) { dragDepth.current++; setDragging(true); } }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); if (operation.current) return; const files = e.dataTransfer.files; if (files.length > 1) { fail('每次请选择一份简历。'); return; } if (files[0]) void selectFile(files[0]); }}>
          <button className="upload-target" type="button" onClick={file ? resumePanel : chooseFile} aria-label={file ? `查看已选择的文件：${file.name}` : '选择或拖拽简历文件'}>
            <FileArrowUp className="upload-icon" size={57} weight="thin" aria-hidden="true" />
            <span className="upload-copy"><strong>{dragging ? '松开，选择这份简历' : file ? file.name : '上传你的简历'}</strong><span>{file ? `${status === 'extracting' ? '正在识别' : '已选择'} · ${fileSize(file.size)}` : '点击选择，或拖拽文件到这里'}</span></span>
          </button>
          <button className="button primary upload-button" type="button" onClick={chooseFile} disabled={busy}>{file ? '更换文件' : '上传简历'}</button>
        </div>
        <p className={status === 'idle' || panel ? 'visually-hidden' : status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
        <button className="button secondary fill-button" type="button" disabled={busy && !facts && !file} onClick={facts || file && busy ? resumePanel : () => setPanel('fill')}>{resume ? '查看优化结果' : facts ? '继续核对我的材料' : busy ? '查看处理进度' : '没有简历？在线填写'}</button>
        <p className="registration-note">首次修改与下载，无需注册</p>
      </div>
    </main>

    {panel === 'login' && <Modal title="先体验，再保存" onClose={close}><p className="modal-lead">首次修改简历无需注册。</p><p className="muted">账号与历史版本功能尚未开放。你可以先体验上传和在线填写。</p><button className="button primary full" onClick={close}>开始体验</button></Modal>}

    {panel === 'processing' && <Modal title={status === 'extracting' ? '正在识别简历' : '简历识别未完成'} onClose={close}>
      {file && <p className="file-name">{file.name} · {fileSize(file.size)}</p>}
      <p className={status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
      <p className="preview-note">支持 PDF、DOCX，最大 10 MB，PDF 最多 10 页。扫描型 PDF 暂不支持，请使用带有可选择文字的文件。</p>
      <button className="button secondary full" disabled={busy} onClick={chooseFile}>重新选择</button>
    </Modal>}

    {panel === 'fill' && <Modal title="从你的经历开始" onClose={close}>
      <p className="modal-lead">不必写得专业，先告诉我们你做过什么。</p>
      <form onSubmit={e => { e.preventDefault(); setFile(null); beginReview(draftToFacts(draft), draft.role.trim()); }}>
        <div className="field-row"><label className="field">姓名<input name="name" value={draft.name} onChange={changeDraft} placeholder="你的姓名" autoComplete="name" maxLength={40} required /></label><label className="field">学校<input name="school" value={draft.school} onChange={changeDraft} placeholder="你的学校（选填）" maxLength={80} /></label></div>
        <label className="field">联系方式 <span className="optional">选填</span><input name="contact" value={draft.contact} onChange={changeDraft} placeholder="手机号或邮箱" maxLength={200} /></label>
        <div className="field-row"><label className="field">专业 <span className="optional">选填</span><input name="major" value={draft.major} onChange={changeDraft} placeholder="所学专业" maxLength={80} /></label><label className="field">目标岗位 <span className="optional">选填</span><input name="role" value={draft.role} onChange={changeDraft} placeholder="核对材料时也可以补充" maxLength={200} /></label></div>
        <label className="field">一段值得讲述的经历<textarea name="experience" value={draft.experience} onChange={changeDraft} placeholder="实习、课程项目、社团或兼职都可以。你负责什么，具体做过哪些事？" rows={5} maxLength={4000} required /></label>
        <p className="preview-note">内容仅保留在本次页面中，刷新页面将清空。核对事实后，再由你决定是否开始 AI 优化。</p>
        <button className="button primary full" type="submit">核对填写内容</button>
      </form>
    </Modal>}

    {panel === 'review' && facts && <Modal title="核对你的材料" onClose={close}>
      <p className="modal-lead">请核对提取结果，并补充教育、经历和技能。只填写真实信息，保留对应的来源原文。</p>
      <p className={status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
      <form onSubmit={optimize} aria-busy={busy}>
        <fieldset className="editor-fields" disabled={busy}>
          <section className="fact-section"><h3>基本资料</h3>
            <label className="field">姓名<input value={facts.name} maxLength={200} onChange={e => editFacts({ ...facts, name: e.target.value })} /></label>
            <label className="field">联系方式<textarea value={facts.contact} maxLength={12000} rows={2} onChange={e => editFacts({ ...facts, contact: e.target.value })} /></label>
            <label className="field">目标岗位<input value={targetRole} required maxLength={200} placeholder="例如：产品助理、前端开发" onChange={e => { setTargetRole(e.target.value); setNotice(''); }} /></label>
          </section>
          <FactEntries title="教育" fields={educationFields} entries={facts.education} sources={facts.sourceBlocks} onChange={education => editFacts({ ...facts, education })} />
          <FactEntries title="经历" fields={experienceFields} entries={facts.experiences} sources={facts.sourceBlocks} onChange={experiences => editFacts({ ...facts, experiences })} />
          <section className="fact-section"><h3>技能</h3><label className="field">已具备的技能，每行一项<textarea value={facts.skills.join('\n')} maxLength={12000} rows={3} onChange={e => editFacts({ ...facts, skills: e.target.value.split('\n') })} /></label></section>
          <section className="fact-section"><h3>来源原文</h3><p className="section-note">请在原文中补全事实依据。修改文本会保留其关联；添加教育或经历时，请勾选对应原文。</p>
            {facts.sourceBlocks.map((block, index) => <label className="field" key={block.id}>原文 {index + 1}{block.page ? ` · 第 ${block.page} 页` : ''}<textarea value={block.text} rows={5} maxLength={12000} required onChange={e => editFacts({ ...facts, sourceBlocks: facts.sourceBlocks.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} /></label>)}
            <button className="button secondary" type="button" disabled={facts.sourceBlocks.length >= 30} onClick={() => { let number = 1; while (facts.sourceBlocks.some(block => block.id === `review-b${number}`)) number++; editFacts({ ...facts, sourceBlocks: [...facts.sourceBlocks, { id: `review-b${number}`, text: '', page: null }] }); }}>补充来源原文</button>
          </section>
          {facts.warnings.length > 0 && <ul className="section-note">{facts.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          <button className="button secondary full" type="button" onClick={saveFacts}>保存事实修改</button>
        </fieldset>
        <div className="service-status" aria-live="polite" aria-atomic="true">{configLoading ? '正在检查 AI 服务' : configError || (config?.configured === false ? '当前 AI 服务尚未配置' : config?.configured ? 'AI 服务已就绪，确认事实后即可开始优化。' : '尚未确认 AI 服务状态。')}</div>
        {!config?.configured && <button className="text-button" type="button" disabled={busy || configLoading} onClick={() => void readConfig()}>重新检查服务</button>}
        <p className="preview-note">刷新页面将清空当前材料与结果。扫描型 PDF 暂不支持。开始优化会将确认后的事实提交给 AI 服务。</p>
        <div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={chooseFile}>重新选择</button><button className="button primary" type="submit" disabled={busy || configLoading || !config?.configured}>{status === 'optimizing' ? '正在优化简历' : '确认事实并优化'}</button></div>
      </form>
    </Modal>}

    {panel === 'result' && resume && <Modal title="你的优化简历" onClose={close}>
      <p className={status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
      <article className="resume-result"><h3>{facts.name || '简历'}</h3>{facts.contact && <p>{facts.contact}</p>}<p className="section-note">目标岗位：{resume.targetRole}</p>
        {resume.summary && <section><h3>个人概述</h3><p>{resume.summary}</p></section>}
        {resume.sections.map((section, index) => <section key={index}><h3>{section.heading}</h3>{section.entries.map((entry, entryIndex) => <div className="resume-entry" key={entryIndex}>
          {entry.title && <h4>{entry.title}</h4>}{entry.organization && <p>{entry.organization}</p>}{entry.dates && <p className="section-note">{entry.dates}</p>}
          <ul>{entry.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}</ul>
        </div>)}</section>)}
      </article>
      <p className="provider-note">本次生成服务：{resume.provider} · 模型：{resume.model}</p>
      <p className="preview-note">请在投递前再次核对事实。刷新页面将清空当前材料与结果。</p>
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => { setResume(null); setStatus('reviewing'); setError(''); setNotice(''); setPanel('review'); }}>修改并重新优化</button><button className="button primary" disabled={busy} onClick={download}>{downloading ? '正在生成 PDF' : '下载 PDF'}</button></div>
    </Modal>}
  </div>;
}
