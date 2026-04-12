import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

// Set env vars BEFORE importing the app — must happen before any dynamic import.
const testDir = join(tmpdir(), `launcharr-test-${process.pid}`);
process.env.CONFIG_PATH = join(testDir, 'config.json');
process.env.DATA_DIR = join(testDir, 'data');
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod';
process.env.PLEX_CLIENT_ID = 'test-client-id';

const { default: supertest } = await import('supertest');
const { app, resolveCookieSecureSetting } = await import('../index.js');
const {
  resetAuthRateLimits,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  checkPlexPinCreateRateLimit,
  recordPlexPinCreateRequest,
} = await import('../routes/auth.js');

const request = supertest(app);
const TEST_HOST = '127.0.0.1';
const TEST_ORIGIN = `http://${TEST_HOST}`;
const originalFetch = globalThis.fetch;

function extractCsrfToken(html) {
  const match = String(html || '').match(/name="_csrf"\s+value="([^"]+)"/i);
  return match ? match[1] : '';
}

async function getCsrfToken(agent, path) {
  const res = await agent.get(path).set('Host', TEST_HOST);
  assert.equal(res.status, 200, `expected GET ${path} to return 200`);
  const csrfToken = extractCsrfToken(res.text);
  assert.ok(csrfToken, `expected GET ${path} to render a CSRF token`);
  return csrfToken;
}

function browserHeaders(path) {
  return {
    Host: TEST_HOST,
    Origin: TEST_ORIGIN,
    Referer: `${TEST_ORIGIN}${path}`,
  };
}

function readConfig() {
  return JSON.parse(readFileSync(process.env.CONFIG_PATH, 'utf8'));
}

function writeConfig(mutator) {
  const current = readConfig();
  const next = typeof mutator === 'function' ? mutator(current) : current;
  writeFileSync(process.env.CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function postForm(agent, path, fields, refererPath = path) {
  const csrfToken = await getCsrfToken(agent, refererPath);
  return agent
    .post(path)
    .set(browserHeaders(refererPath))
    .type('form')
    .send({
      ...fields,
      _csrf: csrfToken,
    });
}

async function postJson(agent, path, body, refererPath = '/login') {
  const csrfToken = await getCsrfToken(agent, '/login');
  return agent
    .post(path)
    .set(browserHeaders(refererPath))
    .set('X-CSRF-Token', csrfToken)
    .send(body);
}

describe('resolveCookieSecureSetting', () => {
  it('defaults secure cookies on in production', () => {
    assert.equal(resolveCookieSecureSetting({ cookieSecureEnv: '', nodeEnv: 'production' }), true);
  });

  it('defaults secure cookies off outside production', () => {
    assert.equal(resolveCookieSecureSetting({ cookieSecureEnv: '', nodeEnv: 'development' }), false);
  });

  it('respects explicit COOKIE_SECURE=true', () => {
    assert.equal(resolveCookieSecureSetting({ cookieSecureEnv: 'true', nodeEnv: 'development' }), true);
  });

  it('respects explicit COOKIE_SECURE=false', () => {
    assert.equal(resolveCookieSecureSetting({ cookieSecureEnv: 'false', nodeEnv: 'production' }), false);
  });
});

describe('rate limiter helpers', () => {
  afterEach(() => resetAuthRateLimits());

  it('returns null for an unknown IP', () => {
    assert.equal(checkLoginRateLimit('1.2.3.4'), null);
  });

  it('returns null while under the failure threshold', () => {
    for (let i = 0; i < 9; i++) recordLoginFailure('1.2.3.4');
    assert.equal(checkLoginRateLimit('1.2.3.4'), null);
  });

  it('returns minutes remaining once threshold is reached', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('1.2.3.4');
    const mins = checkLoginRateLimit('1.2.3.4');
    assert.ok(mins !== null, 'should be blocked');
    assert.ok(mins >= 1, 'should report at least 1 minute remaining');
  });

  it('clearLoginFailures removes the block immediately', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('1.2.3.4');
    clearLoginFailures('1.2.3.4');
    assert.equal(checkLoginRateLimit('1.2.3.4'), null);
  });

  it('treats each IP independently', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('1.1.1.1');
    assert.ok(checkLoginRateLimit('1.1.1.1') !== null, '1.1.1.1 should be blocked');
    assert.equal(checkLoginRateLimit('2.2.2.2'), null, '2.2.2.2 should be unaffected');
  });

  it('tracks plex pin creation requests independently', () => {
    for (let i = 0; i < 30; i++) recordPlexPinCreateRequest('9.9.9.9');
    assert.ok(checkPlexPinCreateRateLimit('9.9.9.9') !== null, '9.9.9.9 should be blocked');
    assert.equal(checkPlexPinCreateRateLimit('8.8.8.8'), null, '8.8.8.8 should be unaffected');
  });
});

