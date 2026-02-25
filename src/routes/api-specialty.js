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
    // URL helpers
    getAppBaseId,
    resolveLaunchUrl,
    injectBasicAuthIntoUrl,
    stripUrlEmbeddedCredentials,
    resolveAppApiCandidates,
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
    // widgets
    resolveDashboardWidgets,
    normalizeDashboardWidgetCard,
    resolveNextDashboardWidgetOrder,
    getDashboardWidgetSourceDefinition,
    normalizeDashboardWidgetToken,
    buildDashboardWidgetId,
    serializeDashboardWidgetCards,
    DASHBOARD_WIDGET_DEFAULTS,
  } = ctx;

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

  app.post('/api/widgets/cards', requireSettingsAdmin, (req, res) => {
    try {
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const existingCards = resolveDashboardWidgets(config, apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      const hasExplicitOrder = Object.prototype.hasOwnProperty.call(req.body || {}, 'order');
      const normalized = normalizeDashboardWidgetCard(req.body || {}, {
        source: DASHBOARD_WIDGET_DEFAULTS.source,
        rows: DASHBOARD_WIDGET_DEFAULTS.rows,
        columns: DASHBOARD_WIDGET_DEFAULTS.columns,
        limit: DASHBOARD_WIDGET_DEFAULTS.limit,
        refreshSeconds: DASHBOARD_WIDGET_DEFAULTS.refreshSeconds,
        autoScroll: DASHBOARD_WIDGET_DEFAULTS.autoScroll,
        order: hasExplicitOrder ? Number(req.body?.order) : resolveNextDashboardWidgetOrder(config, apps),
        visibilityRole: DASHBOARD_WIDGET_DEFAULTS.visibilityRole,
        filters: DASHBOARD_WIDGET_DEFAULTS.filters,
      });
      if (!normalized) {
        return res.status(400).json({ error: 'Invalid widget payload.' });
      }
      const sourceDef = getDashboardWidgetSourceDefinition(normalized.source);
      const sourceAppId = normalizeAppId(sourceDef?.appId || '');
      const sourceApp = apps.find((appItem) => normalizeAppId(appItem?.id) === sourceAppId && !appItem?.removed);
      if (!sourceDef || !sourceAppId || !sourceApp) {
        return res.status(400).json({ error: 'Widget source app is not configured.' });
      }
  
      let widgetId = normalizeDashboardWidgetToken(normalized.id || '') || normalizeDashboardWidgetToken(buildDashboardWidgetId());
      const existingIdSet = new Set(existingCards.map((entry) => normalizeDashboardWidgetToken(entry?.id || '')).filter(Boolean));
      if (existingIdSet.has(widgetId)) {
        const baseId = widgetId;
        let suffix = 2;
        while (existingIdSet.has(`${baseId}-${suffix}`)) suffix += 1;
        widgetId = `${baseId}-${suffix}`;
      }
  
      const nextCards = [...existingCards, { ...normalized, id: widgetId }];
      saveConfig({
        ...config,
        dashboardWidgets: serializeDashboardWidgetCards(nextCards),
      });
      const savedConfig = loadConfig();
      const savedCards = resolveDashboardWidgets(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      const savedCard = savedCards.find((entry) => normalizeDashboardWidgetToken(entry?.id || '') === widgetId) || null;
      return res.json({ ok: true, item: savedCard, items: savedCards });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to create widget card.' });
    }
  });

  app.put('/api/widgets/cards/:id', requireSettingsAdmin, (req, res) => {
    try {
      const widgetId = normalizeDashboardWidgetToken(req.params.id || '');
      if (!widgetId) return res.status(400).json({ error: 'Invalid widget id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const existingCards = resolveDashboardWidgets(config, apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      const cardIndex = existingCards.findIndex((entry) => normalizeDashboardWidgetToken(entry?.id || '') === widgetId);
      if (cardIndex === -1) return res.status(404).json({ error: 'Widget card not found.' });
      const existing = existingCards[cardIndex];
      const hasExplicitOrder = Object.prototype.hasOwnProperty.call(req.body || {}, 'order');
      const normalized = normalizeDashboardWidgetCard({
        ...existing,
        ...(req.body || {}),
        id: widgetId,
      }, {
        ...existing,
        order: hasExplicitOrder ? Number(req.body?.order) : Number(existing?.order || 0),
      }, {
        generateId: false,
      });
      if (!normalized) return res.status(400).json({ error: 'Invalid widget payload.' });
      const sourceDef = getDashboardWidgetSourceDefinition(normalized.source);
      const sourceAppId = normalizeAppId(sourceDef?.appId || '');
      const sourceApp = apps.find((appItem) => normalizeAppId(appItem?.id) === sourceAppId && !appItem?.removed);
      if (!sourceDef || !sourceAppId || !sourceApp) {
        return res.status(400).json({ error: 'Widget source app is not configured.' });
      }
  
      const nextCards = existingCards.map((entry, index) => (index === cardIndex ? normalized : entry));
      saveConfig({
        ...config,
        dashboardWidgets: serializeDashboardWidgetCards(nextCards),
      });
      const savedConfig = loadConfig();
      const savedCards = resolveDashboardWidgets(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      const savedCard = savedCards.find((entry) => normalizeDashboardWidgetToken(entry?.id || '') === widgetId) || null;
      return res.json({ ok: true, item: savedCard, items: savedCards });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to update widget card.' });
    }
  });

  app.delete('/api/widgets/cards/:id', requireSettingsAdmin, (req, res) => {
    try {
      const widgetId = normalizeDashboardWidgetToken(req.params.id || '');
      if (!widgetId) return res.status(400).json({ error: 'Invalid widget id.' });
      const config = loadConfig();
      const apps = Array.isArray(config?.apps) ? config.apps : [];
      const existingCards = resolveDashboardWidgets(config, apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      const nextCards = existingCards.filter((entry) => normalizeDashboardWidgetToken(entry?.id || '') !== widgetId);
      if (nextCards.length === existingCards.length) {
        return res.status(404).json({ error: 'Widget card not found.' });
      }
      saveConfig({
        ...config,
        dashboardWidgets: serializeDashboardWidgetCards(nextCards),
      });
      const savedConfig = loadConfig();
      const savedCards = resolveDashboardWidgets(savedConfig, Array.isArray(savedConfig?.apps) ? savedConfig.apps : apps, 'admin', {
        includeHidden: true,
        includeUnavailable: true,
      });
      return res.json({ ok: true, items: savedCards });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to delete widget card.' });
    }
  });
}
