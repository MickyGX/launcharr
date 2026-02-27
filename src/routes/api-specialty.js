export function registerApiSpecialty(app, ctx) {
  const {
    requireUser,
    requireAdmin,
    requireSettingsAdmin,
    loadConfig,
    saveConfig,
    getEffectiveRole,
    canAccessDashboardApp,
    normalizeAppId,
    safeMessage,
    pushLog,
    resolveNotificationSettings,
    sendAppriseNotification,
    widgetStatsInternalToken,
    // URL helpers
    getAppBaseId,
    resolveLaunchUrl,
    injectBasicAuthIntoUrl,
    stripUrlEmbeddedCredentials,
    resolveAppApiCandidates,
    resolveRequestApiCandidates,
    normalizeBaseUrl,
    buildAppApiUrl,
    // launch helpers
    resolveRoleAwareLaunchUrl,
    hasEmbeddedUrlCredentials,
    // Romm session/priming
    bootstrapRommIframeSession,
    buildCookieHeaderFromSetCookies,
    getRommCsrfTokenFromSetCookies,
    buildRommCookiePrimingPlan,
    evaluateRommCookiePrimingCompatibility,
    prepareRommPrimedSetCookies,
    buildBasicAuthHeader,
    // Romm data
    extractRommList,
    mapRommConsoleItem,
    mapRommRecentlyAddedItem,
    parseFiniteNumber,
    // widget bars
    resolveWidgetBars,
    serializeWidgetBars,
    normalizeWidgetBar,
    normalizeWidgetBarId,
    normalizeWidgetInBar,
    normalizeWidgetId,
    buildWidgetBarId,
    buildWidgetRowId,
    normalizeWidgetRow,
    normalizeWidgetRowSettings,
    resolveNextWidgetBarOrder,
    resolveNextWidgetRowOrder,
    resolveWidgetBarTypes,
    getWidgetStatType,
    // system widgets
    SYSTEM_WIDGET_TYPES,
    SYSTEM_WIDGET_TYPE_BY_ID,
    SYSTEM_WIDGET_SEARCH_PROVIDERS,
    SYSTEM_WIDGET_TIMEZONES,
    normalizeSystemWidget,
  } = ctx;
  const WIDGET_STATUS_MONITOR_POLL_MS = 15000;
  const WIDGET_STATUS_MONITOR_REQUEST_TIMEOUT_MS = 12000;
  const WIDGET_STATUS_MONITOR_INTERNAL_HEADER = 'x-launcharr-internal-token';
  const widgetStatusInternalToken = String(widgetStatsInternalToken || '').trim();
  const widgetStatusMonitorBaseUrl = `http://127.0.0.1:${Number(process.env.PORT) || 3333}`;
  const widgetStatusMonitorState = new Map();
  let widgetStatusMonitorTickRunning = false;

  function normalizeWidgetMonitorState(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'up' || raw === 'online') return 'online';
    if (raw === 'down' || raw === 'offline') return 'offline';
    return 'unknown';
  }

  function isInternalWidgetStatsRequest(req) {
    if (!widgetStatusInternalToken) return false;
    const provided = String(req.get(WIDGET_STATUS_MONITOR_INTERNAL_HEADER) || '').trim();
    return Boolean(provided) && provided === widgetStatusInternalToken;
  }

  function requireWidgetStatsAccess(req, res, next) {
    if (isInternalWidgetStatsRequest(req)) {
      req.__launcharrInternalWidgetStats = true;
      return next();
    }
    return requireUser(req, res, next);
  }

  function buildWidgetStatusMonitorSnapshot() {
    const config = loadConfig();
    const notificationSettings = resolveNotificationSettings(config);
    const delaySecondsRaw = Number(notificationSettings?.widgetStatusDelaySeconds);
    const delaySeconds = Number.isFinite(delaySecondsRaw)
      ? Math.max(5, Math.min(3600, Math.round(delaySecondsRaw)))
      : 60;
    const enabled = Boolean(notificationSettings?.appriseEnabled && notificationSettings?.widgetStatusEnabled);
    const now = Date.now();
    const items = Array.from(widgetStatusMonitorState.entries())
      .map(([appId, state]) => {
        const appName = String(state?.appName || appId).trim() || appId;
        const currentState = normalizeWidgetMonitorState(state?.currentState);
        const pendingStateRaw = normalizeWidgetMonitorState(state?.pendingState);
        const pendingSinceMs = Number(state?.pendingSince);
        const hasPending = (pendingStateRaw === 'online' || pendingStateRaw === 'offline')
          && Number.isFinite(pendingSinceMs)
          && pendingSinceMs > 0;
        const pendingElapsedSeconds = hasPending
          ? Math.max(0, Math.floor((now - pendingSinceMs) / 1000))
          : 0;
        const pendingRemainingSeconds = hasPending
          ? Math.max(0, delaySeconds - pendingElapsedSeconds)
          : 0;
        return {
          appId,
          appName,
          currentState,
          pendingState: hasPending ? pendingStateRaw : '',
          pendingSince: hasPending ? new Date(pendingSinceMs).toISOString() : '',
          pendingElapsedSeconds,
          pendingRemainingSeconds,
        };
      })
      .sort((a, b) => String(a.appName || a.appId || '').localeCompare(String(b.appName || b.appId || '')));
    return {
      ok: true,
      enabled,
      appriseEnabled: Boolean(notificationSettings?.appriseEnabled),
      widgetStatusEnabled: Boolean(notificationSettings?.widgetStatusEnabled),
      delaySeconds,
      pollSeconds: Math.round(WIDGET_STATUS_MONITOR_POLL_MS / 1000),
      items,
      generatedAt: new Date().toISOString(),
    };
  }

  function resolveWidgetMonitorTargets(config) {
    const apps = Array.isArray(config?.apps) ? config.apps : [];
    const appById = new Map();
    apps.forEach((appItem) => {
      const appId = normalizeAppId(appItem?.id);
      if (!appId) return;
      appById.set(appId, appItem);
    });

    const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
    const appIds = new Set();
    bars.forEach((bar) => {
      const rows = Array.isArray(bar?.rows) ? bar.rows : [];
      rows.forEach((row) => {
        const widgets = Array.isArray(row?.widgets) ? row.widgets : [];
        widgets.forEach((widget) => {
          if (!widget || widget.systemType || widget.available === false) return;
          const appId = normalizeAppId(widget.appId);
          if (!appId) return;
          const baseId = getAppBaseId(appId);
          if (!getWidgetStatType(baseId)) return;
          if (!appById.has(appId)) return;
          appIds.add(appId);
        });
      });
    });

    return Array.from(appIds).map((appId) => ({
      appId,
      appName: String(appById.get(appId)?.name || appId).trim() || appId,
    }));
  }

  async function fetchWidgetMonitorState(appId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WIDGET_STATUS_MONITOR_REQUEST_TIMEOUT_MS);
    try {
      const headers = { Accept: 'application/json' };
      if (widgetStatusInternalToken) {
        headers[WIDGET_STATUS_MONITOR_INTERNAL_HEADER] = widgetStatusInternalToken;
      }
      const response = await fetch(`${widgetStatusMonitorBaseUrl}/api/widget-stats/${encodeURIComponent(appId)}`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        return { state: 'unknown', error: `HTTP ${response.status}` };
      }
      const payload = await response.json().catch(() => ({}));
      return { state: normalizeWidgetMonitorState(payload?.status) };
    } catch (err) {
      return { state: 'unknown', error: safeMessage(err) || 'Failed to fetch widget state.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runWidgetStatusMonitorTick() {
    if (widgetStatusMonitorTickRunning) return;
    widgetStatusMonitorTickRunning = true;
    try {
      const config = loadConfig();
      const notificationSettings = resolveNotificationSettings(config);
      const monitorEnabled = Boolean(notificationSettings?.appriseEnabled && notificationSettings?.widgetStatusEnabled);
      const delaySeconds = Number(notificationSettings?.widgetStatusDelaySeconds);
      const effectiveDelaySeconds = Number.isFinite(delaySeconds)
        ? Math.max(5, Math.min(3600, Math.round(delaySeconds)))
        : 60;
      const delayMs = effectiveDelaySeconds * 1000;
      const targets = resolveWidgetMonitorTargets(config);
      const targetIdSet = new Set(targets.map((target) => target.appId));

      Array.from(widgetStatusMonitorState.keys()).forEach((appId) => {
        if (!targetIdSet.has(appId)) widgetStatusMonitorState.delete(appId);
      });

      if (!targets.length) return;
      const now = Date.now();
      const statusResults = await Promise.all(targets.map(async (target) => ({
        ...target,
        ...(await fetchWidgetMonitorState(target.appId)),
      })));
      const notifications = [];

      statusResults.forEach((result) => {
        const nextState = normalizeWidgetMonitorState(result.state);
        const existing = widgetStatusMonitorState.get(result.appId);
        if (!existing) {
          widgetStatusMonitorState.set(result.appId, {
            appName: result.appName,
            currentState: nextState,
            pendingState: '',
            pendingSince: 0,
          });
          return;
        }
        existing.appName = String(result.appName || existing.appName || result.appId).trim() || result.appId;

        if (!monitorEnabled) {
          existing.currentState = nextState;
          existing.pendingState = '';
          existing.pendingSince = 0;
          return;
        }

        if (nextState === existing.currentState) {
          existing.pendingState = '';
          existing.pendingSince = 0;
          return;
        }

        if (nextState === 'unknown') {
          // Keep last known state so transient probe failures do not suppress real transitions.
          existing.pendingState = '';
          existing.pendingSince = 0;
          return;
        }

        if (existing.currentState === 'unknown') {
          existing.currentState = nextState;
          existing.pendingState = '';
          existing.pendingSince = 0;
          return;
        }

        if (existing.pendingState !== nextState) {
          existing.pendingState = nextState;
          existing.pendingSince = now;
          return;
        }

        if ((now - existing.pendingSince) < delayMs) return;
        const fromState = existing.currentState;
        existing.currentState = nextState;
        existing.pendingState = '';
        existing.pendingSince = 0;
        notifications.push({
          appId: result.appId,
          appName: result.appName,
          fromState,
          toState: nextState,
          delaySeconds: effectiveDelaySeconds,
        });
      });

      for (const notification of notifications) {
        const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const toOnline = notification.toState === 'online';
        const title = toOnline
          ? `Launcharr widget online: ${notification.appName}`
          : `Launcharr widget offline: ${notification.appName}`;
        const body = toOnline
          ? `${notification.appName} came online at ${timestamp} after ${notification.delaySeconds}s in the new state.`
          : `${notification.appName} went offline at ${timestamp} after ${notification.delaySeconds}s in the new state.`;
        try {
          await sendAppriseNotification(notificationSettings, {
            title,
            body,
            tag: notificationSettings.appriseTag,
          });
          pushLog({
            level: 'info',
            app: notification.appId,
            action: 'notifications.widget-status',
            message: `${notification.appName} changed from ${notification.fromState} to ${notification.toState}.`,
            meta: { delaySeconds: notification.delaySeconds },
          });
        } catch (err) {
          pushLog({
            level: 'error',
            app: notification.appId,
            action: 'notifications.widget-status',
            message: `Failed to send widget status notification for ${notification.appName}.`,
            meta: { error: safeMessage(err) || 'Unknown notification error.' },
          });
        }
      }
    } catch (err) {
      pushLog({
        level: 'error',
        app: 'widgets',
        action: 'notifications.widget-status.monitor',
        message: 'Widget status monitor tick failed.',
        meta: { error: safeMessage(err) || 'Unknown monitor error.' },
      });
    } finally {
      widgetStatusMonitorTickRunning = false;
    }
  }

  app.post('/api/romm/viewer-session-test', requireAdmin, async (req, res) => {
    const config = loadConfig();
    const apps = Array.isArray(config?.apps) ? config.apps : [];
    const requestedAppId = String(req.body?.appId || '').trim();
    const rommApp = apps.find((appItem) => {
      if (requestedAppId && String(appItem?.id || '') === requestedAppId) return true;
      return getAppBaseId(appItem?.id) === 'romm';
    });
    if (!rommApp) {
      return res.json({ ok: false, message: 'Romm app is not configured.' });
    }
  
    const localUrl = String(req.body?.localUrl !== undefined ? req.body.localUrl : (rommApp.localUrl || '')).trim();
    const remoteUrl = String(req.body?.remoteUrl !== undefined ? req.body.remoteUrl : (rommApp.remoteUrl || '')).trim();
    const fallbackUrl = String(req.body?.url !== undefined ? req.body.url : (rommApp.url || '')).trim();
    const appUsername = String(req.body?.username !== undefined ? req.body.username : (rommApp.username || '')).trim();
    const appPassword = String(req.body?.password !== undefined ? req.body.password : (rommApp.password || ''));
    const viewerUsername = String(req.body?.viewerUsername !== undefined ? req.body.viewerUsername : (rommApp.viewerUsername || '')).trim();
    const viewerPassword = String(req.body?.viewerPassword !== undefined ? req.body.viewerPassword : (rommApp.viewerPassword || ''));
    const credentialModeRaw = String(req.body?.credentialMode || 'viewer').trim().toLowerCase();
    const credentialMode = credentialModeRaw === 'admin' ? 'admin' : 'viewer';
    const usingAdminCredentials = credentialMode === 'admin';
    const sessionUsername = usingAdminCredentials ? appUsername : viewerUsername;
    const sessionPassword = usingAdminCredentials ? appPassword : viewerPassword;
    const sessionLabel = usingAdminCredentials ? 'admin' : 'viewer';
    const primeBrowserRaw = String(req.body?.primeBrowser ?? 'true').trim().toLowerCase();
    const primeBrowser = ['1', 'true', 'yes', 'on'].includes(primeBrowserRaw);
  
    if (!sessionUsername || !sessionPassword) {
      return res.json({
        ok: false,
        message: usingAdminCredentials
          ? 'Romm admin username and password are required (uses the main Username/Password fields).'
          : 'Viewer username and password are required.',
      });
    }
  
    const effectiveApp = {
      ...rommApp,
      localUrl,
      remoteUrl,
      url: fallbackUrl || rommApp.url || '',
    };
    const baseLaunchUrl = String(resolveLaunchUrl(effectiveApp, req) || '').trim();
    if (!baseLaunchUrl) {
      return res.json({ ok: false, message: 'Missing Romm launch URL (local or remote URL).' });
    }
  
    const credentialedLaunchUrl = injectBasicAuthIntoUrl(baseLaunchUrl, sessionUsername, sessionPassword);
    const cleanLaunchUrl = stripUrlEmbeddedCredentials(credentialedLaunchUrl);
    const primingPlan = buildRommCookiePrimingPlan({
      config,
      req,
      browserUrl: cleanLaunchUrl,
    });
  
    const bootstrap = await bootstrapRommIframeSession({
      req,
      launchUrl: credentialedLaunchUrl,
      authBaseCandidates: resolveAppApiCandidates(effectiveApp, req),
    });
  
    let probe = { ok: false };
    if (bootstrap?.ok) {
      try {
        const probeBase = normalizeBaseUrl(bootstrap.authBaseUrl || cleanLaunchUrl);
        const meUrl = buildAppApiUrl(probeBase, 'api/users/me').toString();
        const cookieHeader = buildCookieHeaderFromSetCookies(bootstrap.setCookies || []);
        const csrfToken = getRommCsrfTokenFromSetCookies(bootstrap.setCookies || []);
        const headers = { Accept: 'application/json' };
        if (cookieHeader) headers.Cookie = cookieHeader;
        if (csrfToken) headers['x-csrftoken'] = csrfToken;
        const response = await fetch(meUrl, { headers });
        const text = await response.text().catch(() => '');
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (_err) { payload = {}; }
        probe = {
          ok: response.ok,
          status: response.status,
          user: response.ok ? {
            username: String(payload?.username || '').trim(),
            role: String(payload?.role || '').trim(),
            id: payload?.id,
          } : null,
          error: response.ok ? '' : (String(payload?.detail || payload?.error || text || '').trim() || `Status ${response.status}`),
        };
      } catch (err) {
        probe = { ok: false, error: safeMessage(err) || 'Failed to verify /api/users/me.' };
      }
    }
  
    const primingCompatibility = bootstrap?.ok
      ? evaluateRommCookiePrimingCompatibility(bootstrap.setCookies, primingPlan)
      : { ok: false, blocking: false, reason: '' };
    const primedSetCookies = (bootstrap?.ok && primeBrowser && primingCompatibility.ok)
      ? prepareRommPrimedSetCookies(bootstrap.setCookies, primingPlan)
      : [];
    if (primedSetCookies.length) {
      res.append('Set-Cookie', primedSetCookies);
    }
  
    const cookieNames = Array.isArray(bootstrap?.setCookies)
      ? Array.from(new Set(bootstrap.setCookies.map((cookie) => String(cookie || '').split('=')[0].trim()).filter(Boolean)))
      : [];
    const primedBrowser = Boolean(primedSetCookies.length);
    const message = (() => {
      if (!bootstrap?.ok) return bootstrap?.error || `Romm ${sessionLabel} session bootstrap failed.`;
      if (!primingCompatibility.ok) {
        return `Romm login succeeded server-side, but browser cookie priming is blocked. ${primingCompatibility.reason || primingPlan.reason || 'No compatible shared cookie domain found.'} Launcharr host: ${primingPlan.configuredLauncharrHost || primingPlan.requestHost || 'unknown'}; Romm host: ${primingPlan.targetHost || 'unknown'}.`;
      }
      if (!probe.ok) {
        return `Romm login cookies were obtained${primedBrowser ? ' and primed in this browser' : ''}, but /api/users/me verification failed${probe.status ? ` (${probe.status})` : ''}${probe.error ? `: ${probe.error}` : '.'}`;
      }
      if (primedBrowser && primingPlan.mode === 'shared-domain' && primingPlan.cookieDomain) {
        return `Romm ${sessionLabel} session OK and browser cookies primed for ${primingPlan.cookieDomain}. ${probe.user?.username ? `Logged in as ${probe.user.username}` : `${usingAdminCredentials ? 'Admin' : 'Viewer'} user verified`}.`;
      }
      return `Romm ${sessionLabel} session OK${primedBrowser ? ' and browser cookies primed' : ''}. ${probe.user?.username ? `Logged in as ${probe.user.username}` : `${usingAdminCredentials ? 'Admin' : 'Viewer'} user verified`}.`;
    })();
  
    return res.json({
      ok: Boolean(bootstrap?.ok && probe.ok),
      message,
      diagnostics: {
        credentialMode,
        requestHost: primingPlan.requestHost,
        targetHost: primingPlan.targetHost,
        configuredLauncharrHost: primingPlan.configuredLauncharrHost,
        canPrimeBrowserCookies: primingPlan.canPrime,
        cookiePrimingCompatible: primingCompatibility.ok,
        cookiePrimingCompatibilityReason: primingCompatibility.reason,
        cookiePrimingMode: primingPlan.mode,
        cookieDomain: primingPlan.cookieDomain,
        baseLaunchUrl,
        cleanLaunchUrl,
        cookieNames,
        primedBrowser,
        authBaseUrl: String(bootstrap?.authBaseUrl || '').trim(),
        attemptedAuthBases: Array.isArray(bootstrap?.attemptedBases) ? bootstrap.attemptedBases : [],
        probe,
      },
    });
  });

  app.get('/api/romm/:kind', requireUser, async (req, res) => {
    const kind = String(req.params.kind || '').trim().toLowerCase();
    if (!['recently-added', 'consoles'].includes(kind)) {
      return res.status(400).json({ error: 'Unsupported Romm endpoint.' });
    }
  
    const config = loadConfig();
    const apps = config.apps || [];
    const rommApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'romm');
    if (!rommApp) return res.status(404).json({ error: 'Romm app is not configured.' });
    if (!canAccessDashboardApp(config, rommApp, getEffectiveRole(req))) {
      return res.status(403).json({ error: 'Romm dashboard access denied.' });
    }
  
    const candidates = resolveAppApiCandidates(rommApp, req);
    if (!candidates.length) return res.status(400).json({ error: 'Missing Romm URL.' });
  
    const apiKey = String(rommApp.apiKey || '').trim();
    const authHeader = buildBasicAuthHeader(rommApp.username || '', rommApp.password || '');
    const headers = {
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
      headers['X-API-KEY'] = apiKey;
      if (!authHeader) headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
    }
    if (authHeader) headers.Authorization = authHeader;
  
    const effectiveRole = getEffectiveRole(req);
    let rommSessionHeaders = null;
    let rommSessionBootstrapAttempted = false;
    async function getRommSessionHeaders() {
      if (rommSessionBootstrapAttempted) return rommSessionHeaders;
      rommSessionBootstrapAttempted = true;
  
      const baseLaunchUrl = String(resolveLaunchUrl(rommApp, req) || '').trim();
      if (!baseLaunchUrl) return null;
  
      let credentialedLaunchUrl = resolveRoleAwareLaunchUrl(rommApp, req, baseLaunchUrl, effectiveRole) || baseLaunchUrl;
      if (!hasEmbeddedUrlCredentials(credentialedLaunchUrl)) {
        const roleText = String(effectiveRole || '').trim().toLowerCase();
        const prefersViewer = roleText === 'user' || roleText === 'co-admin';
        const loginUsername = String(
          (prefersViewer ? (rommApp.viewerUsername || rommApp.username) : rommApp.username) || '',
        ).trim();
        const loginPassword = String(
          (prefersViewer ? (rommApp.viewerPassword || rommApp.password) : rommApp.password) || '',
        );
        credentialedLaunchUrl = injectBasicAuthIntoUrl(baseLaunchUrl, loginUsername, loginPassword);
      }
      if (!hasEmbeddedUrlCredentials(credentialedLaunchUrl)) return null;
  
      const bootstrap = await bootstrapRommIframeSession({
        req,
        launchUrl: credentialedLaunchUrl,
        authBaseCandidates: candidates,
      });
      if (!bootstrap?.ok) return null;
  
      const cookieHeader = buildCookieHeaderFromSetCookies(bootstrap.setCookies || []);
      if (!cookieHeader) return null;
      rommSessionHeaders = { Accept: 'application/json', Cookie: cookieHeader };
      const csrfToken = getRommCsrfTokenFromSetCookies(bootstrap.setCookies || []);
      if (csrfToken) rommSessionHeaders['x-csrftoken'] = csrfToken;
      return rommSessionHeaders;
    }
  
    async function fetchRommApi(urlString, requestHeaders) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        return await fetch(urlString, {
          headers: requestHeaders,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  
    const endpointPlans = kind === 'consoles'
      ? [
        { path: 'api/platforms' },
        { path: 'api/v1/platforms' },
        { path: 'api/consoles' },
        { path: 'api/v1/consoles' },
        { path: 'api/systems' },
        { path: 'api/v1/systems' },
      ]
      : (() => {
        const configuredProbeLimit = Number(rommApp?.rommRecentProbeLimit);
        const probeLimit = Number.isFinite(configuredProbeLimit) && configuredProbeLimit > 0
          ? Math.min(200, Math.max(50, Math.round(configuredProbeLimit)))
          : 50;
        const probeLimitText = String(probeLimit);
        return [
          { path: 'api/games/recent', query: { limit: probeLimitText } },
          { path: 'api/v1/games/recent', query: { limit: probeLimitText } },
          { path: 'api/games/recently-added', query: { limit: probeLimitText } },
          { path: 'api/v1/games/recently-added', query: { limit: probeLimitText } },
          { path: 'api/roms/recent', query: { limit: probeLimitText } },
          { path: 'api/roms/recently-added', query: { limit: probeLimitText } },
          { path: 'api/roms', query: { order_by: 'id', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: probeLimitText } },
          { path: 'api/roms', query: { order_by: 'updated_at', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: probeLimitText } },
          { path: 'api/roms', query: { order_by: 'created_at', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: probeLimitText } },
          { path: 'api/roms', query: { sort: 'created_at', order: 'desc', limit: probeLimitText } },
          { path: 'api/v1/roms', query: { sort: 'created_at', order: 'desc', limit: probeLimitText } },
        ];
      })();
  
    let lastError = '';
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const baseUrl = candidates[candidateIndex];
      if (!baseUrl) continue;
      for (let planIndex = 0; planIndex < endpointPlans.length; planIndex += 1) {
        const endpoint = endpointPlans[planIndex];
        try {
          const url = buildAppApiUrl(baseUrl, endpoint.path);
          Object.entries(endpoint.query || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              url.searchParams.set(key, String(value));
            }
          });
          let response;
          response = await fetchRommApi(url.toString(), headers);
          if (!response.ok && (response.status === 401 || response.status === 403)) {
            const sessionHeaders = await getRommSessionHeaders();
            if (sessionHeaders) {
              response = await fetchRommApi(url.toString(), sessionHeaders);
            }
          }
          const text = await response.text();
          if (!response.ok) {
            lastError = `Romm request failed (${response.status}) via ${baseUrl}.`;
            continue;
          }
          const payload = text ? JSON.parse(text) : {};
          const list = extractRommList(payload, kind);
          if (!Array.isArray(list)) {
            lastError = `Unexpected Romm response format via ${baseUrl}.`;
            continue;
          }
          const mapper = kind === 'consoles' ? mapRommConsoleItem : mapRommRecentlyAddedItem;
          const mapped = list
            .map((entry, sourceIndex) => ({ item: mapper(entry, baseUrl), sourceIndex }))
            .filter(({ item }) => Boolean(item?.title));
          let ordered = mapped.map(({ item }) => item);
          if (kind === 'consoles') {
            ordered = mapped.slice().sort((leftEntry, rightEntry) => {
              const leftSort = parseFiniteNumber(leftEntry?.item?.sortTs, 0);
              const rightSort = parseFiniteNumber(rightEntry?.item?.sortTs, 0);
              if (rightSort !== leftSort) return rightSort - leftSort;
              return String(leftEntry?.item?.title || '').localeCompare(String(rightEntry?.item?.title || ''));
            }).map(({ item }) => item);
          } else {
            ordered = mapped
              .slice()
              .sort((leftEntry, rightEntry) => {
                const leftSort = parseFiniteNumber(leftEntry?.item?.sortTs, 0);
                const rightSort = parseFiniteNumber(rightEntry?.item?.sortTs, 0);
                if (rightSort !== leftSort) return rightSort - leftSort;
                const leftSourceIndex = Number(leftEntry?.sourceIndex || 0);
                const rightSourceIndex = Number(rightEntry?.sourceIndex || 0);
                if (leftSourceIndex !== rightSourceIndex) return leftSourceIndex - rightSourceIndex;
                return String(leftEntry?.item?.title || '').localeCompare(String(rightEntry?.item?.title || ''));
              })
              .map(({ item }) => item);
          }
          const requestedLimitRaw = String(req.query?.limit || '').trim().toLowerCase();
          const defaultLimit = kind === 'consoles' ? 500 : 200;
          const maxCap = kind === 'consoles' ? 5000 : 1000;
          let itemLimit = defaultLimit;
          if (requestedLimitRaw === 'all') {
            itemLimit = maxCap;
          } else if (requestedLimitRaw) {
            const parsedLimit = Number(requestedLimitRaw);
            if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
              itemLimit = Math.min(maxCap, Math.max(1, Math.round(parsedLimit)));
            }
          }
          const items = ordered.slice(0, itemLimit);
          return res.json({ items });
        } catch (err) {
          lastError = safeMessage(err) || `Failed to reach Romm via ${baseUrl}.`;
        }
      }
    }
  
    return res.status(502).json({ error: lastError || 'Failed to fetch Romm data.' });
  });

  // ─── Widget Bar CRUD ──────────────────────────────────────────────────────

  app.get('/api/widget-bars', requireSettingsAdmin, (req, res) => {
    try {
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      return res.json({ ok: true, items: bars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to list widget bars.' });
    }
  });

  app.post('/api/widget-bars', requireSettingsAdmin, (req, res) => {
    try {
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const body = req.body || {};
      const nextOrder = resolveNextWidgetBarOrder(config);
      const normalized = normalizeWidgetBar({
        id: normalizeWidgetBarId(body.id || '') || normalizeWidgetBarId(buildWidgetBarId()),
        name: String(body.name || '').trim() || 'Widget Bar',
        icon: body.icon,
        visibilityRoles: body.visibilityRoles,
        visibilityRole: body.visibilityRole,
        refreshSeconds: body.refreshSeconds,
        order: nextOrder,
        widgets: [],
      });
      if (!normalized) return res.status(400).json({ error: 'Invalid widget bar payload.' });
      // Ensure unique ID
      const existing = Array.isArray(config?.widgetBars) ? config.widgetBars : [];
      const existingIds = new Set(existing.map((b) => normalizeWidgetBarId(b?.id || '')).filter(Boolean));
      let barId = normalized.id;
      if (existingIds.has(barId)) {
        let suffix = 2;
        while (existingIds.has(`${barId}-${suffix}`)) suffix += 1;
        barId = `${barId}-${suffix}`;
      }
      const newBars = serializeWidgetBars([...resolveWidgetBars(config, apps, 'admin', { includeHidden: true }), { ...normalized, id: barId }]);
      // New bars start hidden from all dashboards — user must explicitly add via dashboard manager
      const elementKey = `widget-bar:${barId}`;
      const nextDashboardRemovedElements = {
        ...((config?.dashboardRemovedElements && typeof config.dashboardRemovedElements === 'object') ? config.dashboardRemovedElements : {}),
        [elementKey]: true,
      };
      const rawDashboards = Array.isArray(config?.dashboards) ? config.dashboards : null;
      const nextDashboards = rawDashboards
        ? rawDashboards.map((dash) => {
            if (!dash?.state?.dashboardRemovedElements || typeof dash.state.dashboardRemovedElements !== 'object') return dash;
            return { ...dash, state: { ...dash.state, dashboardRemovedElements: { ...dash.state.dashboardRemovedElements, [elementKey]: true } } };
          })
        : null;
      saveConfig({
        ...config,
        widgetBars: newBars,
        dashboardRemovedElements: nextDashboardRemovedElements,
        ...(nextDashboards ? { dashboards: nextDashboards } : {}),
      });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to create widget bar.' });
    }
  });

  app.put('/api/widget-bars/:id', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      if (!barId) return res.status(400).json({ error: 'Invalid widget bar id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const index = bars.findIndex((b) => b.id === barId);
      if (index === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const existing = bars[index];
      const body = req.body || {};
      const updated = normalizeWidgetBar({
        ...existing,
        name: body.name !== undefined ? String(body.name || '').trim() || existing.name : existing.name,
        icon: body.icon !== undefined ? body.icon : existing.icon,
        visibilityRoles: body.visibilityRoles !== undefined ? body.visibilityRoles : existing.visibilityRoles,
        visibilityRole: body.visibilityRole !== undefined ? body.visibilityRole : existing.visibilityRole,
        refreshSeconds: body.refreshSeconds !== undefined ? body.refreshSeconds : existing.refreshSeconds,
        order: body.order !== undefined ? Number(body.order) : existing.order,
        widgets: existing.widgets,
      });
      if (!updated) return res.status(400).json({ error: 'Invalid widget bar payload.' });
      const nextBars = bars.map((b, i) => (i === index ? updated : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to update widget bar.' });
    }
  });

  app.delete('/api/widget-bars/:id', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      if (!barId) return res.status(400).json({ error: 'Invalid widget bar id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      if (!bars.find((b) => b.id === barId)) return res.status(404).json({ error: 'Widget bar not found.' });
      const nextBars = bars.filter((b) => b.id !== barId);
      // Also remove from dashboardRemovedElements if present
      const dashboardRemovedElements = (config?.dashboardRemovedElements && typeof config.dashboardRemovedElements === 'object')
        ? { ...config.dashboardRemovedElements }
        : {};
      delete dashboardRemovedElements[`widget-bar:${barId}`];
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars), dashboardRemovedElements });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      return res.json({ ok: true, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to delete widget bar.' });
    }
  });

  // Backward-compat: add widget to first row of bar
  app.post('/api/widget-bars/:id/widgets', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      if (!barId) return res.status(400).json({ error: 'Invalid widget bar id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const body = req.body || {};
      const appId = String(body.appId || '').trim();
      if (!appId) return res.status(400).json({ error: 'appId is required.' });
      // Collect all widget IDs across all rows for uniqueness
      const existingWidgetIds = new Set(bar.rows.flatMap((r) => r.widgets.map((w) => normalizeWidgetId(w.id || ''))).filter(Boolean));
      const baseWidgetId = normalizeWidgetId(`wg-${appId}`);
      let widgetId = baseWidgetId;
      let suffix = 2;
      while (existingWidgetIds.has(widgetId)) { widgetId = `${baseWidgetId}-${suffix}`; suffix += 1; }
      const newWidget = normalizeWidgetInBar({ id: widgetId, appId });
      if (!newWidget) return res.status(400).json({ error: 'Invalid widget entry.' });
      // Add to first row
      const firstRow = bar.rows[0];
      const updatedRows = bar.rows.map((r, i) => i === 0 ? { ...firstRow, widgets: [...firstRow.widgets, newWidget] } : r);
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      if (!updatedBar) return res.status(400).json({ error: 'Failed to update widget bar.' });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to add widget to bar.' });
    }
  });

  // Backward-compat: remove widget from whichever row contains it
  app.delete('/api/widget-bars/:id/widgets/:widgetId', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const widgetId = normalizeWidgetId(req.params.widgetId || '');
      if (!barId || !widgetId) return res.status(400).json({ error: 'Invalid bar or widget id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const totalBefore = bar.rows.reduce((s, r) => s + r.widgets.length, 0);
      const updatedRows = bar.rows.map((r) => ({ ...r, widgets: r.widgets.filter((w) => normalizeWidgetId(w.id || '') !== widgetId) }));
      const totalAfter = updatedRows.reduce((s, r) => s + r.widgets.length, 0);
      if (totalAfter === totalBefore) return res.status(404).json({ error: 'Widget not found in bar.' });
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to remove widget from bar.' });
    }
  });

  // ─── Widget Bar Row CRUD ───────────────────────────────────────────────────

  app.post('/api/widget-bars/:id/rows', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      if (!barId) return res.status(400).json({ error: 'Invalid widget bar id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const body = req.body || {};
      const beforeRowId = normalizeWidgetBarId(body.beforeRowId || '');
      const newRow = { id: buildWidgetRowId(), order: resolveNextWidgetRowOrder(bar), settings: normalizeWidgetRowSettings({}), widgets: [] };
      const nextRows = Array.isArray(bar.rows) ? [...bar.rows] : [];
      if (beforeRowId) {
        const beforeIndex = nextRows.findIndex((row) => normalizeWidgetBarId(row.id || '') === beforeRowId);
        if (beforeIndex === -1) return res.status(404).json({ error: 'Target row not found.' });
        nextRows.splice(beforeIndex, 0, newRow);
      } else {
        nextRows.push(newRow);
      }
      const orderedRows = nextRows.map((row, index) => ({ ...row, order: (index + 1) * 10 }));
      const updatedBar = normalizeWidgetBar({ ...bar, rows: orderedRows });
      if (!updatedBar) return res.status(400).json({ error: 'Failed to add row.' });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to add row.' });
    }
  });

  app.put('/api/widget-bars/:id/rows/:rowId', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const rowId = normalizeWidgetBarId(req.params.rowId || '');
      if (!barId || !rowId) return res.status(400).json({ error: 'Invalid bar or row id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const rowIndex = bar.rows.findIndex((r) => r.id === rowId);
      if (rowIndex === -1) return res.status(404).json({ error: 'Row not found.' });
      const existingRow = bar.rows[rowIndex];
      const body = req.body || {};
      const newSettings = normalizeWidgetRowSettings({
        maxCols: body.maxCols !== undefined ? body.maxCols : existingRow.settings.maxCols,
        fixedWidth: body.fixedWidth !== undefined ? body.fixedWidth : existingRow.settings.fixedWidth,
        scroll: body.scroll !== undefined ? body.scroll : existingRow.settings.scroll,
        fill: body.fill !== undefined ? body.fill : existingRow.settings.fill,
      });
      let nextWidgets = Array.isArray(existingRow.widgets) ? [...existingRow.widgets] : [];
      if (Array.isArray(body.widgetOrder)) {
        const widgetById = new Map(
          nextWidgets
            .map((widget) => [normalizeWidgetId(widget?.id || ''), widget])
            .filter(([id]) => Boolean(id))
        );
        const usedIds = new Set();
        const orderedWidgets = [];
        for (const rawId of body.widgetOrder) {
          const id = normalizeWidgetId(rawId || '');
          if (!id || usedIds.has(id)) continue;
          const widget = widgetById.get(id);
          if (!widget) continue;
          orderedWidgets.push(widget);
          usedIds.add(id);
        }
        for (const widget of nextWidgets) {
          const id = normalizeWidgetId(widget?.id || '');
          if (!id || usedIds.has(id)) continue;
          orderedWidgets.push(widget);
          usedIds.add(id);
        }
        nextWidgets = orderedWidgets;
      }
      const updatedRow = { ...existingRow, settings: newSettings, widgets: nextWidgets };
      const updatedRows = bar.rows.map((r, i) => (i === rowIndex ? updatedRow : r));
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      if (!updatedBar) return res.status(400).json({ error: 'Failed to update row settings.' });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to update row settings.' });
    }
  });

  app.delete('/api/widget-bars/:id/rows/:rowId', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const rowId = normalizeWidgetBarId(req.params.rowId || '');
      if (!barId || !rowId) return res.status(400).json({ error: 'Invalid bar or row id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      if (bar.rows.length <= 1) return res.status(400).json({ error: 'Cannot delete the last row.' });
      if (!bar.rows.find((r) => r.id === rowId)) return res.status(404).json({ error: 'Row not found.' });
      const updatedRows = bar.rows.filter((r) => r.id !== rowId);
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to delete row.' });
    }
  });

  app.post('/api/widget-bars/:id/rows/:rowId/widgets', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const rowId = normalizeWidgetBarId(req.params.rowId || '');
      if (!barId || !rowId) return res.status(400).json({ error: 'Invalid bar or row id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const rowIndex = bar.rows.findIndex((r) => r.id === rowId);
      if (rowIndex === -1) return res.status(404).json({ error: 'Row not found.' });
      const body = req.body || {};
      const systemType = String(body.systemType || '').trim().toLowerCase();
      const appId = String(body.appId || '').trim();
      if (!systemType && !appId) return res.status(400).json({ error: 'appId or systemType is required.' });
      if (systemType && appId) return res.status(400).json({ error: 'Provide either appId or systemType, not both.' });
      if (systemType && !SYSTEM_WIDGET_TYPE_BY_ID.has(systemType)) {
        return res.status(400).json({ error: `Unsupported system widget type: ${systemType}` });
      }
      // Widget IDs must be unique across all rows in the bar
      const existingWidgetIds = new Set(bar.rows.flatMap((r) => r.widgets.map((w) => normalizeWidgetId(w.id || ''))).filter(Boolean));
      const baseWidgetId = normalizeWidgetId(`wg-${systemType || appId}`);
      let widgetId = baseWidgetId;
      let suffix = 2;
      while (existingWidgetIds.has(widgetId)) { widgetId = `${baseWidgetId}-${suffix}`; suffix += 1; }
      const newWidgetEntry = systemType
        ? { id: widgetId, systemType, systemConfig: body.systemConfig || {} }
        : { id: widgetId, appId };
      const newWidget = normalizeWidgetInBar(newWidgetEntry);
      if (!newWidget) return res.status(400).json({ error: 'Invalid widget entry.' });
      const targetRow = bar.rows[rowIndex];
      const updatedRows = bar.rows.map((r, i) => i === rowIndex ? { ...targetRow, widgets: [...targetRow.widgets, newWidget] } : r);
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      if (!updatedBar) return res.status(400).json({ error: 'Failed to update widget bar.' });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to add widget to row.' });
    }
  });

  app.put('/api/widget-bars/:id/rows/:rowId/widgets/:widgetId', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const rowId = normalizeWidgetBarId(req.params.rowId || '');
      const widgetId = normalizeWidgetId(req.params.widgetId || '');
      if (!barId || !rowId || !widgetId) return res.status(400).json({ error: 'Invalid bar, row, or widget id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const rowIndex = bar.rows.findIndex((r) => r.id === rowId);
      if (rowIndex === -1) return res.status(404).json({ error: 'Row not found.' });
      const row = bar.rows[rowIndex];
      const widgetIndex = row.widgets.findIndex((w) => normalizeWidgetId(w.id || '') === widgetId);
      if (widgetIndex === -1) return res.status(404).json({ error: 'Widget not found in row.' });

      const body = req.body || {};
      const existingWidget = row.widgets[widgetIndex];
      const updatedWidget = normalizeWidgetInBar(
        existingWidget.systemType
          ? { ...existingWidget, systemConfig: body.systemConfig || existingWidget.systemConfig || {} }
          : {
              ...existingWidget,
              selectedMetricKeys: body.selectedMetricKeys,
              metricColumns: body.metricColumns,
              selectedLibraryKeys: body.selectedLibraryKeys,
            }
      );
      if (!updatedWidget) return res.status(400).json({ error: 'Invalid widget update.' });

      const nextWidgets = row.widgets.map((w, i) => (i === widgetIndex ? updatedWidget : w));
      const updatedRows = bar.rows.map((r, i) => (i === rowIndex ? { ...row, widgets: nextWidgets } : r));
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      if (!updatedBar) return res.status(400).json({ error: 'Failed to update widget.' });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to update widget.' });
    }
  });

  app.delete('/api/widget-bars/:id/rows/:rowId/widgets/:widgetId', requireSettingsAdmin, (req, res) => {
    try {
      const barId = normalizeWidgetBarId(req.params.id || '');
      const rowId = normalizeWidgetBarId(req.params.rowId || '');
      const widgetId = normalizeWidgetId(req.params.widgetId || '');
      if (!barId || !rowId || !widgetId) return res.status(400).json({ error: 'Invalid bar, row, or widget id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const bars = resolveWidgetBars(config, apps, 'admin', { includeHidden: true });
      const barIndex = bars.findIndex((b) => b.id === barId);
      if (barIndex === -1) return res.status(404).json({ error: 'Widget bar not found.' });
      const bar = bars[barIndex];
      const rowIndex = bar.rows.findIndex((r) => r.id === rowId);
      if (rowIndex === -1) return res.status(404).json({ error: 'Row not found.' });
      const row = bar.rows[rowIndex];
      const nextWidgets = row.widgets.filter((w) => normalizeWidgetId(w.id || '') !== widgetId);
      if (nextWidgets.length === row.widgets.length) return res.status(404).json({ error: 'Widget not found in row.' });
      const updatedRows = bar.rows.map((r, i) => i === rowIndex ? { ...row, widgets: nextWidgets } : r);
      const updatedBar = normalizeWidgetBar({ ...bar, rows: updatedRows });
      const nextBars = bars.map((b, i) => (i === barIndex ? updatedBar : b));
      saveConfig({ ...config, widgetBars: serializeWidgetBars(nextBars) });
      const savedConfig = loadConfig();
      const savedBars = resolveWidgetBars(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', { includeHidden: true });
      const savedBar = savedBars.find((b) => b.id === barId) || null;
      return res.json({ ok: true, item: savedBar, items: savedBars });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to remove widget from row.' });
    }
  });

  // ─── System Widget APIs ────────────────────────────────────────────────────

  // CPU, RAM, Disk stats for system widgets
  app.get('/api/system-info', requireUser, async (req, res) => {
    try {
      const os = (await import('os')).default;
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const fsPromises = (await import('fs/promises')).default;
      const path = (await import('path')).default;
      const execFileAsync = promisify(execFile);

      function parseDfBytesOutput(stdout) {
        const lines = String(stdout || '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length < 2) return null;
        const parts = lines[lines.length - 1].split(/\s+/);
        const total = Number(parts[0]);
        const free = Number(parts[1]);
        if (!Number.isFinite(total) || !Number.isFinite(free)) return null;
        return { total, free };
      }

      function parseDfKbOutput(stdout) {
        const lines = String(stdout || '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length < 2) return null;
        const parts = lines[lines.length - 1].split(/\s+/);
        const totalKb = Number(parts[1]);
        const freeKb = Number(parts[3]);
        if (!Number.isFinite(totalKb) || !Number.isFinite(freeKb)) return null;
        return { total: totalKb * 1024, free: freeKb * 1024 };
      }

      async function resolveDiskPath(rawPath) {
        let inputPath = String(rawPath || '/').trim() || '/';
        if (!inputPath.startsWith('/')) inputPath = `/${inputPath}`;
        try {
          await fsPromises.access(inputPath);
          return inputPath;
        } catch (_err) { /* continue */ }

        // Fast common-case for /Media vs /media style paths.
        const lowerFirst = inputPath.replace(/^\/([A-Z])/, (_m, c) => `/${String(c).toLowerCase()}`);
        if (lowerFirst !== inputPath) {
          try {
            await fsPromises.access(lowerFirst);
            return lowerFirst;
          } catch (_err) { /* continue */ }
        }

        // Walk filesystem case-insensitively segment by segment.
        const segments = inputPath.split('/').filter(Boolean);
        let current = '/';
        for (const segmentRaw of segments) {
          const segment = String(segmentRaw || '').trim();
          if (!segment) continue;
          const direct = path.join(current, segment);
          try {
            await fsPromises.access(direct);
            current = direct;
            continue;
          } catch (_err) { /* continue */ }
          try {
            const entries = await fsPromises.readdir(current, { withFileTypes: true });
            const found = entries.find((entry) => String(entry.name || '').toLowerCase() === segment.toLowerCase());
            if (!found) return inputPath;
            current = path.join(current, found.name);
          } catch (_err) {
            return inputPath;
          }
        }
        return current;
      }

      async function readDiskUsage(diskPath) {
        const resolvedPath = await resolveDiskPath(diskPath);
        const attempts = [
          { args: ['-B1', '--output=size,avail', resolvedPath], parser: parseDfBytesOutput },
          { args: ['-Pk', resolvedPath], parser: parseDfKbOutput },
          { args: ['-k', resolvedPath], parser: parseDfKbOutput },
        ];
        for (const attempt of attempts) {
          try {
            const { stdout } = await execFileAsync('df', attempt.args, { timeout: 5000 });
            const parsed = attempt.parser(stdout);
            if (parsed && Number.isFinite(parsed.total) && Number.isFinite(parsed.free)) {
              return { ...parsed, ok: true, resolvedPath };
            }
          } catch (_err) { /* try next parser */ }
        }
        return { total: 0, free: 0, ok: false, resolvedPath };
      }

      // CPU: sample twice 100ms apart
      const cpuSample = () => os.cpus().map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
      const s1 = cpuSample();
      await new Promise((r) => setTimeout(r, 100));
      const s2 = cpuSample();
      let idleSum = 0; let totalSum = 0;
      for (let i = 0; i < s1.length; i++) {
        idleSum += s2[i].idle - s1[i].idle;
        totalSum += s2[i].total - s1[i].total;
      }
      const cpuPercent = totalSum > 0 ? Math.round(100 * (1 - idleSum / totalSum)) : 0;

      // RAM
      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      // Disk paths from query
      const rawPaths = String(req.query.paths || '/').trim();
      const diskPaths = [...new Set(rawPaths.split(',').map((p) => p.trim()).filter(Boolean))];
      const diskResults = await Promise.all(diskPaths.map(async (path) => {
        const usage = await readDiskUsage(path);
        return { path, total: usage.total, free: usage.free, ok: usage.ok, resolvedPath: usage.resolvedPath };
      }));

      return res.json({
        ok: true,
        cpu: { percent: cpuPercent },
        memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
        disks: diskResults,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: safeMessage(err) || 'Failed to fetch system info.' });
    }
  });

  // OpenMeteo weather proxy with server-side cache
  const _openmeteoCache = new Map();
  app.get('/api/openmeteo', requireUser, async (req, res) => {
    try {
      const WMO_CONDITIONS = {
        0: { label: 'Clear sky', icon: 'clear' },
        1: { label: 'Mainly clear', icon: 'mainly-clear' },
        2: { label: 'Partly cloudy', icon: 'partly-cloudy' },
        3: { label: 'Overcast', icon: 'overcast' },
        45: { label: 'Foggy', icon: 'foggy' }, 48: { label: 'Icy fog', icon: 'foggy' },
        51: { label: 'Light drizzle', icon: 'drizzle' }, 53: { label: 'Drizzle', icon: 'drizzle' }, 55: { label: 'Heavy drizzle', icon: 'drizzle' },
        56: { label: 'Freezing drizzle', icon: 'drizzle' }, 57: { label: 'Heavy freezing drizzle', icon: 'drizzle' },
        61: { label: 'Light rain', icon: 'rainy' }, 63: { label: 'Rain', icon: 'rainy' }, 65: { label: 'Heavy rain', icon: 'rainy' },
        66: { label: 'Freezing rain', icon: 'rainy' }, 67: { label: 'Heavy freezing rain', icon: 'rainy' },
        71: { label: 'Light snow', icon: 'snowy' }, 73: { label: 'Snow', icon: 'snowy' }, 75: { label: 'Heavy snow', icon: 'snowy' },
        77: { label: 'Snow grains', icon: 'snowy' },
        80: { label: 'Light showers', icon: 'showers' }, 81: { label: 'Showers', icon: 'showers' }, 82: { label: 'Heavy showers', icon: 'showers' },
        85: { label: 'Snow showers', icon: 'snowy' }, 86: { label: 'Heavy snow showers', icon: 'snowy' },
        95: { label: 'Thunderstorm', icon: 'stormy' },
        96: { label: 'Thunderstorm w/ hail', icon: 'stormy' }, 99: { label: 'Thunderstorm w/ hail', icon: 'stormy' },
      };
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ ok: false, error: 'lat and lon are required.' });
      }
      const timezone = String(req.query.timezone || 'UTC').trim() || 'UTC';
      const units = req.query.units === 'imperial' ? 'imperial' : 'metric';
      const cacheMinutes = Math.max(1, Math.min(60, Number(req.query.cache) || 5));
      const cacheKey = `${lat},${lon},${timezone},${units}`;
      const cached = _openmeteoCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return res.json({ ok: true, ...cached.data });
      }
      const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
      const windUnit = units === 'imperial' ? 'mph' : 'kmh';
      const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=${encodeURIComponent(timezone)}&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}`;
      const https = await import('https');
      const wxData = await new Promise((resolve, reject) => {
        const req2 = https.get(apiUrl, { timeout: 8000 }, (response) => {
          let body = '';
          response.on('data', (chunk) => { body += chunk; });
          response.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON from OpenMeteo')); }
          });
        });
        req2.on('error', reject);
        req2.on('timeout', () => { req2.destroy(); reject(new Error('OpenMeteo request timed out')); });
      });
      if (!wxData?.current_weather) {
        return res.status(502).json({ ok: false, error: 'Invalid response from OpenMeteo.' });
      }
      const cw = wxData.current_weather;
      const wmoCode = Number(cw.weathercode);
      const condition = WMO_CONDITIONS[wmoCode] || { label: 'Unknown', icon: 'partly-cloudy' };
      const result = {
        temperature: cw.temperature,
        windspeed: cw.windspeed,
        weathercode: wmoCode,
        condition: condition.label,
        icon: condition.icon,
        units,
        tempUnit: units === 'imperial' ? '°F' : '°C',
      };
      _openmeteoCache.set(cacheKey, { data: result, expiresAt: Date.now() + cacheMinutes * 60 * 1000 });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(502).json({ ok: false, error: safeMessage(err) || 'Failed to fetch weather data.' });
    }
  });

  // ─── Widget Stats ─────────────────────────────────────────────────────────

  app.get('/api/widget-status-monitor', requireSettingsAdmin, (_req, res) => {
    try {
      return res.json(buildWidgetStatusMonitorSnapshot());
    } catch (err) {
      return res.status(500).json({ ok: false, error: safeMessage(err) || 'Failed to load widget monitor state.' });
    }
  });

  app.get('/api/widget-stats/:appId', requireWidgetStatsAccess, async (req, res) => {
    try {
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const rawAppId = String(req.params.appId || '').trim();
      const appItem = apps.find((a) => normalizeAppId(String(a?.id || '')) === normalizeAppId(rawAppId));
      if (!appItem) return res.status(404).json({ error: 'App not configured.' });

      const isInternalWidgetRequest = req.__launcharrInternalWidgetStats === true;
      if (!isInternalWidgetRequest && !canAccessDashboardApp(config, appItem, getEffectiveRole(req))) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const typeId = getAppBaseId(appItem.id);
      const statType = getWidgetStatType(typeId);
      if (!statType) {
        return res.status(400).json({ error: `No stat type for app family: ${typeId}` });
      }

      const candidates = resolveAppApiCandidates(appItem, req);
      if (!candidates.length) {
        return res.json({ ok: true, appId: rawAppId, typeId, status: 'unknown', metrics: [] });
      }

      const apiKey = String(appItem.apiKey || '').trim();

      async function doFetch(urlString, fetchHeaders, opts) {
        const method = String(opts?.method || 'GET').toUpperCase();
        const body = opts?.body;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(urlString, {
            method,
            headers: fetchHeaders,
            ...(body !== undefined ? { body } : {}),
            signal: controller.signal,
          });
          const text = await response.text().catch(() => '');
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
          return { ok: response.ok, status: response.status, headers: response.headers, json, text };
        } finally {
          clearTimeout(timeout);
        }
      }

      // Try each candidate base URL in order; return on first success
      async function tryAllCandidates(buildRequest) {
        let lastResult = null;
        for (const baseUrl of candidates) {
          try {
            const result = await buildRequest(baseUrl);
            if (result && result.ok) return result;
            lastResult = result;
          } catch (_e) {
            lastResult = null;
          }
        }
        return lastResult;
      }

      async function tryCandidatePaths(paths, fetchHeaders) {
        let lastResult = null;
        for (const path of (Array.isArray(paths) ? paths : [])) {
          const result = await tryAllCandidates(async (baseUrl) =>
            doFetch(buildAppApiUrl(baseUrl, path).toString(), fetchHeaders)
          );
          if (result?.ok) return result;
          if (result) lastResult = result;
        }
        return lastResult;
      }

      function pickFiniteFromObject(source, keys) {
        const obj = (source && typeof source === 'object') ? source : null;
        if (!obj) return null;
        for (const key of keys) {
          if (!(key in obj)) continue;
          const parsed = parseMetricNumber(obj[key]);
          if (Number.isFinite(parsed)) return parsed;
        }
        return null;
      }

      function pickFiniteFromPath(source, path) {
        const rawPath = String(path || '').trim();
        if (!rawPath) return null;
        const parts = rawPath.split('.').map((part) => part.trim()).filter(Boolean);
        if (!parts.length) return null;
        let cur = source;
        for (const part of parts) {
          if (!cur || typeof cur !== 'object') return null;
          if (!(part in cur)) return null;
          cur = cur[part];
        }
        const parsed = parseMetricNumber(cur);
        return Number.isFinite(parsed) ? parsed : null;
      }

      function pickFiniteFromPaths(source, paths) {
        for (const path of (Array.isArray(paths) ? paths : [])) {
          const parsed = pickFiniteFromPath(source, path);
          if (parsed !== null) return parsed;
        }
        return null;
      }

      function parseMetricNumber(value) {
        const direct = parseFiniteNumber(value);
        if (Number.isFinite(direct)) return direct;
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return null;
        const normalized = raw
          .replace(/,/g, '')
          .replace(/\s+/g, '')
          .replace(/_/g, '');
        const numeric = Number(normalized);
        if (Number.isFinite(numeric)) return numeric;
        const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([kmb])$/i);
        if (!match) return null;
        const base = Number(match[1]);
        if (!Number.isFinite(base)) return null;
        const suffix = String(match[2] || '').toLowerCase();
        const mult = suffix === 'k' ? 1e3 : (suffix === 'm' ? 1e6 : (suffix === 'b' ? 1e9 : 1));
        return base * mult;
      }

      function toArrayPayload(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];
        const list = payload.records || payload.items || payload.results || payload.data;
        return Array.isArray(list) ? list : [];
      }

      function countEnabledEntries(list) {
        const items = Array.isArray(list) ? list : [];
        return items.filter((entry) => entry?.enable !== false && entry?.enabled !== false).length;
      }

      function summarizeProwlarrStatList(list) {
        let queries = 0;
        let grabs = 0;
        let hasQueries = false;
        let hasGrabs = false;
        for (const entry of (Array.isArray(list) ? list : [])) {
          const q = pickFiniteFromObject(entry, [
            'totalQueries',
            'queries',
            'queryCount',
            'numberOfQueries',
            'queryTotal',
          ]);
          const g = pickFiniteFromObject(entry, [
            'totalGrabs',
            'grabs',
            'grabCount',
            'numberOfGrabs',
            'grabTotal',
          ]);
          if (q !== null) { queries += q; hasQueries = true; }
          if (g !== null) { grabs += g; hasGrabs = true; }
        }
        return { queries, grabs, hasQueries, hasGrabs };
      }

      function extractProwlarrTotals(payload) {
        const directQueries = pickFiniteFromObject(payload, [
          'totalQueries',
          'queries',
          'queryCount',
          'numberOfQueries',
          'queryTotal',
        ]);
        const directGrabs = pickFiniteFromObject(payload, [
          'totalGrabs',
          'grabs',
          'grabCount',
          'numberOfGrabs',
          'grabTotal',
        ]);
        const nestedQueries = pickFiniteFromPaths(payload, [
          'queries.total',
          'query.total',
          'searches.total',
          'stats.queries.total',
          'stats.searches.total',
          'indexers.totalQueries',
        ]);
        const nestedGrabs = pickFiniteFromPaths(payload, [
          'grabs.total',
          'grab.total',
          'stats.grabs.total',
          'indexers.totalGrabs',
        ]);
        if (directQueries !== null || directGrabs !== null) {
          return {
            queries: Math.max(0, directQueries !== null ? directQueries : (nestedQueries !== null ? nestedQueries : 0)),
            grabs: Math.max(0, directGrabs !== null ? directGrabs : (nestedGrabs !== null ? nestedGrabs : 0)),
            hasQueries: directQueries !== null,
            hasGrabs: directGrabs !== null,
          };
        }
        if (nestedQueries !== null || nestedGrabs !== null) {
          return {
            queries: Math.max(0, nestedQueries !== null ? nestedQueries : 0),
            grabs: Math.max(0, nestedGrabs !== null ? nestedGrabs : 0),
            hasQueries: nestedQueries !== null,
            hasGrabs: nestedGrabs !== null,
          };
        }

        if (Array.isArray(payload)) return summarizeProwlarrStatList(payload);

        const listCandidate = payload?.records || payload?.items || payload?.results || payload?.data || payload?.indexers;
        if (Array.isArray(listCandidate)) return summarizeProwlarrStatList(listCandidate);

        return { queries: 0, grabs: 0, hasQueries: false, hasGrabs: false };
      }

      function formatCompactCount(value) {
        const n = Math.max(0, Math.round(Number(value) || 0));
        if (n >= 1000000) {
          const scaled = n / 1000000;
          const text = Number.isInteger(scaled)
            ? String(scaled)
            : (scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, ''));
          return `${text}M`;
        }
        if (n >= 1000) {
          const scaled = n / 1000;
          const text = Number.isInteger(scaled)
            ? String(scaled)
            : (scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, ''));
          return `${text}K`;
        }
        return String(n);
      }

      let status = 'unknown';
      let metrics = [];
      let libraryInfo = null;

      // ── plex ─────────────────────────────────────────────────────────────
      if (typeId === 'plex') {
        const plexToken = String(appItem.plexToken || appItem.apiKey || '').trim();

        // Find the first working base URL and get the sections list
        let workingBase = null;
        let sectionsResult = null;
        for (const baseUrl of candidates) {
          try {
            const url = buildAppApiUrl(baseUrl, 'library/sections');
            if (plexToken) url.searchParams.set('X-Plex-Token', plexToken);
            const r = await doFetch(url.toString(), { Accept: 'application/json' });
            if (r?.ok && r.json?.MediaContainer) {
              workingBase = baseUrl;
              sectionsResult = r;
              break;
            }
          } catch (_e) { /* try next */ }
        }

        if (sectionsResult) {
          status = 'up';
          const dirs = Array.isArray(sectionsResult.json.MediaContainer.Directory)
            ? sectionsResult.json.MediaContainer.Directory : [];

          // Fetch accurate item counts per section using lightweight container-size=0 requests
          // (library/sections does not reliably return per-section counts)
          // For artist sections, also fetch album count (Plex type=9) in parallel
          const sectionCounts = await Promise.all(
            dirs.map(async (d) => {
              try {
                const makeUrl = (extra) => {
                  const url = buildAppApiUrl(workingBase, `library/sections/${d.key}/all`);
                  url.searchParams.set('X-Plex-Container-Start', '0');
                  url.searchParams.set('X-Plex-Container-Size', '0');
                  if (plexToken) url.searchParams.set('X-Plex-Token', plexToken);
                  if (extra) for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
                  return url.toString();
                };
                const [r, albumR] = await Promise.all([
                  doFetch(makeUrl(), { Accept: 'application/json' }),
                  d.type === 'artist' ? doFetch(makeUrl({ type: '9' }), { Accept: 'application/json' }) : Promise.resolve(null),
                ]);
                return {
                  key: String(d.key || ''), title: String(d.title || d.key || '').trim(), type: d.type,
                  count: Number(r?.json?.MediaContainer?.totalSize) || 0,
                  albumCount: d.type === 'artist' ? (Number(albumR?.json?.MediaContainer?.totalSize) || 0) : 0,
                };
              } catch (_e) {
                return { key: String(d.key || ''), title: String(d.title || d.key || '').trim(), type: d.type, count: 0, albumCount: 0 };
              }
            })
          );

          const movies = sectionCounts.filter((s) => s.type === 'movie').reduce((sum, s) => sum + s.count, 0);
          const shows = sectionCounts.filter((s) => s.type === 'show').reduce((sum, s) => sum + s.count, 0);
          const artists = sectionCounts.filter((s) => s.type === 'artist').reduce((sum, s) => sum + s.count, 0);
          const albums = sectionCounts.filter((s) => s.type === 'artist').reduce((sum, s) => sum + s.albumCount, 0);
          metrics = [
            { key: 'movies',  label: 'Movies',   value: movies },
            { key: 'shows',   label: 'TV Shows',  value: shows },
            { key: 'artists', label: 'Artists',   value: artists },
            { key: 'albums',  label: 'Albums',    value: albums },
          ];
          const plexTypeToMetric = { movie: 'movies', show: 'shows', artist: 'artists' };
          libraryInfo = [
            ...sectionCounts
              .filter((s) => plexTypeToMetric[s.type])
              .map((s) => ({ key: s.key, title: s.title, metricKey: plexTypeToMetric[s.type], count: s.count })),
            ...sectionCounts
              .filter((s) => s.type === 'artist')
              .map((s) => ({ key: s.key, title: s.title, metricKey: 'albums', count: s.albumCount })),
          ];
        } else {
          status = 'down';
        }

      // ── tautulli ─────────────────────────────────────────────────────────
      } else if (typeId === 'tautulli') {
        const result = await tryAllCandidates(async (baseUrl) => {
          const url = buildAppApiUrl(baseUrl, 'api/v2');
          if (apiKey) url.searchParams.set('apikey', apiKey);
          url.searchParams.set('cmd', 'get_activity');
          url.searchParams.set('output', 'json');
          return doFetch(url.toString(), { Accept: 'application/json' });
        });
        if (result?.ok && result.json?.response?.result === 'success') {
          status = 'up';
          const data = result.json.response.data || {};
          metrics = [
            { key: 'streams', label: 'Active Streams', value: Number(data.stream_count) || 0 },
            { key: 'transcodes', label: 'Transcoding', value: Number(data.stream_count_transcode) || 0 },
            { key: 'direct', label: 'Direct Play', value: Number(data.stream_count_direct_play) || 0 },
          ];
        } else {
          status = 'down';
        }

      // ── jellyfin / emby ──────────────────────────────────────────────────
      } else if (typeId === 'jellyfin' || typeId === 'emby') {
        const token = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => {
          const url = buildAppApiUrl(baseUrl, 'Items/Counts');
          const headers = { Accept: 'application/json' };
          if (token) headers['X-MediaBrowser-Token'] = token;
          return doFetch(url.toString(), headers);
        });
        if (result?.ok && result.json) {
          status = 'up';
          const j = result.json;
          metrics = [
            { key: 'movies', label: 'Movies', value: Number(j.MovieCount) || 0 },
            { key: 'series', label: 'TV Shows', value: Number(j.SeriesCount) || 0 },
            { key: 'episodes', label: 'Episodes', value: Number(j.EpisodeCount) || 0 },
            { key: 'songs', label: 'Songs', value: Number(j.SongCount) || 0 },
          ];
        } else {
          status = 'down';
        }

      // ── radarr ───────────────────────────────────────────────────────────
      } else if (typeId === 'radarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v3/movie').toString(), headers));
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          const total = result.json.length;
          const movieFiles = result.json.filter((m) => m.hasFile).length;
          const monitored = result.json.filter((m) => m.monitored).length;
          const unmonitored = result.json.filter((m) => !m.monitored).length;
          metrics = [
            { key: 'movies',      label: 'Movies',      value: total },
            { key: 'movie_files', label: 'Movie Files', value: movieFiles },
            { key: 'monitored',   label: 'Monitored',   value: monitored },
            { key: 'unmonitored', label: 'Unmonitored', value: unmonitored },
          ];
        } else {
          status = 'down';
        }

      // ── sonarr ───────────────────────────────────────────────────────────
      } else if (typeId === 'sonarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v3/series').toString(), headers));
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          const total = result.json.length;
          const ended = result.json.filter((s) => String(s.status || '').toLowerCase() === 'ended').length;
          const continuing = total - ended;
          const monitored = result.json.filter((s) => s.monitored).length;
          const unmonitored = result.json.filter((s) => !s.monitored).length;
          const episodes = result.json.reduce((sum, s) => sum + (Number(s.statistics?.episodeCount) || 0), 0);
          metrics = [
            { key: 'series',      label: 'Series',      value: total },
            { key: 'ended',       label: 'Ended',       value: ended },
            { key: 'continuing',  label: 'Continuing',  value: continuing },
            { key: 'monitored',   label: 'Monitored',   value: monitored },
            { key: 'unmonitored', label: 'Unmonitored', value: unmonitored },
            { key: 'episodes',    label: 'Episodes',    value: episodes },
          ];
        } else {
          status = 'down';
        }

      // ── lidarr ───────────────────────────────────────────────────────────
      } else if (typeId === 'lidarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v1/artist').toString(), headers));
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          const albumCount = result.json.reduce((sum, a) => sum + (Number(a.albumCount) || 0), 0);
          metrics = [
            { key: 'artists', label: 'Artists', value: result.json.length },
            { key: 'albums', label: 'Albums', value: albumCount },
          ];
        } else {
          status = 'down';
        }

      // ── readarr ──────────────────────────────────────────────────────────
      } else if (typeId === 'readarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v1/book').toString(), headers));
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          const authorIds = new Set(result.json.map((b) => b.authorId).filter(Boolean));
          metrics = [
            { key: 'books', label: 'Books', value: result.json.length },
            { key: 'authors', label: 'Authors', value: authorIds.size },
          ];
        } else {
          status = 'down';
        }

      // ── prowlarr ─────────────────────────────────────────────────────────
      } else if (typeId === 'prowlarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const [indexerResult, statsResult, overviewStatsResult, appsResult, fallbackClientResult] = await Promise.all([
          tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v1/indexer').toString(), headers)),
          tryCandidatePaths(['api/v1/indexerstats', 'api/v1/indexer/stats'], headers),
          tryCandidatePaths(['api/v1/stats', 'api/stats'], headers),
          tryCandidatePaths(['api/v1/applications', 'api/v1/application'], headers),
          tryCandidatePaths(['api/v1/downloadclient', 'api/v1/downloadclients'], headers),
        ]);

        if (indexerResult?.ok || statsResult?.ok || overviewStatsResult?.ok || appsResult?.ok || fallbackClientResult?.ok) {
          status = 'up';

          const indexers = toArrayPayload(indexerResult?.json);
          const activeIndexersFromList = countEnabledEntries(indexers);
          const activeIndexersFromStatsRaw = [
            pickFiniteFromObject(statsResult?.json, ['activeIndexers', 'activeIndexerCount', 'enabledIndexers', 'enabledIndexerCount']),
            pickFiniteFromObject(overviewStatsResult?.json, ['activeIndexers', 'activeIndexerCount', 'enabledIndexers', 'enabledIndexerCount']),
            pickFiniteFromPaths(statsResult?.json, ['indexers.active', 'stats.indexers.active']),
            pickFiniteFromPaths(overviewStatsResult?.json, ['indexers.active', 'stats.indexers.active']),
          ].filter((value) => value !== null);
          const activeIndexersFromStats = activeIndexersFromStatsRaw.length
            ? Math.max(...activeIndexersFromStatsRaw.map((value) => Math.max(0, Math.round(value))))
            : null;
          const activeIndexers = Math.max(
            Math.max(0, activeIndexersFromList),
            activeIndexersFromStats !== null ? Math.max(0, Math.round(activeIndexersFromStats)) : 0
          );

          const statTotalsA = extractProwlarrTotals(statsResult?.json);
          const statTotalsB = extractProwlarrTotals(overviewStatsResult?.json);
          const statTotalsC = extractProwlarrTotals(indexers);
          const totalQueries = Math.max(
            0,
            Math.round(statTotalsA.queries || 0),
            Math.round(statTotalsB.queries || 0),
            Math.round(statTotalsC.queries || 0)
          );
          const totalGrabs = Math.max(
            0,
            Math.round(statTotalsA.grabs || 0),
            Math.round(statTotalsB.grabs || 0),
            Math.round(statTotalsC.grabs || 0)
          );

          const appLinks = toArrayPayload(appsResult?.json);
          const downloadClients = toArrayPayload(fallbackClientResult?.json);
          const activeAppsFromLists = countEnabledEntries(appLinks) + countEnabledEntries(downloadClients);
          const activeAppsFromStatsRaw = [
            pickFiniteFromObject(statsResult?.json, ['activeApps', 'activeAppCount', 'activeApplications', 'activeApplicationCount']),
            pickFiniteFromObject(overviewStatsResult?.json, ['activeApps', 'activeAppCount', 'activeApplications', 'activeApplicationCount']),
            pickFiniteFromPaths(statsResult?.json, ['apps.active', 'applications.active', 'stats.apps.active', 'stats.applications.active']),
            pickFiniteFromPaths(overviewStatsResult?.json, ['apps.active', 'applications.active', 'stats.apps.active', 'stats.applications.active']),
          ].filter((value) => value !== null);
          const activeAppsFromStats = activeAppsFromStatsRaw.length
            ? Math.max(...activeAppsFromStatsRaw.map((value) => Math.max(0, Math.round(value))))
            : null;
          const activeApps = Math.max(
            Math.max(0, activeAppsFromLists),
            activeAppsFromStats !== null ? Math.max(0, Math.round(activeAppsFromStats)) : 0
          );

          metrics = [
            { key: 'active_indexers', label: 'Active Indexers', value: activeIndexers },
            { key: 'total_queries', label: 'Total Queries', value: formatCompactCount(totalQueries) },
            { key: 'total_grabs', label: 'Total Grabs', value: formatCompactCount(totalGrabs) },
            { key: 'active_apps', label: 'Active Apps', value: activeApps },
          ];
        } else {
          status = 'down';
        }

      // ── jackett ──────────────────────────────────────────────────────────
      } else if (typeId === 'jackett') {
        const result = await tryAllCandidates(async (baseUrl) => {
          const url = buildAppApiUrl(baseUrl, 'api/v2.0/indexers');
          url.searchParams.set('configured', 'true');
          if (apiKey) url.searchParams.set('apikey', apiKey);
          return doFetch(url.toString(), { Accept: 'application/json' });
        });
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          metrics = [{ key: 'configured', label: 'Configured', value: result.json.length }];
        } else {
          status = result?.status != null ? 'down' : 'unknown';
        }

      // ── bazarr ───────────────────────────────────────────────────────────
      } else if (typeId === 'bazarr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-API-KEY'] = apiKey;
        const [epResult, mvResult] = await Promise.all([
          tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/episodes/wanted').toString(), headers)),
          tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/movies/wanted').toString(), headers)),
        ]);
        if (epResult?.ok || mvResult?.ok) {
          status = 'up';
          const epTotal = Number(epResult?.json?.total) || (Array.isArray(epResult?.json?.data) ? epResult.json.data.length : 0);
          const mvTotal = Number(mvResult?.json?.total) || (Array.isArray(mvResult?.json?.data) ? mvResult.json.data.length : 0);
          metrics = [
            { key: 'episodes', label: 'Episodes Wanted', value: epTotal },
            { key: 'movies', label: 'Movies Wanted', value: mvTotal },
          ];
        } else {
          status = 'down';
        }

      // ── autobrr ──────────────────────────────────────────────────────────
      } else if (typeId === 'autobrr') {
        const autobrrHeaders = { Accept: 'application/json' };
        if (apiKey) autobrrHeaders['X-API-Token'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) =>
          doFetch(buildAppApiUrl(baseUrl, 'api/release/stats').toString(), autobrrHeaders));
        if (result?.ok && result.json && typeof result.json === 'object') {
          status = 'up';
          const j = result.json;
          metrics = [
            { key: 'filtered',        label: 'Filtered Releases', value: Number(j.filtered_count)      || 0 },
            { key: 'push_approved',   label: 'Approved Pushes',   value: Number(j.push_approved_count) || 0 },
            { key: 'push_rejected',   label: 'Rejected Pushes',   value: Number(j.push_rejected_count) || 0 },
            { key: 'push_error',      label: 'Errored Pushes',    value: Number(j.push_error_count)    || 0 },
          ];
        } else {
          status = 'down';
        }

      // ── qbittorrent ──────────────────────────────────────────────────────
      } else if (typeId === 'qbittorrent') {
        // qBittorrent may allow unauthenticated access or use session cookies.
        // Try to fetch transfer info; a 403 means auth is required (mark down for now).
        const baseUrl = candidates[0];
        const transferResult = await doFetch(
          buildAppApiUrl(baseUrl, 'api/v2/transfer/info').toString(),
          { Accept: 'application/json' },
        ).catch(() => null);
        if (transferResult?.ok && transferResult.json) {
          status = 'up';
          const info = transferResult.json;
          const dlSpeed = Number(info.dl_info_speed) || 0;
          const upSpeed = Number(info.up_info_speed) || 0;
          const torrentsResult = await doFetch(
            buildAppApiUrl(baseUrl, 'api/v2/torrents/info').toString(),
            { Accept: 'application/json' },
          ).catch(() => null);
          const torrents = Array.isArray(torrentsResult?.json) ? torrentsResult.json : [];
          const downloading = torrents.filter((t) => ['downloading', 'stalledDL', 'forcedDL'].includes(t.state)).length;
          const seeding = torrents.filter((t) => ['uploading', 'stalledUP', 'forcedUP'].includes(t.state)).length;
          metrics = [
            { key: 'downloading', label: 'Downloading', value: downloading },
            { key: 'seeding', label: 'Seeding', value: seeding },
            { key: 'dlspeed', label: 'DL Speed', value: dlSpeed >= 1048576 ? `${(dlSpeed / 1048576).toFixed(1)} MB/s` : `${Math.round(dlSpeed / 1024)} KB/s` },
            { key: 'upspeed', label: 'UL Speed', value: upSpeed >= 1048576 ? `${(upSpeed / 1048576).toFixed(1)} MB/s` : `${Math.round(upSpeed / 1024)} KB/s` },
          ];
        } else {
          status = 'down';
        }

      // ── sabnzbd ──────────────────────────────────────────────────────────
      } else if (typeId === 'sabnzbd') {
        const result = await tryAllCandidates(async (baseUrl) => {
          const url = buildAppApiUrl(baseUrl, 'api');
          url.searchParams.set('mode', 'queue');
          url.searchParams.set('output', 'json');
          if (apiKey) url.searchParams.set('apikey', apiKey);
          return doFetch(url.toString(), { Accept: 'application/json' });
        });
        if (result?.ok && result.json?.queue) {
          status = 'up';
          const q = result.json.queue;
          metrics = [
            { key: 'queued', label: 'Queued', value: Number(q.noofslots) || 0 },
            { key: 'speed', label: 'Speed', value: String(q.speed || '0 B/s') },
            { key: 'sizeleft', label: 'Remaining', value: String(q.sizeleft || '0') + ' ' + String(q.sizeleftunits || 'MB') },
          ];
        } else {
          status = 'down';
        }

      // ── nzbget ───────────────────────────────────────────────────────────
      } else if (typeId === 'nzbget') {
        const username = String(appItem.username || 'nzbget').trim();
        const password = String(appItem.password || '').trim();
        const authHeader = buildBasicAuthHeader(username, password);
        const rpcHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' };
        if (authHeader) rpcHeaders.Authorization = authHeader;

        async function nzbgetRpc(method, params) {
          return tryAllCandidates(async (baseUrl) => {
            const url = buildAppApiUrl(baseUrl, 'jsonrpc');
            return doFetch(url.toString(), rpcHeaders, {
              method: 'POST',
              body: JSON.stringify({ method, params: Array.isArray(params) ? params : [], id: 1 }),
            });
          });
        }

        const [statusResult, groupsResult] = await Promise.all([
          nzbgetRpc('status', []),
          nzbgetRpc('listgroups', [0]),
        ]);

        if ((statusResult?.ok && statusResult.json?.result) || (groupsResult?.ok && Array.isArray(groupsResult?.json?.result))) {
          status = 'up';
          const s = statusResult?.json?.result || {};
          const speed = Number(s.DownloadRate) || 0;
          const remaining = Number(s.RemainingSizeMB) || 0;
          const paused = Boolean(s.DownloadPaused);
          const groups = Array.isArray(groupsResult?.json?.result) ? groupsResult.json.result : [];
          const downloading = groups.filter((entry) => {
            const statusText = String(entry?.Status || entry?.status || '').toUpperCase();
            return statusText.includes('DOWNLOADING') || statusText.includes('FETCHING');
          }).length;
          let queued = groups.filter((entry) => {
            const statusText = String(entry?.Status || entry?.status || '').toUpperCase();
            return statusText.includes('QUEUED') || statusText.includes('PAUSED');
          }).length;
          if (groups.length && queued === 0) queued = Math.max(0, groups.length - downloading);
          metrics = [
            { key: 'downloading', label: 'Downloading', value: downloading },
            { key: 'queue', label: 'Queued', value: queued },
            { key: 'speed', label: 'Speed', value: paused ? 'Paused' : (speed >= 1048576 ? `${(speed / 1048576).toFixed(1)} MB/s` : `${Math.round(speed / 1024)} KB/s`) },
            { key: 'remaining', label: 'Remaining', value: `${remaining} MB` },
          ];
        } else {
          status = 'down';
        }

      // ── transmission ─────────────────────────────────────────────────────
      } else if (typeId === 'transmission') {
        const username = String(appItem.username || '').trim();
        const password = String(appItem.password || '').trim();
        const authHeader = buildBasicAuthHeader(username, password);
        const baseUrl = candidates[0];
        const rpcUrl = buildAppApiUrl(baseUrl, 'transmission/rpc').toString();
        const rpcHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (authHeader) rpcHeaders.Authorization = authHeader;
        rpcHeaders['X-Transmission-Session-Id'] = '0';

        async function transmissionRpc(method, args) {
          const body = JSON.stringify({ method, arguments: args || {}, tag: 1 });
          const first = await doFetch(rpcUrl, { ...rpcHeaders }, { method: 'POST', body }).catch(() => null);
          if (first?.status === 409) {
            const sessionId = String(first.headers?.get?.('X-Transmission-Session-Id') || '').trim();
            if (sessionId) {
              rpcHeaders['X-Transmission-Session-Id'] = sessionId;
              return doFetch(rpcUrl, { ...rpcHeaders }, { method: 'POST', body }).catch(() => null);
            }
          }
          return first;
        }

        function formatRate(bytesPerSecond) {
          const value = Number(bytesPerSecond) || 0;
          if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB/s`;
          return `${Math.round(value / 1024)} KB/s`;
        }

        const [sessionStatsResult, torrentsResult] = await Promise.all([
          transmissionRpc('session-stats', {}),
          transmissionRpc('torrent-get', { fields: ['id', 'status', 'rateDownload', 'rateUpload'] }),
        ]);

        if (sessionStatsResult?.ok && sessionStatsResult.json?.result === 'success') {
          status = 'up';
          const args = sessionStatsResult.json.arguments || {};
          const active = Number(args.activeTorrentCount) || 0;
          const paused = Number(args.pausedTorrentCount) || 0;
          const total = Number(args.torrentCount) || 0;
          const torrentItems = Array.isArray(torrentsResult?.json?.arguments?.torrents)
            ? torrentsResult.json.arguments.torrents
            : [];
          const downloading = torrentItems.filter((t) => Number(t?.status) === 3 || Number(t?.status) === 4).length;
          const seeding = torrentItems.filter((t) => Number(t?.status) === 5 || Number(t?.status) === 6).length;
          const dlSpeed = Number(args.downloadSpeed) || torrentItems.reduce((sum, t) => sum + (Number(t?.rateDownload) || 0), 0);
          const upSpeed = Number(args.uploadSpeed) || torrentItems.reduce((sum, t) => sum + (Number(t?.rateUpload) || 0), 0);
          metrics = [
            { key: 'active', label: 'Active', value: active },
            { key: 'paused', label: 'Paused', value: paused },
            { key: 'total', label: 'Total', value: total },
            { key: 'downloading', label: 'Downloading', value: downloading },
            { key: 'seeding', label: 'Seeding', value: seeding },
            { key: 'dlspeed', label: 'Download Speed', value: formatRate(dlSpeed) },
            { key: 'upspeed', label: 'Upload Speed', value: formatRate(upSpeed) },
          ];
        } else {
          status = 'down';
        }

      // ── maintainerr ──────────────────────────────────────────────────────
      } else if (typeId === 'maintainerr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/rules').toString(), headers));
        if (result?.ok && Array.isArray(result.json)) {
          status = 'up';
          const active = result.json.filter((r) => r.isActive !== false).length;
          metrics = [
            { key: 'rules', label: 'Total Rules', value: result.json.length },
            { key: 'active', label: 'Active', value: active },
          ];
        } else {
          status = 'down';
        }

      // ── cleanuparr ───────────────────────────────────────────────────────
      } else if (typeId === 'cleanuparr') {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        // /api/statistics is served by the SPA (returns HTML) — use /api/strikes instead
        const [healthResult, strikesResult] = await Promise.all([
          tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/health').toString(), headers)),
          tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/strikes').toString(), headers)),
        ]);
        const isUp = healthResult?.ok && healthResult.json && typeof healthResult.json === 'object' && !Array.isArray(healthResult.json);
        if (isUp || (strikesResult?.ok && strikesResult.json?.totalCount !== undefined)) {
          status = 'up';
          const j = strikesResult?.json || {};
          const items = Array.isArray(j.items) ? j.items : [];
          const removed = items.filter((i) => i.isRemoved).length;
          metrics = [
            { key: 'tracked', label: 'Tracked',  value: Number(j.totalCount) || 0 },
            { key: 'removed', label: 'Removed',  value: removed },
          ];
        } else {
          status = 'down';
        }

      // ── romm ─────────────────────────────────────────────────────────────
      } else if (typeId === 'romm') {
        const headers = { Accept: 'application/json' };
        if (apiKey) {
          headers['X-Api-Key'] = apiKey;
          headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
        }
        const authHdr = buildBasicAuthHeader(appItem.username || '', appItem.password || '');
        if (authHdr) headers.Authorization = authHdr;

        function asArray(payload, kind = 'recently-added') {
          if (Array.isArray(payload)) return payload;
          if (!payload || typeof payload !== 'object') return [];
          if (kind === 'collections') {
            const direct = payload.collections || payload.items || payload.results || payload.records || payload.data;
            if (Array.isArray(direct)) return direct;
          }
          const extracted = extractRommList(payload, kind === 'consoles' ? 'consoles' : 'recently-added');
          if (Array.isArray(extracted)) return extracted;
          const fallback = payload.items || payload.results || payload.data || payload.records || payload.consoles || payload.collections;
          return Array.isArray(fallback) ? fallback : [];
        }

        function parseCountish(value, seen = new Set()) {
          if (value === null || value === undefined || value === '') return 0;
          const direct = Number(value);
          if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
          if (typeof value === 'string') {
            const text = value.trim();
            if (!text) return 0;
            const compact = text.replace(/[\s,]+/g, '');
            const compactNum = Number(compact);
            if (Number.isFinite(compactNum)) return Math.max(0, Math.round(compactNum));
            const embedded = text.match(/(\d[\d,]*)/);
            if (embedded && embedded[1]) {
              const embeddedNum = Number(String(embedded[1]).replace(/,/g, ''));
              if (Number.isFinite(embeddedNum)) return Math.max(0, Math.round(embeddedNum));
            }
            return 0;
          }
          if (Array.isArray(value)) return value.length;
          if (typeof value !== 'object') return 0;
          if (seen.has(value)) return 0;
          seen.add(value);

          const preferred = [
            value.count,
            value.total,
            value.totalCount,
            value.totalItems,
            value.itemsCount,
            value.romCount,
            value.romsCount,
            value.rom_count,
            value.roms_count,
            value.gameCount,
            value.gamesCount,
            value.game_count,
            value.games_count,
            value.consoleCount,
            value.consolesCount,
            value.console_count,
            value.consoles_count,
            value.collectionCount,
            value.collectionsCount,
            value.collection_count,
            value.collections_count,
            value.biosCount,
            value.bios_count,
            value.saveCount,
            value.savesCount,
            value.save_count,
            value.saves_count,
            value.stats,
            value.totals,
            value.summary,
            value.meta,
            value.metadata,
            value.pagination,
            value.page,
            value.pageInfo,
          ];
          for (const candidate of preferred) {
            const parsed = parseCountish(candidate, seen);
            if (parsed > 0) return parsed;
          }

          let best = 0;
          Object.entries(value).forEach(([rawKey, rawValue]) => {
            const key = String(rawKey || '').toLowerCase();
            if (!key) return;
            const maybeCount = key.includes('count')
              || key.includes('total')
              || key.includes('rom')
              || key.includes('game')
              || key.includes('console')
              || key.includes('collection')
              || key.includes('bios')
              || key.includes('save')
              || key.includes('item')
              || key.includes('entry');
            if (!maybeCount) return;
            const parsed = parseCountish(rawValue, seen);
            if (parsed > best) best = parsed;
          });
          return best;
        }

        function pickCount(payload, keys = []) {
          const obj = (payload && typeof payload === 'object') ? payload : null;
          if (!obj) return null;
          for (const key of keys) {
            const parts = String(key || '').split('.').filter(Boolean);
            if (!parts.length) continue;
            let cur = obj;
            let ok = true;
            for (const part of parts) {
              if (!cur || typeof cur !== 'object' || !(part in cur)) { ok = false; break; }
              cur = cur[part];
            }
            if (!ok) continue;
            const parsed = parseCountish(cur);
            if (parsed > 0) return parsed;
          }
          const fallback = parseCountish(payload);
          return Number.isFinite(fallback) ? fallback : null;
        }


        const [romsResult, consolesResult, collectionsResult, virtualCollResult, smartCollResult] = await Promise.all([
          tryAllCandidates(async (baseUrl) => {
            const url = buildAppApiUrl(baseUrl, 'api/roms');
            url.searchParams.set('limit', '1');
            url.searchParams.set('with_char_index', 'false');
            url.searchParams.set('with_filter_values', 'false');
            return doFetch(url.toString(), headers);
          }),
          tryCandidatePaths(['api/platforms', 'api/v1/platforms', 'api/consoles', 'api/v1/consoles', 'api/systems', 'api/v1/systems'], headers),
          tryCandidatePaths(['api/collections', 'api/v1/collections', 'api/collection'], headers),
          // type=collection = IGDB series/collection groupings (the user-visible "auto-collections")
          tryAllCandidates(async (baseUrl) => {
            const url = buildAppApiUrl(baseUrl, 'api/collections/virtual');
            url.searchParams.set('type', 'collection');
            return doFetch(url.toString(), headers);
          }),
          tryCandidatePaths(['api/collections/smart'], headers),
        ]);

        if ((romsResult?.ok && romsResult.json) || (consolesResult?.ok && consolesResult.json) || (collectionsResult?.ok && collectionsResult.json) || (virtualCollResult?.ok && virtualCollResult.json) || (smartCollResult?.ok && smartCollResult.json)) {
          status = 'up';
          const romsPayload = romsResult?.json;
          const consolesPayload = consolesResult?.json;
          const collectionsPayload = collectionsResult?.json;
          const virtualCollPayload = virtualCollResult?.json;
          const smartCollPayload = smartCollResult?.json;

          const romItems = asArray(romsPayload, 'recently-added');
          const consoleItems = asArray(consolesPayload, 'consoles');
          const mappedConsoleItems = consoleItems.map((entry) => mapRommConsoleItem(entry, ''));
          const consoleRomSum = mappedConsoleItems.reduce((sum, item) => sum + (Number(item?.romCount) || 0), 0);

          const games = Math.max(
            pickCount(romsPayload, ['total', 'count', 'totalItems', 'totals.roms', 'stats.roms', 'stats.games']) || 0,
            romItems.length,
            consoleRomSum
          );
          const consoles = Math.max(
            pickCount(consolesPayload, ['total', 'count', 'totalItems', 'totals.consoles', 'stats.consoles']) || 0,
            consoleItems.length
          );
          // Count by array length only — never use pickCount on these payloads since
          // each item carries rom_count which would be picked up as an aggregate count.
          const collectionItems = asArray(collectionsPayload, 'collections');
          const collections = collectionItems.length;
          const virtualCount = asArray(virtualCollPayload, 'collections').length;
          const smartCount = asArray(smartCollPayload, 'collections').length;
          const biosFromConsoleStats = mappedConsoleItems.reduce((sum, item) => {
            const biosEntry = Array.isArray(item?.stats) ? item.stats.find((stat) => String(stat?.label || '').toLowerCase() === 'bios') : null;
            return sum + parseCountish(biosEntry?.value);
          }, 0);
          const savesFromConsoleStats = mappedConsoleItems.reduce((sum, item) => {
            const savesEntry = Array.isArray(item?.stats) ? item.stats.find((stat) => String(stat?.label || '').toLowerCase() === 'saves') : null;
            return sum + parseCountish(savesEntry?.value);
          }, 0);
          // Use only explicitly-labeled stats from mapped items; sumCount's parseCountish
          // fallback would pick up rom_count when bios/save fields are absent.
          const bios = biosFromConsoleStats;
          const saves = savesFromConsoleStats;

          metrics = [
            { key: 'games', label: 'Games', value: games },
            { key: 'consoles', label: 'Consoles', value: consoles },
            { key: 'collections', label: 'Collections', value: collections },
            { key: 'virtual_collections', label: 'Virtual Collections', value: virtualCount },
            { key: 'smart_collections', label: 'Smart Collections', value: smartCount },
            { key: 'bios', label: 'BIOS', value: bios },
            { key: 'saves', label: 'Saves', value: saves },
          ];
        } else {
          status = 'down';
        }

      // ── seerr (overseerr / jellyseerr) ───────────────────────────────────
      } else if (typeId === 'seerr') {
        const seerrHeaders = { Accept: 'application/json' };
        if (apiKey) seerrHeaders['X-Api-Key'] = apiKey;
        const seerrCandidates = resolveRequestApiCandidates(appItem, req);
        // Try /request/count (requires manage-requests permission), then paginated list,
        // then public /api/v1/status as final fallback to at least show ONLINE
        let seerrResult = null;
        let seerrLastResponse = null;
        let seerrMode = 'count';
        for (const baseUrl of seerrCandidates) {
          try {
            const r = await doFetch(buildAppApiUrl(baseUrl, 'api/v1/request/count').toString(), seerrHeaders);
            seerrLastResponse = r;
            if (r?.ok) { seerrResult = r; break; }
          } catch (_e) { /* try next */ }
        }
        if (!seerrResult) {
          seerrMode = 'list';
          for (const baseUrl of seerrCandidates) {
            try {
              const url = buildAppApiUrl(baseUrl, 'api/v1/request');
              url.searchParams.set('take', '1');
              url.searchParams.set('skip', '0');
              url.searchParams.set('filter', 'all');
              const r = await doFetch(url.toString(), seerrHeaders);
              seerrLastResponse = r;
              if (r?.ok) { seerrResult = r; break; }
            } catch (_e) { /* try next */ }
          }
        }
        if (!seerrResult) {
          // Final fallback: public status endpoint (no auth needed) — at least show ONLINE
          seerrMode = 'status';
          for (const baseUrl of seerrCandidates) {
            try {
              const r = await doFetch(buildAppApiUrl(baseUrl, 'api/v1/status').toString(), { Accept: 'application/json' });
              seerrLastResponse = r;
              if (r?.ok) { seerrResult = r; break; }
            } catch (_e) { /* try next */ }
          }
        }
        if (seerrResult?.ok) {
          status = 'up';
          if (seerrMode === 'count') {
            const j = seerrResult.json || {};
            metrics = [
              { key: 'pending', label: 'Pending', value: Number(j.pending) || 0 },
              { key: 'approved', label: 'Approved', value: Number(j.approved) || 0 },
              { key: 'processing', label: 'Processing', value: Number(j.processing) || 0 },
              { key: 'available', label: 'Available', value: Number(j.available) || 0 },
            ];
            if ((Number(j.available) || 0) === 0 && (Number(j.total) || 0) > 0) {
              pushLog({ level: 'warn', app: 'seerr', action: 'widget.stats',
                message: `available=0 but total=${j.total} — raw count: ${JSON.stringify(j).slice(0, 400)}` });
            }
          } else if (seerrMode === 'list') {
            const total = Number(seerrResult.json?.pageInfo?.results
              || seerrResult.json?.pageInfo?.total
              || seerrResult.json?.total) || 0;
            metrics = [{ key: 'total', label: 'Total Requests', value: total }];
          }
          // seerrMode==='status': server is up, no request metrics (key not configured)
        } else {
          pushLog({ level: 'error', app: 'seerr', action: 'widget.stats',
            message: `All seerr endpoints failed. last HTTP=${seerrLastResponse?.status ?? 'null'} body=${String(seerrLastResponse?.text || '').slice(0, 200)} candidates=${seerrCandidates.join(', ')}` });
          status = 'down';
        }

      // ── pulsarr ──────────────────────────────────────────────────────────
      } else if (typeId === 'pulsarr') {
        const pulsarrHeaders = { Accept: 'application/json', 'X-API-Key': apiKey };
        const pulsarrCandidates = resolveRequestApiCandidates(appItem, req);
        // Fetch approval stats (totals) and all auto-approved requests (for per-content-type counts)
        const [approvalResult, autoApprovedResult] = await Promise.all([
          (async () => {
            for (const baseUrl of pulsarrCandidates) {
              try {
                const r = await doFetch(buildAppApiUrl(baseUrl, 'v1/approval/stats').toString(), pulsarrHeaders);
                if (r?.ok) return r;
              } catch (_e) { /* try next */ }
            }
            return null;
          })(),
          (async () => {
            for (const baseUrl of pulsarrCandidates) {
              try {
                const url = buildAppApiUrl(baseUrl, 'v1/approval/requests');
                url.searchParams.set('status', 'auto_approved');
                url.searchParams.set('limit', '500');
                const r = await doFetch(url.toString(), pulsarrHeaders);
                if (r?.ok) return r;
              } catch (_e) { /* try next */ }
            }
            return null;
          })(),
        ]);
        if (approvalResult?.ok || autoApprovedResult?.ok) {
          status = 'up';
          const approvalStats = approvalResult?.json?.stats || {};
          const autoApprovedReqs = Array.isArray(autoApprovedResult?.json?.approvalRequests) ? autoApprovedResult.json.approvalRequests : [];
          const movieCount = autoApprovedReqs.filter((i) => String(i?.contentType || '').toLowerCase() === 'movie').length;
          const showCount = autoApprovedReqs.filter((i) => String(i?.contentType || '').toLowerCase() === 'show').length;
          metrics = [
            { key: 'auto_approved', label: 'Auto Approved', value: Number(approvalStats.auto_approved) || 0 },
            { key: 'approved',      label: 'Approved',      value: Number(approvalStats.approved) || 0 },
            { key: 'movies',        label: 'Movies',        value: movieCount },
            { key: 'shows',         label: 'TV Shows',      value: showCount },
          ];
        } else {
          status = 'down';
        }

      // ── fallback: system status check ────────────────────────────────────
      } else {
        const headers = { Accept: 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;
        const result = await tryAllCandidates(async (baseUrl) => doFetch(buildAppApiUrl(baseUrl, 'api/v1/system/status').toString(), headers));
        status = result?.ok ? 'up' : 'down';
      }

      if (status === 'down') {
        pushLog({ level: 'error', app: typeId, action: 'widget.stats.down',
          message: `Widget stats returned down for ${typeId} (${rawAppId}). candidates: ${candidates.join(', ')}` });
      }
      return res.json({ ok: true, appId: rawAppId, typeId, status, metrics, ...(libraryInfo ? { libraryInfo } : {}) });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to fetch widget stats.' });
    }
  });

  if (!app.locals.__launcharrWidgetStatusMonitorStarted) {
    app.locals.__launcharrWidgetStatusMonitorStarted = true;
    if (!widgetStatusInternalToken) {
      pushLog({
        level: 'warn',
        app: 'widgets',
        action: 'notifications.widget-status.monitor',
        message: 'Widget status monitor disabled: missing internal token.',
      });
    } else {
      runWidgetStatusMonitorTick().catch(() => {});
      const monitorTimer = setInterval(() => {
        runWidgetStatusMonitorTick().catch(() => {});
      }, WIDGET_STATUS_MONITOR_POLL_MS);
      if (typeof monitorTimer.unref === 'function') monitorTimer.unref();
      app.locals.__launcharrWidgetStatusMonitorTimer = monitorTimer;
    }
  }

}
