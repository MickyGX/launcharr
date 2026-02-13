(() => {
  const status = document.querySelector('.main-window-status');
  if (!status) return;
  const dot = status.querySelector('.status-dot');
  const toggle = document.createElement('button');
  const icon = document.createElement('img');

  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Toggle theme');
  toggle.setAttribute('aria-pressed', 'false');
  icon.className = 'theme-toggle-icon';
  icon.alt = '';
  toggle.appendChild(icon);

  const applyTheme = (theme) => {
    const mode = theme === 'day' ? 'day' : 'night';
    document.documentElement.dataset.theme = mode;
    if (document.body) {
      document.body.dataset.theme = mode;
    }
    icon.src = mode === 'day' ? '/icons/sun.svg' : '/icons/moon.svg';
    toggle.setAttribute('aria-pressed', mode === 'day' ? 'true' : 'false');
  };

  const stored = localStorage.getItem('launcharr-theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(stored || (prefersLight ? 'day' : 'night'));

  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'day' ? 'night' : 'day';
    applyTheme(next);
    localStorage.setItem('launcharr-theme', next);
  });

  if (dot) {
    status.insertBefore(toggle, dot);
  } else {
    status.appendChild(toggle);
  }

  fetch('/api/version')
    .then((res) => res.json())
    .then((data) => {
      const current = String(data?.current || '').trim();
      const latest = String(data?.latest || '').trim();
      if (!current) return;

      const wrap = document.createElement('div');
      wrap.className = 'version-badge';

      const currentSpan = document.createElement('span');
      currentSpan.className = 'version-pill';
      currentSpan.textContent = `Current ${current}`;
      wrap.appendChild(currentSpan);

      if (latest && latest !== current) {
        const latestSpan = document.createElement('span');
        latestSpan.className = 'version-pill version-pill--latest';
        latestSpan.textContent = `Latest ${latest}`;
        wrap.appendChild(latestSpan);
      }

      status.prepend(wrap);
    })
    .catch(() => {});
})();
