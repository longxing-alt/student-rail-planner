/* 校验 WXML 事件处理器都在 index.js 中定义 */
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(import.meta.dirname, '../miniprogram/pages/index');
const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
const handlers = new Set();
for (const m of wxml.matchAll(/(?:bind|catch)[a-z]+="([A-Za-z_][A-Za-z0-9_]*)"/g)) handlers.add(m[1]);
const missing = [...handlers].filter(h => !new RegExp('\\b' + h + '\\s*\\(').test(js));
console.log('WXML 事件处理器(' + handlers.size + '):', [...handlers].join(', '));
if (missing.length) { console.error('未定义: ' + missing.join(', ')); process.exit(1); }
console.log('OK 全部有定义');
