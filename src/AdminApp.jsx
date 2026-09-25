import { useEffect, useMemo, useState } from 'react';
import '@fontsource/noto-serif-sc/400.css';
import {
  createInvites, getAdminStatus, getAudit, getCalls, getInvites, getOverview, getSettings,
  loginAdmin, logoutAdmin, resetInviteToday, setupAdmin, updateInvite, updateSettings,
} from './admin-api';
import './admin.css';

const pages = [
  ['overview', '总览'], ['invites', '邀请码'], ['calls', '调用记录'], ['settings', '运行控制'], ['audit', '操作记录'],
];

const operationLabels = { extract: '识别', diagnose: '诊断', optimize: '优化', export: '导出' };
const errorLabels = {
  unknown: '未知错误', provider_failed: '外部处理失败', request_invalid: '请求内容无效', document_invalid: '文档无效',
  optimization_paused: '已暂停新优化', daily_budget_exceeded: '达到费用上限', invite_quota_exceeded: '邀请码额度用完',
  csrf_invalid: '页面会话失效', privacy_consent_required: '未确认隐私说明', internal_error: '内部错误',
};
const actionLabels = {
  'admin.setup': '创建管理员', 'admin.password_reset': '重置管理密码', 'invite.create_batch': '创建邀请码',
  'invite.update': '修改邀请码', 'invite.reset_today': '重置今日次数', 'settings.update': '修改运行设置',
};

function dateTime(value) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function fullDate(value) {
  return value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '长期有效';
}

function number(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value) || 0);
}

function money(micros) {
  return `¥${((Number(micros) || 0) / 1_000_000).toFixed(2)}`;
}

function ErrorNotice({ message, onClose }) {
  if (!message) return null;
  return <div className="admin-notice is-error" role="alert"><span>{message}</span>{onClose && <button type="button" onClick={onClose}>关闭</button>}</div>;
}

