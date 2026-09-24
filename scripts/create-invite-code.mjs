import { readAccessConfig } from '../server/access-config.js';
import { AccessStore } from '../server/access-store.js';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数。`);
  return parsed;
}

const count = option('count', 1);
if (count > 100) throw new Error('每次最多生成 100 个邀请码。');

const config = readAccessConfig({ ...process.env, ACCESS_REQUIRED: 'true' });
const store = new AccessStore(config);
const invitations = Array.from({ length: count }, () => store.createInvite({
  expiresInDays: option('expires-days', 30),
  dailyFlowLimit: option('daily-flows', config.defaultDailyFlowLimit),
  totalFlowLimit: option('total-flows', config.defaultTotalFlowLimit),
}));

console.log('邀请码只会显示这一次，请保存到受控位置并分别发送。');
for (const invitation of invitations) {
  console.log(`${invitation.code}\t有效期至 ${new Date(invitation.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\t每日 ${invitation.dailyFlowLimit} 次\t总计 ${invitation.totalFlowLimit} 次`);
}
