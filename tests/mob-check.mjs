/* 手机端布局体检: 启动 Edge headless → CDP → 实测各元素尺寸/溢出/计算样式
   用法: node tests/mob-check.mjs <url> <宽度> <高度>   (需先本地起 http 服务)
   场景: ①布局指标 ②触屏拖拽排序 ③多站节点条 ④规则菜单 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';
const URL = process.argv[2] || 'http://localhost:8899/index.html';
const width = +(process.argv[3] || 390), height = +(process.argv[4] || 844);

const port = 9333 + Math.floor(Math.random() * 500);
const profile = (await import('node:os')).tmpdir() + '/zcode-edge-' + port;
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  '--window-size=' + width + ',' + height, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r.json(); } catch (e) { }
    await sleep(250);
  }
  throw new Error('CDP 未就绪: ' + url);
}

const tabs = await waitJSON(`http://127.0.0.1:${port}/json/list`);
const tab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-')) || tabs.find(t => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(res => ws.onopen = res);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: URL });
await sleep(6500); // 等 Leaflet/演示数据加载

const status = await send('Runtime.evaluate', {
  expression: `({ href: location.href, title: document.title, bodyLen: document.body ? document.body.innerHTML.length : -1, totals: !!document.querySelector('#totals'), wizard: !!document.querySelector('#wizardBar') })`,
  returnByValue: true,
});
console.log('PAGE:', JSON.stringify(status.result.result.value));

const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const W = window.innerWidth, SW = document.documentElement.scrollWidth;
    const g = sel => document.querySelector(sel);
    const css = (el, p) => el ? getComputedStyle(el)[p] : null;
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };
    const rows = [...document.querySelectorAll('#tripList .stop-row, #tripList .trip-row')];
    const rc = g('.route-chain');
    const tripRow = rows.find(r => r.querySelector('.trip-main'));
    return {
      viewport: W, docScrollW: SW, horizOverflow: SW > W,
      nav: {
        inner: rect(g('nav .inner')),
        links: [...document.querySelectorAll('nav .nav-link')].map(a => ({ txt: a.textContent, w: Math.round(a.getBoundingClientRect().width), hidden: css(a, 'display') === 'none' })),
        verHidden: css(g('.ver'), 'display') === 'none',
      },
      wrap: rect(g('.wrap')),
      wsInput: { pad: css(g('.ws-input'), 'padding') },
      inputFont: css(g('#schoolInput'), 'fontSize') || css(g('#tripInput'), 'fontSize'),
      wizard: { wrap: css(g('.wizard-bar'), 'flexWrap'), w: rect(g('#wizardBar')) },
      iv: rect(g('.iv-box')),
      chain: { scrollable: rc ? (rc.scrollWidth > rc.clientWidth) : null, clientW: rc ? rc.clientWidth : null, scrollW: rc ? rc.scrollWidth : null, jc: rc ? css(rc, 'justifyContent') : null },
      totals: { display: css(g('#totals'), 'display'), cols: css(g('#totals'), 'gridTemplateColumns'), w: rect(g('#totals')).w },
      rows: { n: rows.length, firstW: rows[0] ? rect(rows[0]).w : null, tripMain: tripRow ? css(tripRow.querySelector('.trip-main'), 'flex') : null },
      mapBtnOrder: css(g('#mapToggleBtn'), 'order'),
      hint: { order: css(g('.ws-top .hint'), 'order'), basis: css(g('.ws-top .hint'), 'flexBasis') },
      handleTouch: rows[0] ? css(rows[0].querySelector('.drag-handle'), 'touchAction') : null,
      pointerEvent: typeof window.PointerEvent,
      mapExists: !!window.L,
      usedBig: css(g('#usedBig'), 'fontSize'),
    };
  })()`,
  returnByValue: true,
});
if (r.result.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.result.exceptionDetails));
console.log(JSON.stringify(r.result.result.value, null, 2));

/* ---- 场景2: 触屏拖拽排序(模拟 pointer 事件, 拖第3行到第2位) ---- */
const drag = await send('Runtime.evaluate', {
  expression: `(async () => {
    const list = document.getElementById('tripList');
    const kids = () => [...list.children];
    const row0 = kids()[0], row2 = kids()[2];
    const handle0 = row0.querySelector('.drag-handle');
    const r2 = row2.getBoundingClientRect();
    const cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
    handle0.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: cx, clientY: cy, cancelable: true }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', clientX: cx, clientY: cy, cancelable: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: cx, clientY: cy, cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    const texts = state.trips.map(t => t.text);
    return { texts, routeStart: state.routeStart ? state.routeStart.name : null };
  })()`,
  awaitPromise: true, returnByValue: true,
});
console.log('DRAG:', JSON.stringify(drag.result.result.value));

/* ---- 场景3: 加满站点后路线节点条是否可横滚 ---- */
const many = await send('Runtime.evaluate', {
  expression: `(async () => {
    for (const c of ['天津','郑州','西安','兰州']) {
      const r = await resolvePlace(c);
      if (r) state.trips.push({ id: ++state._tid, text: c, point: r.point, station: r.station, round: false });
    }
    renderAll();
    const rc = document.querySelector('.route-chain');
    return { scrollable: rc.scrollWidth > rc.clientWidth, clientW: rc.clientWidth, scrollW: rc.scrollWidth };
  })()`,
  awaitPromise: true, returnByValue: true,
});
console.log('CHAIN-SCROLL:', JSON.stringify(many.result.result.value));

/* ---- 场景4: 规则菜单手机尺寸 ---- */
const menu = await send('Runtime.evaluate', {
  expression: `(() => {
    toggleRulesMenu({ stopPropagation() {} });
    const m = document.getElementById('rulesMenu');
    const r = m.getBoundingClientRect();
    const st = getComputedStyle(m);
    return { x: Math.round(r.x), w: Math.round(r.width), vw: window.innerWidth, maxH: st.maxHeight, ov: st.overflowY };
  })()`,
  returnByValue: true,
});
console.log('MENU:', JSON.stringify(menu.result.result.value));
ws.close();
proc.kill();
process.exit(0);
