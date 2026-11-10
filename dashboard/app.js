/* Forge Desk: the web desktop. Plain ES modules, no build step. */
import { Terminal } from '/vendor/xterm/lib/xterm.mjs';
import { FitAddon } from '/vendor/xterm-fit/addon-fit.mjs';
import { WebLinksAddon } from '/vendor/xterm-links/addon-web-links.mjs';

/* ================================================================ helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const root = document.documentElement;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const ICONS = {
  terminal: '<path d="m5 8 4 4-4 4M12 16h7"/>',
  files: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.500 5.700 12 3Z"/>',
  desktop: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8.500 20.500h7M12 17v3.500"/>',
  apps: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  automate: '<path d="M13 2.500 5 13.500h6l-1 8 8-11h-6z"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  agent: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.300 6.300l2.400 2.400M15.300 15.300l2.400 2.400M17.700 6.300l-2.400 2.400M8.700 15.300l-2.400 2.400"/>',
  braces: '<path d="M9 4c-2 0-3 1-3 3v2c0 1.500-1 3-2.500 3C5 12 6 13.500 6 15v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1.500 1 3 2.500 3-1.500 0-2.500 1.500-2.500 3v2c0 2-1 3-3 3"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
  text: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  image: '<path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4"/><circle cx="9" cy="9" r="1.500"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  min: '<path d="M6 12h12"/>',
  max: '<path d="M6 6h12v12H6z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.300 6.200M20 4v7h-7"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="19" cy="12" r="1.300"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  play: '<path d="M7 4.500v15l12-7.500z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.200M12 19.300v2.200M2.500 12h2.200M19.300 12h2.200M5.300 5.300l1.600 1.600M17.100 17.100l1.600 1.600M18.700 5.300l-1.600 1.600M6.900 17.100l-1.600 1.600"/>',
  moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500Z"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  clipboard: '<path d="M9 4h6v3H9zM7 5.500H5v15h14v-15h-2"/>',
  fit: '<path d="M4 4h16v16H4zM9 9h6v6H9z"/>',
  save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
};
function icon(name, cls = '') {
  const span = h('span', { class: `ic ${cls}`.trim(), 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] || ICONS.file}</svg>`; // constants above only
  return span;
}
function iconButton(name, label, onclick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`.trim(), type: 'button', title: label, 'aria-label': label, onclick }, icon(name));
}

async function api(path, { method = 'GET', body, raw } = {}) {
  const opt = { method, headers: { 'X-Forge': '1' } };
  if (body !== undefined) {
    if (raw) opt.body = body; else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  let res;
  try { res = await fetch(path, opt); } catch (_) { throw new Error('The server did not answer. Check your connection.'); }
  if (res.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const qs = (obj) => new URLSearchParams(obj).toString();
const wsUrl = (path) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
const joinPath = (...parts) => parts.join('/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
const parentPath = (p) => p.split('/').slice(0, -1).join('/');
const baseName = (p) => p.split('/').pop();
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i += 1; } while (n >= 1024 && i < u.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function fmtUptime(s) {
  const d = Math.floor(s / 86400); const hr = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${hr} h` : hr ? `${hr} h ${m} min` : `${m} min`;
}

/* ================================================================ toasts, dialogs, menus */
const layer = $('#layer');
function toast(message, kind = 'info', ms = 3600) {
  const el = h('div', { class: `toast ${kind}`, text: message });
  $('#toasts').append(el);
  const done = () => el.remove();
  if (ms) setTimeout(done, ms);
  return { update: (t) => { el.textContent = t; }, close: done };
}
const oops = (e) => toast(e.message || String(e), 'error', 6000);

function dialog({ title, message, input, confirm = 'OK', danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const field = input ? h('input', { class: 'field', type: 'text', value: input.value || '', placeholder: input.placeholder || '', 'aria-label': input.label || title, spellcheck: 'false', autocomplete: 'off' }) : null;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const ok = () => { if (field) { const v = field.value.trim(); if (!v) return field.focus(); close(v); } else close(true); };
    const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: ok, text: confirm });
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', { text: title }), message && h('p', { text: message }), field,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null), text: cancel }), okBtn));
    const back = h('div', { class: 'backdrop', onpointerdown: (e) => { if (e.target === back) close(null); } }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok(); }
    };
    document.addEventListener('keydown', onKey, true);
    layer.append(back);
    if (field) { field.focus(); const dot = field.value.lastIndexOf('.'); field.setSelectionRange(0, dot > 0 ? dot : field.value.length); } else okBtn.focus();
  });
}

function menu(anchor, items) {
  closeMenu();
  const list = h('div', { class: 'menu', role: 'menu' }, items.filter(Boolean).map((it) => it === '-' ? h('hr') :
    h('button', { class: it.danger ? 'danger' : '', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); it.run(); } }, icon(it.icon || 'file'), h('span', { text: it.label }))));
  layer.append(list);
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const x = Math.max(8, Math.min(r.left, innerWidth - list.offsetWidth - 8));
  const y = r.bottom + list.offsetHeight + 12 > innerHeight ? Math.max(8, r.top - list.offsetHeight - 6) : r.bottom + 6;
  list.style.left = `${x}px`; list.style.top = `${y}px`;
  setTimeout(() => document.addEventListener('pointerdown', menuAway, true));
  list.querySelector('button')?.focus();
}
function menuAway(e) { if (!e.target.closest('.menu')) closeMenu(); }
function closeMenu() { document.removeEventListener('pointerdown', menuAway, true); layer.querySelectorAll('.menu').forEach((m) => m.remove()); }

/* ================================================================ look */
const WALLS = [['forge', 'Forge'], ['night', 'Night'], ['paper', 'Paper']];
function setTheme(theme) {
  root.dataset.theme = theme; store.set('forge-theme', theme);
  try { localStorage.setItem('forge-theme', theme); } catch (_) { /* ignore */ }
  $('meta[name="theme-color"]').content = theme === 'light' ? '#f0f2f8' : '#0b0f1a';
  document.dispatchEvent(new CustomEvent('forge:theme'));
}
function setWall(wall) { root.dataset.wall = wall; try { localStorage.setItem('forge-wall', wall); } catch (_) { /* ignore */ } }
const termTheme = () => (root.dataset.theme === 'light'
  ? { background: '#f8f9fc', foreground: '#1a2030', cursor: '#0c6fd4', cursorAccent: '#f8f9fc', selectionBackground: '#0c6fd433',
      black: '#1a2030', red: '#c4314b', green: '#1a7f5a', yellow: '#96650a', blue: '#1a6fc4', magenta: '#7a5ba0', cyan: '#0f7c8f', white: '#6b7a92',
      brightBlack: '#8a95a8', brightRed: '#d9485f', brightGreen: '#22976c', brightYellow: '#b07a10', brightBlue: '#3388e0', brightMagenta: '#9474b8', brightCyan: '#1593a8', brightWhite: '#1a2030' }
  : { background: '#0a0e18', foreground: '#e8eaf0', cursor: '#1a8fff', cursorAccent: '#0a0e18', selectionBackground: '#1a8fff44',
      black: '#111827', red: '#ff7d8e', green: '#6fe0b0', yellow: '#d4b87a', blue: '#7db4ff', magenta: '#b8a0d8', cyan: '#6bd8e6', white: '#9ba8be',
      brightBlack: '#6b7a92', brightRed: '#ff9eab', brightGreen: '#8ff0c6', brightYellow: '#e8d0a0', brightBlue: '#a0ccff', brightMagenta: '#d0c0e8', brightCyan: '#93e8f2', brightWhite: '#ffffff' });