function AuthScreen({ setupRequired, minimumPasswordLength = 12, loginHint = '', onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (setupRequired && password !== confirmation) { setError('两次输入的密码不一致。'); return; }
    setBusy(true); setError('');
    try {
      await (setupRequired ? setupAdmin(password) : loginAdmin(password));
      onAuthenticated();
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <main className="admin-auth-shell">
    <a className="admin-brand" href="/">简历</a>
    <form className="admin-auth" onSubmit={submit}>
      <p className="admin-eyebrow">运营控制台</p>
      <h1>{setupRequired ? '创建管理密码' : '登录控制台'}</h1>
      <p>{setupRequired ? `这是本机首次进入。密码只保存为不可逆摘要，至少 ${minimumPasswordLength} 个字符。` : '使用独立管理密码查看用量并调整运行设置。'}</p>
      {loginHint && <p className="admin-login-hint">提示：{loginHint}</p>}
      <label>管理密码<input type="password" autoComplete={setupRequired ? 'new-password' : 'current-password'} minLength={minimumPasswordLength} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required autoFocus /></label>
      {setupRequired && <label>再次输入<input type="password" autoComplete="new-password" minLength={minimumPasswordLength} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>}
      <ErrorNotice message={error} />
      <button className="admin-primary" type="submit" disabled={busy || password.length < minimumPasswordLength || setupRequired && confirmation.length < minimumPasswordLength}>{busy ? '正在处理' : setupRequired ? '创建并进入' : '登录'}</button>
      <a className="admin-back" href="/">返回简历首页</a>
    </form>
  </main>;
}

function Metric({ label, value, detail }) {
  return <div className="admin-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function Overview({ data, days, onDays }) {
  if (!data) return <div className="admin-loading">正在读取今日数据…</div>;
  const { summary, trend, failures, settings } = data;
  const max = Math.max(1, ...trend.map(item => item.optimizeCount));
  return <>
    <header className="admin-page-heading">
      <div><p className="admin-eyebrow">运行概况</p><h1>今日使用情况</h1><p>数据每 10 秒更新一次，费用为项目侧估算。</p></div>
      <div className="admin-heading-actions"><a className="admin-export" href="/api/admin/export?type=daily">导出每日数据</a><label className="admin-select">统计趋势<select value={days} onChange={event => onDays(Number(event.target.value))}><option value="7">最近 7 天</option><option value="14">最近 14 天</option><option value="30">最近 30 天</option></select></label></div>
    </header>
    {settings.optimizationPaused && <div className="admin-notice is-warning">新的诊断与优化当前处于暂停状态。</div>}
    {Number(summary.estimatedCostYuan) >= Number(settings.dailyExternalAlertYuan) && <div className={`admin-notice ${Number(summary.estimatedCostYuan) >= Number(settings.dailyExternalBudgetYuan) ? 'is-error' : 'is-warning'}`}>今日预估费用已达到{Number(summary.estimatedCostYuan) >= Number(settings.dailyExternalBudgetYuan) ? '硬上限' : '提醒金额'}，请检查调用记录。</div>}
    <section className="admin-metrics" aria-label="今日关键数据">
      <Metric label="活跃邀请码" value={number(summary.activeInvites)} />
      <Metric label="完成优化" value={number(summary.optimizeCount)} />
      <Metric label="接口成功率" value={`${summary.successRate}%`} detail={`${number(summary.requestCount)} 次产品调用`} />
      <Metric label="外部处理" value={number(summary.externalAttempts)} detail={`${number(summary.totalTokens)} tokens`} />
      <Metric label="今日预估费用" value={`¥${Number(summary.estimatedCostYuan).toFixed(2)}`} detail={`上限 ¥${settings.dailyExternalBudgetYuan}`} />
    </section>
    <section className="admin-section admin-trend">
      <div className="admin-section-title"><div><h2>优化趋势</h2><p>按成功进入优化流程的日计数展示。</p></div></div>
      <div className="admin-bars" aria-label="每日优化次数">
        {trend.map(item => <div className="admin-bar-column" key={item.day} title={`${item.day}：${item.optimizeCount} 次`}>
          <span className="admin-bar-value">{item.optimizeCount}</span><i style={{ height: `${Math.max(3, item.optimizeCount / max * 100)}%` }} /><small>{item.day.slice(5)}</small>
        </div>)}
      </div>
    </section>
    <div className="admin-two-column">
      <section className="admin-section">
        <div className="admin-section-title"><div><h2>流程分布</h2><p>用于定位用户在哪一步离开。</p></div></div>
        <dl className="admin-definition-list">
          <div><dt>文档识别</dt><dd>{number(summary.extractCount)}</dd></div>
          <div><dt>材料诊断</dt><dd>{number(summary.diagnoseCount)}</dd></div>
          <div><dt>简历优化</dt><dd>{number(summary.optimizeCount)}</dd></div>
          <div><dt>PDF 导出</dt><dd>{number(summary.exportCount)}</dd></div>
          <div><dt>平均耗时</dt><dd>{summary.averageDurationMs ? `${(summary.averageDurationMs / 1000).toFixed(1)} 秒` : '—'}</dd></div>
        </dl>
      </section>
      <section className="admin-section">
        <div className="admin-section-title"><div><h2>失败原因</h2><p>最近 {days} 天，仅显示错误分类。</p></div></div>
        {failures.length ? <dl className="admin-definition-list">{failures.map(item => <div key={item.code}><dt>{errorLabels[item.code] || item.code}</dt><dd>{number(item.count)}</dd></div>)}</dl> : <p className="admin-empty">当前统计周期没有失败记录。</p>}
      </section>
    </div>
  </>;
}

function InviteRow({ invite, originalCode, onSaved, onReset }) {
  const [draft, setDraft] = useState({ label: invite.label || '', dailyFlowLimit: invite.dailyFlowLimit, totalFlowLimit: invite.totalFlowLimit, tester: invite.tester, status: invite.status });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await updateInvite(invite.id, draft); onSaved(); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <div className="admin-invite-row">
    <div className="admin-invite-identity">
      <strong className={originalCode ? 'is-code' : ''}>{originalCode || invite.label || `管理编号 ${invite.id.slice(0, 8)}`}</strong>
      <span>{originalCode
        ? `${invite.label ? `备注：${invite.label} · ` : ''}原始码仅在本页可见`
        : invite.label ? `管理编号 ${invite.id.slice(0, 8)}` : '原始邀请码已安全隐藏'} · {invite.redeemedAt ? `已使用 · 最近 ${dateTime(invite.lastSeenAt)}` : '尚未使用'} · {fullDate(invite.expiresAt)}</span>
    </div>
    <label>备注<input value={draft.label} maxLength={40} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
    <label>每日<input type="number" min="1" max="100" value={draft.dailyFlowLimit} onChange={event => setDraft({ ...draft, dailyFlowLimit: Number(event.target.value) })} /></label>
    <label>总量<input type="number" min="1" max="10000" value={draft.totalFlowLimit} onChange={event => setDraft({ ...draft, totalFlowLimit: Number(event.target.value) })} /></label>
    <label className="admin-check"><input type="checkbox" checked={draft.tester} onChange={event => setDraft({ ...draft, tester: event.target.checked })} /><span>测试账号</span></label>
    <label>状态<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="active">有效</option><option value="revoked">已撤销</option></select></label>
    <div className="admin-invite-usage"><span>今日 {invite.optimizeToday}/{invite.dailyFlowLimit}</span><span>累计 {invite.optimizeTotal}/{invite.totalFlowLimit}</span></div>
    <div className="admin-row-actions"><button type="button" onClick={save} disabled={busy}>{busy ? '保存中' : '保存'}</button><button type="button" onClick={() => onReset(invite.id)}>重置今日</button></div>
    {error && <p className="admin-row-error">{error}</p>}
  </div>;
}

function Invites({ data, onReload }) {
  const [form, setForm] = useState({ count: 1, expiresInDays: 30, dailyFlowLimit: 2, totalFlowLimit: 20, tester: false, label: '' });
  const [created, setCreated] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!data?.defaults) return;
    setForm(current => ({
      ...current,
      dailyFlowLimit: data.defaults.dailyFlowLimit,
      totalFlowLimit: data.defaults.totalFlowLimit,
    }));
  }, [data?.defaults?.dailyFlowLimit, data?.defaults?.totalFlowLimit]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setCreated([]);
    try { const result = await createInvites(form); setCreated(result.invites); onReload(); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  async function reset(id) {
    setError('');
    try { await resetInviteToday(id); onReload(); }
    catch (issue) { setError(issue.message); }
  }
  const codes = created.map(item => item.code).join('\n');
  const createdCodeById = new Map(created.map(item => [item.id, item.code]));
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">准入管理</p><h1>邀请码</h1><p>原始邀请码只在创建后显示一次，之后只能调整对应记录。</p></div><a className="admin-export" href="/api/admin/export?type=invites">导出使用数据</a></header>
    <form className="admin-create-strip" onSubmit={submit}>
      <label>数量<input type="number" min="1" max="50" value={form.count} onChange={event => setForm({ ...form, count: Number(event.target.value) })} /></label>
      <label>有效天数<input type="number" min="1" max="365" value={form.expiresInDays} onChange={event => setForm({ ...form, expiresInDays: Number(event.target.value) })} /></label>
      <label>每日优化<input type="number" min="1" max="100" value={form.dailyFlowLimit} onChange={event => setForm({ ...form, dailyFlowLimit: Number(event.target.value) })} /></label>
      <label>总优化<input type="number" min="1" max="10000" value={form.totalFlowLimit} onChange={event => setForm({ ...form, totalFlowLimit: Number(event.target.value) })} /></label>
      <label className="admin-grow">备注<input maxLength={40} placeholder="例如：首轮朋友测试" value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} /></label>
      <label className="admin-check"><input type="checkbox" checked={form.tester} onChange={event => setForm({ ...form, tester: event.target.checked })} /><span>测试账号不限次数</span></label>
      <button className="admin-primary" type="submit" disabled={busy || !data?.defaults}>{busy ? '正在创建' : data?.defaults ? '创建邀请码' : '正在读取默认额度'}</button>
    </form>
    <ErrorNotice message={error} onClose={() => setError('')} />
    {created.length > 0 && <section className="admin-created-codes"><div><h2>请立即保存</h2><p>离开页面后不能再次查看这些邀请码。</p></div><pre>{codes}</pre><button type="button" onClick={() => navigator.clipboard?.writeText(codes)}>复制全部</button></section>}
    <section className="admin-section admin-invite-list">
      <div className="admin-section-title"><div><h2>现有邀请码</h2><p>{data?.invites?.length || 0} 条记录。备注不要填写简历内容或联系方式。</p></div></div>
      {data?.invites?.length ? data.invites.map(invite => <InviteRow key={`${invite.id}-${invite.status}-${invite.dailyFlowLimit}-${invite.totalFlowLimit}-${invite.tester}-${invite.optimizeToday}`} invite={invite} originalCode={createdCodeById.get(invite.id)} onSaved={onReload} onReset={reset} />) : <p className="admin-empty">还没有邀请码。</p>}
    </section>
  </>;
}

