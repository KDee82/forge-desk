'use strict';
/*
 * Forge Desk server.
 *
 * One process, one login. Everything below the login is reachable only with a
 * valid session cookie:
 *   /                 the web desktop (static files from PUBLIC_DIR)
 *   /api/*            system, files, terminals, desktop helpers
 *   /ws/term          terminal sessions (node-pty), kept alive between visits
 *   /ws/vnc           WebSocket <-> TCP bridge to the Linux desktop (VNC)
 *   /ide/*            code-server (prefix stripped)
 *   /proxy/<port>/*   any web app listening inside the workspace (prefix stripped)
 *   /absproxy/<port>/ same, prefix kept (for apps configured with a base path)
 */
const http = require('http');
const net = require('net');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const bcrypt = require('bcryptjs');

/* ------------------------------------------------------------------ config */
const PORT = Number(process.env.PORT || 7700);
const BIND = process.env.BIND || '0.0.0.0';
const HOME = path.resolve(process.env.FORGE_HOME || os.homedir());
const PROJECT = path.resolve(process.env.FORGE_PROJECT || path.join(HOME, 'project'));
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, '..', 'dashboard'));
const DATA_DIR = path.resolve(process.env.FORGE_DATA || path.join(HOME, '.config', 'forge-desk'));
const IDE_PORT = Number(process.env.IDE_PORT || 7701);
const VNC_PORT = Number(process.env.VNC_PORT || 5901);
const DISPLAY = process.env.FORGE_DISPLAY || ':1';
const SHELL = process.env.FORGE_SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh');
const PASSWORD_HASH = (process.env.FORGE_PASSWORD_HASH || '').trim().replace(/^'(.*)'$/, '$1');
const HASH_OK = /^\$2[aby]\$\d\d\$.{53}$/.test(PASSWORD_HASH);
const COOKIE = 'forge_session';
const SESSION_DAYS = 30;
const MAX_TERMINALS = 24;
const SCROLLBACK_BYTES = 256 * 1024;
const NM = path.join(__dirname, 'node_modules');
const VENDOR = {
  '/vendor/xterm/': path.join(NM, '@xterm', 'xterm'),
  '/vendor/xterm-fit/': path.join(NM, '@xterm', 'addon-fit', 'lib'),
  '/vendor/xterm-links/': path.join(NM, '@xterm', 'addon-web-links', 'lib'),
  '/vendor/novnc/': path.join(NM, '@novnc', 'novnc'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const INLINE_OK = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.mp3', '.wav']);

/* ------------------------------------------------------------------ auth */
fs.mkdirSync(DATA_DIR, { recursive: true });
const SECRET_FILE = path.join(DATA_DIR, 'secret');
let secret;
function loadSecret(rotate) {
  if (!rotate) { try { secret = fs.readFileSync(SECRET_FILE); } catch (_) { /* first run */ } }
  if (rotate || !secret || secret.length < 32) {
    secret = crypto.randomBytes(48);
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  }
}
loadSecret(false);

const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');
function makeSession() {
  const payload = `${Date.now() + SESSION_DAYS * 864e5}.${crypto.randomBytes(9).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function authed(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return false;
  return Number(payload.split('.')[0]) > Date.now();
}
const isHttps = (req) => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
function sessionCookie(req, value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}
/* Requests that change something, and every WebSocket, must come from our own pages. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client or same-origin GET
  try {
    const host = new URL(origin).host;
    const mine = [req.headers.host, ...String(req.headers['x-forwarded-host'] || '').split(',').map((s) => s.trim())];
    return mine.includes(host);
  } catch (_) { return false; }
}
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}
/* Login throttle: 5 free attempts per address, then a growing lockout. */
const fails = new Map();
/* The address can be forged in a header, so there is also a cap across all addresses:
   20 wrong passwords in 10 minutes pauses sign-in for everyone for a minute. */
let recentFails = [];
function lockedFor(ip) {
  const now = Date.now();
  recentFails = recentFails.filter((t) => now - t < 600e3);
  if (recentFails.length >= 20 && now - recentFails[recentFails.length - 1] < 60e3) return Math.ceil((60e3 - (now - recentFails[recentFails.length - 1])) / 1000);
  const f = fails.get(ip);
  return f && f.until > now ? Math.ceil((f.until - now) / 1000) : 0;
}
function noteFail(ip) {
  recentFails.push(Date.now());
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) f.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (f.n - 5)) * 1000;
  f.at = Date.now();
  fails.set(ip, f);
}
setInterval(() => { for (const [ip, f] of fails) if (Date.now() - f.at > 3600e3) fails.delete(ip); }, 600e3).unref();

/* ------------------------------------------------------------------ helpers */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; " +
    "connect-src 'self' ws: wss:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
};
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...headers });
  res.end(buf);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': MIME['.json'] });
const fail = (res, status, message) => json(res, status, { error: message });
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const raw = await readBody(req);
  try { return raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (_) { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
/* Files are confined to the home folder. Paths from the browser are relative to it. */
function safePath(rel) {
  const clean = path.posix.normalize('/' + String(rel || '').replace(/\\/g, '/'));
  const full = path.resolve(HOME, '.' + clean);
  if (full !== HOME && !full.startsWith(HOME + path.sep)) throw Object.assign(new Error('Outside the home folder'), { status: 400 });
  return full;
}
const relPath = (full) => path.relative(HOME, full).split(path.sep).join('/');
function safeName(name) {
  const n = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[\x00-\x1f]/g, '').trim();
  if (!n || n === '.' || n === '..') throw Object.assign(new Error('Invalid name'), { status: 400 });
  return n;
}

async function serveFile(req, res, file, extra = {}) {
  let st;
  try { st = await fsp.stat(file); } catch (_) { return false; }
  if (st.isDirectory()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const headers = { ...BASE_HEADERS, 'Content-Type': type, ETag: etag, 'Cache-Control': 'no-cache', ...extra };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
function staticPath(root, rel) {
  const full = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

/* ------------------------------------------------------------------ system */
let cpuPrev = os.cpus(); let cpuPct = 0;
setInterval(() => {
  const now = os.cpus(); let idle = 0; let total = 0;
  now.forEach((c, i) => {
    const p = cpuPrev[i] ? cpuPrev[i].times : { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    for (const k of Object.keys(c.times)) total += c.times[k] - (p[k] || 0);
    idle += c.times.idle - p.idle;
  });
  cpuPct = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0;
  cpuPrev = now;
}, 2000).unref();

function memInfo() {
  const total = os.totalmem(); let free = os.freemem();
  try {
    const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (m) free = Number(m[1]) * 1024;
  } catch (_) { /* not Linux */ }
  return { total, used: total - free };
}
async function diskInfo() {
  try {
    const s = await fsp.statfs(fs.existsSync(PROJECT) ? PROJECT : HOME);
    return { total: s.blocks * s.bsize, used: (s.blocks - s.bavail) * s.bsize };
  } catch (_) { return null; }
}
function probe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(700, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}
const HIDDEN_PORTS = new Set([PORT, IDE_PORT, VNC_PORT, 9222]);
function listPorts() {
  return new Promise((resolve) => {
    execFile('ss', ['-ltnpH'], { timeout: 4000 }, (err, out) => {
      if (err) return resolve([]);
      const seen = new Map();
      for (const line of out.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 4) continue;
        const m = /:(\d+)$/.exec(cols[3]);
        if (!m) continue;
        const port = Number(m[1]);
        if (HIDDEN_PORTS.has(port) || (port >= 6000 && port < 6064) || seen.has(port)) continue;
        const p = /\(\("([^"]+)",pid=(\d+)/.exec(line);
        seen.set(port, { port, process: p ? p[1] : '', pid: p ? Number(p[2]) : null });
      }
      resolve([...seen.values()].sort((a, b) => a.port - b.port));
    });
  });
}

/* ------------------------------------------------------------------ terminals */
const terms = new Map();
function childEnv() {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', DISPLAY, HOME, FORGE_DESK: '1' };
  for (const k of ['FORGE_PASSWORD_HASH', 'PORT', 'BIND', 'PUBLIC_DIR', 'FORGE_DATA']) delete env[k];
  return env;
}
function createTerm(id, { cols, rows, cwd, title, init }) {
  if (terms.size >= MAX_TERMINALS) throw Object.assign(new Error(`Limit of ${MAX_TERMINALS} terminals reached. Close one first.`), { status: 429 });
  let dir = PROJECT;
  try { const want = safePath(cwd || relPath(PROJECT)); if (fs.statSync(want).isDirectory()) dir = want; } catch (_) { /* fall back */ }
  if (!fs.existsSync(dir)) dir = HOME;
  const proc = pty.spawn(SHELL, ['-l'], { name: 'xterm-256color', cols, rows, cwd: dir, env: childEnv() });
  const t = { id, proc, title: title || 'Terminal', created: Date.now(), chunks: [], size: 0, clients: new Set(), alive: true };
  proc.onData((data) => {
    const buf = Buffer.from(data, 'utf8');
    t.chunks.push(buf); t.size += buf.length;
    while (t.size > SCROLLBACK_BYTES && t.chunks.length > 1) t.size -= t.chunks.shift().length;
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(buf, { binary: true });
  });
  proc.onExit(() => {
    t.alive = false; terms.delete(id);
    for (const ws of t.clients) { try { ws.send(JSON.stringify({ t: 'exit' })); ws.close(); } catch (_) { /* gone */ } }
  });
  if (init) setTimeout(() => { if (t.alive) proc.write(init + '\r'); }, 400);
  terms.set(id, t);
  return t;
}
function attachTerm(ws, q) {
  const id = String(q.get('id') || '');
  if (!/^[a-z0-9-]{4,40}$/.test(id)) return ws.close(4000, 'bad id');
  const cols = Math.max(20, Math.min(500, Number(q.get('cols')) || 100));
  const rows = Math.max(5, Math.min(200, Number(q.get('rows')) || 30));
  let t = terms.get(id);
  try {
    if (!t) t = createTerm(id, { cols, rows, cwd: q.get('cwd'), title: String(q.get('title') || '').slice(0, 60), init: String(q.get('init') || '').slice(0, 500) });
  } catch (e) { ws.send(JSON.stringify({ t: 'error', message: e.message })); return ws.close(); }
  if (t.chunks.length) ws.send(Buffer.concat(t.chunks), { binary: true });
  t.clients.add(ws);
  try { t.proc.resize(cols, rows); } catch (_) { /* exited */ }
  ws.on('message', (raw, isBinary) => {
    if (!t.alive) return;
    if (isBinary) return t.proc.write(raw.toString('utf8'));
    let m; try { m = JSON.parse(raw.toString('utf8')); } catch (_) { return; }
    if (m.t === 'i' && typeof m.d === 'string') t.proc.write(m.d);
    else if (m.t === 'r') { try { t.proc.resize(Math.max(20, Math.min(500, m.cols | 0)), Math.max(5, Math.min(200, m.rows | 0))); } catch (_) { /* exited */ } }
  });
  ws.on('close', () => t.clients.delete(ws));
  ws.on('error', () => t.clients.delete(ws));
}

/* ------------------------------------------------------------------ desktop */
const DESKTOP_APPS = {
  browser: (url) => ['forge-browser', ...(url ? [url] : [])],
  terminal: () => ['xfce4-terminal'],
  files: () => ['thunar'],
};
function launchDesktop(app, url) {
  const make = DESKTOP_APPS[app];
  if (!make) throw Object.assign(new Error('Unknown desktop app'), { status: 400 });
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw Object.assign(new Error('Only http and https addresses can be opened'), { status: 400 });
  const [cmd, ...args] = make(url);
  const child = spawn(cmd, args, { cwd: HOME, env: childEnv(), detached: true, stdio: 'ignore' });
  child.on('error', () => { /* reported through desktop status */ });
  child.unref();
}
function bridgeVnc(ws) {
  const tcp = net.connect({ port: VNC_PORT, host: '127.0.0.1' });
  tcp.setNoDelay(true);
  tcp.on('data', (d) => { if (ws.readyState === 1) ws.send(d, { binary: true }); });
  tcp.on('close', () => ws.close());
  tcp.on('error', () => ws.close());
  ws.on('message', (d) => { if (!tcp.destroyed) tcp.write(d); });
  ws.on('close', () => tcp.destroy());
  ws.on('error', () => tcp.destroy());
}

/* ------------------------------------------------------------------ proxy */
function upstreamHeaders(req) {
  const h = { ...req.headers };
  if (h.cookie) {
    const kept = h.cookie.split(';').map((s) => s.trim()).filter((s) => s && !s.startsWith(COOKIE + '='));
    if (kept.length) h.cookie = kept.join('; '); else delete h.cookie;
  }
  h['x-forwarded-for'] = h['x-forwarded-for'] || req.socket.remoteAddress || '';
  h['x-forwarded-host'] = h['x-forwarded-host'] || h.host || '';
  h['x-forwarded-proto'] = h['x-forwarded-proto'] || 'http';
  return h;
}
/* Returns { port, path, prefix } when the URL is one of the proxied routes. */
function proxyTarget(url) {
  let m;
  if (url === '/ide' || url.startsWith('/ide/') || url.startsWith('/ide?')) return { port: IDE_PORT, path: url.slice(4) || '/', prefix: '/ide', name: 'The code editor' };
  if ((m = /^\/proxy\/(\d{1,5})(\/.*|\?.*)?$/.exec(url))) return { port: Number(m[1]), path: m[2] ? (m[2].startsWith('?') ? '/' + m[2] : m[2]) : '/', prefix: `/proxy/${m[1]}`, bare: !m[2] };
  if ((m = /^\/absproxy\/(\d{1,5})(\/.*|\?.*)?$/.exec(url))) return { port: Number(m[1]), path: url, prefix: '' };
  return null;
}
const portAllowed = (p) => p >= 1 && p <= 65535 && p !== PORT && p !== VNC_PORT;
function proxyHttp(req, res, target) {
  if (!portAllowed(target.port)) return fail(res, 400, 'That port cannot be opened here.');
  if (target.bare || req.url === '/ide') { res.writeHead(308, { Location: (req.url.split('?')[0]) + '/' }); return res.end(); }
  const up = http.request({ host: '127.0.0.1', port: target.port, method: req.method, path: target.path, headers: upstreamHeaders(req) }, (ur) => {
    const headers = { ...ur.headers };
    if (target.prefix && typeof headers.location === 'string' && headers.location.startsWith('/') && !headers.location.startsWith('//') && !headers.location.startsWith(target.prefix + '/')) {
      headers.location = target.prefix + headers.location;
    }
    res.writeHead(ur.statusCode, ur.statusMessage, headers);
    ur.pipe(res);
  });
  up.on('error', () => {
    if (res.headersSent) return res.destroy();
    const what = target.name || `Nothing is listening on port ${target.port}`;
    const msg = target.name ? `${what} is not running yet. It usually needs a few seconds after a restart.` : `${what}. Start your app in the terminal, then reload.`;
    send(res, 502, `<!doctype html><meta charset="utf-8"><title>Not running</title><body style="font:15px system-ui;background:#14151d;color:#e9e7f2;display:grid;place-items:center;height:100vh;margin:0"><p style="max-width:34ch;text-align:center;line-height:1.6">${msg}</p>`, { 'Content-Type': MIME['.html'] });
  });
  req.pipe(up);
}
function proxyUpgrade(req, socket, head, target) {
  if (!portAllowed(target.port)) return socket.destroy();
  const up = net.connect({ port: target.port, host: '127.0.0.1' }, () => {
    let raw = `${req.method} ${target.path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(upstreamHeaders(req))) for (const one of [].concat(v)) raw += `${k}: ${one}\r\n`;
    up.write(raw + '\r\n');
    if (head && head.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

/* ------------------------------------------------------------------ API */
async function api(req, res, url) {
  const p = url.pathname; const q = url.searchParams; const m = req.method;
  if (m !== 'GET' && m !== 'HEAD' && (!sameOrigin(req) || req.headers['x-forge'] !== '1')) return fail(res, 403, 'Request refused.');

  if (p === '/api/me') return json(res, 200, { home: HOME, project: relPath(PROJECT), host: os.hostname() });
  if (p === '/api/logout' && m === 'POST') {
    if (q.get('all') === '1') loadSecret(true); // signs every device out
    return send(res, 204, '', { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (p === '/api/system') {
    const [disk, desktop, ide] = await Promise.all([diskInfo(), probe(VNC_PORT), probe(IDE_PORT)]);
    return json(res, 200, {
      host: os.hostname(), cores: os.cpus().length, cpu: cpuPct, load: os.loadavg()[0], mem: memInfo(), disk,
      uptime: Math.round(os.uptime()), terminals: terms.size, desktop, ide, node: process.version, time: Date.now(),
    });
  }
  if (p === '/api/ports') return json(res, 200, { ports: await listPorts() });

  /* ---- terminals */
  if (p === '/api/term' && m === 'GET') {
    return json(res, 200, { terminals: [...terms.values()].map((t) => ({ id: t.id, title: t.title, created: t.created, viewers: t.clients.size, pid: t.proc.pid })) });
  }
  if (p === '/api/term' && m === 'DELETE') {
    const t = terms.get(String(q.get('id')));
    if (t) { try { t.proc.kill(); } catch (_) { /* already gone */ } }
    return json(res, 200, { ok: true });
  }

  /* ---- desktop */
  if (p === '/api/desktop/launch' && m === 'POST') {
    const body = await readJson(req);
    if (!(await probe(VNC_PORT))) return fail(res, 503, 'The Linux desktop is not running.');
    launchDesktop(String(body.app || ''), body.url ? String(body.url) : '');
    return json(res, 200, { ok: true });
  }

  /* ---- files */
  if (p === '/api/fs/list') {
    const dir = safePath(q.get('path'));
    const names = await fsp.readdir(dir, { withFileTypes: true });
    const entries = (await Promise.all(names.slice(0, 5000).map(async (d) => {
      try {
        const st = await fsp.stat(path.join(dir, d.name));
        return { name: d.name, dir: st.isDirectory(), size: st.size, mtime: Math.round(st.mtimeMs), link: d.isSymbolicLink() };
      } catch (_) { return { name: d.name, dir: false, size: 0, mtime: 0, link: true, broken: true }; }
    }))).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return json(res, 200, { path: relPath(dir), entries, truncated: names.length > 5000 });
  }
  if (p === '/api/fs/read') {
    const file = safePath(q.get('path'));
    const st = await fsp.stat(file);
    if (st.isDirectory()) return fail(res, 400, 'That is a folder.');
    if (st.size > 2 * 1024 * 1024) return fail(res, 413, 'This file is larger than 2 MB. Download it or open it in Code.');
    const buf = await fsp.readFile(file);
    if (buf.subarray(0, 8192).includes(0)) return fail(res, 415, 'This is not a text file. Download it instead.');
    return json(res, 200, { path: relPath(file), text: buf.toString('utf8'), mtime: Math.round(st.mtimeMs) });
  }
  if (p === '/api/fs/write' && m === 'PUT') {
    const file = safePath(q.get('path'));
    if (file === HOME) return fail(res, 400, 'Choose a file name.');
    if (q.get('new') === '1' && fs.existsSync(file)) return fail(res, 409, 'A file with that name already exists.');
    const body = await readBody(req, 20 * 1024 * 1024);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.forge-tmp-${process.pid}`;
    await fsp.writeFile(tmp, body);
    try { const st = await fsp.stat(file); await fsp.chmod(tmp, st.mode); } catch (_) { /* new file */ }
    await fsp.rename(tmp, file);
    return json(res, 200, { ok: true, mtime: Date.now() });
  }
  if (p === '/api/fs/upload' && m === 'PUT') {
    const dir = safePath(q.get('path'));
    const file = path.join(dir, safeName(q.get('name')));
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${file}.part`;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmp);
      req.pipe(out);
      out.on('finish', resolve); out.on('error', reject);
      req.on('aborted', () => { out.destroy(); fsp.rm(tmp, { force: true }); reject(Object.assign(new Error('Upload interrupted'), { status: 400 })); });
    });
    await fsp.rename(tmp, file);
    return json(res, 200, { ok: true, path: relPath(file) });
  }
  if (p === '/api/fs/mkdir' && m === 'POST') {
    const body = await readJson(req);
    const dir = path.join(safePath(body.path), safeName(body.name));
    if (fs.existsSync(dir)) return fail(res, 409, 'Something with that name already exists.');
    await fsp.mkdir(dir, { recursive: true });
    return json(res, 200, { ok: true, path: relPath(dir) });
  }
  if (p === '/api/fs/rename' && m === 'POST') {
    const body = await readJson(req);
    const from = safePath(body.path);
    const to = path.join(body.to != null ? safePath(body.to) : path.dirname(from), safeName(body.name || path.basename(from)));
    if (from === HOME) return fail(res, 400, 'The home folder cannot be renamed.');
    if (fs.existsSync(to)) return fail(res, 409, 'Something with that name already exists.');
    await fsp.rename(from, to);
    return json(res, 200, { ok: true, path: relPath(to) });
  }
  if (p === '/api/fs/delete' && m === 'POST') {
    const body = await readJson(req);
    const target = safePath(body.path);
    if (target === HOME || target === PROJECT) return fail(res, 400, 'That folder cannot be deleted from here.');
    await fsp.rm(target, { recursive: true, force: true });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/fs/download') {
    const file = safePath(q.get('path'));
    const st = await fsp.stat(file);
    const name = path.basename(file) || 'home';
    const disp = (kind, n) => `${kind}; filename*=UTF-8''${encodeURIComponent(n)}`;
    if (st.isDirectory()) {
      res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': 'application/gzip', 'Content-Disposition': disp('attachment', `${name}.tar.gz`), 'Cache-Control': 'no-store' });
      const tar = spawn('tar', ['-czf', '-', '-C', path.dirname(file), '--', path.basename(file)], { stdio: ['ignore', 'pipe', 'ignore'] });
      tar.stdout.pipe(res); tar.on('error', () => res.destroy()); res.on('close', () => tar.kill());
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const inline = q.get('inline') === '1' && INLINE_OK.has(ext);
    res.writeHead(200, {
      ...BASE_HEADERS, 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      'Content-Type': inline ? MIME[ext] : 'application/octet-stream', 'Content-Length': st.size,
      'Content-Disposition': disp(inline ? 'inline' : 'attachment', name), 'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return;
  }
  return fail(res, 404, 'Not found');
}

/* ------------------------------------------------------------------ HTTP */
const PUBLIC_FILES = new Set(['/login.css', '/login.js', '/favicon.svg']);
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/healthz') return send(res, 200, 'ok', { 'Content-Type': MIME['.txt'] });

  if (p === '/api/login' && req.method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'Request refused.');
    if (!HASH_OK) return fail(res, 503, 'No password is set. Add FORGE_PASSWORD_HASH to .env and restart.');
    const ip = clientIp(req);
    const wait = lockedFor(ip);
    if (wait) return fail(res, 429, `Too many attempts. Try again in ${wait} seconds.`);
    const body = await readJson(req);
    const ok = typeof body.password === 'string' && body.password.length <= 1024 && await bcrypt.compare(body.password, PASSWORD_HASH);
    if (!ok) { noteFail(ip); return fail(res, 401, 'That password is not correct.'); }
    fails.delete(ip);
    return send(res, 204, '', { 'Set-Cookie': sessionCookie(req, makeSession(), SESSION_DAYS * 86400) });
  }
  if (p === '/login') {
    if (authed(req)) { res.writeHead(302, { Location: '/' }); return res.end(); }
    return (await serveFile(req, res, path.join(PUBLIC_DIR, 'login.html'))) || send(res, 500, 'login.html is missing');
  }
  if (PUBLIC_FILES.has(p)) return (await serveFile(req, res, path.join(PUBLIC_DIR, p))) || send(res, 404, 'Not found');

  if (!authed(req)) {
    if (p.startsWith('/api/')) return fail(res, 401, 'Signed out');
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    return res.end();
  }

  const target = proxyTarget(req.url);
  if (target) return proxyHttp(req, res, target);
  if (p.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');

  for (const [prefix, root] of Object.entries(VENDOR)) {
    if (p.startsWith(prefix)) {
      const file = staticPath(root, decodeURIComponent(p.slice(prefix.length)));
      return (file && await serveFile(req, res, file, { 'Cache-Control': 'public, max-age=86400' })) || send(res, 404, 'Not found');
    }
  }
  let rel; try { rel = decodeURIComponent(p); } catch (_) { return send(res, 400, 'Bad path'); }
  const file = staticPath(PUBLIC_DIR, rel === '/' ? '/index.html' : rel);
  return (file && await serveFile(req, res, file)) || send(res, 404, 'Not found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e.status || (e.code === 'ENOENT' ? 404 : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : e.code === 'ENOTDIR' || e.code === 'EISDIR' ? 400 : 500);
    const message = e.status ? e.message : e.code === 'ENOENT' ? 'That file or folder no longer exists.' : e.code === 'EACCES' || e.code === 'EPERM' ? 'Permission denied.' : e.code === 'ENOTEMPTY' ? 'That folder is not empty.' : 'Something went wrong on the server.';
    if (status === 500) console.error(e);
    if (!res.headersSent) fail(res, status, message); else res.destroy();
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024, handleProtocols: (set) => (set.has('binary') ? 'binary' : false) });
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  if (!authed(req) || !sameOrigin(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
  const target = proxyTarget(req.url);
  if (target) return proxyUpgrade(req, socket, head, target);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/ws/term') return wss.handleUpgrade(req, socket, head, (ws) => attachTerm(ws, url.searchParams));
  if (url.pathname === '/ws/vnc') return wss.handleUpgrade(req, socket, head, (ws) => bridgeVnc(ws));
  socket.destroy();
});

server.listen(PORT, BIND, () => {
  console.log(`Forge Desk listening on ${BIND}:${PORT} (home ${HOME})`);
  if (!HASH_OK) console.warn('FORGE_PASSWORD_HASH is missing or not a bcrypt hash: sign-in is disabled until it is set.');
});
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const t of terms.values()) { try { t.proc.kill(); } catch (_) { /* gone */ } }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
