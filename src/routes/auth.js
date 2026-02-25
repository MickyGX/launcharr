import crypto from 'crypto';

// Rate limiting for POST /login — in-memory, resets on restart (acceptable for self-hosted)
const loginAttempts = new Map(); // ip -> { failures: number, windowStart: ms }
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Returns minutes remaining if blocked, null if not blocked.
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) return null;
  if (entry.failures >= RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 60000));
  }
  return null;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { failures: 1, windowStart: now });
  } else {
    entry.failures += 1;
  }
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

// Exported for testing only
export function resetLoginAttempts() { loginAttempts.clear(); }
export { checkLoginRateLimit, recordLoginFailure, clearLoginFailures };

export function registerAuth(app, ctx) {
  const {
    loadConfig,
    saveConfig,
    hasLocalAdmin,
    resolveLocalUsers,
    serializeLocalUsers,
    verifyPassword,
    hashPassword,
    setSessionUser,
    updateUserLogins,
    resolvePublicBaseUrl,
    pushLog,
    buildAppApiUrl,
    exchangePinWithRetry,
    exchangePin,
    completePlexLogin,
    safeMessage,
    PRODUCT,
    PLATFORM,
    DEVICE_NAME,
    CLIENT_ID,
    LOCAL_AUTH_MIN_PASSWORD,
  } = ctx;

  app.get('/', (req, res) => {
    const user = req.session?.user || null;
    if (!user) return res.redirect('/login');
    return res.redirect('/dashboard');
  });

  app.get('/login', (req, res) => {
    const user = req.session?.user || null;
    if (user) return res.redirect('/dashboard');
    const config = loadConfig();
    if (!hasLocalAdmin(config)) return res.redirect('/setup');
    res.render('login', {
      title: 'Launcharr',
      product: PRODUCT,
      allowLocalLogin: true,
      error: null,
      info: null,
    });
  });

  app.post('/login', (req, res) => {
    const user = req.session?.user || null;
    if (user) return res.redirect('/dashboard');

    const ip = getClientIp(req);
    const blockedMinutes = checkLoginRateLimit(ip);
    if (blockedMinutes !== null) {
      pushLog({ level: 'warn', app: 'system', action: 'login.ratelimit', message: `Rate limit reached from ${ip}.` });
      return res.status(429).render('login', {
        title: 'Launcharr',
        product: PRODUCT,
        allowLocalLogin: true,
        error: `Too many failed login attempts. Try again in ${blockedMinutes} minute${blockedMinutes === 1 ? '' : 's'}.`,
        info: null,
      });
    }

    const config = loadConfig();
    const users = resolveLocalUsers(config);
    if (!users.length) return res.redirect('/setup');
    const identifier = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const match = users.find((entry) => {
      const username = String(entry.username || '').trim().toLowerCase();
      const email = String(entry.email || '').trim().toLowerCase();
      const candidate = identifier.toLowerCase();
      return candidate && (candidate === username || candidate === email);
    });

    if (!match || !verifyPassword(password, match)) {
      recordLoginFailure(ip);
      const nowBlocked = checkLoginRateLimit(ip);
      const suffix = nowBlocked !== null
        ? ` Too many failed attempts — try again in ${nowBlocked} minute${nowBlocked === 1 ? '' : 's'}.`
        : '';
      return res.status(401).render('login', {
        title: 'Launcharr',
        product: PRODUCT,
        allowLocalLogin: true,
        error: `Invalid username/email or password.${suffix}`,
        info: null,
      });
    }

    clearLoginFailures(ip);
    setSessionUser(req, match, 'local');
    const loginConfig = updateUserLogins(config, {
      identifier: match.email || match.username,
      launcharr: true,
    });
    if (loginConfig !== config) saveConfig(loginConfig);
    return res.redirect('/dashboard');
  });

  app.get('/setup', (req, res) => {
    const user = req.session?.user || null;
    if (user) return res.redirect('/dashboard');
    const config = loadConfig();
    if (hasLocalAdmin(config)) return res.redirect('/login');
    res.render('setup', {
      title: 'Launcharr Setup',
      minPassword: LOCAL_AUTH_MIN_PASSWORD,
      error: null,
      values: {
        username: '',
        email: '',
      },
    });
  });

  app.post('/setup', (req, res) => {
    const user = req.session?.user || null;
    if (user) return res.redirect('/dashboard');
    const config = loadConfig();
    if (hasLocalAdmin(config)) return res.redirect('/login');

    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const confirm = String(req.body?.confirmPassword || '');
    const values = { username, email };

    if (!username) {
      return res.status(400).render('setup', {
        title: 'Launcharr Setup',
        minPassword: LOCAL_AUTH_MIN_PASSWORD,
        error: 'Username is required.',
        values,
      });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).render('setup', {
        title: 'Launcharr Setup',
        minPassword: LOCAL_AUTH_MIN_PASSWORD,
        error: 'A valid email is required.',
        values,
      });
    }
    if (!password || password.length < LOCAL_AUTH_MIN_PASSWORD) {
      return res.status(400).render('setup', {
        title: 'Launcharr Setup',
        minPassword: LOCAL_AUTH_MIN_PASSWORD,
        error: `Password must be at least ${LOCAL_AUTH_MIN_PASSWORD} characters.`,
        values,
      });
    }
    if (password !== confirm) {
      return res.status(400).render('setup', {
        title: 'Launcharr Setup',
        minPassword: LOCAL_AUTH_MIN_PASSWORD,
        error: 'Passwords do not match.',
        values,
      });
    }

    const users = resolveLocalUsers(config);
    const exists = users.find((entry) => String(entry.username || '').toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(400).render('setup', {
        title: 'Launcharr Setup',
        minPassword: LOCAL_AUTH_MIN_PASSWORD,
        error: 'Username already exists.',
        values,
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const newUser = {
      username,
      email,
      role: 'admin',
      passwordHash,
      salt,
      avatar: '',
      createdBy: 'setup',
      setupAccount: true,
      systemCreated: true,
      createdAt: new Date().toISOString(),
    };

    saveConfig({ ...config, users: serializeLocalUsers([...users, newUser]) });
    setSessionUser(req, newUser, 'local');
    return res.redirect('/dashboard');
  });

  app.get('/auth/plex', async (req, res) => {
    try {
      const authBaseUrl = resolvePublicBaseUrl(req);
      pushLog({
        level: 'info',
        app: 'plex',
        action: 'login.start',
        message: 'Plex login started.',
        meta: null,
      });
      return res.render('plex-auth', {
        title: 'Plex Login',
        callbackUrl: buildAppApiUrl(authBaseUrl, 'oauth/callback').toString(),
        client: {
          id: CLIENT_ID,
          product: PRODUCT,
          platform: PLATFORM,
          deviceName: DEVICE_NAME,
        },
      });
    } catch (err) {
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'login.start',
        message: safeMessage(err) || 'Plex login failed.',
      });
      return res.status(500).send(`Login failed: ${safeMessage(err)}`);
    }
  });

  app.post('/api/plex/pin', (req, res) => {
    try {
      const pinId = String(req.body?.pinId || '').trim();
      if (!pinId) return res.status(400).json({ error: 'Missing pinId.' });
      req.session.pinId = pinId;
      req.session.pinIssuedAt = Date.now();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: safeMessage(err) || 'Failed to store PIN.' });
    }
  });

  app.get('/oauth/callback', async (req, res) => {
    try {
      const pinId = req.session?.pinId || req.query.pinId;
      if (!pinId) {
        pushLog({
          level: 'error',
          app: 'plex',
          action: 'login.callback',
          message: 'Missing PIN session.',
        });
        return res.status(400).send('Missing PIN session. Start login again.');
      }

      const pinResult = await exchangePinWithRetry(pinId);
      const authToken = pinResult?.token || null;
      if (!authToken) {
        pushLog({
          level: 'error',
          app: 'plex',
          action: 'login.callback',
          message: 'Plex login not completed.',
          // DEBUG: capture pin/attempts for Plex SSO troubleshooting
          meta: {
            pinId: String(pinId || ''),
            attempts: pinResult?.attempts || 0,
            lastError: pinResult?.error || '',
          },
        });
        return res.status(401).send('Plex login not completed. Try again.');
      }

      await completePlexLogin(req, authToken);
      res.redirect('/');
    } catch (err) {
      console.error('Plex callback failed:', err);
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'login.callback',
        message: safeMessage(err) || 'Plex login callback failed.',
      });
      const status = err?.status || 500;
      res.status(status).send(`Login failed: ${safeMessage(err)}`);
    }
  });

  app.get('/api/plex/pin/status', async (req, res) => {
    try {
      const pinId = String(req.query?.pinId || req.session?.pinId || '').trim();
      if (!pinId) return res.status(400).json({ error: 'Missing pinId.' });
      const authToken = await exchangePin(pinId);
      if (!authToken) return res.json({ ok: false });
      await completePlexLogin(req, authToken);
      return res.json({ ok: true });
    } catch (err) {
      const status = err?.status || 500;
      return res.status(status).json({ error: safeMessage(err) || 'PIN status check failed.' });
    }
  });

  app.get('/logout', (req, res) => {
    const user = req.session?.user || {};
    pushLog({
      level: 'info',
      app: 'system',
      action: 'logout',
      message: 'User logged out.',
      meta: { user: user.username || user.email || '' },
    });
    req.session = null;
    res.redirect('/');
  });
}
