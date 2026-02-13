(() => {
  const configs = resolveConfigs();
  if (!configs.length) return;

  configs.forEach((config) => {
    try {
      initArrOverview(config);
    } catch (err) {
      console.error('ARR overview failed for', config?.appId || 'unknown', err);
    }
  });

  function resolveConfigs() {
    const list = [];
    const multi = Array.isArray(window.ARR_OVERVIEW_CONFIGS) ? window.ARR_OVERVIEW_CONFIGS : [];
    multi.forEach((entry) => {
      if (entry && entry.appId) list.push(entry);
    });
    const combined = Array.isArray(window.ARR_OVERVIEW_COMBINED_CONFIGS) ? window.ARR_OVERVIEW_COMBINED_CONFIGS : [];
    combined.forEach((entry) => {
      if (entry && entry.appId) list.push(entry);
    });

    const single = window.ARR_OVERVIEW_CONFIG;
    if (single && single.appId) list.push(single);

    if (!list.length) {
      const legacySonarr = window.SONARR_OVERVIEW_CONFIG;
      if (legacySonarr) {
        list.push({
          appId: 'sonarr',
          appName: 'Sonarr',
          baseUrl: legacySonarr.baseUrl,
          apiKey: legacySonarr.apiKey,
        });
      }
    }

    const dedupe = new Map();
    list.forEach((entry) => {
      const key = String(entry.appId || '').trim().toLowerCase();
      if (!key) return;
      const sources = Array.isArray(entry.sources)
        ? entry.sources.map((source) => ({
          appId: String(source?.appId || '').trim().toLowerCase(),
          appName: String(source?.appName || source?.appId || '').trim(),
          baseUrl: String(source?.baseUrl || '').trim(),
          baseUrls: Array.isArray(source?.baseUrls) ? source.baseUrls.map((url) => String(url || '').trim()).filter(Boolean) : [],
          apiKey: String(source?.apiKey || '').trim(),
        })).filter((source) => source.appId && (source.baseUrl || source.baseUrls.length) && source.apiKey)
        : [];
      dedupe.set(key, {
        appId: key,
        appName: String(entry.appName || key).trim() || key,
        baseUrl: String(entry.baseUrl || '').trim(),
        apiKey: String(entry.apiKey || '').trim(),
        appIds: Array.isArray(entry.appIds) ? entry.appIds.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean) : [],
        includeSoon: entry.includeSoon !== false,
        includeRecent: entry.includeRecent !== false,
        includeQueue: entry.includeQueue !== false,
        displaySettings: entry.displaySettings && typeof entry.displaySettings === 'object' ? entry.displaySettings : {},
        sources,
      });
    });

    return Array.from(dedupe.values());
  }

  function initArrOverview(config) {
    const appId = String(config.appId || '').trim().toLowerCase();
    if (!appId) return;

    const appName = String(config.appName || appId).trim() || appId;
    const isCombined = Array.isArray(config.sources) && config.sources.length > 0;
    const sources = isCombined
      ? config.sources
        .map((source) => ({
          appId: String(source?.appId || '').trim().toLowerCase(),
          appName: String(source?.appName || source?.appId || '').trim() || source?.appId || '',
          baseUrl: normalizeBaseUrl(String(source?.baseUrl || '').trim()),
          baseUrls: Array.isArray(source?.baseUrls)
            ? source.baseUrls.map((url) => normalizeBaseUrl(String(url || '').trim())).filter(Boolean)
            : [],
          apiKey: String(source?.apiKey || '').trim(),
        }))
        .filter((source) => source.appId && (source.baseUrl || source.baseUrls.length) && source.apiKey)
      : [{
        appId,
        appName,
        baseUrl: normalizeBaseUrl(String(config.baseUrl || '').trim()),
        baseUrls: [normalizeBaseUrl(String(config.baseUrl || '').trim())].filter(Boolean),
        apiKey: String(config.apiKey || '').trim(),
      }];
    if (isCombined && Array.isArray(config.appIds) && config.appIds.length) {
      const existingIds = new Set(sources.map((source) => source.appId));
      const singles = Array.isArray(window.ARR_OVERVIEW_CONFIGS) ? window.ARR_OVERVIEW_CONFIGS : [];
      config.appIds.forEach((sourceId) => {
        if (!sourceId || existingIds.has(sourceId)) return;
        const single = singles.find((entry) => String(entry?.appId || '').trim().toLowerCase() === sourceId);
        if (!single) return;
        const baseUrl = normalizeBaseUrl(String(single.baseUrl || '').trim());
        const apiKey = String(single.apiKey || '').trim();
        if (!baseUrl || !apiKey) return;
        sources.push({
          appId: sourceId,
          appName: String(single.appName || sourceId).trim() || sourceId,
          baseUrl,
          baseUrls: [baseUrl],
          apiKey,
        });
      });
    }
    const activeSources = sources.filter((source) => source.baseUrl && source.apiKey);
    const root = document.querySelector('.plex-overview') || document.documentElement;
    const defaultDisplaySettings = {
      showSubtitle: true,
      showMeta: true,
      showPill: true,
      showTypeIcon: true,
      showViewIcon: true,
      showUsername: true,
    };
    const displaySettingsMap = config.displaySettings && typeof config.displaySettings === 'object'
      ? config.displaySettings
      : {};

    function sectionDisplaySettings(sectionId) {
      const raw = sectionId && typeof displaySettingsMap[sectionId] === 'object'
        ? displaySettingsMap[sectionId]
        : {};
      return {
        showSubtitle: raw.showSubtitle !== false,
        showMeta: raw.showMeta !== false,
        showPill: raw.showPill !== false,
        showTypeIcon: raw.showTypeIcon !== false,
        showViewIcon: raw.showViewIcon !== false,
        showUsername: raw.showUsername !== false,
      };
    }

    const moduleDisplaySettings = {
      soon: sectionDisplaySettings('downloading-soon'),
      recent: sectionDisplaySettings('recently-downloaded'),
      queue: sectionDisplaySettings('activity-queue'),
    };

    const modules = {
      soon: {
        viewport: document.getElementById(appId + 'SoonViewport'),
        track: document.getElementById(appId + 'SoonTrack'),
        prevBtn: document.getElementById(appId + 'SoonPrevBtn'),
        nextBtn: document.getElementById(appId + 'SoonNextBtn'),
        mediaFilter: document.getElementById(appId + 'SoonTypeFilter'),
        windowFilter: document.getElementById(appId + 'SoonWindowFilter'),
        items: [],
        carousel: null,
      },
      recent: {
        viewport: document.getElementById(appId + 'RecentViewport'),
        track: document.getElementById(appId + 'RecentTrack'),
        prevBtn: document.getElementById(appId + 'RecentPrevBtn'),
        nextBtn: document.getElementById(appId + 'RecentNextBtn'),
        mediaFilter: document.getElementById(appId + 'RecentMediaFilter'),
        typeFilter: document.getElementById(appId + 'RecentTypeFilter'),
        windowFilter: document.getElementById(appId + 'RecentWindowFilter'),
        items: [],
        carousel: null,
      },
      queue: {
        table: document.querySelector('#' + appId + '-activity-queue .queue-table'),
        body: document.getElementById(appId + 'QueueBody'),
        typeFilter: document.getElementById(appId + 'QueueTypeFilter'),
        sortHeaders: Array.from(document.querySelectorAll('#' + appId + '-activity-queue .queue-row.header > div')),
        sortDir: 'asc',
        sortIndex: 0,
        items: [],
      },
    };

    const hasSoon = Boolean(modules.soon.viewport && modules.soon.track) && config.includeSoon !== false;
    const hasRecent = Boolean(modules.recent.viewport && modules.recent.track) && config.includeRecent !== false;
    const hasQueue = Boolean(modules.queue.body) && config.includeQueue !== false;
    if (!hasSoon && !hasRecent && !hasQueue) return;

    if (!activeSources.length) {
      const message = '<div class="plex-empty">Add ' + escapeHtml(appName) + ' URL and API key in settings.</div>';
      if (hasSoon) modules.soon.track.innerHTML = message;
      if (hasRecent) modules.recent.track.innerHTML = message;
      if (hasQueue) modules.queue.body.innerHTML = '<div class="queue-empty">Add ' + escapeHtml(appName) + ' URL and API key in settings.</div>';
      bindCollapseButtons(appId);
      return;
    }

    if (hasSoon) {
      modules.soon.carousel = createCarousel({
        viewport: modules.soon.viewport,
        track: modules.soon.track,
        prevBtn: modules.soon.prevBtn,
        nextBtn: modules.soon.nextBtn,
        onView: openItemModal,
        renderCard: (item) => renderCard(item, moduleDisplaySettings.soon),
      });
      modules.soon.mediaFilter?.addEventListener('change', applySoonFilters);
      modules.soon.windowFilter?.addEventListener('change', applySoonFilters);
      if (isCombined) bindCombinedLogoToFilter(modules.soon.mediaFilter);
      loadSoon();
    }

    if (hasRecent) {
      modules.recent.carousel = createCarousel({
        viewport: modules.recent.viewport,
        track: modules.recent.track,
        prevBtn: modules.recent.prevBtn,
        nextBtn: modules.recent.nextBtn,
        onView: openItemModal,
        renderCard: (item) => renderCard(item, moduleDisplaySettings.recent),
      });
      modules.recent.mediaFilter?.addEventListener('change', applyRecentFilters);
      modules.recent.typeFilter?.addEventListener('change', applyRecentFilters);
      modules.recent.windowFilter?.addEventListener('change', applyRecentFilters);
      if (isCombined) bindCombinedLogoToFilter(modules.recent.mediaFilter);
      loadRecent();
    }

    if (hasQueue) {
      syncQueueTableLayout();
      modules.queue.typeFilter?.addEventListener('change', applyQueueFilters);
      if (isCombined) bindCombinedLogoToFilter(modules.queue.typeFilter);
      if (modules.queue.sortHeaders?.length) {
        modules.queue.sortHeaders.forEach((header, index) => {
          header.classList.add('queue-sortable');
          header.addEventListener('click', () => {
            if (modules.queue.sortIndex === index) {
              modules.queue.sortDir = modules.queue.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              modules.queue.sortIndex = index;
              modules.queue.sortDir = 'asc';
            }
            applyQueueFilters();
          });
        });
      }
      loadQueue();
    }

    window.addEventListener('resize', () => {
      if (modules.soon.carousel) modules.soon.carousel.updateLayout();
      if (modules.recent.carousel) modules.recent.carousel.updateLayout();
    });

    bindCollapseButtons(appId);

    function normalizeBaseUrl(value) {
      let url = String(value || '').trim();
      if (!url) return '';
      if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
      try {
        const parsed = new URL(url);
        return parsed.origin;
      } catch (err) {
        return url.replace(/\/+$/, '');
      }
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        }[char]
      ));
    }

    function combinedLogoByType(typeValue) {
      const value = String(typeValue || 'all').toLowerCase();
      if (value === 'movie') return '/icons/radarr.png';
      if (value === 'tv' || value === 'show') return '/icons/sonarr.png';
      if (value === 'music') return '/icons/lidarr.png';
      if (value === 'book') return '/icons/readarr.png';
      return '/icons/app-arr.svg';
    }

    function bindCombinedLogoToFilter(selectElement) {
      if (!selectElement) return;
      const module = selectElement.closest('.plex-module');
      const logo = module?.querySelector('.plex-title .plex-logo');
      if (!logo) return;
      const syncLogo = () => {
        logo.src = combinedLogoByType(selectElement.value);
      };
      selectElement.addEventListener('change', syncLogo);
      syncLogo();
    }

    function cssNum(name, fallback) {
      const raw = getComputedStyle(root).getPropertyValue(name).trim();
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    function formatDateLabel(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return pad2(date.getDate()) + '/' + pad2(date.getMonth() + 1) + '/' + date.getFullYear();
    }

    function formatRecentPill(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const now = new Date();
      const isToday = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
      if (isToday) {
        return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
      }
      return pad2(date.getDate()) + '/' + pad2(date.getMonth() + 1) + '/' + String(date.getFullYear()).slice(-2);
    }

    function formatSoonPill(value) {
      if (!value) return 'Soon';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Soon';
      const now = new Date();
      const isTodayUtc = date.getUTCFullYear() === now.getUTCFullYear()
        && date.getUTCMonth() === now.getUTCMonth()
        && date.getUTCDate() === now.getUTCDate();
      if (isTodayUtc) {
        return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ' GMT';
      }
      return pad2(date.getUTCDate()) + '/' + pad2(date.getUTCMonth() + 1) + '/' + String(date.getUTCFullYear()).slice(-2);
    }

    function episodeCode(season, episode) {
      const seasonNumber = Number(season);
      const episodeNumber = Number(episode);
      if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return '';
      return 'S' + pad2(seasonNumber) + 'E' + pad2(episodeNumber);
    }

    function episodeCodeX(season, episode) {
      const seasonNumber = Number(season);
      const episodeNumber = Number(episode);
      if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return '';
      return seasonNumber + 'x' + pad2(episodeNumber);
    }

    function parseEpisodeFromTitle(title) {
      const value = String(title || '');
      let match = value.match(/S(\d{1,2})E(\d{1,2})/i);
      if (match) return { season: Number(match[1]), episode: Number(match[2]) };
      match = value.match(/(\d{1,2})x(\d{1,2})/i);
      if (match) return { season: Number(match[1]), episode: Number(match[2]) };
      return null;
    }

    function pickEpisodeTitle(item) {
      const episode = item?.episode || {};
      if (episode.title) return String(episode.title);
      if (item?.episodeTitle) return String(item.episodeTitle);
      if (Array.isArray(item?.episodes) && item.episodes.length && item.episodes[0]?.title) {
        return String(item.episodes[0].title);
      }
      if (item?.title) {
        const parts = String(item.title).split(' - ');
        if (parts.length >= 3) return parts.slice(2).join(' - ').trim();
      }
      return '';
    }

    function resolveQueueTimeLeft(item) {
      return String(item?.timeleft || item?.timeLeft || item?.timeLeftHuman || '');
    }

    function resolveQueueProgress(item) {
      if (typeof item?.progress === 'number') return Math.max(0, Math.min(100, item.progress));
      const size = Number(item?.size || item?.sizeBytes || 0);
      const left = Number(item?.sizeleft || item?.sizeLeft || item?.sizeLeftBytes || 0);
      if (size > 0 && left >= 0) {
        return Math.max(0, Math.min(100, 100 - (left / size * 100)));
      }
      return 0;
    }

    function pickImage(entity) {
      const images = Array.isArray(entity?.images) ? entity.images : [];
      if (!images.length) return null;
      return images.find((image) => {
        const type = String(image?.coverType || '').toLowerCase();
        return type === 'poster' || type === 'cover' || type === 'album';
      }) || images[0];
    }

    function pickBackdropImage(entity) {
      const images = Array.isArray(entity?.images) ? entity.images : [];
      if (!images.length) return null;
      return images.find((image) => {
        const type = String(image?.coverType || '').toLowerCase();
        return type === 'fanart' || type === 'background' || type === 'banner';
      }) || null;
    }

    function buildImageUrl(image, entity) {
      if (!image) return '';
      if (image.remoteUrl) return String(image.remoteUrl);
      const relative = String(image.url || '').trim();
      if (!relative) return '';
      if (/^https?:\/\//i.test(relative)) return relative;
      const sourceBase = String(entity?.__arrBaseUrl || '').trim() || activeSources[0]?.baseUrl || '';
      const sourceKey = String(entity?.__arrApiKey || '').trim() || activeSources[0]?.apiKey || '';

      try {
        const resolved = new URL(relative, sourceBase);
        if (sourceKey) resolved.searchParams.set('apikey', sourceKey);
        return resolved.toString();
      } catch (err) {
        return '';
      }
    }

    function buildPosterUrl(entity) {
      const preferred = pickImage(entity);
      return buildImageUrl(preferred, entity);
    }

    function buildBackdropUrl(entity) {
      const preferred = pickBackdropImage(entity);
      return buildImageUrl(preferred, entity);
    }

    function resolveEntity(entry) {
      const entity = entry?.series || entry?.movie || entry?.album || entry?.artist || entry?.book || entry?.author || entry || {};
      if (entity && typeof entity === 'object') {
        entity.__arrBaseUrl = entry?.__arrBaseUrl || entity.__arrBaseUrl;
        entity.__arrApiKey = entry?.__arrApiKey || entity.__arrApiKey;
      }
      return entity;
    }

    function resolveTitle(entry, entity) {
      return String(
        entity?.title ||
        entity?.bookTitle ||
        entity?.authorName ||
        entity?.artistName ||
        entity?.name ||
        entry?.seriesTitle ||
        entry?.sourceTitle ||
        entry?.title ||
        'Unknown Item'
      );
    }

    function resolveSoonDate(entry) {
      return (
        entry?.airDateUtc ||
        entry?.airDate ||
        entry?.releaseDate ||
        entry?.releaseDateUtc ||
        entry?.inCinemas ||
        entry?.digitalRelease ||
        entry?.physicalRelease ||
        ''
      );
    }

    function resolveSubtitle(entry) {
      const parts = [];
      const code = episodeCode(entry?.seasonNumber, entry?.episodeNumber);
      if (code) parts.push(code);
      if (entry?.title) parts.push(String(entry.title));
      if (!parts.length && entry?.album?.title) parts.push(String(entry.album.title));
      if (!parts.length && entry?.book?.title) parts.push(String(entry.book.title));
      if (!parts.length && entry?.author?.authorName) parts.push(String(entry.author.authorName));
      if (!parts.length && entry?.movie?.year) parts.push(String(entry.movie.year));
      return parts.join(' - ');
    }

    function resolveOverview(entry, entity) {
      return String(
        entity?.overview ||
        entity?.summary ||
        entry?.overview ||
        entry?.summary ||
        ''
      ).trim();
    }

    function resolveExternalIds(entry, entity) {
      const imdbRaw = entity?.imdbId || entity?.imdbid || entry?.imdbId || entry?.imdbid || '';
      const tmdbRaw = entity?.tmdbId || entity?.tmdbid || entry?.tmdbId || entry?.tmdbid || '';
      const imdbId = String(imdbRaw || '').trim();
      const tmdbId = String(tmdbRaw || '').trim();
      return {
        imdbId: /^tt\d+$/i.test(imdbId) ? imdbId : '',
        tmdbId: /^\d+$/.test(tmdbId) ? tmdbId : '',
      };
    }

    function recentKeyForRecord(record, entity, externalIds) {
      if (externalIds?.tmdbId) return 'tmdb:' + externalIds.tmdbId;
      if (externalIds?.imdbId) return 'imdb:' + externalIds.imdbId;
      const fallbackIds = [
        record?.movieId,
        record?.seriesId,
        record?.episodeId,
        record?.albumId,
        record?.artistId,
        record?.trackId,
        record?.bookId,
        record?.authorId,
        entity?.id,
      ];
      const found = fallbackIds.find((value) => Number.isFinite(Number(value)) || String(value || '').trim());
      if (found !== undefined && found !== null && String(found).trim() !== '') {
        return 'id:' + String(found).trim();
      }
      const title = resolveTitle(record, entity);
      const code = episodeCode(record?.seasonNumber, record?.episodeNumber);
      return (title || 'unknown') + (code ? ':' + code : '');
    }

    function mediaKindFromAppId(value) {
      const app = String(value || '').toLowerCase();
      if (app === 'radarr') return 'movie';
      if (app === 'sonarr') return 'tv';
      if (app === 'lidarr') return 'music';
      if (app === 'readarr') return 'book';
      return 'all';
    }

    function mediaKindFromEntry(entry) {
      if (entry?.series || entry?.episode || Number.isFinite(Number(entry?.seasonNumber))) return 'tv';
      if (entry?.movie || entry?.inCinemas || entry?.digitalRelease) return 'movie';
      if (entry?.album || entry?.artist || entry?.track) return 'music';
      if (entry?.book || entry?.author || entry?.bookTitle || entry?.authorName) return 'book';
      return mediaKindFromAppId(entry?.__arrAppId);
    }

    function logApi(level, message, meta) {
      const logger = console[level] || console.log;
      if (meta && typeof meta === 'object') {
        logger(`[Launcharr] ${message}`, meta);
      } else {
        logger(`[Launcharr] ${message}`);
      }
    }

    async function fetchArrFromSource(source, pathSuffix, params) {
      let lastError = null;
      const baseCandidates = Array.from(new Set([
        ...(Array.isArray(source?.baseUrls) ? source.baseUrls : []),
        String(source?.baseUrl || '').trim(),
      ].filter(Boolean)));
      const versions = ['v3', 'v1'];

      for (let index = 0; index < versions.length; index += 1) {
        const version = versions[index];
        // Try same-origin proxy first (avoids CORS and mixed-content issues).
        try {
          const endpoint = '/api/arr/' + encodeURIComponent(source.appId) + '/' + version + '/' + String(pathSuffix || '')
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/');
          const url = new URL(endpoint, window.location.origin);
          Object.entries(params || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            url.searchParams.set(key, String(value));
          });
          logApi('info', 'ARR proxy request', { app: source.appId, path: pathSuffix, url: url.toString() });
          const response = await fetch(url.toString(), {
            headers: { Accept: 'application/json' },
          });
          logApi('info', 'ARR proxy response', { app: source.appId, status: response.status, ok: response.ok });
          if (response.ok) return response.json();
          lastError = new Error(source.appName + ' proxy request failed with status ' + response.status);
        } catch (err) {
          logApi('error', 'ARR proxy request failed', {
            app: source.appId,
            path: pathSuffix,
            error: err?.message || String(err),
          });
          lastError = err;
        }

        // If proxy failed, fall back to direct URL candidates (dash.html behavior).
        for (let baseIndex = 0; baseIndex < baseCandidates.length; baseIndex += 1) {
          const base = baseCandidates[baseIndex];
          if (!base) continue;
          try {
            const direct = new URL('/api/' + version + '/' + pathSuffix, base);
            Object.entries(params || {}).forEach(([key, value]) => {
              if (value === undefined || value === null || value === '') return;
              direct.searchParams.set(key, String(value));
            });
            direct.searchParams.set('apikey', String(source.apiKey || ''));
            const safeParams = {};
            direct.searchParams.forEach((value, key) => {
              if (key.toLowerCase() === 'apikey') return;
              safeParams[key] = value;
            });
            logApi('info', 'ARR direct request', {
              app: source.appId,
              path: pathSuffix,
              url: direct.origin + direct.pathname,
              params: safeParams,
            });
            const response = await fetch(direct.toString(), {
              headers: {
                Accept: 'application/json',
                'X-Api-Key': source.apiKey,
              },
            });
            logApi('info', 'ARR direct response', { app: source.appId, status: response.status, ok: response.ok });
            if (!response.ok) {
              lastError = new Error(source.appName + ' direct request failed with status ' + response.status);
              continue;
            }
            return response.json();
          } catch (err) {
            logApi('error', 'ARR direct request failed', {
              app: source.appId,
              path: pathSuffix,
              error: err?.message || String(err),
            });
            lastError = err;
          }
        }
      }

      throw lastError || new Error(source.appName + ' request failed');
    }

    async function fetchArr(pathSuffix, params, source) {
      return fetchArrFromSource(source || activeSources[0], pathSuffix, params);
    }

    function movieIcon() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M5 9h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a1 1 0 0 1 1-1z"></path>' +
        '<path d="M5 13h15"></path><path d="M4.5 9.2 3.8 7a1.7 1.7 0 0 1 1.1-2.1L16.8 1a1.7 1.7 0 0 1 2.1 1.1l.7 2.2"></path>' +
        '<path d="m6.2 9.1 2.5-2.6"></path><path d="m9.8 9.1 2.5-2.6"></path><path d="m13.4 9.1 2.5-2.6"></path><path d="m17 9.1 2.2-2.3"></path>' +
        '<path d="m7.4 4 2.7 2.2"></path><path d="m11 2.8 2.7 2.2"></path><path d="m14.6 1.6 2.7 2.2"></path></svg>';
    }

    function tvIcon() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 7 6 4"></path><path d="M15 7l3-3"></path><rect x="3" y="7" width="18" height="11" rx="2"></rect><path d="M9 21h6"></path></svg>';
    }

    function musicIcon() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M10 18V6l8-2v12"></path><circle cx="8" cy="18" r="2.5"></circle><circle cx="18" cy="14" r="2.5"></circle></svg>';
    }

    function bookIcon() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2z"></path><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"></path></svg>';
    }

    function eyeSvg() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="#e8eef7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path>' +
        '<circle cx="12" cy="12" r="3"></circle></svg>';
    }

    function mediaTypeIcon(kind) {
      if (kind === 'tv') return tvIcon();
      if (kind === 'music') return musicIcon();
      if (kind === 'book') return bookIcon();
      return movieIcon();
    }

    function mediaTypeLabel(kind) {
      if (kind === 'tv') return 'TV Show';
      if (kind === 'music') return 'Music';
      if (kind === 'book') return 'Book';
      return 'Movie';
    }

    function calendarParamsForApp(appSourceId, startDate, endDate) {
      const shared = {
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
      };
      if (appSourceId === 'sonarr') {
        return {
          ...shared,
          includeSeries: true,
          includeEpisodeFile: false,
        };
      }
      if (appSourceId === 'radarr') {
        return {
          ...shared,
          includeMovie: true,
        };
      }
      if (appSourceId === 'lidarr') {
        return {
          ...shared,
          includeArtist: true,
          includeAlbum: true,
        };
      }
      if (appSourceId === 'readarr') {
        return {
          ...shared,
          includeAuthor: true,
          includeBook: true,
        };
      }
      return shared;
    }

    function historyParamsForApp(appSourceId) {
      const shared = {
        page: 1,
        pageSize: 100,
        sortKey: 'date',
        sortDirection: 'descending',
      };
      if (appSourceId === 'sonarr') {
        return {
          ...shared,
          includeSeries: true,
          includeEpisode: true,
        };
      }
      if (appSourceId === 'radarr') {
        return {
          ...shared,
          includeMovie: true,
        };
      }
      if (appSourceId === 'lidarr') {
        return {
          ...shared,
          includeArtist: true,
          includeAlbum: true,
        };
      }
      if (appSourceId === 'readarr') {
        return {
          ...shared,
          includeAuthor: true,
          includeBook: true,
        };
      }
      return shared;
    }

    function createCarousel(options) {
      const viewport = options.viewport;
      const track = options.track;
      const prevBtn = options.prevBtn;
      const nextBtn = options.nextBtn;
      const onView = typeof options.onView === 'function' ? options.onView : null;
      let cards = [];
      let slideIndex = 0;
      let visibleCount = 1;
      let cardWidth = 203;
      let gap = 24;

      function computeLayout() {
        const viewportWidth = viewport.clientWidth;
        cardWidth = cssNum('--plex-cardW', 203);
        gap = cssNum('--plex-gap', 24);
        if (viewportWidth <= 0) return;
        visibleCount = Math.max(1, Math.floor((viewportWidth + gap) / (cardWidth + gap)));
      }

      function clampIndex() {
        const maxLeft = Math.max(0, cards.length - visibleCount);
        slideIndex = Math.min(Math.max(0, slideIndex), maxLeft);
      }

      function applyTransform(animated) {
        track.style.transition = animated ? 'transform .25s ease' : 'none';
        const offset = slideIndex * (cardWidth + gap);
        track.style.transform = 'translateX(' + (-offset) + 'px)';
      }

      function updateButtons() {
        if (!prevBtn || !nextBtn) return;
        const maxLeft = Math.max(0, cards.length - visibleCount);
        prevBtn.disabled = slideIndex <= 0;
        nextBtn.disabled = slideIndex >= maxLeft;
      }

      function render() {
        track.innerHTML = '';
        if (!cards.length) {
          track.innerHTML = '<div class="plex-empty">No results found.</div>';
          updateButtons();
          return;
        }

        cards.forEach((item) => {
          const cardRenderer = typeof options.renderCard === 'function'
            ? options.renderCard
            : (cardItem) => renderCard(cardItem, defaultDisplaySettings);
          const card = cardRenderer(item);
          const viewBtn = card.querySelector('[data-action="view"]');
          if (viewBtn && onView) {
            viewBtn.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              onView(item);
            });
          }
          track.appendChild(card);
        });

        computeLayout();
        clampIndex();
        applyTransform(false);
        updateButtons();
      }

      function slidePrev() {
        computeLayout();
        slideIndex = Math.max(0, slideIndex - visibleCount);
        applyTransform(true);
        updateButtons();
      }

      function slideNext() {
        computeLayout();
        const maxLeft = Math.max(0, cards.length - visibleCount);
        slideIndex = Math.min(maxLeft, slideIndex + visibleCount);
        applyTransform(true);
        updateButtons();
      }

      function addSwipe() {
        viewport.style.touchAction = 'pan-y';
        let startX = 0;
        let deltaX = 0;
        let tracking = false;
        const threshold = 42;

        const onStart = (x, target) => {
          if (target && target.closest && target.closest('button, input, select, textarea, a, [data-action="view"]')) {
            tracking = false;
            return;
          }
          tracking = true;
          startX = x;
          deltaX = 0;
        };

        const onMove = (x) => {
          if (!tracking) return;
          deltaX = x - startX;
        };

        const onEnd = () => {
          if (!tracking) return;
          if (Math.abs(deltaX) > threshold) {
            if (deltaX > 0) slidePrev();
            else slideNext();
          }
          tracking = false;
        };

        viewport.addEventListener('pointerdown', (event) => {
          onStart(event.clientX, event.target);
          if (tracking && viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
        });
        viewport.addEventListener('pointermove', (event) => onMove(event.clientX));
        viewport.addEventListener('pointerup', onEnd);
        viewport.addEventListener('pointercancel', onEnd);

        viewport.addEventListener('touchstart', (event) => {
          if (!event.touches?.length) return;
          onStart(event.touches[0].clientX, event.target);
        }, { passive: true });
        viewport.addEventListener('touchmove', (event) => {
          if (!event.touches?.length) return;
          onMove(event.touches[0].clientX);
        }, { passive: true });
        viewport.addEventListener('touchend', onEnd);
        viewport.addEventListener('touchcancel', onEnd);
      }

      prevBtn?.addEventListener('click', slidePrev);
      nextBtn?.addEventListener('click', slideNext);
      addSwipe();

      return {
        setItems(nextItems) {
          cards = Array.isArray(nextItems) ? nextItems : [];
          slideIndex = 0;
          render();
        },
        updateLayout() {
          computeLayout();
          clampIndex();
          applyTransform(false);
          updateButtons();
        },
      };
    }

    function renderCard(item, displaySettings) {
      const card = document.createElement('div');
      card.className = 'plex-card';
      const title = escapeHtml(item.title || 'Unknown');
      const subtitle = displaySettings.showSubtitle ? escapeHtml(item.subtitle || '') : '';
      const meta = displaySettings.showMeta ? escapeHtml(item.meta || '') : '';
      const pill = escapeHtml(item.pill || '');
      const pillStyle = item.pillColor ? ' style="background:' + item.pillColor + '"' : '';
      const typeSvg = mediaTypeIcon(String(item.kind || '').toLowerCase());
      const metaLine = [subtitle, meta].filter(Boolean).join(' | ');

      card.innerHTML =
        '<div class="plex-poster-wrap">' +
          '<div class="plex-poster-well">' +
            (item.thumb
              ? '<img src="' + item.thumb + '" alt="' + title + '" loading="lazy" referrerpolicy="no-referrer" />'
              : '<div class="plex-placeholder"><div class="plex-placeholder-big">' + title + '</div><div class="plex-placeholder-small">No poster</div></div>') +
            (displaySettings.showTypeIcon ? '<div class="plex-type-icon" title="Type">' + typeSvg + '</div>' : '') +
            (displaySettings.showViewIcon ? '<div class="plex-eye-icon" title="View" data-action="view">' + eyeSvg() + '</div>' : '') +
            (displaySettings.showPill && pill ? '<div class="plex-pill"' + pillStyle + '>' + pill + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="plex-footer">' +
          '<div class="plex-name">' + title + '</div>' +
          (metaLine ? '<div class="plex-meta">' + metaLine + '</div>' : '') +
        '</div>';

      return card;
    }

    function normalizeSoonWindow(item) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const msPerDay = 24 * 60 * 60 * 1000;
      const deltaMs = item.airTimestamp - now.getTime();
      const dayDiff = Math.floor(deltaMs / msPerDay);
      if (!Number.isFinite(dayDiff)) return 'all';
      if (dayDiff <= 0) return 'today';
      if (dayDiff <= 7) return 'week';
      if (dayDiff <= 28) return 'month';
      return 'all';
    }

    function mapSoonItem(entry) {
      const entity = resolveEntity(entry);
      const externalIds = resolveExternalIds(entry, entity);
      const dateValue = resolveSoonDate(entry);
      const airTimestamp = new Date(dateValue).getTime();
      const sourceName = String(entry?.__arrAppName || '').trim();

      return {
        id: 'soon-' + String(entry?.id || Math.random()),
        title: resolveTitle(entry, entity),
        subtitle: [resolveSubtitle(entry), sourceName].filter(Boolean).join(' · '),
        meta: formatDateLabel(dateValue),
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        pill: formatSoonPill(dateValue),
        kind: mediaKindFromEntry(entry),
        overview: resolveOverview(entry, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
        airTimestamp: Number.isFinite(airTimestamp) ? airTimestamp : Number.MAX_SAFE_INTEGER,
        window: 'all',
      };
    }

    function eventType(record) {
      const value = String(record?.eventType || '').toLowerCase();
      if (value.includes('import') || value.includes('download')) return 'imported';
      if (value.includes('grab')) return 'grabbed';
      if (value.includes('fail')) return 'failed';
      return 'other';
    }

    function mapRecentItem(record) {
      const entity = resolveEntity(record);
      const externalIds = resolveExternalIds(record, entity);
      const type = eventType(record);
      const entry = record?.episode || record?.track || record || {};
      const subtitleParts = [];
      const sourceName = String(record?.__arrAppName || '').trim();
      const code = episodeCode(entry?.seasonNumber, entry?.episodeNumber);
      if (code) subtitleParts.push(code);
      if (entry?.title && entry !== record) subtitleParts.push(String(entry.title));
      if (!subtitleParts.length && record?.quality?.quality?.name) {
        subtitleParts.push(String(record.quality.quality.name));
      }
      if (sourceName) subtitleParts.push(sourceName);

      const date = record?.date || record?.eventDate || '';
      const timestamp = new Date(date).getTime();
      const pill = formatRecentPill(date);
      const pillColor = type === 'failed'
        ? '#ff5b5b'
        : (type === 'grabbed' ? '#f6c343' : '#2bd56f');

      return {
        id: 'recent-' + String(record?.id || Math.random()),
        title: resolveTitle(record, entity),
        subtitle: subtitleParts.join(' - '),
        meta: formatDateLabel(date),
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        pill,
        pillColor,
        kind: mediaKindFromEntry(record),
        overview: resolveOverview(record, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
        recentKey: recentKeyForRecord(record, entity, externalIds),
        eventType: type,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      };
    }

    const modal = createModal();

    function createModal() {
      const idPrefix = appId + 'Modal';
      let backdrop = document.getElementById(idPrefix + 'Backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = idPrefix + 'Backdrop';
        backdrop.className = 'plex-modal-backdrop plex-hidden';
        backdrop.innerHTML =
          '<div class="plex-modal">' +
            '<button id="' + idPrefix + 'Close" class="plex-modal-close" aria-label="Close">✕</button>' +
            '<div class="plex-modal-header">' +
              '<div class="plex-modal-title">' +
                '<span id="' + idPrefix + 'TypeIcon" class="plex-mini-icon"></span>' +
                '<span id="' + idPrefix + 'Title">Loading…</span>' +
              '</div>' +
              '<div id="' + idPrefix + 'Subtitle" class="plex-modal-subtitle"></div>' +
            '</div>' +
            '<div id="' + idPrefix + 'Body" class="plex-modal-body"></div>' +
          '</div>';
        document.body.appendChild(backdrop);
      }

      const refs = {
        backdrop,
        close: document.getElementById(idPrefix + 'Close'),
        title: document.getElementById(idPrefix + 'Title'),
        subtitle: document.getElementById(idPrefix + 'Subtitle'),
        body: document.getElementById(idPrefix + 'Body'),
        typeIcon: document.getElementById(idPrefix + 'TypeIcon'),
      };

      refs.close?.addEventListener('click', closeItemModal);
      refs.backdrop?.addEventListener('click', (event) => {
        if (event.target === refs.backdrop) closeItemModal();
      });
      return refs;
    }

    function openItemModal(item) {
      if (!modal.backdrop) return;
      const mediaKind = String(item?.kind || '').toLowerCase();
      const typeSvg = mediaTypeIcon(mediaKind);
      if (modal.typeIcon) modal.typeIcon.innerHTML = typeSvg;
      if (modal.title) modal.title.textContent = String(item?.title || 'Unknown');
      if (modal.subtitle) modal.subtitle.textContent = String(item?.subtitle || '');
      const overview = escapeHtml(item?.overview || 'No overview available for this title.');
      const meta = escapeHtml(item?.meta || '');
      const pill = escapeHtml(item?.pill || '');
      const typeLabel = escapeHtml(mediaTypeLabel(mediaKind));
      const poster = String(item?.thumb || '').trim();
      const backdrop = String(item?.art || '').trim();
      const baseTitle = String(item?.searchQuery || item?.title || 'Unknown').trim();
      const kindHint = mediaKind === 'tv' ? 'tv' : (mediaKind === 'movie' ? 'movie' : (mediaKind || ''));
      const query = encodeURIComponent([baseTitle, kindHint].filter(Boolean).join(' '));
      const imdbUrl = item?.imdbId
        ? ('https://www.imdb.com/title/' + encodeURIComponent(String(item.imdbId)) + '/')
        : '';
      const tmdbUrl = item?.tmdbId
        ? ('https://www.themoviedb.org/' + (mediaKind === 'tv' ? 'tv/' : 'movie/') + encodeURIComponent(String(item.tmdbId)))
        : ('https://www.themoviedb.org/search?query=' + query);
      if (modal.body) {
        modal.body.innerHTML =
          '<div class="plex-modal-scroll">' +
            '<div class="plex-modal-hero">' +
              (backdrop ? '<img class="plex-modal-bg" src="' + backdrop + '" alt="" referrerpolicy="no-referrer" />' : '') +
              '<div class="plex-modal-content">' +
                '<div class="plex-modal-poster">' +
                  (poster
                    ? '<img src="' + poster + '" alt="' + escapeHtml(item?.title || 'Unknown') + '" referrerpolicy="no-referrer" />'
                    : '<div class="plex-placeholder" style="height:340px"><div class="plex-placeholder-big">' + escapeHtml(item?.title || 'Unknown') + '</div><div class="plex-placeholder-small">No poster</div></div>'
                  ) +
                '</div>' +
                '<div class="plex-modal-meta">' +
                  '<div class="plex-pills">' +
                    '<span class="plex-pill2">' + typeLabel + '</span>' +
                    (pill ? '<span class="plex-pill2">' + pill + '</span>' : '') +
                    (meta ? '<span class="plex-pill2">' + meta + '</span>' : '') +
                  '</div>' +
                  '<div class="plex-section">' +
                    '<h4>Overview</h4>' +
                    '<div class="plex-overview-text">' + overview + '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="plex-modal-footer">' +
            (imdbUrl
              ? '<a class="plex-modal-link" href="' + imdbUrl + '" target="_blank" rel="noreferrer">IMDb</a>'
              : '<span class="plex-modal-link" aria-disabled="true">IMDb</span>') +
            '<a class="plex-modal-link" href="' + tmdbUrl + '" target="_blank" rel="noreferrer">TMDb</a>' +
            '<a class="plex-modal-link" href="/apps/tautulli/launch?q=' + query + (item?.imdbId ? ('&imdb=' + encodeURIComponent(String(item.imdbId))) : '') + (item?.tmdbId ? ('&tmdb=' + encodeURIComponent(String(item.tmdbId))) : '') + '&type=' + encodeURIComponent(mediaKind) + '" target="_blank" rel="noreferrer">Tautulli</a>' +
            '<a class="plex-modal-link" href="/apps/plex/launch?q=' + query + (item?.imdbId ? ('&imdb=' + encodeURIComponent(String(item.imdbId))) : '') + (item?.tmdbId ? ('&tmdb=' + encodeURIComponent(String(item.tmdbId))) : '') + '&type=' + encodeURIComponent(mediaKind) + '" target="_blank" rel="noreferrer">Plex</a>' +
          '</div>';
      }
      modal.backdrop.classList.remove('plex-hidden');
      document.body.classList.add('modal-open');
    }

    function closeItemModal() {
      if (!modal.backdrop) return;
      modal.backdrop.classList.add('plex-hidden');
      document.body.classList.remove('modal-open');
    }

    function queueArray(payload) {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.records)) return payload.records;
      if (Array.isArray(payload?.items)) return payload.items;
      return [];
    }

    function mapQueueSonarrItem(item) {
      const entry = {
        ...item,
        __arrBaseUrl: item?.__arrBaseUrl,
        __arrApiKey: item?.__arrApiKey,
        __arrAppName: item?.__arrAppName,
        __arrAppId: item?.__arrAppId,
      };
      const entity = resolveEntity(entry);
      const externalIds = resolveExternalIds(entry, entity);
      const seriesTitle = item?.series?.title || item?.seriesTitle || item?.series?.sortTitle || item?.title || 'Unknown';
      const episode = item?.episode || {};
      let season = episode?.seasonNumber ?? item?.seasonNumber;
      let episodeNumber = episode?.episodeNumber ?? item?.episodeNumber;
      if (!Number.isFinite(Number(season)) || !Number.isFinite(Number(episodeNumber))) {
        const parsed = parseEpisodeFromTitle(item?.title || '');
        if (parsed) {
          season = parsed.season;
          episodeNumber = parsed.episode;
        }
      }

      return {
        kind: 'tv',
        title: String(seriesTitle),
        episode: episodeCodeX(season, episodeNumber),
        episodeTitle: pickEpisodeTitle(item),
        quality: String(item?.quality?.quality?.name || item?.quality?.name || ''),
        protocol: String(item?.protocol || item?.downloadProtocol || '').toLowerCase(),
        timeLeft: resolveQueueTimeLeft(item),
        progress: resolveQueueProgress(item),
        subtitle: [episodeCode(season, episodeNumber), pickEpisodeTitle(item), String(entry?.__arrAppName || '').trim()].filter(Boolean).join(' - '),
        meta: [String(item?.quality?.quality?.name || item?.quality?.name || ''), resolveQueueTimeLeft(item)].filter(Boolean).join(' · '),
        pill: 'In Queue',
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        overview: resolveOverview(entry, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
      };
    }

    function mapQueueRadarrItem(item) {
      const entry = {
        ...item,
        __arrBaseUrl: item?.__arrBaseUrl,
        __arrApiKey: item?.__arrApiKey,
        __arrAppName: item?.__arrAppName,
        __arrAppId: item?.__arrAppId,
      };
      const entity = resolveEntity(entry);
      const externalIds = resolveExternalIds(entry, entity);
      const movieTitle = item?.movie?.title || item?.title || 'Unknown';
      const yearValue = item?.movie?.year ?? item?.year ?? '';
      const studio = resolveMovieStudio(item?.movie || {});
      return {
        kind: 'movie',
        title: String(movieTitle),
        episode: String(yearValue || ''),
        episodeTitle: String(studio || ''),
        quality: String(item?.quality?.quality?.name || item?.quality?.name || ''),
        protocol: String(item?.protocol || item?.downloadProtocol || '').toLowerCase(),
        timeLeft: resolveQueueTimeLeft(item),
        progress: resolveQueueProgress(item),
        subtitle: String(entry?.__arrAppName || '').trim(),
        meta: [String(item?.quality?.quality?.name || item?.quality?.name || ''), resolveQueueTimeLeft(item)].filter(Boolean).join(' · '),
        pill: 'In Queue',
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        overview: resolveOverview(entry, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
      };
    }

    function resolveMovieDirector(movie) {
      if (!movie) return '';
      const crew = movie?.credits?.crew;
      if (Array.isArray(crew)) {
        const director = crew.find((entry) => String(entry?.job || '').toLowerCase() === 'director');
        if (director?.name) return String(director.name);
      }
      if (Array.isArray(movie?.directors) && movie.directors.length) {
        const first = movie.directors[0];
        return typeof first === 'string' ? first : String(first?.name || '');
      }
      if (Array.isArray(movie?.director) && movie.director.length) {
        return String(movie.director[0] || '');
      }
      if (typeof movie?.director === 'string') return movie.director;
      return '';
    }

    function resolveMovieStudio(movie) {
      if (!movie) return '';
      if (movie?.studio) return String(movie.studio);
      if (Array.isArray(movie?.studios) && movie.studios.length) {
        const first = movie.studios[0];
        return typeof first === 'string' ? first : String(first?.name || '');
      }
      return '';
    }

    function mapQueueLidarrItem(item) {
      const entry = {
        ...item,
        __arrBaseUrl: item?.__arrBaseUrl,
        __arrApiKey: item?.__arrApiKey,
        __arrAppName: item?.__arrAppName,
        __arrAppId: item?.__arrAppId,
      };
      const entity = resolveEntity(entry);
      const externalIds = resolveExternalIds(entry, entity);
      const artist = item?.artist?.artistName || item?.artistName || '';
      const album = item?.album?.title || item?.albumTitle || '';
      const track = item?.track?.title || item?.title || '';
      const title = artist || album || track || 'Unknown';
      return {
        kind: 'music',
        title: String(title),
        episode: String(album || ''),
        episodeTitle: String(track && track !== title ? track : ''),
        quality: String(item?.quality?.quality?.name || item?.quality?.name || ''),
        protocol: String(item?.protocol || item?.downloadProtocol || '').toLowerCase(),
        timeLeft: resolveQueueTimeLeft(item),
        progress: resolveQueueProgress(item),
        subtitle: [album, track, String(entry?.__arrAppName || '').trim()].filter(Boolean).join(' - '),
        meta: [String(item?.quality?.quality?.name || item?.quality?.name || ''), resolveQueueTimeLeft(item)].filter(Boolean).join(' · '),
        pill: 'In Queue',
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        overview: resolveOverview(entry, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
      };
    }

    function mapQueueReadarrItem(item) {
      const entry = {
        ...item,
        __arrBaseUrl: item?.__arrBaseUrl,
        __arrApiKey: item?.__arrApiKey,
        __arrAppName: item?.__arrAppName,
        __arrAppId: item?.__arrAppId,
      };
      const entity = resolveEntity(entry);
      const externalIds = resolveExternalIds(entry, entity);
      const author = item?.author?.authorName || item?.authorName || '';
      const book = item?.book?.title || item?.bookTitle || item?.title || '';
      const title = item?.title || book || author || 'Unknown';
      return {
        kind: 'book',
        title: String(title),
        episode: String(author || ''),
        episodeTitle: String(book || ''),
        quality: String(item?.quality?.quality?.name || item?.quality?.name || ''),
        protocol: String(item?.protocol || item?.downloadProtocol || '').toLowerCase(),
        timeLeft: resolveQueueTimeLeft(item),
        progress: resolveQueueProgress(item),
        subtitle: [author, book, String(entry?.__arrAppName || '').trim()].filter(Boolean).join(' - '),
        meta: [String(item?.quality?.quality?.name || item?.quality?.name || ''), resolveQueueTimeLeft(item)].filter(Boolean).join(' · '),
        pill: 'In Queue',
        thumb: buildPosterUrl(entity),
        art: buildBackdropUrl(entity),
        overview: resolveOverview(entry, entity),
        imdbId: externalIds.imdbId,
        tmdbId: externalIds.tmdbId,
      };
    }

    function applySoonFilters() {
      if (!modules.soon.carousel) return;
      const mediaValue = String(modules.soon.mediaFilter?.value || 'all');
      const windowValue = String(modules.soon.windowFilter?.value || 'month');
      const filtered = modules.soon.items
        .filter((item) => {
          if (mediaValue !== 'all' && item.kind !== mediaValue) return false;
          if (windowValue === 'today') return item.window === 'today';
          if (windowValue === 'week') return item.window === 'today' || item.window === 'week';
          if (windowValue === 'month') return item.window !== 'all';
          return true;
        });
      modules.soon.carousel.setItems(filtered);
    }

    function applyRecentFilters() {
      if (!modules.recent.carousel) return;
      const mediaValue = String(modules.recent.mediaFilter?.value || 'all');
      const typeValue = String(modules.recent.typeFilter?.value || 'imported');
      const windowValue = String(modules.recent.windowFilter?.value || 'month');
      const filtered = modules.recent.items
        .filter((item) => {
          if (mediaValue !== 'all' && item.kind !== mediaValue) return false;
          if (typeValue !== 'all' && item.eventType !== typeValue) return false;
          const timestamp = Number(item.timestamp || 0);
          if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
          const ageMs = Date.now() - timestamp;
          if (ageMs < 0) return true;
          if (windowValue === 'today') return ageMs <= 86400000;
          if (windowValue === 'week') return ageMs <= (7 * 86400000);
          if (windowValue === 'month') return ageMs <= (31 * 86400000);
          return true;
        });
      modules.recent.carousel.setItems(filtered);
    }

    function applyQueueFilters() {
      if (!hasQueue) return;
      const typeValue = String(modules.queue.typeFilter?.value || 'all');
      const filtered = modules.queue.items.filter((item) => typeValue === 'all' || item.kind === typeValue);
      filtered.sort((a, b) => {
        const left = queueSortValue(a, modules.queue.sortIndex);
        const right = queueSortValue(b, modules.queue.sortIndex);
        if (left < right) return modules.queue.sortDir === 'asc' ? -1 : 1;
        if (left > right) return modules.queue.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      renderQueueRows(filtered);
    }

    function queueColumnVisibility() {
      const table = modules.queue.table;
      if (!table) {
        return {
          detail: true,
          subdetail: true,
          size: true,
          protocol: true,
          timeleft: true,
          progress: true,
        };
      }
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

    function setQueueColumnDisplay(selector, show) {
      const table = modules.queue.table;
      if (!table) return;
      table.querySelectorAll(selector).forEach((cell) => {
        cell.style.display = show ? '' : 'none';
      });
    }

    function syncQueueTableLayout() {
      const table = modules.queue.table;
      if (!table) return;
      const visibility = queueColumnVisibility();
      table.style.setProperty('--queue-grid-template', buildQueueGridTemplate(visibility));
      setQueueColumnDisplay('.queue-col-detail', visibility.detail);
      setQueueColumnDisplay('.queue-col-subdetail', visibility.subdetail);
      setQueueColumnDisplay('.queue-col-size', visibility.size);
      setQueueColumnDisplay('.queue-col-protocol', visibility.protocol);
      setQueueColumnDisplay('.queue-col-time', visibility.timeleft);
      setQueueColumnDisplay('.queue-col-progress', visibility.progress);
    }

    function queueSortValue(item, index) {
      if (!item) return '';
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

    function renderQueueRows(items) {
      if (!hasQueue) return;
      if (!items.length) {
        modules.queue.body.innerHTML = '<div class="queue-empty">No items in queue.</div>';
        syncQueueTableLayout();
        return;
      }

      modules.queue.body.innerHTML = items.map((item, index) => {
        const protocol = escapeHtml(item.protocol || '-');
        const quality = escapeHtml(item.quality || '-');
        const episode = escapeHtml(item.episode || '-');
        const episodeTitle = escapeHtml(item.episodeTitle || '-');
        const timeLeft = escapeHtml(item.timeLeft || '-');
        const progress = Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0)));
        const protocolClass = item.protocol === 'usenet' ? ' usenet' : '';
        return (
          '<div class="queue-row" data-index="' + index + '">' +
            '<div class="queue-col-title"><button class="queue-link queue-title" type="button" data-action="queue-view" data-index="' + index + '">' + escapeHtml(item.title || 'Unknown') + '</button></div>' +
            '<div class="queue-col-detail queue-episode">' + episode + '</div>' +
            '<div class="queue-col-subdetail queue-ep-title">' + (episodeTitle !== '-' ? '<button class="queue-link queue-ep-title-link" type="button" data-action="queue-view" data-index="' + index + '">' + episodeTitle + '</button>' : episodeTitle) + '</div>' +
            '<div class="queue-col-size"><span class="queue-quality">' + quality + '</span></div>' +
            '<div class="queue-col-protocol queue-protocol' + protocolClass + '">' + protocol + '</div>' +
            '<div class="queue-col-time queue-time">' + timeLeft + '</div>' +
            '<div class="queue-col-progress queue-progress"><span style="width:' + progress + '%"></span></div>' +
          '</div>'
        );
      }).join('');

      modules.queue.body.querySelectorAll('[data-action="queue-view"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const index = Number(button.getAttribute('data-index'));
          if (!Number.isFinite(index) || !items[index]) return;
          openItemModal(items[index]);
        });
      });
      syncQueueTableLayout();
    }

    async function loadSoon() {
      if (!hasSoon) return;
      modules.soon.track.innerHTML = '<div class="plex-empty">Loading...</div>';

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate.getTime());
      endDate.setDate(endDate.getDate() + 28);

      try {
        const list = [];
        for (let index = 0; index < activeSources.length; index += 1) {
          const source = activeSources[index];
          try {
            const payload = await fetchArr(
              'calendar',
              calendarParamsForApp(source.appId, startDate, endDate),
              source
            );
            const sourceList = Array.isArray(payload)
              ? payload
              : (Array.isArray(payload?.records) ? payload.records : []);
            sourceList.forEach((entry) => {
              list.push({
                ...entry,
                __arrAppId: source.appId,
                __arrAppName: source.appName,
                __arrBaseUrl: source.baseUrl,
                __arrApiKey: source.apiKey,
              });
            });
          } catch (err) {
            if (!isCombined) throw err;
            console.warn('ARR combined calendar load failed for', source.appId, err);
          }
        }

        modules.soon.items = list
          .filter((entry) => {
            if (entry?.hasFile === true) return false;
            if (entry?.movieFile) return false;
            return true;
          })
          .map(mapSoonItem)
          .map((item) => ({ ...item, window: normalizeSoonWindow(item) }))
          .sort((a, b) => a.airTimestamp - b.airTimestamp);

        applySoonFilters();
      } catch (err) {
        modules.soon.track.innerHTML = '<div class="plex-empty">Unable to load ' + escapeHtml(appName) + ' calendar.</div>';
      }
    }

    async function loadRecent() {
      if (!hasRecent) return;
      modules.recent.track.innerHTML = '<div class="plex-empty">Loading...</div>';

      try {
        const records = [];
        for (let index = 0; index < activeSources.length; index += 1) {
          const source = activeSources[index];
          try {
            const payload = await fetchArr(
              'history',
              historyParamsForApp(source.appId),
              source
            );
            const sourceRecords = Array.isArray(payload?.records)
              ? payload.records
              : (Array.isArray(payload) ? payload : []);
            sourceRecords.forEach((entry) => {
              records.push({
                ...entry,
                __arrAppId: source.appId,
                __arrAppName: source.appName,
                __arrBaseUrl: source.baseUrl,
                __arrApiKey: source.apiKey,
              });
            });
          } catch (err) {
            if (!isCombined) throw err;
            console.warn('ARR combined history load failed for', source.appId, err);
          }
        }

        modules.recent.items = records
          .map(mapRecentItem)
          .filter((item) => item.eventType !== 'other')
          .sort((a, b) => b.timestamp - a.timestamp);

        const importedKeys = new Set(
          modules.recent.items
            .filter((item) => item.eventType === 'imported' && item.recentKey)
            .map((item) => item.recentKey)
        );

        if (importedKeys.size) {
          modules.recent.items = modules.recent.items.filter((item) => {
            if (item.eventType !== 'grabbed') return true;
            if (!item.recentKey) return true;
            return !importedKeys.has(item.recentKey);
          });
        }

        applyRecentFilters();
      } catch (err) {
        modules.recent.track.innerHTML = '<div class="plex-empty">Unable to load ' + escapeHtml(appName) + ' history.</div>';
      }
    }

    async function loadQueue() {
      if (!hasQueue) return;
      modules.queue.body.innerHTML = '<div class="queue-empty">Loading...</div>';

      try {
        let mapped = [];
        for (let index = 0; index < activeSources.length; index += 1) {
          const source = activeSources[index];
          try {
            if (source.appId === 'sonarr') {
              let payload = null;
              try {
                payload = await fetchArr('queue/details', {
                  includeSeries: true,
                  includeEpisode: true,
                  includeUnknownSeriesItems: true,
                }, source);
              } catch (_detailsErr) {
                payload = await fetchArr('queue', {
                  includeSeries: true,
                  includeEpisode: true,
                  includeUnknownSeriesItems: true,
                }, source);
              }

              let sonarrQueue = queueArray(payload);
              if (!sonarrQueue.length) {
                try {
                  const fallbackPayload = await fetchArr('queue', {
                    includeSeries: true,
                    includeEpisode: true,
                    includeUnknownSeriesItems: true,
                  }, source);
                  sonarrQueue = queueArray(fallbackPayload);
                } catch (_fallbackErr) {
                  sonarrQueue = [];
                }
              }

              const list = sonarrQueue
                .map((entry) => ({
                  ...entry,
                  __arrBaseUrl: source.baseUrl,
                  __arrApiKey: source.apiKey,
                  __arrAppName: source.appName,
                  __arrAppId: source.appId,
                }))
                .map(mapQueueSonarrItem);
              mapped = mapped.concat(list);
            } else if (source.appId === 'radarr') {
              const payload = await fetchArr('queue', {
                includeMovie: true,
                includeUnknownMovieItems: true,
              }, source);
              const list = queueArray(payload)
                .map((entry) => ({
                  ...entry,
                  __arrBaseUrl: source.baseUrl,
                  __arrApiKey: source.apiKey,
                  __arrAppName: source.appName,
                  __arrAppId: source.appId,
                }))
                .map(mapQueueRadarrItem);
              mapped = mapped.concat(list);
            } else if (source.appId === 'lidarr') {
              const payload = await fetchArr('queue', {
                includeArtist: true,
                includeAlbum: true,
                includeTrack: true,
                includeUnknownArtistItems: true,
              }, source);
              const list = queueArray(payload)
                .map((entry) => ({
                  ...entry,
                  __arrBaseUrl: source.baseUrl,
                  __arrApiKey: source.apiKey,
                  __arrAppName: source.appName,
                  __arrAppId: source.appId,
                }))
                .map(mapQueueLidarrItem);
              mapped = mapped.concat(list);
            } else if (source.appId === 'readarr') {
              const payload = await fetchArr('queue', {
                includeAuthor: true,
                includeBook: true,
                includeUnknownAuthorItems: true,
              }, source);
              const list = queueArray(payload)
                .map((entry) => ({
                  ...entry,
                  __arrBaseUrl: source.baseUrl,
                  __arrApiKey: source.apiKey,
                  __arrAppName: source.appName,
                  __arrAppId: source.appId,
                }))
                .map(mapQueueReadarrItem);
              mapped = mapped.concat(list);
            }
          } catch (err) {
            if (!isCombined) throw err;
            console.warn('ARR combined queue load failed for', source.appId, err);
          }
        }

        modules.queue.items = mapped;
        applyQueueFilters();
      } catch (err) {
        modules.queue.body.innerHTML = '<div class="queue-empty">Unable to load ' + escapeHtml(appName) + ' queue.</div>';
      }
    }

    function bindCollapseButtons(prefix) {
      document.querySelectorAll('.plex-collapse-btn[data-target^="' + prefix + '-"]').forEach((button) => {
        button.addEventListener('click', () => {
          const targetId = button.getAttribute('data-target');
          const section = targetId ? document.getElementById(targetId) : null;
          if (!section) return;
          section.classList.toggle('plex-collapsed');
        });
      });
    }
  }
})();
