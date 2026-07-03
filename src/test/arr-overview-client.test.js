import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

function createElement(id = '') {
  return {
    id,
    dataset: {},
    classList: {
      add() {},
      remove() {},
      contains() { return false; },
      toggle() {},
    },
    innerHTML: '',
    textContent: '',
    value: '',
    setAttribute() {},
    getAttribute() { return ''; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
}

describe('ARR overview browser requests', () => {
  it('preserves reverse-proxy subpaths when direct calendar fallback is needed', async () => {
    const requestedUrls = [];
    const elements = new Map([
      ['sonarr-calendar', createElement('sonarr-calendar')],
      ['sonarrCalendarGrid', createElement('sonarrCalendarGrid')],
      ['sonarrCalendarList', createElement('sonarrCalendarList')],
      ['sonarrCalendarListLabel', createElement('sonarrCalendarListLabel')],
      ['sonarrCalendarMonthLabel', createElement('sonarrCalendarMonthLabel')],
    ]);

    const context = {
      AbortController,
      Date,
      Error,
      Map,
      Promise,
      Response,
      Set,
      URL,
      console: {
        error() {},
        info() {},
        log() {},
        warn() {},
      },
      clearTimeout,
      setTimeout,
      fetch: async (input) => {
        const url = String(input || '');
        requestedUrls.push(url);
        if (url.includes('/api/arr/sonarr/')) {
          return new Response(JSON.stringify({ error: 'proxy unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      getComputedStyle() {
        return { getPropertyValue() { return ''; } };
      },
      localStorage: {
        getItem() { return ''; },
        setItem() {},
      },
      document: {
        body: createElement('body'),
        documentElement: createElement('html'),
        addEventListener() {},
        dispatchEvent() {},
        getElementById(id) {
          return elements.get(id) || null;
        },
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      },
      window: {
        ARR_OVERVIEW_CONFIG: {
          appId: 'sonarr',
          appName: 'Sonarr',
          baseUrl: 'https://apps.example.test/sonarr',
          apiKey: 'test-api-key',
          includeSoon: false,
          includeRecent: false,
          includeQueue: false,
          includeCalendar: true,
        },
        LAUNCHARR_DASHBOARD_REFRESH: null,
        addEventListener() {},
        dispatchEvent() {},
        location: {
          origin: 'https://launcharr.example.test',
          pathname: '/dashboard',
        },
        matchMedia() {
          return { matches: false };
        },
      },
    };
    context.window.window = context.window;
    context.window.document = context.document;
    context.window.localStorage = context.localStorage;
    context.window.fetch = context.fetch;
    context.window.console = context.console;
    context.globalThis = context.window;

    const script = readFileSync(resolve('public/arr-overview.js'), 'utf8');
    vm.runInNewContext(script, context);
    await new Promise((resolveTest) => setTimeout(resolveTest, 30));

    assert.ok(
      requestedUrls.some((url) => url.includes('https://apps.example.test/sonarr/api/v3/calendar')),
      `expected direct fallback to preserve /sonarr path, got: ${requestedUrls.join(', ')}`
    );
    assert.ok(
      requestedUrls.every((url) => !url.includes('https://apps.example.test/api/v3/calendar')),
      `direct fallback must not strip /sonarr path, got: ${requestedUrls.join(', ')}`
    );
  });
});