/* ================================================================ window manager */
const stage = $('#stage');
const wins = new Map();
let zTop = 10; let focused = null; let cascade = 0; let project = 'project';
const narrow = () => innerWidth < 720;

function saveLayout() {
  clearTimeout(saveLayout.t);
  saveLayout.t = setTimeout(() => {
    store.set('forge-layout', [...wins.values()].sort((a, b) => a.z - b.z).map((w) => ({ app: w.app, state: w.state, g: w.g, max: w.max, min: w.min })));
  }, 250);
}
function place(w) {
  const s = stage.getBoundingClientRect();
  w.g.w = Math.max(320, Math.min(w.g.w, s.width)); w.g.h = Math.max(220, Math.min(w.g.h, s.height));
  w.g.x = Math.max(80 - w.g.w, Math.min(w.g.x, s.width - 80)); w.g.y = Math.max(0, Math.min(w.g.y, s.height - 44));
  Object.assign(w.el.style, { left: `${w.g.x}px`, top: `${w.g.y}px`, width: `${w.g.w}px`, height: `${w.g.h}px` });
}
function focusWin(w) {
  if (!w) { focused = null; wins.forEach((x) => x.el.classList.remove('focus')); renderDock(); return; }
  if (w.min) { w.min = false; w.el.classList.remove('min'); }
  w.z = ++zTop; w.el.style.zIndex = w.z;
  wins.forEach((x) => x.el.classList.toggle('focus', x === w));
  focused = w; renderDock(); saveLayout();
  w.onFocus?.();
}
function topWin(except) {
  return [...wins.values()].filter((w) => !w.min && w !== except).sort((a, b) => b.z - a.z)[0] || null;
}
function minimize(w) { w.min = true; w.el.classList.add('min'); focusWin(topWin(w)); saveLayout(); }
function toggleMax(w) { w.max = !w.max; w.el.classList.toggle('max', w.max); saveLayout(); }
function closeWin(w, opts = {}) {
  if (!wins.has(w.key)) return;
  if (w.beforeClose && !opts.force && w.beforeClose() === false) return;
  wins.delete(w.key);
  w.cleanup.forEach((fn) => { try { fn(opts); } catch (_) { /* best effort */ } });
  w.el.remove();
  if (focused === w) focusWin(topWin());
  renderDock(); saveLayout();
}

function openApp(app, state = {}, saved) {
  const def = APPS[app];
  if (!def) return null;
  const key = def.key ? `${app}:${def.key(state)}` : def.multi ? `${app}:${state._k || (state._k = rid())}` : app;
  const existing = wins.get(key);
  if (existing) { focusWin(existing); existing.onReopen?.(state); return existing; }

  const s = stage.getBoundingClientRect();
  const [dw, dh] = def.size || [900, 600];
  const g = saved?.g || { w: Math.min(dw, s.width - 24), h: Math.min(dh, s.height - 24), x: 0, y: 0 };
  if (!saved?.g) {
    g.x = Math.max(12, Math.round((s.width - g.w) / 2) + (cascade % 6) * 26 - 60);
    g.y = Math.max(8, Math.round((s.height - g.h) / 2.6) + (cascade % 6) * 26 - 30);
    cascade += 1;
  }
  const titleEl = h('span', { class: 'win-title', text: def.name });
  const actions = h('div', { class: 'win-actions' });
  const bar = h('header', { class: 'win-bar' }, icon(def.icon, `tint-${def.tint}`), titleEl, actions);
  const body = h('div', { class: 'win-body' });
  const el = h('section', { class: 'win', data: { app }, 'aria-label': def.name }, bar, body);
  const w = {
    app, key, state, el, body, g, z: 0, max: !!saved?.max, min: false, cleanup: [],
    setTitle(t) { titleEl.textContent = t; w.title = t; renderDock(); },
    addAction(name, label, fn) { actions.prepend(iconButton(name, label, fn)); },
    save: saveLayout,
  };
  actions.append(
    iconButton('min', 'Minimize', () => minimize(w)),
    iconButton('max', 'Maximize or restore', () => toggleMax(w)),
    iconButton('close', 'Close', () => closeWin(w), 'close'));
  for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) el.append(h('i', { class: `rz rz-${dir}`, data: { dir } }));
  el.classList.toggle('max', w.max);
  wins.set(key, w);
  stage.append(el);
  place(w);

  el.addEventListener('pointerdown', () => { if (focused !== w) focusWin(w); }, true);
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMax(w); });
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || w.max || narrow()) return;
    drag(e, (dx, dy, start) => { w.g.x = start.x + dx; w.g.y = start.y + dy; place(w); }, (ev) => {
      if (ev.clientY <= stage.getBoundingClientRect().top + 2) toggleMax(w);
    }, w);
  });
  el.addEventListener('pointerdown', (e) => {
    const dir = e.target.dataset?.dir;
    if (!dir || !e.target.classList.contains('rz') || w.max || narrow()) return;
    drag(e, (dx, dy, start) => {
      if (dir.includes('e')) w.g.w = Math.max(320, start.w + dx);
      if (dir.includes('s')) w.g.h = Math.max(220, start.h + dy);
      if (dir.includes('w')) { w.g.w = Math.max(320, start.w - dx); w.g.x = start.x + start.w - w.g.w; }
      if (dir.includes('n')) { w.g.h = Math.max(220, start.h - dy); w.g.y = Math.max(0, start.y + start.h - w.g.h); }
      place(w);
    }, null, w);
  });

  try { def.mount(w); } catch (e) { body.append(emptyState('This app could not start', e.message)); }
  focusWin(w);
  return w;
}
function drag(e, onMove, onEnd, w) {
  e.preventDefault();
  const start = { ...w.g }; const x0 = e.clientX; const y0 = e.clientY;
  document.body.classList.add('wm-drag');
  const move = (ev) => onMove(ev.clientX - x0, ev.clientY - y0, start);
  const up = (ev) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    document.body.classList.remove('wm-drag');
    onEnd?.(ev); saveLayout();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
addEventListener('resize', () => wins.forEach(place));
/* Clicking inside an embedded page does not bubble, so watch where focus goes. */
addEventListener('blur', () => setTimeout(() => {
  const frame = document.activeElement;
  if (frame?.tagName === 'IFRAME') { const w = [...wins.values()].find((x) => x.el.contains(frame)); if (w && focused !== w) focusWin(w); }
}, 0));

function emptyState(title, text, ...actions) {
  return h('div', { class: 'empty' }, h('h3', { text: title }), text && h('p', { text }), actions.length ? h('div', { class: 'empty-actions' }, actions) : null);
}
const button = (label, onclick, cls = '', ic) => h('button', { class: `btn ${cls}`.trim(), type: 'button', onclick }, ic && icon(ic), h('span', { text: label }));

/* ================================================================ app: terminal */
function mountTerminal(w) {
  const st = w.state;
  st.sid = st.sid || `t-${rid()}`;
  const wrap = h('div', { class: 'term' });
  w.body.append(wrap);
  const term = new Terminal({
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13.5, lineHeight: 1.25,
    cursorBlink: true, scrollback: 8000, theme: termTheme(), allowProposedApi: true, macOptionIsMeta: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit); term.loadAddon(new WebLinksAddon((e, uri) => window.open(uri, '_blank', 'noopener')));
  term.open(wrap);
  let ws = null; let closed = false; let retry = 0; let ended = false;
  const sendSize = () => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'r', cols: term.cols, rows: term.rows })); };
  const doFit = () => { if (wrap.offsetWidth > 0 && wrap.offsetHeight > 0) { try { fit.fit(); } catch (_) { /* not laid out */ } } };
  const connect = () => {
    doFit();
    const params = { id: st.sid, cols: term.cols, rows: term.rows, cwd: st.cwd || project, title: st.title || '' };
    if (st.init) params.init = st.init;
    ws = new WebSocket(wsUrl(`/ws/term?${qs(params)}`));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { retry = 0; term.reset(); delete st.init; w.save(); sendSize(); };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return term.write(new Uint8Array(ev.data));
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 'exit') { ended = true; closeWin(w, { force: true, ended: true }); }
      else if (m.t === 'error') { ended = true; term.write(`\r\n\x1b[31m${m.message}\x1b[0m\r\n`); }
    };
    ws.onclose = () => {
      if (closed || ended) return;
      retry += 1;
      term.write('\r\n\x1b[2m[connection lost, reconnecting…]\x1b[0m\r\n');
      setTimeout(connect, Math.min(8000, 800 * retry));
    };
  };
  term.onData((d) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'i', d })); });
  term.onResize(sendSize);
  term.onTitleChange((t) => { if (t) w.setTitle(st.title ? `${st.title}: ${t}` : t); });
  if (st.title) w.setTitle(st.title);
  const ro = new ResizeObserver(() => { clearTimeout(ro.t); ro.t = setTimeout(doFit, 60); });
  ro.observe(wrap);
  const onTheme = () => { term.options.theme = termTheme(); };
  document.addEventListener('forge:theme', onTheme);
  w.addAction('plus', 'New terminal', () => openApp('terminal'));
  w.onFocus = () => term.focus();
  w.cleanup.push((opts) => {
    closed = true; ro.disconnect(); document.removeEventListener('forge:theme', onTheme);
    try { ws?.close(); } catch (_) { /* closed */ }
    term.dispose();
    if (!opts.ended) api(`/api/term?${qs({ id: st.sid })}`, { method: 'DELETE' }).catch(() => {});
  });
  (document.fonts?.ready || Promise.resolve()).then(connect);
}
const runInTerminal = (title, init, cwd) => openApp('terminal', { title, init, cwd });

