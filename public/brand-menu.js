(function () {
  const brand = document.querySelector('.dash-brand');
  const root = document.documentElement;
  if (!brand || !root) return;

  const safeStorage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (_err) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_err) {
        return;
      }
    },
  };

  const storageKeys = {
    bgMotion: 'launcharr-bg-motion',
    maximized: 'launcharr-maximized-window',
  };

  const wrapper = document.createElement('div');
  const maximizeIconSvg = ''
    + '<svg class="dash-brand-menu-item-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '  <rect x="5" y="5" width="14" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8" />'
    + '</svg>';
  const minimizeIconSvg = ''
    + '<svg class="dash-brand-menu-item-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '  <rect x="5.5" y="8" width="11" height="10.5" rx="1.6" ry="1.6" fill="none" stroke="currentColor" stroke-width="1.8" />'
    + '  <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M9 5.5h9.5V15" />'
    + '</svg>';
  wrapper.className = 'dash-brand-menu';
  wrapper.innerHTML = ''
    + '<button class="dash-brand-menu-toggle" type="button" aria-label="Open Launcharr menu" aria-expanded="false">'
    + '  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9" />'
    + '    <line x1="8" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />'
    + '    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />'
    + '    <line x1="8" y1="15" x2="16" y2="15" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />'
    + '  </svg>'
    + '</button>'
    + '<div class="dash-brand-menu-popover" hidden>'
    + '  <div class="dash-brand-menu-heading">Settings</div>'
    + '  <button class="dash-brand-menu-item" type="button" data-action="bg-motion">'
    + '    <svg class="dash-brand-menu-item-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '      <path fill="currentColor" d="M12 4.2l1.15 2.73 2.73 1.15-2.73 1.15L12 12l-1.15-2.77-2.73-1.15 2.73-1.15L12 4.2z" />'
    + '      <path fill="currentColor" d="M18.5 3.6l.62 1.48 1.48.62-1.48.62-.62 1.48-.62-1.48-1.48-.62 1.48-.62.62-1.48zM5.2 14.5l.7 1.66 1.66.7-1.66.7-.7 1.66-.7-1.66-1.66-.7 1.66-.7.7-1.66zM16.2 14.8l.48 1.12 1.12.48-1.12.48-.48 1.12-.48-1.12-1.12-.48 1.12-.48.48-1.12z" />'
    + '    </svg>'
    + '    <span class="dash-brand-menu-item-label" data-label="bg-motion">Disable starfield effect</span>'
    + '  </button>'
    + '  <button class="dash-brand-menu-item" type="button" data-action="maximize">'
    + '    <span data-icon="maximize"></span>'
    + '    <span class="dash-brand-menu-item-label" data-label="maximize">Maximize window</span>'
    + '  </button>'
    + '</div>';
  brand.appendChild(wrapper);

  const toggle = wrapper.querySelector('.dash-brand-menu-toggle');
  const menu = wrapper.querySelector('.dash-brand-menu-popover');
  const motionBtn = wrapper.querySelector('[data-action="bg-motion"]');
  const maximizeBtn = wrapper.querySelector('[data-action="maximize"]');
  const motionLabel = wrapper.querySelector('[data-label="bg-motion"]');
  const maximizeLabel = wrapper.querySelector('[data-label="maximize"]');
  const maximizeIcon = wrapper.querySelector('[data-icon="maximize"]');
  if (!toggle || !menu || !motionBtn || !maximizeBtn || !motionLabel || !maximizeLabel || !maximizeIcon) return;

  const isMotionEnabled = () => root.dataset.bgMotion !== '0';
  const isMaximized = () => root.dataset.maximized === '1';
  const applyMotion = (enabled) => {
    root.dataset.bgMotion = enabled ? '1' : '0';
    safeStorage.set(storageKeys.bgMotion, enabled ? '1' : '0');
  };
  const applyMaximized = (enabled) => {
    root.dataset.maximized = enabled ? '1' : '0';
    safeStorage.set(storageKeys.maximized, enabled ? '1' : '0');
  };

  const updateLabels = () => {
    motionLabel.textContent = isMotionEnabled() ? 'Disable starfield effect' : 'Enable starfield effect';
    maximizeLabel.textContent = isMaximized() ? 'Exit maximize view' : 'Maximize window';
    maximizeIcon.innerHTML = isMaximized() ? minimizeIconSvg : maximizeIconSvg;
  };

  const openMenu = () => {
    toggle.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  };
  const closeMenu = () => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  };

  const storedMaximized = safeStorage.get(storageKeys.maximized) === '1';
  if (storedMaximized) applyMaximized(true);
  updateLabels();

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  motionBtn.addEventListener('click', (event) => {
    event.preventDefault();
    applyMotion(!isMotionEnabled());
    updateLabels();
    closeMenu();
  });

  maximizeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const next = !isMaximized();
    applyMaximized(next);
    updateLabels();
    closeMenu();
  });

  wrapper.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', () => {
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
  });
})();
