(() => {
  const configs = resolveConfigs();
  if (!configs.length) return;

  configs.forEach((config) => {
    try {
      initQueueCard(config);
    } catch (err) {
      console.error('Queue card init failed for', config?.moduleId || config?.endpoint || 'unknown', err);
    }
  });

  function resolveConfigs() {
    const list = [];
    if (Array.isArray(window.QUEUE_CARD_CONFIGS)) {
      window.QUEUE_CARD_CONFIGS.forEach((entry) => {
        if (entry && entry.moduleId && entry.endpoint) list.push(entry);
      });
    }
    if (window.QUEUE_CARD_CONFIG && window.QUEUE_CARD_CONFIG.moduleId && window.QUEUE_CARD_CONFIG.endpoint) {
      list.push(window.QUEUE_CARD_CONFIG);
    }
    const dedupe = new Map();
    list.forEach((entry) => {
      const key = String(entry?.moduleId || '').trim();
      if (!key) return;
      dedupe.set(key, {
        moduleId: key,
        bodyId: String(entry?.bodyId || '').trim(),
        typeFilterId: String(entry?.typeFilterId || '').trim(),
        statusFilterId: String(entry?.statusFilterId || '').trim(),
        endpoint: String(entry?.endpoint || '').trim(),
        appName: String(entry?.appName || 'App').trim() || 'App',
      });
    });
    return Array.from(dedupe.values());
  }

  function initQueueCard(config) {
    if (!config.endpoint) return;
    const module = document.getElementById(config.moduleId);
    if (!module) return;
    const table = module.querySelector('.queue-table');
    const body = document.getElementById(config.bodyId);
    if (!table || !body) return;
    const typeFilter = config.typeFilterId ? document.getElementById(config.typeFilterId) : null;
    const statusFilter = config.statusFilterId ? document.getElementById(config.statusFilterId) : null;
    const sortHeaders = Array.from(module.querySelectorAll('.queue-row.header > div'));
    const state = {
      items: [],
      sortIndex: 0,
      sortDir: 'asc',
    };

    syncQueueTableLayout(table);

    sortHeaders.forEach((header, index) => {
      header.classList.add('queue-sortable');
      header.addEventListener('click', () => {
        if (state.sortIndex === index) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortIndex = index;
          state.sortDir = 'asc';
        }
        applyFilters();
      });
    });

    typeFilter?.addEventListener('change', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);

    loadItems();

    async function loadItems() {
      body.innerHTML = '<div class="queue-empty">Loading...</div>';
      try {
        const response = await fetch(config.endpoint, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = await response.json();
        const list = Array.isArray(payload?.items) ? payload.items : [];
        state.items = list.map(normalizeItem).filter(Boolean);
        applyFilters();
      } catch (err) {
        body.innerHTML = `<div class="queue-empty">Unable to load ${escapeHtml(config.appName)} data.</div>`;
      }
    }

    function applyFilters() {
      const typeValue = String(typeFilter?.value || 'all').toLowerCase();
      const statusValue = String(statusFilter?.value || 'all').toLowerCase();
      const filtered = state.items.filter((item) => {
        const typeMatch = typeValue === 'all' || String(item.kind || '').toLowerCase() === typeValue;
        const statusMatch = statusValue === 'all' || (Array.isArray(item.statusKeys)
          ? item.statusKeys.map((entry) => String(entry || '').toLowerCase()).includes(statusValue)
          : String(item.statusKey || '').toLowerCase() === statusValue);
        return typeMatch && statusMatch;
      });
      filtered.sort((a, b) => {
        const left = queueSortValue(a, state.sortIndex);
        const right = queueSortValue(b, state.sortIndex);
        if (left < right) return state.sortDir === 'asc' ? -1 : 1;
        if (left > right) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      renderRows(filtered);
    }

    function renderRows(items) {
      if (!items.length) {
        body.innerHTML = '<div class="queue-empty">No items available.</div>';
        syncQueueTableLayout(table);
        return;
      }
      body.innerHTML = items.map((item, index) => {
        const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
        const protocol = escapeHtml(item.protocol || '-');
        const protocolClass = String(item.protocol || '').toLowerCase() === 'usenet' ? ' usenet' : '';
        return `
          <div class="queue-row" data-index="${index}">
            <div class="queue-col-title">${escapeHtml(item.title || 'Unknown')}</div>
            <div class="queue-col-detail queue-episode">${escapeHtml(item.episode || '-')}</div>
            <div class="queue-col-subdetail queue-ep-title">${escapeHtml(item.episodeTitle || '-')}</div>
            <div class="queue-col-size"><span class="queue-quality">${escapeHtml(item.quality || '-')}</span></div>
            <div class="queue-col-protocol queue-protocol${protocolClass}">${protocol}</div>
            <div class="queue-col-time queue-time">${escapeHtml(item.timeLeft || '-')}</div>
            <div class="queue-col-progress queue-progress"><span style="width:${progress}%"></span></div>
          </div>
        `;
      }).join('');
      syncQueueTableLayout(table);
    }
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    const statusKey = String(item.statusKey || '').trim().toLowerCase() || 'queued';
    const statusKeys = Array.isArray(item.statusKeys) && item.statusKeys.length
      ? item.statusKeys.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
      : [statusKey];
    return {
      kind: String(item.kind || 'other').trim().toLowerCase() || 'other',
      title: String(item.title || '').trim() || 'Unknown',
      episode: String(item.episode || '').trim() || '-',
      episodeTitle: String(item.episodeTitle || '').trim() || '-',
      quality: String(item.quality || '').trim() || '-',
      protocol: String(item.protocol || '').trim() || '-',
      timeLeft: String(item.timeLeft || '').trim() || '-',
      progress: Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0,
      statusKey,
      statusKeys,
    };
  }

  function queueSortValue(item, index) {
    switch (index) {
      case 0:
        return String(item.title || '').toLowerCase();
      case 1:
        return String(item.episode || '').toLowerCase();
      case 2:
        return String(item.episodeTitle || '').toLowerCase();
      case 3:
        return String(item.quality || '').toLowerCase();
      case 4:
        return String(item.protocol || '').toLowerCase();
      case 5:
        return String(item.timeLeft || '').toLowerCase();
      case 6:
        return Number(item.progress || 0);
      default:
        return String(item.title || '').toLowerCase();
    }
  }

  function queueColumnVisibility(table) {
    return {
      detail: !table.classList.contains('queue-hide-detail'),
      subdetail: !table.classList.contains('queue-hide-subdetail'),
      size: !table.classList.contains('queue-hide-size'),
      protocol: !table.classList.contains('queue-hide-protocol'),
      timeleft: !table.classList.contains('queue-hide-timeleft'),
      progress: !table.classList.contains('queue-hide-progress'),
    };
  }

  function buildQueueGridTemplate(visibility) {
    const columns = ['minmax(220px, 1fr)'];
    if (visibility.detail) columns.push('140px');
    if (visibility.subdetail) columns.push('160px');
    if (visibility.size) columns.push('130px');
    if (visibility.protocol) columns.push('116px');
    if (visibility.timeleft) columns.push('110px');
    if (visibility.progress) columns.push('170px');
    return columns.join(' ');
  }

  function setQueueColumnDisplay(table, selector, show) {
    table.querySelectorAll(selector).forEach((cell) => {
      cell.style.display = show ? '' : 'none';
    });
  }

  function syncQueueTableLayout(table) {
    if (!table) return;
    const visibility = queueColumnVisibility(table);
    table.style.setProperty('--queue-grid-template', buildQueueGridTemplate(visibility));
    setQueueColumnDisplay(table, '.queue-col-detail', visibility.detail);
    setQueueColumnDisplay(table, '.queue-col-subdetail', visibility.subdetail);
    setQueueColumnDisplay(table, '.queue-col-size', visibility.size);
    setQueueColumnDisplay(table, '.queue-col-protocol', visibility.protocol);
    setQueueColumnDisplay(table, '.queue-col-time', visibility.timeleft);
    setQueueColumnDisplay(table, '.queue-col-progress', visibility.progress);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#039;',
    }[char]));
  }
})();
