if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const currentScript = document.currentScript;
    let swUrl = '/sw.js';
    const basePath = window.LAUNCHARR_BASE_PATH || '';
    try {
      const scriptUrl = new URL(currentScript?.src || window.location.href, window.location.href);
      const version = scriptUrl.searchParams.get('v');
      if (version) swUrl = '/sw.js?v=' + encodeURIComponent(version);
    } catch (err) {
      swUrl = '/sw.js';
    }
    if (basePath) {
      if (swUrl.startsWith('/')) {
        swUrl = basePath + swUrl;
      } else {
        swUrl = basePath + '/' + swUrl;
      }
    }
    navigator.serviceWorker
      .register(swUrl, { updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {});
      })
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
