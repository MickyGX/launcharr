if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const currentScript = document.currentScript;
    let swUrl = '/sw.js';
    try {
      const scriptUrl = new URL(currentScript?.src || window.location.href, window.location.href);
      const version = scriptUrl.searchParams.get('v');
      if (version) swUrl = '/sw.js?v=' + encodeURIComponent(version);
    } catch (err) {
      swUrl = '/sw.js';
    }
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
