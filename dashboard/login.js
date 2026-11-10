(() => {
  'use strict';
  const form = document.getElementById('form');
  const input = document.getElementById('password');
  const button = document.getElementById('submit');
  const error = document.getElementById('error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      });
      if (res.status === 204) { location.replace('/'); return; }
      const data = await res.json().catch(() => ({}));
      error.textContent = data.error || 'Sign-in failed. Try again.';
      input.select();
    } catch (_) {
      error.textContent = 'The server did not answer. Check your connection and try again.';
    }
    button.disabled = false;
    button.textContent = 'Sign in';
  });
})();