describe('auth routes', () => {
  before(async () => {
    const agent = supertest.agent(app);
    const csrfToken = await getCsrfToken(agent, '/setup');
    const res = await agent.post('/setup').set(browserHeaders('/setup')).type('form').send({
      username: 'testadmin',
      email: 'test@launcharr.test',
      password: 'TestPassword1!',
      confirmPassword: 'TestPassword1!',
      _csrf: csrfToken,
    });
    assert.equal(res.status, 302);
  });

  afterEach(() => {
    resetAuthRateLimits();
    globalThis.fetch = originalFetch;
  });

  it('GET /login returns 200 when an admin exists', async () => {
    const res = await request.get('/login');
    assert.equal(res.status, 200);
  });

  it('POST /login with wrong password returns 401', async () => {
    const agent = supertest.agent(app);
    const res = await postForm(agent, '/login', {
      username: 'testadmin',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
  });

  it('POST /login with correct credentials redirects to /dashboard', async () => {
    const agent = supertest.agent(app);
    const res = await postForm(agent, '/login', {
      username: 'testadmin',
      password: 'TestPassword1!',
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/dashboard'), 'should redirect to /dashboard');
  });

  it('GET /login renders Jellyfin synced login when Jellyfin is configured', async () => {
    writeConfig((config) => ({
      ...config,
      apps: [
        ...(Array.isArray(config.apps) ? config.apps.filter((appItem) => appItem?.id !== 'jellyfin') : []),
        { id: 'jellyfin', name: 'Jellyfin', localUrl: 'http://jellyfin.test:8096', remoteUrl: '', url: '', apiKey: '' },
      ],
    }));

    const res = await request.get('/login').set('Host', TEST_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, /Sign in with Jellyfin/i);
  });

  it('GET /login hides Jellyfin login when explicitly disabled', async () => {
    writeConfig((config) => ({
      ...config,
      apps: [
        ...(Array.isArray(config.apps) ? config.apps.filter((appItem) => appItem?.id !== 'jellyfin') : []),
        { id: 'jellyfin', name: 'Jellyfin', localUrl: 'http://jellyfin.test:8096', remoteUrl: '', url: '', apiKey: '', loginEnabled: false },
      ],
    }));

    const res = await request.get('/login').set('Host', TEST_HOST);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Sign in with Jellyfin/i);
  });

  it('GET /login hides Plex SSO when explicitly disabled', async () => {
    writeConfig((config) => ({
      ...config,
      apps: [
        ...(Array.isArray(config.apps) ? config.apps.filter((appItem) => appItem?.id !== 'plex') : []),
        { id: 'plex', name: 'Plex', localUrl: '', remoteUrl: '', url: '', plexToken: '', plexMachine: '', loginEnabled: false },
      ],
    }));

    const res = await request.get('/login').set('Host', TEST_HOST);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Sign in with Plex/i);
  });

  it('POST /auth/jellyfin with valid credentials redirects to /dashboard', async () => {
    writeConfig((config) => ({
      ...config,
      apps: [
        ...(Array.isArray(config.apps) ? config.apps.filter((appItem) => appItem?.id !== 'jellyfin') : []),
        { id: 'jellyfin', name: 'Jellyfin', localUrl: 'http://jellyfin.test:8096', remoteUrl: '', url: '', apiKey: '' },
      ],
    }));

    globalThis.fetch = async (input) => {
      const url = String(input || '');
      assert.match(url, /Users\/AuthenticateByName$/);
      return new Response(JSON.stringify({
        AccessToken: 'jf-token',
        User: {
          Id: 'jelly-user-1',
          Name: 'jellyuser',
          Email: 'jelly@example.test',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const agent = supertest.agent(app);
    const res = await postForm(agent, '/auth/jellyfin', {
      username: 'jellyuser',
      password: 'secret-password',
    }, '/login');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/dashboard'), 'should redirect to /dashboard');

    const follow = await agent.get('/login').set('Host', TEST_HOST);
    assert.equal(follow.status, 302);
    assert.ok(follow.headers.location?.includes('/dashboard'), 'logged-in Jellyfin session should redirect away from /login');
  });

  it('POST /login rejects a missing CSRF token when origin metadata is absent', async () => {
    const agent = supertest.agent(app);
    await getCsrfToken(agent, '/login');
    const res = await agent.post('/login').set('Host', TEST_HOST).type('form').send({
      username: 'testadmin',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 403);
  });

  it('POST /login returns 429 after 10 failed attempts', async () => {
    const agent = supertest.agent(app);
    const csrfToken = await getCsrfToken(agent, '/login');
    for (let i = 0; i < 10; i++) {
      await agent.post('/login').set(browserHeaders('/login')).type('form').send({
        username: 'testadmin',
        password: 'wrong',
        _csrf: csrfToken,
      });
    }
    const res = await agent.post('/login').set(browserHeaders('/login')).type('form').send({
      username: 'testadmin',
      password: 'wrong',
      _csrf: csrfToken,
    });
    assert.equal(res.status, 429);
  });

  it('successful login clears the rate limit counter', async () => {
    const firstAgent = supertest.agent(app);
    const firstToken = await getCsrfToken(firstAgent, '/login');
    for (let i = 0; i < 9; i++) {
      await firstAgent.post('/login').set(browserHeaders('/login')).type('form').send({
        username: 'testadmin',
        password: 'wrong',
        _csrf: firstToken,
      });
    }

    const successAgent = supertest.agent(app);
    const successRes = await postForm(successAgent, '/login', {
      username: 'testadmin',
      password: 'TestPassword1!',
    });
    assert.equal(successRes.status, 302);

    const secondAgent = supertest.agent(app);
    const secondToken = await getCsrfToken(secondAgent, '/login');
    for (let i = 0; i < 9; i++) {
      await secondAgent.post('/login').set(browserHeaders('/login')).type('form').send({
        username: 'testadmin',
        password: 'wrong',
        _csrf: secondToken,
      });
    }
    const res = await secondAgent.post('/login').set(browserHeaders('/login')).type('form').send({
      username: 'testadmin',
      password: 'wrong',
      _csrf: secondToken,
    });
    assert.equal(res.status, 401, 'should be 401 not 429 — counter was reset by successful login');
  });

  it('POST /api/plex/pin returns 429 after 30 requests from the same IP', async () => {
    const agent = supertest.agent(app);
    for (let i = 0; i < 30; i++) {
      const res = await postJson(agent, '/api/plex/pin', { pinId: '12345' }, '/auth/plex');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    }

    const res = await postJson(agent, '/api/plex/pin', { pinId: '12345' }, '/auth/plex');
    assert.equal(res.status, 429);
  });
});

describe('route guards (unauthenticated)', () => {
  it('GET / redirects to /login', async () => {
    const res = await request.get('/');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/login') || res.headers.location?.includes('/dashboard'));
  });

  it('GET /dashboard redirects to /login', async () => {
    const res = await request.get('/dashboard');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/login'), 'should redirect to /login');
  });

  it('GET /settings redirects to /login', async () => {
    const res = await request.get('/settings');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/login'), 'should redirect to /login');
  });

  it('GET /apps/plex returns 302 to /login', async () => {
    const res = await request.get('/apps/plex');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('/login'), 'should redirect to /login');
  });
});
