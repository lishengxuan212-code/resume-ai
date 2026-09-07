import { useRef, useState } from 'react';
import { FileArrowUp, FileText, ArrowLeft, Check } from '@phosphor-icons/react';
import '@fontsource/noto-serif-sc/400.css';
import { Modal } from './Modal';
import { validateFile, fileSize } from './intake';

const emptyDraft = { name: '', school: '', major: '', role: '', experience: '' };

export function App() {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmed, setConfirmed] = useState(false);
  const chooseFile = () => inputRef.current?.click();
  const selectFile = nextFile => {
    const issue = validateFile(nextFile);
    setError(issue);
    if (!issue) { setFile(nextFile); setPanel('file'); }
  };
  const close = () => setPanel(null);
  const change = e => { setConfirmed(false); setDraft({ ...draft, [e.target.name]: e.target.value }); };

  return (
    <div className="page">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="简历首页">简历</a>
        <button className="login-link" onClick={() => setPanel('login')}>登录</button>
      </header>

      <main className="hero">
        <div className="offer-stage" aria-hidden="true"><img className="offer-image" src="/assets/offer.png" alt="" width="1254" height="1254" fetchPriority="high" /></div>
        <h1><span>心仪的工作，</span><span>从好简历开始。</span></h1>
        <p className="subtitle">针对目标岗位优化简历，让你的优势更有说服力。</p>

        <div className="intake">
          <input className="visually-hidden" type="file" accept=".pdf,.docx" ref={inputRef} tabIndex={-1} aria-label="选择简历文件" onChange={e => { if (e.target.files?.[0]) selectFile(e.target.files[0]); e.target.value = ''; }} />
          <div className={`upload-panel ${dragging ? 'is-dragging' : ''}`} onDragEnter={e => { e.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); const files = e.dataTransfer.files; if (files.length > 1) { setError('每次请选择一份简历。'); return; } if (files[0]) selectFile(files[0]); }}>
            <button className="upload-target" type="button" onClick={file ? () => setPanel('file') : chooseFile} aria-label={file ? `查看已选择的文件：${file.name}` : '选择或拖拽简历文件'}>
              <FileArrowUp className="upload-icon" size={57} weight="thin" aria-hidden="true" />
              <span className="upload-copy"><strong>{dragging ? '松开，选择这份简历' : file ? file.name : '上传你的简历'}</strong><span>{file ? `已选择 · ${fileSize(file.size)}` : '点击选择，或拖拽文件到这里'}</span></span>
            </button>
            <button className="button primary upload-button" type="button" onClick={chooseFile}>{file ? '更换文件' : '上传简历'}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button secondary fill-button" type="button" onClick={() => setPanel('fill')}>{confirmed ? '继续编辑我的经历' : '没有简历？在线填写'}</button>
          <p className="registration-note">首次修改与下载，无需注册</p>
        </div>
      </main>

      {panel === 'login' && <Modal title="先体验，再保存" onClose={close}><p className="modal-lead">首次修改简历无需注册。</p><p className="muted">账号与历史版本功能尚未开放。你可以先体验上传和在线填写。</p><button className="button primary full" onClick={close}>开始体验</button></Modal>}

      {panel === 'file' && file && <Modal title="这份简历，准备好了" onClose={close}>
        <div className="file-summary"><FileText size={38} weight="thin" /><div><strong>{file.name}</strong><p>{fileSize(file.size)} · 仅在当前页面选中</p></div><Check size={20} /></div>
        <label className="field">想投递的岗位 <span className="optional">选填</span><input name="role" value={draft.role} onChange={change} placeholder="例如：产品助理、前端开发" maxLength={80} /></label>
        <p className="preview-note">当前为前端预览，文件尚未上传或解析，AI 修改将在后续接入。</p>
        <div className="modal-actions"><button className="button secondary" onClick={chooseFile}>重新选择</button><button className="button primary" onClick={close}>确认材料</button></div>
      </Modal>}

      {panel === 'fill' && <Modal title="从你的经历开始" onClose={close}>
        <p className="modal-lead">不必写得专业，先告诉我们你做过什么。</p>
        <form onSubmit={e => { e.preventDefault(); setPanel('review'); }}>
          <div className="field-row"><label className="field">姓名<input name="name" value={draft.name} onChange={change} placeholder="你的姓名" autoComplete="name" maxLength={40} required /></label><label className="field">学校<input name="school" value={draft.school} onChange={change} placeholder="你的学校" maxLength={80} required /></label></div>
          <div className="field-row"><label className="field">专业 <span className="optional">选填</span><input name="major" value={draft.major} onChange={change} placeholder="所学专业" maxLength={80} /></label><label className="field">目标岗位 <span className="optional">选填</span><input name="role" value={draft.role} onChange={change} placeholder="还没想好可以留空" maxLength={80} /></label></div>
          <label className="field">一段值得讲述的经历<textarea name="experience" value={draft.experience} onChange={change} placeholder="实习、课程项目、社团或兼职都可以。你负责什么，具体做过哪些事？" rows={5} maxLength={4000} required /></label>
          <p className="preview-note">内容仅保留在本次页面中。当前先体验填写与核对，尚未接入 AI 修改。</p>
          <button className="button primary full" type="submit">核对填写内容</button>
        </form>
      </Modal>}

      {panel === 'review' && <Modal title="核对你的材料" onClose={close}>
        <p className="modal-lead">确认事实准确，专业表达交给后续优化。</p>
        <dl className="review-list"><div><dt>姓名</dt><dd>{draft.name}</dd></div><div><dt>教育背景</dt><dd>{draft.school}{draft.major && ` · ${draft.major}`}</dd></div><div><dt>求职方向</dt><dd>{draft.role || '尚未确定'}</dd></div><div className="experience-review"><dt>经历</dt><dd>{draft.experience}</dd></div></dl>
        <p className="preview-note">本次仅核对原始材料，尚未生成优化简历；关闭弹窗后仍可继续编辑，刷新页面将清空。</p>
        <div className="modal-actions"><button className="button secondary" onClick={() => setPanel('fill')}><ArrowLeft size={16} />返回修改</button><button className="button primary" onClick={() => { setConfirmed(true); close(); }}>确认完成</button></div>
      </Modal>}
    </div>
  );
}
