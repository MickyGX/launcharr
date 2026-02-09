(() => {
  const status = document.querySelector('.main-window-status');
  if (!status) return;

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