/* ================================================================ app: files */
const TEXT_EXT = /\.(txt|md|markdown|json|jsonc|js|cjs|mjs|ts|tsx|jsx|css|scss|html?|xml|svg|ya?ml|toml|ini|conf|cfg|env|sh|bash|zsh|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sql|csv|tsv|log|lock|gitignore|dockerfile|caddyfile|makefile)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;
const MEDIA_EXT = /\.(pdf|mp4|webm|mp3|wav)$/i;
const fileIcon = (e) => (e.dir ? 'files' : IMG_EXT.test(e.name) ? 'image' : TEXT_EXT.test(e.name) ? 'text' : 'file');
const downloadUrl = (path, inline) => `/api/fs/download?${qs(inline ? { path, inline: 1 } : { path })}`;
const triggerDownload = (path) => { const a = h('a', { href: downloadUrl(path), download: '' }); document.body.append(a); a.click(); a.remove(); };

function uploadFiles(dir, files, done) {
  const list = [...files];
  if (!list.length) return;
  const note = toast(`Uploading ${list.length === 1 ? list[0].name : `${list.length} files`}…`, 'info', 0);
  let i = 0; let failed = 0;
  const next = () => {
    if (i >= list.length) {
      note.close();
      toast(failed ? `${list.length - failed} uploaded, ${failed} failed` : list.length === 1 ? `Uploaded ${list[0].name}` : `Uploaded ${list.length} files`, failed ? 'error' : 'ok');
      return done?.();
    }
    const file = list[i]; i += 1;
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/fs/upload?${qs({ path: dir, name: file.name })}`);
    xhr.setRequestHeader('X-Forge', '1');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) note.update(`Uploading ${file.name} (${i} of ${list.length}): ${Math.round((e.loaded / e.total) * 100)}%`); };
    xhr.onload = () => { if (xhr.status >= 300) failed += 1; next(); };
    xhr.onerror = () => { failed += 1; next(); };
    xhr.send(file);
  };
  next();
}

function openFile(path) {
  const name = baseName(path);
  if (IMG_EXT.test(name) || MEDIA_EXT.test(name)) return openApp('viewer', { path });
  return openApp('editor', { path });
}

function mountFiles(w) {
  const st = w.state;
  if (st.path == null) st.path = project;
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Folder path' });
  const list = h('div', { class: 'file-list', role: 'list' });
  const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { uploadFiles(st.path, picker.files, load); picker.value = ''; } });
  const go = (p) => { st.path = p; w.save(); load(); };
  const tools = h('div', { class: 'toolbar' },
    iconButton('up', 'Parent folder', () => { if (st.path) go(parentPath(st.path)); }),
    crumbs,
    iconButton('refresh', 'Refresh', () => load()),
    button('New', (e) => menu(e.currentTarget, [
      { label: 'New folder', icon: 'files', run: newFolder },
      { label: 'New text file', icon: 'text', run: newFile },
    ]), '', 'plus'),
    button('Upload', () => picker.click(), 'primary', 'upload'), picker);
  const drop = h('div', { class: 'drop-hint', text: 'Drop files to upload them here' });
  w.body.append(h('div', { class: 'pane files' }, tools, list, drop));

  async function newFolder() {
    const name = await dialog({ title: 'New folder', input: { placeholder: 'Folder name' }, confirm: 'Create folder' });
    if (name) api('/api/fs/mkdir', { method: 'POST', body: { path: st.path, name } }).then(load, oops);
  }
  async function newFile() {
    const name = await dialog({ title: 'New text file', input: { value: 'untitled.txt' }, confirm: 'Create file' });
    if (!name) return;
    const path = joinPath(st.path, name);
    api(`/api/fs/write?${qs({ path, new: 1 })}`, { method: 'PUT', body: '', raw: true }).then(() => { load(); openApp('editor', { path }); }, oops);
  }
  async function rename(e) {
    const name = await dialog({ title: `Rename ${e.name}`, input: { value: e.name }, confirm: 'Rename' });
    if (name && name !== e.name) api('/api/fs/rename', { method: 'POST', body: { path: joinPath(st.path, e.name), name } }).then(load, oops);
  }
  async function remove(e) {
    const ok = await dialog({ title: `Delete ${e.name}?`, message: e.dir ? 'The folder and everything inside it will be deleted permanently.' : 'The file will be deleted permanently.', confirm: 'Delete', danger: true });
    if (ok) api('/api/fs/delete', { method: 'POST', body: { path: joinPath(st.path, e.name) } }).then(() => { toast(`Deleted ${e.name}`, 'ok'); load(); }, oops);
  }
  const rowMenu = (anchor, e) => {
    const path = joinPath(st.path, e.name);
    menu(anchor, [
      e.dir ? { label: 'Open', icon: 'files', run: () => go(path) } : { label: 'Open', icon: 'text', run: () => openFile(path) },
      e.dir && { label: 'Open terminal here', icon: 'terminal', run: () => openApp('terminal', { cwd: path }) },
      e.dir && { label: 'Open in Code', icon: 'code', run: () => openApp('code', { folder: path }) },
      { label: e.dir ? 'Download as .tar.gz' : 'Download', icon: 'download', run: () => triggerDownload(path) },
      '-',
      { label: 'Rename', icon: 'pencil', run: () => rename(e) },
      { label: 'Delete', icon: 'trash', danger: true, run: () => remove(e) },
    ]);
  };

  async function load() {
    crumbs.replaceChildren(h('button', { type: 'button', text: 'Home', onclick: () => go('') }),
      ...st.path.split('/').filter(Boolean).flatMap((part, i, all) => [h('span', { text: '/', 'aria-hidden': 'true' }), h('button', { type: 'button', text: part, onclick: () => go(all.slice(0, i + 1).join('/')) })]));
    w.setTitle(st.path ? baseName(st.path) : 'Home');
    let data;
    try { data = await api(`/api/fs/list?${qs({ path: st.path })}`); } catch (e) {
      list.replaceChildren(emptyState('This folder could not be opened', e.message, button('Go to Home', () => go(''))));
      return;
    }
    if (!data.entries.length) { list.replaceChildren(emptyState('This folder is empty', 'Drop files here, or use Upload.')); return; }
    list.replaceChildren(...data.entries.map((e) => {
      const path = joinPath(st.path, e.name);
      const open = () => (e.dir ? go(path) : openFile(path));
      const row = h('div', { class: `file-row${e.name.startsWith('.') ? ' hidden-file' : ''}`, role: 'listitem', tabindex: '0',
        ondblclick: open, onkeydown: (ev) => { if (ev.key === 'Enter') open(); },
        oncontextmenu: (ev) => { ev.preventDefault(); rowMenu({ x: ev.clientX, y: ev.clientY }, e); } },
        icon(fileIcon(e), e.dir ? 'tint-amber' : ''),
        h('button', { class: 'file-name', type: 'button', text: e.name, onclick: open, title: e.name }),
        h('span', { class: 'file-meta', text: e.dir ? '' : fmtSize(e.size) }),
        h('span', { class: 'file-meta date', text: fmtDate(e.mtime) }),
        iconButton('more', `Actions for ${e.name}`, (ev) => { ev.stopPropagation(); rowMenu(ev.currentTarget, e); }));
      return row;
    }));
  }
  const pane = w.body.firstChild;
  let depth = 0;
  pane.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); depth += 1; pane.classList.add('dropping'); } });
  pane.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  pane.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) pane.classList.remove('dropping'); });
  pane.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; pane.classList.remove('dropping'); uploadFiles(st.path, e.dataTransfer.files, load); });
  w.onReopen = (s) => { if (s.path != null && s.path !== st.path) go(s.path); };
  load();
}

/* ================================================================ app: editor and viewer */
function mountEditor(w) {
  const st = w.state;
  const area = h('textarea', { class: 'editor', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': `Contents of ${baseName(st.path)}`, disabled: true });
  const status = h('span', { class: 'toolbar-note', text: 'Loading…' });
  let clean = ''; let saving = false;
  const dirty = () => area.value !== clean;
  const mark = () => { w.setTitle(`${dirty() ? '● ' : ''}${baseName(st.path)}`); saveBtn.disabled = !dirty() || saving; };
  const save = async () => {
    if (!dirty() || saving) return;
    saving = true; mark();
    const text = area.value;
    try { await api(`/api/fs/write?${qs({ path: st.path })}`, { method: 'PUT', body: text, raw: true }); clean = text; status.textContent = `Saved at ${fmtDate(Date.now())}`; }
    catch (e) { oops(e); }
    saving = false; mark();
  };
  const saveBtn = button('Save', save, 'primary', 'save');
  w.body.append(h('div', { class: 'pane' },
    h('div', { class: 'toolbar' }, h('span', { class: 'toolbar-path', text: `~/${st.path}`, title: st.path }), status, saveBtn), area));
  area.addEventListener('input', mark);
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end'); mark(); }
  });
  w.onFocus = () => area.focus();
  w.beforeClose = () => {
    if (!dirty()) return true;
    dialog({ title: `Close ${baseName(st.path)} without saving?`, message: 'Your changes since the last save will be lost.', confirm: 'Discard changes', danger: true }).then((ok) => { if (ok) closeWin(w, { force: true }); });
    return false;
  };
  api(`/api/fs/read?${qs({ path: st.path })}`).then((d) => {
    area.value = clean = d.text; area.disabled = false; status.textContent = ''; mark(); if (focused === w) area.focus();
  }, (e) => {
    area.replaceWith(emptyState('This file cannot be edited here', e.message, button('Download it', () => triggerDownload(st.path), 'primary', 'download')));
    status.textContent = ''; saveBtn.hidden = true;
  });
  w.setTitle(baseName(st.path));
}
function mountViewer(w) {
  const st = w.state; const name = baseName(st.path);
  w.setTitle(name);
  const view = IMG_EXT.test(name) ? h('img', { src: downloadUrl(st.path, true), alt: name })
    : /\.(mp4|webm)$/i.test(name) ? h('video', { src: downloadUrl(st.path, true), controls: true })
    : /\.(mp3|wav)$/i.test(name) ? h('audio', { src: downloadUrl(st.path, true), controls: true })
    : h('iframe', { src: downloadUrl(st.path, true), title: name });
  w.body.append(h('div', { class: 'pane' },
    h('div', { class: 'toolbar' }, h('span', { class: 'toolbar-path', text: `~/${st.path}` }), button('Download', () => triggerDownload(st.path), '', 'download')),
    h('div', { class: 'viewer' }, view)));
}

/* ================================================================ app: code, web apps */
function mountCode(w) {
  const folder = w.state.folder != null ? w.state.folder : project;
  const frame = h('iframe', { class: 'frame', title: 'Code editor', allow: 'clipboard-read; clipboard-write', src: `/ide/?${qs({ folder: `${home}/${folder}`.replace(/\/+$/, '') })}` });
  w.body.append(frame);
  w.addAction('external', 'Open Code in a new tab', () => window.open(frame.src, '_blank', 'noopener'));
  w.addAction('refresh', 'Reload Code', () => { frame.src = frame.src; });
  w.onFocus = () => frame.focus();
  w.onReopen = (s) => { if (s.folder != null && s.folder !== w.state.folder) { w.state.folder = s.folder; frame.src = `/ide/?${qs({ folder: `${home}/${s.folder}` })}`; w.save(); } };
}
function mountWeb(w) {
  const st = w.state; const src = `/proxy/${st.port}/`;
  const frame = h('iframe', { class: 'frame', title: st.title || `App on port ${st.port}`, src, allow: 'clipboard-read; clipboard-write; fullscreen' });
  w.setTitle(st.title || `Port ${st.port}`);
  w.addAction('external', 'Open in a new tab', () => window.open(src, '_blank', 'noopener'));
  w.addAction('refresh', 'Reload', () => { frame.src = src; });
  w.body.append(frame);
  w.onFocus = () => frame.focus();
}

/* ================================================================ app: Linux desktop (and its browser) */
function toAddress(text) {
  const t = text.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(t)) return `http://${t}`;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}
async function openInDesktopBrowser(text) {
  const w = openApp('desktop');
  try { await api('/api/desktop/launch', { method: 'POST', body: { app: 'browser', url: toAddress(text || '') || undefined } }); w.browserStarted = true; }
  catch (e) { oops(e); }
  return w;
}
function mountDesktop(w) {
  const view = h('div', { class: 'vnc' });
  const address = h('input', { class: 'field', type: 'text', inputmode: 'url', placeholder: 'Type a web address or search, then press Enter', 'aria-label': 'Web address to open in the desktop browser', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
  let rfb = null; let closed = false; let fitSession = w.state.fit !== false;
  const fitBtn = iconButton('fit', 'Match the desktop to this window', () => {
    fitSession = !fitSession; w.state.fit = fitSession; w.save(); fitBtn.classList.toggle('on', fitSession);
    if (rfb) rfb.resizeSession = fitSession;
  });
  fitBtn.classList.toggle('on', fitSession);
  const tools = h('form', { class: 'toolbar', onsubmit: (e) => { e.preventDefault(); if (address.value.trim()) { openInDesktopBrowser(address.value); address.select(); } } },
    icon('browser', 'tint-teal'), address, button('Open', null, 'primary'),
    h('span', { class: 'toolbar-gap' }),
    iconButton('clipboard', 'Send text to the desktop clipboard', async () => {
      const text = await dialog({ title: 'Send text to the desktop', message: 'The text goes to the desktop clipboard. Press Ctrl+V there to paste it.', input: { placeholder: 'Text to send' }, confirm: 'Send' });
      if (text && rfb) { rfb.clipboardPasteFrom(text); toast('Sent. Press Ctrl+V in the desktop to paste.', 'ok'); }
    }),
    fitBtn,
    iconButton('fullscreen', 'Full screen', () => (document.fullscreenElement ? document.exitFullscreen() : view.requestFullscreen?.())));
  tools.querySelector('.btn.primary').type = 'submit';
  w.body.append(h('div', { class: 'pane' }, tools, view));
  w.setTitle('Linux desktop');

  const showDown = (title, text) => view.replaceChildren(emptyState(title, text, button('Try again', connect, 'primary', 'refresh')));
  async function connect() {
    if (closed) return;
    view.replaceChildren(emptyState('Connecting to the desktop…'));
    let sys;
    try { sys = await api('/api/system'); } catch (e) { return showDown('The server did not answer', e.message); }
    if (!sys.desktop) return showDown('The Linux desktop is not running', 'It starts with the workspace and needs a few seconds after a restart. If it stays down, run "supervisorctl status" in the terminal.');
    try {
      const { default: RFB } = await import('/vendor/novnc/core/rfb.js');
      if (closed) return;
      view.replaceChildren();
      rfb = new RFB(view, wsUrl('/ws/vnc'), { shared: true });
      rfb.scaleViewport = true; rfb.resizeSession = fitSession; rfb.focusOnClick = true; rfb.background = 'transparent';
      rfb.addEventListener('disconnect', () => { rfb = null; if (!closed) showDown('The desktop connection closed', 'Reconnect to pick up where you left off. Apps on the desktop keep running.'); });
      rfb.addEventListener('clipboard', (e) => { navigator.clipboard?.writeText(e.detail.text).catch(() => {}); });
    } catch (e) { showDown('The desktop viewer could not start', e.message); }
  }
  w.onFocus = () => rfb?.focus();
  w.focusAddress = () => address.focus();
  w.cleanup.push(() => { closed = true; try { rfb?.disconnect(); } catch (_) { /* closed */ } });
  connect();
}

/* ================================================================ app: apps on ports */
let lastPorts = [];
const validPort = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;
const openPort = (port, title) => openApp('web', { port, title });
function mountApps(w) {
  const list = h('div', { class: 'rows' });
  const portInput = h('input', { class: 'field', type: 'text', inputmode: 'numeric', maxlength: '5', placeholder: 'Port, for example 3000', 'aria-label': 'Port number' });
  const form = h('form', { class: 'toolbar', onsubmit: (e) => {
    e.preventDefault();
    const n = Number(portInput.value.trim());
    if (!validPort(n)) return toast('Enter a port number between 1 and 65535.', 'error');
    openPort(n); portInput.value = '';
  } }, h('span', { class: 'toolbar-note', text: 'Open any port' }), portInput, button('Open', null, 'primary'));
  form.querySelector('.btn').type = 'submit';
  w.body.append(h('div', { class: 'pane' }, form, list,
    h('p', { class: 'pane-foot', text: 'Start a web app in the terminal and it appears here by itself. Pin favourites in dashboard/apps.json.' })));
  let favs = [];
  const row = (title, sub, running, port, url) => h('div', { class: 'row' },
    h('span', { class: `dot ${running ? 'on' : ''}`, title: running ? 'Running' : 'Not running' }),
    h('div', { class: 'row-text' }, h('b', { text: title }), h('span', { text: sub })),
    port ? button('Open', () => openPort(port, title), running ? 'primary' : '') : null,
    iconButton('external', 'Open in a new tab', () => window.open(url || `/proxy/${port}/`, '_blank', 'noopener')));
  const render = () => {
    const live = new Map(lastPorts.map((p) => [p.port, p]));
    const rows = [];
    for (const f of favs) {
      const port = Number(f.port);
      if (f.url && /^(\/(?!\/)|https?:\/\/)/.test(f.url)) rows.push(row(f.name || f.url, f.description || f.url, true, null, f.url));
      else if (validPort(port)) { rows.push(row(f.name || `Port ${port}`, `${f.description || ''}${f.description ? ' (' : ''}port ${port}${f.description ? ')' : ''}`, live.has(port), port)); live.delete(port); }
    }
    for (const p of live.values()) rows.push(row(`Port ${p.port}`, p.process ? `Started by ${p.process}` : 'Listening', true, p.port));
    list.replaceChildren(...(rows.length ? rows : [emptyState('No web apps are running', 'Run something like "npm run dev" or "python3 -m http.server 8000" in the terminal.', button('Open a terminal', () => openApp('terminal'), 'primary', 'terminal'))]));
  };
  fetch('/apps.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((d) => { favs = Array.isArray(d.apps) ? d.apps : []; render(); }).catch(render);
  document.addEventListener('forge:ports', render);
  w.cleanup.push(() => document.removeEventListener('forge:ports', render));
  refreshPorts();
}

/* ================================================================ app: automations */
const AUTOMATION_TEMPLATE = `// Drives the browser you can see in the Linux desktop window.
// Run it from the Automations window, or with:  node ${'${name}'}
const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); // the visible browser
  } catch (_) {
    console.log('The desktop browser is not open, so this run uses a hidden one.');
    browser = await chromium.launch();
  }
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  await page.goto('https://example.com');
  console.log('Title:', await page.title());
  await page.screenshot({ path: 'example.png' });
  console.log('Saved example.png next to this script.');

  await page.close();
  await browser.close(); // only disconnects when attached to the visible browser
})();
`;
const RUNNERS = [[/\.(c?js|mjs)$/i, 'node'], [/\.py$/i, 'python3'], [/\.sh$/i, 'bash']];
function mountAutomations(w) {
  const dir = joinPath(project, 'automations');
  const list = h('div', { class: 'rows' });
  const create = async () => {
    let name = await dialog({ title: 'New automation', message: 'Scripts are saved in project/automations. Use .js for browser automation, or .py and .sh for anything else.', input: { value: 'my-automation.js' }, confirm: 'Create script' });
    if (!name) return;
    if (!RUNNERS.some(([re]) => re.test(name))) name += '.js';
    const path = joinPath(dir, name);
    const body = /\.(c?js)$/i.test(name) ? AUTOMATION_TEMPLATE.replace('${name}', name) : /\.py$/i.test(name) ? '#!/usr/bin/env python3\nprint("Hello from Forge Desk")\n' : /\.sh$/i.test(name) ? '#!/usr/bin/env bash\nset -euo pipefail\necho "Hello from Forge Desk"\n' : '';
    api(`/api/fs/write?${qs({ path, new: 1 })}`, { method: 'PUT', body, raw: true }).then(() => { load(); openApp('editor', { path }); }, oops);
  };
  const run = (name) => {
    const runner = RUNNERS.find(([re]) => re.test(name));
    runInTerminal(`Run ${name}`, `${runner ? runner[1] : 'bash'} '${name.replace(/'/g, "'\\''")}'`, dir);
  };
  async function load() {
    let entries = [];
    try { entries = (await api(`/api/fs/list?${qs({ path: dir })}`)).entries.filter((e) => !e.dir && RUNNERS.some(([re]) => re.test(e.name))); } catch (_) { /* folder not created yet */ }
    list.replaceChildren(...(entries.length ? entries.map((e) => h('div', { class: 'row' },
      icon('automate', 'tint-amber'),
      h('div', { class: 'row-text' }, h('b', { text: e.name }), h('span', { text: `Changed ${fmtDate(e.mtime)}` })),
      button('Run', () => run(e.name), 'primary', 'play'),
      iconButton('pencil', `Edit ${e.name}`, () => openApp('editor', { path: joinPath(dir, e.name) }))))
      : [emptyState('No automations yet', 'An automation is a script that works the browser or the server for you. The starter script opens a page in the desktop browser and takes a screenshot.', button('Create the starter script', create, 'primary', 'plus'))]));
  }
  w.body.append(h('div', { class: 'pane' },
    h('div', { class: 'toolbar' }, h('span', { class: 'toolbar-path', text: `~/${dir}` }), iconButton('refresh', 'Refresh', load),
      button('Show folder', () => openApp('files', { path: dir, _k: 'auto' })), button('New automation', create, 'primary', 'plus')),
    list,
    h('p', { class: 'pane-foot', text: 'Open the Browser first if you want to watch a script work. Scripts also run headless when it is closed.' })));
  w.onFocus = load;
  load();
}

/* ================================================================ app: settings */
function mountSettings(w) {
  const meters = h('div', { class: 'meters' });
  const termList = h('div', { class: 'rows compact' });
  const themeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' },
    ...[['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']].map(([v, label, ic]) => h('button', { type: 'button', data: { v }, onclick: () => { setTheme(v); sync(); } }, icon(ic), h('span', { text: label }))));
  const wallSeg = h('div', { class: 'walls', role: 'group', 'aria-label': 'Background' },
    ...WALLS.map(([v, label]) => h('button', { type: 'button', class: `wall wall-${v}`, data: { v }, 'aria-label': `${label} background`, title: label, onclick: () => { setWall(v); sync(); } })));
  const sync = () => {
    themeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === root.dataset.theme));
    wallSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === root.dataset.wall));
  };
  const meter = (label, pct, detail) => h('div', { class: 'meter' },
    h('div', { class: 'meter-head' }, h('b', { text: label }), h('span', { text: detail })),
    h('div', { class: 'meter-track', role: 'img', 'aria-label': `${label} ${Math.round(pct)} percent` }, h('i', { style: `width:${Math.max(1, Math.min(100, pct))}%`, class: pct > 90 ? 'hot' : '' })));
  const renderSys = () => {
    const s = lastSystem; if (!s) return;
    meters.replaceChildren(
      meter('Processor', s.cpu, `${s.cpu}% of ${s.cores} cores`),
      meter('Memory', (s.mem.used / s.mem.total) * 100, `${fmtSize(s.mem.used)} of ${fmtSize(s.mem.total)}`),
      s.disk ? meter('Storage', (s.disk.used / s.disk.total) * 100, `${fmtSize(s.disk.used)} of ${fmtSize(s.disk.total)}`) : null,
      h('p', { class: 'meter-note', text: `${s.host} has been up for ${fmtUptime(s.uptime)}. Code editor ${s.ide ? 'running' : 'stopped'}, Linux desktop ${s.desktop ? 'running' : 'stopped'}.` }));
  };
  const loadTerms = async () => {
    let data; try { data = await api('/api/term'); } catch (_) { return; }
    termList.replaceChildren(...(data.terminals.length ? data.terminals.map((t) => h('div', { class: 'row' },
      icon('terminal', 'tint-violet'),
      h('div', { class: 'row-text' }, h('b', { text: t.title || 'Terminal' }), h('span', { text: `Started ${fmtDate(t.created)}${t.viewers ? '' : ', not shown in any window'}` })),
      !t.viewers && button('Show', () => openApp('terminal', { sid: t.id, _k: t.id, title: t.title })),
      button('End', () => api(`/api/term?${qs({ id: t.id })}`, { method: 'DELETE' }).then(() => setTimeout(loadTerms, 300), oops))))
      : [h('p', { class: 'meter-note', text: 'No terminal sessions are running.' })]));
  };
  const signOut = (all) => api(`/api/logout${all ? '?all=1' : ''}`, { method: 'POST' }).then(() => { location.href = '/login'; }, oops);
  w.body.append(h('div', { class: 'pane settings' },
    h('section', {}, h('h3', { text: 'Appearance' }), h('div', { class: 'setting' }, h('span', { text: 'Theme' }), themeSeg), h('div', { class: 'setting' }, h('span', { text: 'Background' }), wallSeg)),
    h('section', {}, h('h3', { text: 'Server' }), meters),
    h('section', {}, h('h3', { text: 'Terminal sessions' }), h('p', { class: 'meter-note', text: 'Terminals keep running when you close the browser tab. Closing a terminal window ends it.' }), termList),
    h('section', {}, h('h3', { text: 'Access' }), h('div', { class: 'setting' }, h('span', { text: 'This browser stays signed in for 30 days.' }),
      h('div', { class: 'btn-row' }, button('Sign out', () => signOut(false), '', 'logout'), button('Sign out everywhere', () => signOut(true), 'danger')))),
    h('section', { class: 'about' }, h('h3', { text: 'About' }),
      h('p', { class: 'meter-note', style: 'text-align:center;padding:8px 0 4px' }, h('img', { src: '/favicon.svg', width: 36, height: 36, style: 'border-radius:10px;margin-bottom:8px;display:block;margin-inline:auto' }), h('b', { text: 'Forge Desk', style: 'display:block;font-size:15px;margin-bottom:2px' }), h('span', { text: 'A DML AI Product', style: 'color:var(--faint);font-size:12px' })))));
  sync(); renderSys(); loadTerms();
  document.addEventListener('forge:system', renderSys);
  const timer = setInterval(loadTerms, 8000);
  w.cleanup.push(() => { document.removeEventListener('forge:system', renderSys); clearInterval(timer); });
}

