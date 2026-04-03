(function () {
  'use strict';

  var config = (window.LAUNCHARR_DASHBOARD_REFRESH_CONFIG && typeof window.LAUNCHARR_DASHBOARD_REFRESH_CONFIG === 'object')
    ? window.LAUNCHARR_DASHBOARD_REFRESH_CONFIG
    : {};
  var enabled = config.enabled === true;
  var rawSeconds = Number(config.refreshSeconds);
  var refreshSeconds = Number.isFinite(rawSeconds) ? Math.max(15, Math.min(3600, Math.round(rawSeconds))) : 60;
  var dashboardId = String(config.dashboardId || '').trim() || 'main';
  var listeners = new Set();
  var timerId = null;

  function emit(reason) {
    var detail = {
      dashboardId: dashboardId,
      reason: String(reason || 'interval'),
      refreshSeconds: refreshSeconds,
    };
    listeners.forEach(function (callback) {
      try {
        callback(detail);
      } catch (err) {
        console.error('Dashboard refresh listener failed', err);
      }
    });
    document.dispatchEvent(new CustomEvent('launcharr:dashboard-refresh', { detail: detail }));
  }

  function onRefresh(callback) {
    if (typeof callback !== 'function') return function () {};
    listeners.add(callback);
    return function () {
      listeners.delete(callback);
    };
  }

  function stop() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function start() {
    if (!enabled) return;
    stop();
    timerId = window.setInterval(function () {
      if (document.hidden) return;
      emit('interval');
    }, refreshSeconds * 1000);
  }

  window.LAUNCHARR_DASHBOARD_REFRESH = {
    enabled: enabled,
    refreshSeconds: refreshSeconds,
    dashboardId: dashboardId,
    onRefresh: onRefresh,
    emitNow: function (reason) {
      emit(reason || 'manual');
    },
  };

  if (!enabled) return;

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    emit('visibility');
  });

  start();
})();