function Calls({ data, filters, onFilters }) {
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">运行追踪</p><h1>调用记录</h1><p>仅保存请求元数据、耗时、token 和错误分类，不保存简历正文。</p></div>
      <div className="admin-heading-actions"><a className="admin-export" href="/api/admin/export?type=calls">导出调用记录</a><div className="admin-filters"><select value={filters.operation} onChange={event => onFilters({ ...filters, operation: event.target.value })}><option value="">全部操作</option>{Object.entries(operationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select value={filters.status} onChange={event => onFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option><option value="success">成功</option><option value="failed">失败</option><option value="running">进行中</option></select></div></div>
    </header>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th><th>操作</th><th>结果</th><th>耗时</th><th>外部请求</th><th>Token</th><th>预估费用</th><th>请求编号</th></tr></thead><tbody>
      {data?.map(item => <tr key={item.id}><td>{dateTime(item.startedAt)}</td><td>{operationLabels[item.operation] || item.operation}</td><td><span className={`admin-status is-${item.status}`}>{item.status === 'success' ? '成功' : item.status === 'running' ? '进行中' : errorLabels[item.errorCode] || '失败'}</span></td><td>{item.durationMs === null ? '—' : `${(item.durationMs / 1000).toFixed(1)} 秒`}</td><td>{item.externalAttempts}</td><td>{number(item.totalTokens)}</td><td>{money(item.estimatedCostMicros)}</td><td><code>{item.requestId.slice(0, 8)}</code></td></tr>)}
      {!data?.length && <tr><td colSpan="8" className="admin-empty">暂无符合条件的调用记录。</td></tr>}
    </tbody></table></div>
  </>;
}

function Settings({ data, onSaved }) {
  const [draft, setDraft] = useState(data);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setDraft(data), [data]);
  if (!draft) return <div className="admin-loading">正在读取运行设置…</div>;
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { const result = await updateSettings(draft); setDraft(result.settings); setNotice('设置已保存，将对下一次请求生效。'); onSaved(result.settings); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">安全控制</p><h1>运行控制</h1><p>这里只开放可安全即时调整的参数，密钥和并发等配置仍由服务器管理。</p></div></header>
    <form className="admin-settings" onSubmit={save}>
      <section><div><h2>前端访问策略</h2><p>保存后普通页面会在下一次同步时采用所选策略，最长约 30 秒。</p></div><div className="admin-access-options" role="radiogroup" aria-label="前端访问策略"><label><input type="radio" name="invite-required" checked={!draft.inviteRequired} onChange={() => setDraft({ ...draft, inviteRequired: false })} /><span><strong>无需邀请码</strong><small>适合当前测试，访客可直接进入。</small></span></label><label><input type="radio" name="invite-required" checked={draft.inviteRequired} onChange={() => setDraft({ ...draft, inviteRequired: true })} /><span><strong>需要邀请码</strong><small>未持有有效邀请码的访客将停留在准入页。</small></span></label></div></section>
      <section><h2>新邀请码默认额度</h2><p>只影响之后创建的邀请码，现有邀请码可以单独调整。</p><div className="admin-settings-fields"><label>每日优化次数<input type="number" min="1" max="100" value={draft.defaultDailyFlowLimit} onChange={event => setDraft({ ...draft, defaultDailyFlowLimit: Number(event.target.value) })} /></label><label>总优化次数<input type="number" min="1" max="10000" value={draft.defaultTotalFlowLimit} onChange={event => setDraft({ ...draft, defaultTotalFlowLimit: Number(event.target.value) })} /></label></div></section>
      <section><h2>费用保护</h2><p>费用按照当前项目的单次均值估算，供应商账单仍是最终依据。</p><div className="admin-settings-fields"><label>提醒金额（元/日）<input type="number" min="1" max="10000" value={draft.dailyExternalAlertYuan} onChange={event => setDraft({ ...draft, dailyExternalAlertYuan: Number(event.target.value) })} /></label><label>硬上限（元/日）<input type="number" min="1" max="10000" value={draft.dailyExternalBudgetYuan} onChange={event => setDraft({ ...draft, dailyExternalBudgetYuan: Number(event.target.value) })} /></label></div></section>
      <section className="admin-stop-control"><div><h2>暂停新的诊断与优化</h2><p>紧急止损时使用。文档识别和已有结果导出仍可继续。</p></div><label className="admin-switch"><input type="checkbox" checked={draft.optimizationPaused} onChange={event => setDraft({ ...draft, optimizationPaused: event.target.checked })} /><span>{draft.optimizationPaused ? '已暂停' : '运行中'}</span></label></section>
      <div className="admin-settings-note"><span>无需邀请码只关闭入口校验；隐私确认、请求统计、限流与费用保护仍然生效。</span></div>
      <ErrorNotice message={error} onClose={() => setError('')} />{notice && <div className="admin-notice is-success">{notice}</div>}
      <button className="admin-primary" type="submit" disabled={busy}>{busy ? '正在保存' : '保存运行设置'}</button>
    </form>
  </>;
}

function Audit({ data }) {
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">变更追踪</p><h1>操作记录</h1><p>记录管理员修改了什么，不记录密码和邀请码原文。</p></div></header>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th><th>操作</th><th>目标</th><th>操作者</th></tr></thead><tbody>{data?.map(item => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{actionLabels[item.action] || item.action}</td><td>{item.targetType === 'invite' && item.targetId ? `邀请码 ${item.targetId.slice(0, 8)}` : item.targetType || '—'}</td><td>{item.username || '系统命令'}</td></tr>)}{!data?.length && <tr><td colSpan="4" className="admin-empty">暂无操作记录。</td></tr>}</tbody></table></div>
  </>;
}

export function AdminApp() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, setupRequired: false });
  const [page, setPage] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [filters, setFilters] = useState({ operation: '', status: '', limit: 100 });
  const title = useMemo(() => pages.find(([key]) => key === page)?.[1] || '运营控制台', [page]);

  async function check() {
    try { setAuth({ loading: false, ...(await getAdminStatus()) }); }
    catch (issue) { setAuth({ loading: false, authenticated: false, setupRequired: false }); setError(issue.message); }
  }
  useEffect(() => { void check(); }, []);

  async function load(activePage = page) {
    setError('');
    try {
      const result = activePage === 'overview' ? await getOverview(days)
        : activePage === 'invites' ? await getInvites()
          : activePage === 'calls' ? await getCalls(filters)
            : activePage === 'settings' ? await getSettings()
              : await getAudit();
      setData(result);
    } catch (issue) {
      if (issue.status === 401) { setAuth({ loading: false, authenticated: false, setupRequired: false }); return; }
      setError(issue.message);
    }
  }
  useEffect(() => {
    if (!auth.authenticated) return undefined;
    setData(null); void load(page);
    if (!['overview', 'calls'].includes(page)) return undefined;
    const timer = window.setInterval(() => void load(page), 10_000);
    return () => window.clearInterval(timer);
  }, [auth.authenticated, page, days, filters.operation, filters.status]);

  if (auth.loading) return <div className="admin-loading-screen">正在打开运营控制台…</div>;
  if (!auth.authenticated) return <AuthScreen setupRequired={auth.setupRequired} minimumPasswordLength={auth.minimumPasswordLength} loginHint={auth.loginHint} onAuthenticated={() => void check()} />;
  const content = page === 'overview' ? <Overview data={data} days={days} onDays={setDays} />
    : page === 'invites' ? <Invites data={data} onReload={() => void load('invites')} />
      : page === 'calls' ? <Calls data={data?.calls} filters={filters} onFilters={setFilters} />
        : page === 'settings' ? <Settings data={data?.settings} onSaved={() => void load('settings')} />
          : <Audit data={data?.events} />;
  return <div className="admin-shell">
    <aside className="admin-sidebar"><a className="admin-brand" href="/">简历</a><div><p>运营控制台</p><nav aria-label="控制台导航">{pages.map(([key, label]) => <button type="button" className={page === key ? 'is-active' : ''} key={key} onClick={() => setPage(key)}>{label}</button>)}</nav></div>{auth.localMode ? <span className="admin-local-badge">本机测试模式</span> : <button className="admin-logout" type="button" onClick={async () => { await logoutAdmin().catch(() => null); setAuth({ loading: false, authenticated: false, setupRequired: false }); }}>退出登录</button>}</aside>
    <main className="admin-main"><div className="admin-mobile-head"><strong>{title}</strong><a href="/">返回首页</a></div><ErrorNotice message={error} onClose={() => setError('')} />{content}</main>
  </div>;
}
