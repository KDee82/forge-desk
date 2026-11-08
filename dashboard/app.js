(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Greeting ---------- */
  const greeting = $('#greeting');
  if (greeting) {
    const h = new Date().getHours();
    const part = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    greeting.textContent = `${part}, builder.`;
  }

  /* ---------- Theme (dark / light, remembered) ---------- */
  const toggle = $('#theme-toggle');
  const currentTheme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');
  const applyTheme = (theme, persist) => {
    root.dataset.theme = theme;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f6f5fb' : '#0a0b10';
    if (toggle) toggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    if (persist) { try { localStorage.setItem('forge-theme', theme); } catch (_) { /* private mode */ } }
  };
  applyTheme(currentTheme(), false);
  toggle?.addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true));

  /* ---------- Copy project path ---------- */
  const copy = $('#copy-path');
  const PATH = '/home/coder/project';
  copy?.addEventListener('click', async () => {
    const previous = copy.dataset.label || (copy.dataset.label = copy.textContent);
    let ok = true;
    try {
      await navigator.clipboard.writeText(PATH);
    } catch (_) {
      // Fallback for browsers/contexts without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = PATH; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
      ta.remove();
    }
    copy.textContent = ok ? `Copied: ${PATH}` : `Copy failed — path is ${PATH}`;
    clearTimeout(copy._t);
    copy._t = setTimeout(() => { copy.textContent = previous; }, 2200);
  });

  /* ---------- Live status from /healthz ---------- */
  const status = $('#status');
  const statusText = $('#status-text');
  const setStatus = (state, text) => { if (status) { status.dataset.state = state; statusText.textContent = text; } };
  const check = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch('/healthz', { cache: 'no-store', signal: ctrl.signal });
      setStatus(res.ok ? 'online' : 'offline', res.ok ? 'VPS online' : 'Gateway error');
    } catch (_) {
      setStatus('offline', 'Unreachable');
    } finally { clearTimeout(timer); }
  };
  check();
  setInterval(() => { if (!document.hidden) check(); }, 30000);

  /* ---------- App launcher ---------- */
  const grid = $('#app-grid');
  const proxyUrl = (port) => `/ide/proxy/${port}/`;
  const validPort = (n) => Number.isInteger(n) && n >= 1 && n <= 65535 && n !== 80 && n !== 443 && n !== 8080;
  const safeUrl = (u) => typeof u === 'string' && /^(\/(?!\/)|https?:\/\/)/.test(u);

  const card = (app) => {
    const port = Number(app.port);
    const href = app.url ? app.url : (validPort(port) ? proxyUrl(port) : null);
    if (!href || !safeUrl(href)) return null;
    const a = document.createElement('a');
    a.className = 'app-card'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
    const badge = document.createElement('span');
    badge.className = 'icon violet'; badge.textContent = String(app.name || '?').trim().charAt(0).toUpperCase() || '?';
    badge.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = app.name || 'App';
    const p = document.createElement('p'); p.textContent = app.description || (validPort(port) ? `Port ${port}` : href);
    body.append(h, p);
    const go = document.createElement('span'); go.className = 'go'; go.setAttribute('aria-hidden', 'true'); go.textContent = '↗';
    a.append(badge, body, go);
    return a;
  };

  const loadApps = async () => {
    if (!grid) return;
    try {
      const res = await fetch('apps.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const cards = (Array.isArray(data.apps) ? data.apps : []).map(card).filter(Boolean);
      if (!cards.length) throw new Error('empty');
      grid.replaceChildren(...cards);
    } catch (_) {
      const empty = document.createElement('p');
      empty.className = 'apps-empty';
      empty.textContent = 'No saved apps yet. Use "Open app on port" above, or add entries to dashboard/apps.json.';
      grid.replaceChildren(empty);
    }
  };
  loadApps();

  const form = $('#port-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#port-input');
    const port = Number(input.value.trim());
    if (!validPort(port)) {
      input.setCustomValidity('Enter a port between 1 and 65535 (not 80, 443 or 8080).');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    window.open(proxyUrl(port), '_blank', 'noopener');
  });
  $('#port-input')?.addEventListener('input', (e) => e.target.setCustomValidity(''));
})();
