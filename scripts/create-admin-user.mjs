import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readAccessConfig } from '../server/access-config.js';
import { AccessStore } from '../server/access-store.js';

async function hiddenQuestion(label) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const lines = createInterface({ input, output });
    try { return await lines.question(label); }
    finally { lines.close(); }
  }
  output.write(label);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  return await new Promise((resolve, reject) => {
    let value = '';
    const finish = error => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = character => {
      if (character === '\u0003') return finish(new Error('已取消。'));
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u007f' || character === '\b') { value = value.slice(0, -1); return; }
      value += character;
    };
    input.on('data', onData);
  });
}

const config = readAccessConfig(process.env);
if (!config.enabled) throw new Error('请先启用 ACCESS_REQUIRED。');
const first = await hiddenQuestion(`请输入管理密码（至少 ${config.adminPasswordMinLength ?? 12} 个字符）：`);
const second = await hiddenQuestion('请再次输入管理密码：');
if (first !== second) throw new Error('两次输入的密码不一致。');
const store = new AccessStore(config);
if (process.argv.includes('--reset')) {
  store.resetAdminPassword(first);
  console.log('管理密码已更新，原有管理会话已退出。');
} else {
  store.setupAdmin(first);
  console.log('管理员已创建。');
}
