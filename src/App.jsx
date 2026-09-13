import { useRef, useState } from 'react';
import { FileArrowUp } from '@phosphor-icons/react';
import '@fontsource/noto-serif-sc/400.css';
import { Modal } from './Modal';
import { validateFile, fileSize } from './intake';
import { getApiConfig, extractResume, diagnoseResume, optimizeResume, saveResumePdf, downloadResume } from './api';
import { prepareReviewedFacts, updateReviewedEntry, removeReviewedEntry, updateReviewedSkills } from './resume-state';
import { ReviewPage } from './ReviewPage';
import { DiagnosisPage } from './DiagnosisPage';
import { LoadingOverlay } from './LoadingOverlay';
import { ResultPage } from './ResultPage';
import { makeAvatarDataUrl, makeAvatarDataUrlFromSource } from './avatar';

const emptyOnlineFacts = () => ({
  name: '', contact: '', education: [],
  experiences: [{ title: '', organization: '', dates: '', description: '', sourceIds: [] }],
  skills: [], warnings: [], sourceBlocks: [],
});
export function App() {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const operation = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [facts, setFacts] = useState(null);
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [diagnosis, setDiagnosis] = useState(null);
  const [resume, setResume] = useState(null);
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewPdf, setPreviewPdf] = useState(null);
  const [presentation, setPresentation] = useState({ avatarDataUrl: '' });
  const busy = status === 'extracting' || status === 'diagnosing' || status === 'optimizing' || downloading;
  const statusText = status === 'extracting' ? '正在识别简历' : status === 'diagnosing' ? '正在按方法论检查材料' : status === 'optimizing' ? '正在优化简历' : downloading ? '正在生成 PDF' : status === 'error' ? error : notice || ({ idle: '请选择简历或在线填写。', reviewing: '请核对并编辑简历事实。', diagnosed: '材料诊断已完成，可以补充回答或直接优化。', ready: '简历优化已完成，可以查看结果并下载 PDF。' }[status]);
  const close = () => setPanel(null);
  const chooseFile = () => { if (!operation.current) inputRef.current?.click(); };
  const fail = issue => { setError(issue instanceof Error ? issue.message : issue); setNotice(''); setStatus('error'); };
  async function readConfig() {
    setConfigLoading(true); setConfigError('');
    try { const next = await getApiConfig(); setConfig(next); return next; }
    catch (issue) { setConfig(null); setConfigError(issue.message); return null; }
    finally { setConfigLoading(false); }
  }
  function beginReview(nextFacts, role = targetRole, nextPresentation = { avatarDataUrl: '' }) {
    setFacts(nextFacts); setTargetRole(role); setResume(null); setDiagnosis(null); setPresentation(nextPresentation); setError(''); setNotice(''); setStatus('reviewing'); setPanel('review');
    void readConfig();
  }
  async function selectFile(nextFile) {
    if (operation.current) return;
    const issue = validateFile(nextFile);
    if (issue) { fail(issue); return; }
    operation.current = true;
    const previousFile = file;
    setFile(nextFile); setError(''); setNotice(''); setStatus('extracting'); setPanel('processing');
    try {
      const result = await extractResume(nextFile);
      const avatarDataUrl = await makeAvatarDataUrlFromSource(result.presentation?.avatarDataUrl).catch(() => '');
      beginReview(result.facts, targetRole, { avatarDataUrl });
    }
    catch (issue) {
      if (facts) setFile(previousFile);
      fail(issue);
      setPanel(resume ? 'result' : facts ? 'review' : 'processing');
    }
    finally { operation.current = false; }
  }
  function editFacts(next) { setFacts(next); setResume(null); setDiagnosis(null); setNotice(''); setError(''); setStatus('reviewing'); }
  function saveFacts() {
    try {
      const next = prepareReviewedFacts(facts);
      setFacts(next); setTargetRole(targetRole.trim()); setError(''); setStatus('reviewing'); setNotice('事实修改已保存在当前页面。');
      return next;
    } catch (issue) { fail(issue); return null; }
  }
  async function diagnose(event) {
    event.preventDefault();
    if (operation.current || configLoading) return;
    const next = saveFacts();
    if (!next) return;
    if (!targetRole.trim()) { fail('请填写目标岗位后再优化。'); return; }
    operation.current = true;
    try {
      const currentConfig = config ?? await readConfig();
      if (!currentConfig?.configured) {
        if (currentConfig) setConfigError('暂时无法开始优化，请稍后重试。');
        return;
      }
      setError(''); setNotice(''); setStatus('diagnosing');
      const result = await diagnoseResume(next, targetRole.trim(), jobDescription.trim());
      setDiagnosis(result.diagnosis); setStatus('diagnosed'); setPanel('diagnosis');
    } catch (issue) { fail(issue); }
    finally { operation.current = false; }
  }
  async function runOptimization(answers = [], skipQuestions = false) {
    if (operation.current) return;
    operation.current = true;
    try {
      setError(''); setNotice(''); setStatus('optimizing');
      const result = await optimizeResume(facts, targetRole.trim(), { jobDescription: jobDescription.trim(), answers, skipQuestions, diagnosis });
      setFacts(result.facts || facts); setResume(result.resume); setPreviewPdf(null); setStatus('ready'); setPanel('result');
    } catch (issue) { fail(issue); }
    finally { operation.current = false; }
  }
  async function download() {
    if (previewPdf) {
      saveResumePdf(previewPdf);
      setNotice('已下载与当前预览一致的 PDF。');
      return;
    }
    if (operation.current) return;
    operation.current = true; setDownloading(true); setError(''); setNotice(''); setStatus('ready');
    try { await downloadResume(facts, resume, 'recommended', presentation); setNotice('PDF 已生成，并已发起下载。'); }
    catch (issue) { fail(issue); }
    finally { operation.current = false; setDownloading(false); }
  }
  const resumePanel = () => setPanel(resume ? 'result' : facts ? 'review' : 'processing');
  const beginOnlineReview = () => { setFile(null); beginReview(emptyOnlineFacts(), ''); };
  const loading = busy ? <LoadingOverlay key={downloading ? 'downloading' : status} stage={downloading ? 'downloading' : status} /> : null;

  const fileInput = (<input className="visually-hidden" type="file" accept=".pdf,.docx" ref={inputRef} tabIndex={-1} disabled={busy} aria-label="选择简历文件" onChange={e => { if (e.target.files?.[0]) void selectFile(e.target.files[0]); e.target.value = ''; }} />);
  if (panel === 'review' && facts) return <><ReviewPage
    facts={facts} targetRole={targetRole} file={file} fileInput={fileInput} busy={busy}
    status={status} statusText={statusText} config={config} configLoading={configLoading} configError={configError}
    onBack={close} onChooseFile={chooseFile} onFacts={editFacts}
    onTargetRole={value => { setTargetRole(value); setNotice(''); setResume(null); }}
    jobDescription={jobDescription} onJobDescription={value => { setJobDescription(value); setNotice(''); setDiagnosis(null); setResume(null); }}
    onEntry={(collection, index, patch) => { try { editFacts(updateReviewedEntry(facts, collection, index, patch)); } catch (issue) { fail(issue); } }}
    onSkills={text => { try { editFacts(updateReviewedSkills(facts, text)); } catch (issue) { fail(issue); } }}
    onRemoveEntry={(collection, index) => editFacts(removeReviewedEntry(facts, collection, index))}
    onSave={saveFacts} onDiagnose={diagnose} onReadConfig={() => void readConfig()}
  />{loading}</>;

  if (panel === 'diagnosis' && diagnosis) return <><DiagnosisPage diagnosis={diagnosis} busy={busy} statusText={statusText} error={status === 'error' ? error : ''} onBack={() => { setError(''); setStatus('reviewing'); setPanel('review'); }} onOptimize={(answers, skip) => void runOptimization(answers, skip)} />{loading}</>;

  if (panel === 'result' && resume && facts) return <><ResultPage facts={facts} resume={resume} busy={busy} downloading={downloading} status={status} statusText={statusText} presentation={presentation} onAvatarFile={async file => { try { setPresentation({ avatarDataUrl: await makeAvatarDataUrl(file) }); setPreviewPdf(null); setError(''); setNotice('头像已更新，请重新生成 PDF 预览。'); } catch (issue) { setError(''); setNotice(issue.message); } }} onRemoveAvatar={() => { setPresentation({ avatarDataUrl: '' }); setPreviewPdf(null); setNotice('头像已移除，请重新生成 PDF 预览。'); }} onFacts={next => { setFacts(next); setPreviewPdf(null); setNotice('修改已保存，请重新生成 PDF 预览。'); setError(''); setStatus('ready'); }} onResume={next => { setResume(next); setPreviewPdf(null); setNotice('修改已保存，请重新生成 PDF 预览。'); setError(''); setStatus('ready'); }} onBack={() => { setError(''); setStatus('reviewing'); setPanel('review'); }} onDownload={{ download, setPreviewPdf }} />{loading}</>;

  return <div className="page">
    <header className="site-header"><a className="wordmark" href="/" aria-label="简历首页">简历</a><button className="login-link" onClick={() => setPanel('login')}>登录</button></header>
    <main className="hero">
      <div className="offer-stage" aria-hidden="true"><img className="offer-image" src="/assets/offer.png" alt="" width="1254" height="1254" fetchPriority="high" /></div>
      <h1><span>心仪的工作，</span><span>从好简历开始。</span></h1>
      <p className="subtitle">针对目标岗位优化简历，让你的优势更有说服力。</p>
      <div className="intake">
        {fileInput}
        <div className={`upload-panel ${dragging ? 'is-dragging' : ''}`} onDragEnter={e => { e.preventDefault(); if (!busy) { dragDepth.current++; setDragging(true); } }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); if (operation.current) return; const files = e.dataTransfer.files; if (files.length > 1) { fail('每次请选择一份简历。'); return; } if (files[0]) void selectFile(files[0]); }}>
          <button className="upload-target" type="button" onClick={file ? resumePanel : chooseFile} aria-label={file ? `查看已选择的文件：${file.name}` : '选择或拖拽简历文件'}>
            <FileArrowUp className="upload-icon" size={57} weight="thin" aria-hidden="true" />
            <span className="upload-copy"><strong>{dragging ? '松开，选择这份简历' : file ? file.name : '上传你的简历'}</strong><span>{file ? `${status === 'extracting' ? '正在识别' : '已选择'} · ${fileSize(file.size)}` : '点击选择，或拖拽文件到这里'}</span></span>
          </button>
          <button className="button primary upload-button" type="button" onClick={chooseFile} disabled={busy}>{file ? '更换文件' : '上传简历'}</button>
        </div>
        <p className={status === 'idle' || panel ? 'visually-hidden' : status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
        <button className="button secondary fill-button" type="button" disabled={busy && !facts && !file} onClick={facts || file && busy ? resumePanel : beginOnlineReview}>{resume ? '查看优化结果' : facts ? '继续核对我的材料' : busy ? '查看处理进度' : '没有简历？在线填写'}</button>
        <p className="registration-note">首次修改与下载，无需注册</p>
      </div>
    </main>

    {panel === 'login' && <Modal title="先体验，再保存" onClose={close}><p className="modal-lead">首次修改简历无需注册。</p><p className="muted">账号与历史版本功能尚未开放。你可以先体验上传和在线填写。</p><button className="button primary full" onClick={close}>开始体验</button></Modal>}

    {panel === 'processing' && !busy && <Modal title="简历识别未完成" onClose={close}>
      {file && <p className="file-name">{file.name} · {fileSize(file.size)}</p>}
      <p className={status === 'error' ? 'error' : 'processing-status'} aria-live="polite" aria-atomic="true">{statusText}</p>
      <p className="preview-note">支持 PDF、DOCX，最大 10 MB，PDF 最多 10 页。扫描型 PDF 暂不支持，请使用带有可选择文字的文件。</p>
      <button className="button secondary full" disabled={busy} onClick={chooseFile}>重新选择</button>
    </Modal>}

    {loading}
  </div>;
}
