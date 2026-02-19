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
  const bootstrapped = document.documentElement?.dataset?.theme;
  const initial = stored
    || (bootstrapped === 'day' || bootstrapped === 'night' ? bootstrapped : '')
    || (prefersLight ? 'day' : 'night');
  applyTheme(initial);
  if (!stored && (initial === 'day' || initial === 'night')) {
    localStorage.setItem('launcharr-theme', initial);
  }

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

  const switchViewLink = document.querySelector('.user-menu-item[href^="/switch-view?role="]');
  const inAdminView = Boolean(switchViewLink && /[?&]role=user(?:&|$)/.test(switchViewLink.getAttribute('href') || ''));
  if (!inAdminView) return;

  fetch('/api/version')
    .then((res) => res.json())
    .then((data) => {
      const current = String(data?.current || '').trim();
      const latest = String(data?.latest || '').trim();
      if (!current) return;
      const compactLabel = Boolean(window.matchMedia && window.matchMedia('(max-width: 980px)').matches);
      const releaseBase = 'https://github.com/MickyGX/launcharr/releases/tag/';
      const buildReleaseUrl = (versionTag) => releaseBase + encodeURIComponent(String(versionTag || '').trim());
      const buildVersionPill = ({ text, className, versionTag, ariaPrefix }) => {
        const link = document.createElement('a');
        link.className = className;
        link.href = buildReleaseUrl(versionTag);
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = text;
        link.setAttribute('aria-label', `${ariaPrefix} ${versionTag} release notes`);
        return link;
      };

      const wrap = document.createElement('div');
      wrap.className = 'version-badge';

      wrap.appendChild(buildVersionPill({
        text: compactLabel ? current : `Current ${current}`,
        className: 'version-pill',
        versionTag: current,
        ariaPrefix: 'Current version',
      }));

      if (latest && latest !== current) {
        wrap.appendChild(buildVersionPill({
          text: compactLabel ? latest : `Latest ${latest}`,
          className: 'version-pill version-pill--latest',
          versionTag: latest,
          ariaPrefix: 'Latest version',
        }));
      }

      status.prepend(wrap);
    })
    .catch(() => {});
})();