/* ================================================================ registry, dock */
let home = '/home/coder';
const APPS = {
  terminal: { name: 'Terminal', icon: 'terminal', tint: 'violet', multi: true, size: [860, 540], mount: mountTerminal },
  files: { name: 'Files', icon: 'files', tint: 'amber', multi: true, size: [820, 560], mount: mountFiles },
  code: { name: 'Code', icon: 'code', tint: 'blue', size: [1180, 760], mount: mountCode },
  desktop: { name: 'Linux desktop', icon: 'desktop', tint: 'teal', size: [1180, 760], mount: mountDesktop },
  apps: { name: 'Apps', icon: 'apps', tint: 'pink', size: [560, 520], mount: mountApps },
  automations: { name: 'Automations', icon: 'automate', tint: 'amber', size: [640, 520], mount: mountAutomations },
  settings: { name: 'Settings', icon: 'settings', tint: 'grey', size: [560, 640], mount: mountSettings },
  editor: { name: 'Editor', icon: 'text', tint: 'grey', key: (s) => s.path, size: [780, 580], mount: mountEditor, hidden: true },
  viewer: { name: 'Viewer', icon: 'image', tint: 'grey', key: (s) => s.path, size: [760, 560], mount: mountViewer, hidden: true },
  web: { name: 'Web app', icon: 'apps', tint: 'pink', key: (s) => String(s.port), size: [1040, 700], mount: mountWeb, hidden: true },
};
const DOCK = [
  { id: 'terminal', label: 'Terminal', app: 'terminal' },
  { id: 'files', label: 'Files', app: 'files' },
  { id: 'code', label: 'Code', app: 'code' },
  { id: 'browser', label: 'Browser', icon: 'browser', tint: 'teal', run: () => { const w = wins.get('desktop'); if (w?.browserStarted) { focusWin(w); w.focusAddress(); } else openInDesktopBrowser('').then((x) => x.focusAddress()); } },
  { id: 'desktop', label: 'Linux desktop', app: 'desktop' },
  { id: 'apps', label: 'Apps', app: 'apps' },
  { id: 'automations', label: 'Automations', app: 'automations' },
  '-',
  { id: 'codex', label: 'Codex', icon: 'agent', tint: 'green', run: () => runInTerminal('Codex', 'codex') },
  { id: 'opencode', label: 'OpenCode', icon: 'braces', tint: 'blue', run: () => runInTerminal('OpenCode', 'opencode') },
  '-',
  { id: 'settings', label: 'Settings', app: 'settings' },
];
function dockClick(item) {
  if (item.run) return item.run();
  const mine = [...wins.values()].filter((w) => w.app === item.app).sort((a, b) => b.z - a.z);
  if (!mine.length) return openApp(item.app);
  if (mine.length === 1) return (focused === mine[0] && !mine[0].min ? minimize(mine[0]) : focusWin(mine[0]));
  const i = mine.indexOf(focused);
  return focusWin(i >= 0 ? mine[mine.length - 1] : mine[0]); // cycle through that app's windows
}
function renderDock() {
  const dock = $('#dock');
  const kids = DOCK.map((item) => {
    if (item === '-') return h('span', { class: 'dock-sep', 'aria-hidden': 'true' });
    const def = item.app ? APPS[item.app] : item;
    const open = item.app ? [...wins.values()].filter((w) => w.app === item.app) : [];
    const active = open.includes(focused);
    return h('button', { class: `dock-item${open.length ? ' open' : ''}${active ? ' active' : ''}`, type: 'button', 'aria-label': item.label, data: { tip: item.label, id: item.id }, onclick: () => dockClick(item) },
      icon(def.icon, `tint-${def.tint}`));
  });
  // Windows without a dock entry (editors, viewers, web apps) get temporary icons.
  const extra = [...wins.values()].filter((w) => APPS[w.app].hidden);
  if (extra.length) {
    kids.push(h('span', { class: 'dock-sep', 'aria-hidden': 'true' }));
    for (const w of extra) kids.push(h('button', { class: `dock-item open${focused === w ? ' active' : ''}`, type: 'button', 'aria-label': w.title || APPS[w.app].name, data: { tip: w.title || APPS[w.app].name }, onclick: () => (focused === w && !w.min ? minimize(w) : focusWin(w)) }, icon(APPS[w.app].icon, `tint-${APPS[w.app].tint}`)));
  }
  dock.replaceChildren(...kids);
}

