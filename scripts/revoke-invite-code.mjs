import { readAccessConfig } from '../server/access-config.js';
import { AccessStore } from '../server/access-store.js';

const code = process.argv.slice(2).find(item => item.startsWith('--code='))?.slice('--code='.length)?.trim();
if (!code) throw new Error('请提供 --code=OFFER-XXXX-XXXX-XXXX。');

const config = readAccessConfig({ ...process.env, ACCESS_REQUIRED: 'true' });
const store = new AccessStore(config);
store.revokeInvite(code);
console.log('邀请码及其现有会话已撤销。');
