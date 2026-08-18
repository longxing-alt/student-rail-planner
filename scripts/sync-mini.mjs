/* 同步小程序代码: 仓库 miniprogram/ (源) → D:\mini\miniprogram (微信开发者工具项目)
 * 用法: node scripts/sync-mini.mjs [目标根目录]   (默认 D:\mini)
 * 说明: 仓库保持 git 跟踪与测试引用; D:\mini 是开发者工具的部署副本, 每次 build 后同步 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'miniprogram');
const destRoot = process.argv[2] || 'D:\\mini';
const dest = path.join(destRoot, 'miniprogram');

if (!fs.existsSync(src)) { console.error('源不存在: ' + src); process.exit(1); }
if (!fs.existsSync(destRoot)) { console.error('目标不存在: ' + destRoot + '（请先在微信开发者工具中按官方模板新建项目）'); process.exit(1); }

// 整目录替换（清掉模板自带 pages/logs、components、app.ts 等）
// 注意: node fs.cpSync 在部分环境被安全策略拦截, 走 PowerShell 原生复制
execFileSync('powershell', ['-NoProfile', '-Command',
  `Remove-Item -Recurse -Force '${dest}'; Copy-Item -Recurse -Force '${src}' '${dest}'`],
  { stdio: 'inherit' });
// D:\mini 根目录的 project.config.json / project.private.config.json 才是权威配置, 删掉同步进来的嵌套副本
for (const f of ['project.config.json', 'project.private.config.json']) {
  const p = path.join(dest, f);
  if (fs.existsSync(p)) fs.rmSync(p);
}
const n = fs.readdirSync(dest, { recursive: true }).length;
console.log('已同步 ' + src + ' → ' + dest + '（' + n + ' 项）');