/* ================================================================ launcher */
function openLauncher() {
  if ($('.launcher')) return;
  const input = h('input', { class: 'launcher-input', type: 'text', placeholder: 'Search apps, ports and actions', 'aria-label': 'Search apps, ports and actions', spellcheck: 'false', autocomplete: 'off' });
  const results = h('div', { class: 'launcher-list', role: 'listbox' });
  const back = h('div', { class: 'backdrop top', onpointerdown: (e) => { if (e.target === back) close(); } }, h('div', { class: 'launcher', role: 'dialog', 'aria-label': 'Launcher' }, input, results));
  const close = () => back.remove();
  const base = [
    ...DOCK.filter((d) => d !== '-').map((d) => ({ label: d.label, hint: d.app === 'terminal' ? 'New terminal window' : d.id === 'codex' || d.id === 'opencode' ? 'AI agent in a terminal' : 'App', icon: (d.app ? APPS[d.app] : d).icon, tint: (d.app ? APPS[d.app] : d).tint, run: () => (d.app === 'terminal' || d.app === 'files' ? openApp(d.app) : dockClick(d)) })),
    ...lastPorts.map((p) => ({ label: `Open port ${p.port}`, hint: p.process ? `Running: ${p.process}` : 'Running web app', icon: 'apps', tint: 'pink', run: () => openPort(p.port) })),
    { label: root.dataset.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', hint: 'Action', icon: root.dataset.theme === 'light' ? 'moon' : 'sun', tint: 'grey', run: () => setTheme(root.dataset.theme === 'light' ? 'dark' : 'light') },
    { label: 'Show the desktop', hint: 'Minimize every window', icon: 'desktop', tint: 'grey', run: showDesktop },
    { label: 'Sign out', hint: 'Action', icon: 'logout', tint: 'grey', run: () => api('/api/logout', { method: 'POST' }).then(() => { location.href = '/login'; }) },
  ];
  let items = []; let sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    items = base.filter((i) => !q || `${i.label} ${i.hint}`.toLowerCase().includes(q));
    if (/^\d{2,5}$/.test(q) && validPort(Number(q)) && !lastPorts.some((p) => p.port === Number(q))) items.unshift({ label: `Open port ${q}`, hint: 'Web app on this server', icon: 'apps', tint: 'pink', run: () => openPort(Number(q)) });
    if (q && !/^\d+$/.test(q)) items.push({ label: /[.:]/.test(q) && !/\s/.test(q) ? `Browse ${input.value.trim()}` : `Search the web for "${input.value.trim()}"`, hint: 'Opens in the desktop browser', icon: 'browser', tint: 'teal', run: () => openInDesktopBrowser(input.value) },
      { label: `Run "${input.value.trim()}" in a terminal`, hint: 'Command', icon: 'terminal', tint: 'violet', run: () => runInTerminal('', input.value.trim()) });
    sel = Math.min(sel, Math.max(0, items.length - 1));
    results.replaceChildren(...items.map((it, i) => h('button', { class: i === sel ? 'on' : '', type: 'button', role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => { close(); it.run(); }, onpointermove: () => { if (sel !== i) { sel = i; render(); } } },
      icon(it.icon, `tint-${it.tint}`), h('b', { text: it.label }), h('span', { text: it.hint }))));
    results.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) { close(); it.run(); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  layer.append(back); render(); input.focus();
}
function showDesktop() { wins.forEach((w) => { w.min = true; w.el.classList.add('min'); }); focusWin(null); saveLayout(); }

/* ================================================================ status polling, home */
let lastSystem = null;
async function refreshSystem() {
  const status = $('#status');
  try {
    lastSystem = await api('/api/system');
    status.dataset.state = 'online'; $('#status-text').textContent = lastSystem.host;
    $('#stats').hidden = false;
    $('#stat-cpu').textContent = `${lastSystem.cpu}%`;
    $('#stat-mem').textContent = `${Math.round((lastSystem.mem.used / lastSystem.mem.total) * 100)}%`;
    document.dispatchEvent(new CustomEvent('forge:system'));
  } catch (_) { status.dataset.state = 'offline'; $('#status-text').textContent = 'Offline'; }
}
async function refreshPorts() {
  try { lastPorts = (await api('/api/ports')).ports; } catch (_) { return; }
  const box = $('#home-running');
  box.replaceChildren(...(lastPorts.length ? [h('span', { class: 'home-label', text: 'Running now' }), ...lastPorts.slice(0, 8).map((p) => h('button', { class: 'chip', type: 'button', onclick: () => openPort(p.port) }, h('i', { class: 'dot on' }), h('span', { text: `${p.process || 'App'} on port ${p.port}` })))] : []));
  document.dispatchEvent(new CustomEvent('forge:ports'));
}
function tick() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hr = now.getHours();
  $('#greeting').textContent = hr < 5 ? 'Working late.' : hr < 12 ? 'Good morning.' : hr < 17 ? 'Good afternoon.' : 'Good evening.';
  $('#today').textContent = `${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}. Pick an app below, or press ${isMac ? '⌘K' : 'Ctrl+/'} to search.`;
}

/* ================================================================ boot */
$('#search-kbd').textContent = isMac ? '⌘K' : 'Ctrl /';
$('#search').addEventListener('click', openLauncher);
$('#brand').addEventListener('click', showDesktop);
$('#stats').addEventListener('click', () => openApp('settings'));
addEventListener('keydown', (e) => {
  const hit = isMac ? (e.metaKey && e.key.toLowerCase() === 'k') : (e.ctrlKey && e.key === '/');
  if (hit) { e.preventDefault(); e.stopPropagation(); openLauncher(); }
}, true);

(async function boot() {
  tick(); setInterval(tick, 20000);
  renderDock();
  try { const me = await api('/api/me'); home = me.home; project = me.project; } catch (_) { /* keep defaults */ }
  for (const saved of store.get('forge-layout', [])) {
    if (!APPS[saved.app] || !saved.state) continue;
    const w = openApp(saved.app, saved.state, saved);
    if (w && saved.min) { w.min = true; w.el.classList.add('min'); }
  }
  focusWin(topWin());
  refreshSystem(); refreshPorts();
  setInterval(() => { if (!document.hidden) refreshSystem(); }, 5000);
  setInterval(() => { if (!document.hidden) refreshPorts(); }, 10000);
})();
