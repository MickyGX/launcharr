(function () {
  'use strict';

  var root = document.getElementById('dashboardWidgetsRoot');
  if (!root) return;

  var addButton = document.getElementById('dashboardWidgetsAddBtn');
  var canManage = Boolean(window.DASHBOARD_WIDGETS_CAN_MANAGE);
  var sourceOptions = Array.isArray(window.DASHBOARD_WIDGET_SOURCES)
    ? window.DASHBOARD_WIDGET_SOURCES.slice()
    : [];
  var sourceById = new Map(sourceOptions.map(function (entry) {
    return [String(entry && entry.id || '').trim().toLowerCase(), entry || {}];
  }));

  var cards = Array.isArray(window.DASHBOARD_WIDGETS_CONFIG)
    ? window.DASHBOARD_WIDGETS_CONFIG.map(normalizeCard).filter(Boolean)
    : [];
  cards.sort(function (left, right) {
    var orderDelta = Number(left.order || 0) - Number(right.order || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });

  var stateById = new Map();
  var SETTINGS_ROLES = ['guest', 'user', 'co-admin', 'admin'];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampInt(value, fallback, minValue, maxValue) {
    var base = parseNumber(value, fallback);
    var rounded = Number.isFinite(base) ? Math.round(base) : fallback;
    return Math.max(minValue, Math.min(maxValue, rounded));
  }

  function normalizeToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
  }

  function normalizeFilterValue(value, fallback) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return String(fallback || 'all').trim().toLowerCase() || 'all';
    if (/^[a-z0-9#._-]+$/.test(text)) return text;
    return String(fallback || 'all').trim().toLowerCase() || 'all';
  }

  function getSource(sourceId) {
    var key = String(sourceId || '').trim().toLowerCase();
    return sourceById.get(key) || null;
  }

  function defaultSourceId() {
    var available = sourceOptions.find(function (entry) { return entry && entry.available; });
    var first = sourceOptions[0] || {};
    return String((available && available.id) || first.id || 'romm-recently-added').trim().toLowerCase();
  }

  function normalizeCard(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var sourceId = normalizeToken(source.source || source.sourceId || defaultSourceId());
    var sourceDef = getSource(sourceId);
    if (!sourceDef) return null;
    return {
      id: normalizeToken(source.id || source.widgetId || '') || ('widget-' + Math.random().toString(36).slice(2, 9)),
      title: String(source.title || sourceDef.name || 'Widget').trim() || 'Widget',
      source: sourceId,
      rows: clampInt(source.rows, 2, 1, 6),
      columns: clampInt(source.columns, 4, 1, 8),
      limit: clampInt(source.limit, 12, 1, 200),
      refreshSeconds: clampInt(source.refreshSeconds, 120, 15, 3600),
      autoScroll: source.autoScroll !== false,
      order: parseNumber(source.order, 0),
      visibilityRole: SETTINGS_ROLES.includes(String(source.visibilityRole || '').trim().toLowerCase())
        ? String(source.visibilityRole || '').trim().toLowerCase()
        : 'user',
      filters: {
        media: normalizeFilterValue(source.filters && source.filters.media, 'all'),
        letter: normalizeFilterValue(source.filters && source.filters.letter, 'all'),
        status: normalizeFilterValue(source.filters && source.filters.status, 'all'),
      },
      supports: {
        media: Boolean(source.supports && source.supports.media),
        letter: Boolean(source.supports && source.supports.letter),
        status: Boolean(source.supports && source.supports.status),
        execute: Boolean(source.supports && source.supports.execute),
      },
      sourceName: String(source.sourceName || sourceDef.name || sourceId).trim() || sourceId,
      sourceIcon: String(source.sourceIcon || sourceDef.icon || '/icons/app.svg').trim() || '/icons/app.svg',
      sourceEndpoint: String(source.sourceEndpoint || sourceDef.endpoint || '').trim(),
      sourceAppId: String(source.sourceAppId || sourceDef.appId || '').trim().toLowerCase(),
      sourceAvailable: source.sourceAvailable !== false,
    };
  }

  function ensureState(cardId) {
    var key = normalizeToken(cardId);
    if (!key) return null;
    if (!stateById.has(key)) {
      stateById.set(key, {
        loading: false,
        error: '',
        items: [],
        filtered: [],
        page: 0,
        timer: null,
      });
    }
    return stateById.get(key);
  }

  function clearAllTimers() {
    stateById.forEach(function (entry) {
      if (entry && entry.timer) {
        window.clearInterval(entry.timer);
        entry.timer = null;
      }
    });
  }

  function formatRelative(value) {
    var ts = parseTimestamp(value);
    if (!ts) return '';
    var diffMs = Date.now() - ts;
    var mins = Math.max(1, Math.round(diffMs / 60000));
    if (mins < 60) return String(mins) + 'm ago';
    var hours = Math.round(mins / 60);
    if (hours < 48) return String(hours) + 'h ago';
    var days = Math.round(hours / 24);
    return String(days) + 'd ago';
  }

  function parseTimestamp(value) {
    if (value === null || value === undefined || value === '') return 0;
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      if (numeric > 1e11) return Math.round(numeric);
      return Math.round(numeric * 1000);
    }
    var parsed = Date.parse(String(value || '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeKind(value) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (text === 'tv' || text === 'show' || text === 'series') return 'show';
    if (text === 'movie' || text === 'film') return 'movie';
    return text;
  }

  function normalizeItem(raw, index) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var title = String(source.title || source.name || source.event || source.action || '').trim();
    if (!title) title = 'Untitled';
    var status = String(source.status || source.state || source.level || '').trim();
    var pill = String(source.pill || '').trim();
    var sortTs = parseTimestamp(
      source.sortTs
      || source.timestamp
      || source.createdAt
      || source.created_at
      || source.updatedAt
      || source.updated_at
      || source.date
      || source.time
    );
    return {
      id: normalizeToken(source.id || source.uuid || source.slug || '') || ('item-' + String(index + 1)),
      title: title,
      subtitle: String(source.subtitle || source.libraryTitle || source.collectionTitle || source.mediaTitle || '').trim(),
      meta: String(source.meta || source.addedLabel || source.overview || source.description || source.message || '').trim(),
      overview: String(source.overview || source.description || source.message || '').trim(),
      status: status,
      statusKey: normalizeFilterValue(source.statusKey || status, status),
      pill: pill || formatRelative(sortTs),
      kind: normalizeKind(source.kind || source.mediaType || source.type || ''),
      thumb: String(source.thumb || source.poster || source.image || '').trim(),
      art: String(source.art || source.backdrop || '').trim(),
      launchUrl: String(source.launchUrl || '').trim(),
      sortTs: sortTs,
      raw: source,
    };
  }

  function appendQuery(url, params) {
    var parsed = new URL(url, window.location.origin);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      parsed.searchParams.set(key, String(value));
    });
    return parsed.pathname + parsed.search;
  }

  function requestJson(url, options) {
    return fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }, options || {})).then(function (res) {
      return res.text().then(function (text) {
        var payload = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (_err) {
          payload = {};
        }
        if (!res.ok) {
          var message = String(payload.error || payload.message || '').trim();
          throw new Error(message || ('Request failed (' + res.status + ')'));
        }
        return payload;
      });
    });
  }

  function fetchCardItems(card) {
    var state = ensureState(card.id);
    if (!state) return Promise.resolve();
    state.loading = true;
    state.error = '';
    renderCard(card);

    var endpoint = String(card.sourceEndpoint || '').trim();
    if (!endpoint) {
      state.loading = false;
      state.error = 'Missing source endpoint.';
      renderCard(card);
      return Promise.resolve();
    }

    var url = appendQuery(endpoint, {
      limit: Math.max(card.limit * 5, 100),
    });

    return requestJson(url)
      .then(function (payload) {
        var list = Array.isArray(payload && payload.items)
          ? payload.items
          : (Array.isArray(payload) ? payload : []);
        state.items = list.map(normalizeItem).filter(function (entry) { return Boolean(entry && entry.title); });
        state.loading = false;
        state.error = '';
        applyFilters(card);
      })
      .catch(function (err) {
        state.loading = false;
        state.error = err && err.message ? String(err.message) : 'Failed to load widget data.';
        state.items = [];
        state.filtered = [];
        renderCard(card);
      });
  }

  function applyFilters(card) {
    var state = ensureState(card.id);
    if (!state) return;
    var mediaFilter = normalizeFilterValue(card.filters && card.filters.media, 'all');
    var statusFilter = normalizeFilterValue(card.filters && card.filters.status, 'all');
    var letterFilter = normalizeFilterValue(card.filters && card.filters.letter, 'all').toUpperCase();
    var filtered = (Array.isArray(state.items) ? state.items : []).filter(function (entry) {
      if (mediaFilter !== 'all' && normalizeKind(entry.kind) !== mediaFilter) return false;
      if (statusFilter !== 'all' && normalizeFilterValue(entry.statusKey || entry.status, '').indexOf(statusFilter) === -1) return false;
      if (letterFilter !== 'ALL') {
        var first = String(entry.title || '').trim().charAt(0).toUpperCase();
        var letter = /[A-Z]/.test(first) ? first : '#';
        if (letter !== letterFilter) return false;
      }
      return true;
    });
    filtered.sort(function (left, right) {
      var sortDelta = Number(right.sortTs || 0) - Number(left.sortTs || 0);
      if (sortDelta !== 0) return sortDelta;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
    state.filtered = filtered;
    var pageSize = Math.max(1, card.rows * card.columns);
    var maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (state.page > maxPage) state.page = maxPage;
    renderCard(card);
  }

  function sourceOptionsHtml(selectedSourceId) {
    return sourceOptions.map(function (entry) {
      var sourceId = String(entry && entry.id || '').trim().toLowerCase();
      if (!sourceId) return '';
      var selected = sourceId === selectedSourceId ? ' selected' : '';
      var disabled = entry && entry.available ? '' : ' disabled';
      var label = String(entry && entry.name || sourceId).trim() || sourceId;
      return '<option value="' + escapeHtml(sourceId) + '"' + selected + disabled + '>' + escapeHtml(label) + '</option>';
    }).join('');
  }

  function renderCards() {
    if (!cards.length) {
      root.innerHTML = '<div class="plex-empty">' + (canManage ? 'No widget cards yet. Use + to add one.' : 'No widget cards configured.') + '</div>';
      return;
    }

    root.innerHTML = cards.map(function (card) {
      var state = ensureState(card.id);
      var supports = card.supports || {};
      var hasError = Boolean(state && state.error);
      var loading = Boolean(state && state.loading);
      return (
        '<article class="dashboard-widget-card" data-widget-id="' + escapeHtml(card.id) + '">' +
          '<header class="dashboard-widget-card-head">' +
            '<div class="dashboard-widget-card-title">' +
              '<img class="dashboard-widget-card-logo" src="' + escapeHtml(card.sourceIcon || '/icons/app.svg') + '" alt="" onerror="this.onerror=null;this.src=\'/icons/app.svg\'" />' +
              '<div class="dashboard-widget-card-title-copy">' +
                '<div class="dashboard-widget-card-name">' + escapeHtml(card.title) + '</div>' +
                '<div class="dashboard-widget-card-source">' + escapeHtml(card.sourceName || card.source) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="dashboard-widget-card-controls">' +
              (supports.media ? (
                '<select class="dashboard-widget-filter" data-widget-action="filter-media" data-widget-id="' + escapeHtml(card.id) + '">' +
                  '<option value="all"' + (card.filters.media === 'all' ? ' selected' : '') + '>All media</option>' +
                  '<option value="movie"' + (card.filters.media === 'movie' ? ' selected' : '') + '>Movies</option>' +
                  '<option value="show"' + (card.filters.media === 'show' ? ' selected' : '') + '>TV</option>' +
                '</select>'
              ) : '') +
              (supports.letter ? (
                '<select class="dashboard-widget-filter" data-widget-action="filter-letter" data-widget-id="' + escapeHtml(card.id) + '">' +
                  '<option value="all"' + (card.filters.letter === 'all' ? ' selected' : '') + '>All letters</option>' +
                  '<option value="#"' + (card.filters.letter === '#' ? ' selected' : '') + '>#</option>' +
                  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(function (letter) {
                    var selected = card.filters.letter && card.filters.letter.toUpperCase() === letter ? ' selected' : '';
                    return '<option value="' + letter + '"' + selected + '>' + letter + '</option>';
                  }).join('') +
                '</select>'
              ) : '') +
              (supports.status ? (
                '<select class="dashboard-widget-filter" data-widget-action="filter-status" data-widget-id="' + escapeHtml(card.id) + '">' +
                  '<option value="all"' + (card.filters.status === 'all' ? ' selected' : '') + '>All status</option>' +
                  '<option value="active"' + (card.filters.status === 'active' ? ' selected' : '') + '>Active</option>' +
                  '<option value="paused"' + (card.filters.status === 'paused' ? ' selected' : '') + '>Paused</option>' +
                  '<option value="error"' + (card.filters.status === 'error' ? ' selected' : '') + '>Error</option>' +
                '</select>'
              ) : '') +
              '<button class="dashboard-widget-mini-btn" type="button" data-widget-action="refresh" data-widget-id="' + escapeHtml(card.id) + '" title="Refresh">⟳</button>' +
              (canManage ? '<button class="dashboard-widget-mini-btn" type="button" data-widget-action="settings" data-widget-id="' + escapeHtml(card.id) + '" title="Card settings">⚙</button>' : '') +
            '</div>' +
          '</header>' +
          '<div class="dashboard-widget-settings" data-widget-settings="' + escapeHtml(card.id) + '">' +
            (canManage ? (
              '<div class="dashboard-widget-settings-grid">' +
                '<label>Title<input type="text" data-widget-field="title" value="' + escapeHtml(card.title) + '" /></label>' +
                '<label>Source<select data-widget-field="source">' + sourceOptionsHtml(card.source) + '</select></label>' +
                '<label>Columns<input type="number" min="1" max="8" data-widget-field="columns" value="' + String(card.columns) + '" /></label>' +
                '<label>Rows<input type="number" min="1" max="6" data-widget-field="rows" value="' + String(card.rows) + '" /></label>' +
                '<label>Items<input type="number" min="1" max="200" data-widget-field="limit" value="' + String(card.limit) + '" /></label>' +
                '<label>Refresh s<input type="number" min="15" max="3600" data-widget-field="refreshSeconds" value="' + String(card.refreshSeconds) + '" /></label>' +
                '<label>Order<input type="number" min="0" max="9999" data-widget-field="order" value="' + String(card.order || 0) + '" /></label>' +
                '<label>Min role<select data-widget-field="visibilityRole">' +
                  SETTINGS_ROLES.map(function (roleName) {
                    var selected = roleName === card.visibilityRole ? ' selected' : '';
                    return '<option value="' + roleName + '"' + selected + '>' + roleName + '</option>';
                  }).join('') +
                '</select></label>' +
                '<label class="dashboard-widget-checkbox">' +
                  '<input type="checkbox" data-widget-field="autoScroll"' + (card.autoScroll ? ' checked' : '') + ' /> Auto paging' +
                '</label>' +
              '</div>' +
              '<div class="dashboard-widget-settings-actions">' +
                '<button class="dashboard-widget-settings-btn" type="button" data-widget-action="save" data-widget-id="' + escapeHtml(card.id) + '">Save</button>' +
                '<button class="dashboard-widget-settings-btn" type="button" data-widget-action="duplicate" data-widget-id="' + escapeHtml(card.id) + '">Duplicate</button>' +
                '<button class="dashboard-widget-settings-btn dashboard-widget-settings-btn--danger" type="button" data-widget-action="delete" data-widget-id="' + escapeHtml(card.id) + '">Delete</button>' +
              '</div>'
            ) : '') +
          '</div>' +
          '<div class="dashboard-widget-body" data-widget-body="' + escapeHtml(card.id) + '">' +
            (loading ? '<div class="plex-empty">Loading…</div>' : '') +
            (hasError ? '<div class="plex-empty">' + escapeHtml(state.error) + '</div>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');

    cards.forEach(function (card) {
      renderCard(card);
      scheduleRefresh(card);
    });
  }

  function renderCard(card) {
    var state = ensureState(card.id);
    if (!state) return;
    var body = root.querySelector('[data-widget-body="' + card.id + '"]');
    if (!body) return;
    if (state.loading) {
      body.innerHTML = '<div class="plex-empty">Loading…</div>';
      return;
    }
    if (state.error) {
      body.innerHTML = '<div class="plex-empty">' + escapeHtml(state.error) + '</div>';
      return;
    }

    var pageSize = Math.max(1, card.rows * card.columns);
    var list = Array.isArray(state.filtered) ? state.filtered : [];
    if (!list.length) {
      body.innerHTML = '<div class="plex-empty">No items match the current filters.</div>';
      return;
    }

    var totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    var page = Math.max(0, Math.min(totalPages - 1, Number(state.page || 0)));
    state.page = page;
    var start = page * pageSize;
    var items = list.slice(start, start + pageSize);

    body.innerHTML =
      '<div class="dashboard-widget-grid" style="--widget-columns:' + String(card.columns) + '; --widget-rows:' + String(card.rows) + '">' +
        items.map(function (item) {
          var icon = item.thumb ? (
            '<img class="dashboard-widget-item-thumb" src="' + escapeHtml(item.thumb) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" onerror="this.onerror=null;this.parentNode.classList.add(\'dashboard-widget-thumb-fallback\');this.src=\'' + escapeHtml(card.sourceIcon || '/icons/app.svg') + '\'" />'
          ) : (
            '<img class="dashboard-widget-item-thumb dashboard-widget-item-thumb--fallback" src="' + escapeHtml(card.sourceIcon || '/icons/app.svg') + '" alt="" loading="lazy" />'
          );
          var launchTarget = item.launchUrl || (card.sourceAppId ? ('/apps/' + encodeURIComponent(card.sourceAppId) + '/launch') : '');
          return (
            '<article class="dashboard-widget-item" data-widget-item-id="' + escapeHtml(item.id) + '">' +
              '<button class="dashboard-widget-item-main" type="button" data-widget-action="open-item" data-widget-id="' + escapeHtml(card.id) + '" data-item-id="' + escapeHtml(item.id) + '" data-launch-url="' + escapeHtml(launchTarget) + '">' +
                '<div class="dashboard-widget-thumb">' + icon + '</div>' +
                '<div class="dashboard-widget-copy">' +
                  '<div class="dashboard-widget-copy-top">' +
                    '<span class="dashboard-widget-item-title">' + escapeHtml(item.title) + '</span>' +
                    (item.pill ? '<span class="dashboard-widget-item-pill">' + escapeHtml(item.pill) + '</span>' : '') +
                  '</div>' +
                  (item.subtitle ? '<div class="dashboard-widget-item-subtitle">' + escapeHtml(item.subtitle) + '</div>' : '') +
                  (item.meta ? '<div class="dashboard-widget-item-meta">' + escapeHtml(item.meta) + '</div>' : '') +
                  (item.status ? '<div class="dashboard-widget-item-status">' + escapeHtml(item.status) + '</div>' : '') +
                '</div>' +
              '</button>' +
              ((card.supports && card.supports.execute && String(card.source || '').toLowerCase() === 'maintainerr-rules' && item.raw && item.raw.id)
                ? ('<button class="dashboard-widget-execute" type="button" data-widget-action="execute-rule" data-widget-id="' + escapeHtml(card.id) + '" data-rule-id="' + escapeHtml(String(item.raw.id)) + '" title="Execute rule">▶</button>')
                : '') +
            '</article>'
          );
        }).join('') +
      '</div>' +
      '<div class="dashboard-widget-pagination">' +
        '<button class="dashboard-widget-mini-btn" type="button" data-widget-action="prev-page" data-widget-id="' + escapeHtml(card.id) + '">‹</button>' +
        '<span class="dashboard-widget-page-label">' + String(page + 1) + ' / ' + String(totalPages) + '</span>' +
        '<button class="dashboard-widget-mini-btn" type="button" data-widget-action="next-page" data-widget-id="' + escapeHtml(card.id) + '">›</button>' +
      '</div>';
  }

  function scheduleRefresh(card) {
    var state = ensureState(card.id);
    if (!state) return;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    var refreshMs = Math.max(15, Number(card.refreshSeconds || 120)) * 1000;
    state.timer = window.setInterval(function () {
      if (card.autoScroll) {
        var pageSize = Math.max(1, card.rows * card.columns);
        var totalPages = Math.max(1, Math.ceil((state.filtered || []).length / pageSize));
        if (totalPages > 1) {
          state.page = (Number(state.page || 0) + 1) % totalPages;
          renderCard(card);
        }
      }
      fetchCardItems(card);
    }, refreshMs);
  }

  function loadAllCards() {
    cards.forEach(function (card) {
      fetchCardItems(card);
    });
  }

  function findCard(cardId) {
    var key = normalizeToken(cardId);
    return cards.find(function (card) { return normalizeToken(card.id) === key; }) || null;
  }

  function updateCardFilter(cardId, field, value) {
    var card = findCard(cardId);
    if (!card) return;
    card.filters[field] = normalizeFilterValue(value, 'all');
    var state = ensureState(card.id);
    if (state) state.page = 0;
    applyFilters(card);
  }

  function readSettingsPayload(cardId) {
    var card = findCard(cardId);
    if (!card) return null;
    var cardEl = root.querySelector('[data-widget-id="' + card.id + '"]');
    if (!cardEl) return null;
    var getField = function (fieldName) {
      return cardEl.querySelector('[data-widget-field="' + fieldName + '"]');
    };
    return {
      title: String(getField('title') && getField('title').value || card.title).trim(),
      source: String(getField('source') && getField('source').value || card.source).trim().toLowerCase(),
      columns: clampInt(getField('columns') && getField('columns').value, card.columns, 1, 8),
      rows: clampInt(getField('rows') && getField('rows').value, card.rows, 1, 6),
      limit: clampInt(getField('limit') && getField('limit').value, card.limit, 1, 200),
      refreshSeconds: clampInt(getField('refreshSeconds') && getField('refreshSeconds').value, card.refreshSeconds, 15, 3600),
      order: clampInt(getField('order') && getField('order').value, card.order || 0, 0, 9999),
      visibilityRole: SETTINGS_ROLES.includes(String(getField('visibilityRole') && getField('visibilityRole').value || '').trim().toLowerCase())
        ? String(getField('visibilityRole').value).trim().toLowerCase()
        : card.visibilityRole,
      autoScroll: Boolean(getField('autoScroll') && getField('autoScroll').checked),
      filters: {
        media: normalizeFilterValue(card.filters.media, 'all'),
        letter: normalizeFilterValue(card.filters.letter, 'all'),
        status: normalizeFilterValue(card.filters.status, 'all'),
      },
    };
  }

  function replaceCards(nextCards) {
    var normalized = Array.isArray(nextCards) ? nextCards.map(normalizeCard).filter(Boolean) : [];
    normalized.sort(function (left, right) {
      var orderDelta = Number(left.order || 0) - Number(right.order || 0);
      if (orderDelta !== 0) return orderDelta;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
    cards = normalized;
    clearAllTimers();
    renderCards();
    loadAllCards();
  }

  function createCard() {
    if (!canManage) return;
    var sourceId = defaultSourceId();
    var sourceDef = getSource(sourceId) || {};
    var maxOrder = cards.reduce(function (maxValue, card) {
      var value = Number(card && card.order || 0);
      return Number.isFinite(value) && value > maxValue ? value : maxValue;
    }, 0);
    var payload = {
      title: String(sourceDef.name || 'Widget').trim() || 'Widget',
      source: sourceId,
      rows: 2,
      columns: 4,
      limit: 12,
      refreshSeconds: 120,
      autoScroll: true,
      order: maxOrder + 1,
      visibilityRole: 'user',
      filters: {
        media: 'all',
        letter: 'all',
        status: 'all',
      },
    };
    requestJson('/api/widgets/cards', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then(function (response) {
      replaceCards(response && response.items);
    }).catch(function (err) {
      window.alert(err && err.message ? String(err.message) : 'Failed to create widget card.');
    });
  }

  function saveCard(cardId) {
    if (!canManage) return;
    var payload = readSettingsPayload(cardId);
    if (!payload) return;
    requestJson('/api/widgets/cards/' + encodeURIComponent(cardId), {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then(function (response) {
      replaceCards(response && response.items);
    }).catch(function (err) {
      window.alert(err && err.message ? String(err.message) : 'Failed to save widget card.');
    });
  }

  function duplicateCard(cardId) {
    if (!canManage) return;
    var card = findCard(cardId);
    if (!card) return;
    var payload = {
      title: String(card.title || 'Widget').trim() + ' Copy',
      source: card.source,
      columns: card.columns,
      rows: card.rows,
      limit: card.limit,
      refreshSeconds: card.refreshSeconds,
      autoScroll: card.autoScroll,
      order: Number(card.order || 0) + 1,
      visibilityRole: card.visibilityRole,
      filters: {
        media: card.filters.media,
        letter: card.filters.letter,
        status: card.filters.status,
      },
    };
    requestJson('/api/widgets/cards', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then(function (response) {
      replaceCards(response && response.items);
    }).catch(function (err) {
      window.alert(err && err.message ? String(err.message) : 'Failed to duplicate widget card.');
    });
  }

  function deleteCard(cardId) {
    if (!canManage) return;
    if (!window.confirm('Delete this widget card?')) return;
    requestJson('/api/widgets/cards/' + encodeURIComponent(cardId), {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    }).then(function (response) {
      replaceCards(response && response.items);
    }).catch(function (err) {
      window.alert(err && err.message ? String(err.message) : 'Failed to delete widget card.');
    });
  }

  function openItem(actionTarget) {
    var launchUrl = String(actionTarget && actionTarget.getAttribute('data-launch-url') || '').trim();
    if (!launchUrl) return;
    window.open(launchUrl, '_blank', 'noopener,noreferrer');
  }

  function executeMaintainerrRule(actionTarget) {
    var ruleId = String(actionTarget && actionTarget.getAttribute('data-rule-id') || '').trim();
    if (!ruleId) return;
    actionTarget.disabled = true;
    requestJson('/api/maintainerr/rules/' + encodeURIComponent(ruleId) + '/execute', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    }).then(function () {
      actionTarget.title = 'Executed';
      window.setTimeout(function () {
        actionTarget.disabled = false;
      }, 600);
    }).catch(function (err) {
      actionTarget.disabled = false;
      actionTarget.title = err && err.message ? String(err.message) : 'Failed to execute';
    });
  }

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!target) return;
    var action = String(target.getAttribute('data-widget-action') || '').trim();
    var cardId = String(target.getAttribute('data-widget-id') || '').trim();
    if (!action || !cardId) return;
    if (action === 'filter-media') {
      updateCardFilter(cardId, 'media', target.value);
      return;
    }
    if (action === 'filter-letter') {
      updateCardFilter(cardId, 'letter', target.value);
      return;
    }
    if (action === 'filter-status') {
      updateCardFilter(cardId, 'status', target.value);
    }
  });

  root.addEventListener('click', function (event) {
    var target = event.target && event.target.closest('[data-widget-action]');
    if (!target) return;
    var action = String(target.getAttribute('data-widget-action') || '').trim();
    var cardId = String(target.getAttribute('data-widget-id') || '').trim();
    var card = cardId ? findCard(cardId) : null;
    var state = card ? ensureState(card.id) : null;

    if (action === 'refresh' && card) {
      fetchCardItems(card);
      return;
    }
    if (action === 'settings' && card) {
      var panel = root.querySelector('[data-widget-settings="' + card.id + '"]');
      if (panel) panel.classList.toggle('is-open');
      return;
    }
    if (action === 'save' && card) {
      saveCard(card.id);
      return;
    }
    if (action === 'duplicate' && card) {
      duplicateCard(card.id);
      return;
    }
    if (action === 'delete' && card) {
      deleteCard(card.id);
      return;
    }
    if (action === 'prev-page' && card && state) {
      if (state.page > 0) state.page -= 1;
      renderCard(card);
      return;
    }
    if (action === 'next-page' && card && state) {
      var pageSize = Math.max(1, card.rows * card.columns);
      var maxPage = Math.max(0, Math.ceil((state.filtered || []).length / pageSize) - 1);
      if (state.page < maxPage) state.page += 1;
      renderCard(card);
      return;
    }
    if (action === 'open-item') {
      openItem(target);
      return;
    }
    if (action === 'execute-rule') {
      executeMaintainerrRule(target);
    }
  });

  if (addButton) {
    addButton.addEventListener('click', function (event) {
      event.preventDefault();
      createCard();
    });
  }

  renderCards();
  loadAllCards();
})();
