import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import cookieSession from 'cookie-session';
import {
  exportJWK,
  calculateJwkThumbprint,
} from 'jose';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3333;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const CLIENT_ID = process.env.PLEX_CLIENT_ID || getOrCreatePlexClientId();
const PRODUCT = process.env.PLEX_PRODUCT || 'Launcharr';
const PLATFORM = process.env.PLEX_PLATFORM || 'Web';
const DEVICE_NAME = process.env.PLEX_DEVICE_NAME || 'Launcharr';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me';
const LOCAL_AUTH_MIN_PASSWORD = 6;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config', 'config.json');
const APP_VERSION = process.env.APP_VERSION || loadPackageVersion();
const DEFAULT_APPS_PATH = process.env.DEFAULT_APPS_PATH || path.join(__dirname, '..', 'default-apps.json');
const DEFAULT_CATEGORIES_PATH = process.env.DEFAULT_CATEGORIES_PATH || path.join(__dirname, '..', 'config', 'default-categories.json');
const CONFIG_EXAMPLE_PATH = process.env.CONFIG_EXAMPLE_PATH || path.join(__dirname, '..', 'config', 'config.example.json');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const ADMIN_USERS = parseCsv(process.env.ADMIN_USERS || '');
const ARR_APP_IDS = ['radarr', 'sonarr', 'lidarr', 'readarr'];
const DOWNLOADER_APP_IDS = ['transmission', 'nzbget'];
const MEDIA_APP_IDS = ['plex', 'jellyfin', 'emby'];
const DEFAULT_CATEGORY_ORDER = ['Admin', 'Media', 'Manager', 'Games', 'Arr Suite', 'Downloaders', 'Tools'];
const DEFAULT_CATEGORY_ICON = '/icons/category.svg';
const ARR_COMBINE_SECTIONS = [
  { key: 'downloadingSoon', elementId: 'downloading-soon' },
  { key: 'recentlyDownloaded', elementId: 'recently-downloaded' },
  { key: 'activityQueue', elementId: 'activity-queue' },
  { key: 'calendar', elementId: 'calendar' },
];
const DOWNLOADER_COMBINE_SECTIONS = [
  { key: 'activityQueue', elementId: 'activity-queue' },
];
const MEDIA_COMBINE_SECTIONS = [
  { key: 'active', elementId: 'active' },
  { key: 'recent', elementId: 'recent' },
];
const APP_OVERVIEW_ELEMENTS = {
  plex: [
    { id: 'active', name: 'Active Streams' },
    { id: 'recent', name: 'Recently Added' },
    { id: 'watchlisted', name: 'Most Watchlisted This Week' },
  ],
  jellyfin: [
    { id: 'active', name: 'Active Streams' },
    { id: 'recent', name: 'Recently Added' },
  ],
  emby: [
    { id: 'active', name: 'Active Streams' },
    { id: 'recent', name: 'Recently Added' },
  ],
  tautulli: [
    { id: 'watch-stats', name: 'Watch Statistics' },
    { id: 'watch-stats-wheel', name: 'Watch Statistics Wheel' },
  ],
  sonarr: [
    { id: 'downloading-soon', name: 'Downloading Soon' },
    { id: 'recently-downloaded', name: 'Recently Downloaded' },
    { id: 'activity-queue', name: 'Activity Queue' },
    { id: 'calendar', name: 'Calendar' },
  ],
  radarr: [
    { id: 'downloading-soon', name: 'Downloading Soon' },
    { id: 'recently-downloaded', name: 'Recently Downloaded' },
    { id: 'activity-queue', name: 'Activity Queue' },
    { id: 'calendar', name: 'Calendar' },
  ],
  lidarr: [
    { id: 'downloading-soon', name: 'Downloading Soon' },
    { id: 'recently-downloaded', name: 'Recently Downloaded' },
    { id: 'activity-queue', name: 'Activity Queue' },
    { id: 'calendar', name: 'Calendar' },
  ],
  readarr: [
    { id: 'downloading-soon', name: 'Downloading Soon' },
    { id: 'recently-downloaded', name: 'Recently Downloaded' },
    { id: 'activity-queue', name: 'Activity Queue' },
    { id: 'calendar', name: 'Calendar' },
  ],
  pulsarr: [
    { id: 'recent-requests', name: 'Recent Requests' },
    { id: 'most-watchlisted', name: 'Most Watchlisted' },
  ],
  seerr: [
    { id: 'recent-requests', name: 'Recent Requests' },
    { id: 'most-watchlisted', name: 'Most Watchlisted' },
  ],
  prowlarr: [
    { id: 'search', name: 'Indexer Search' },
  ],
  transmission: [
    { id: 'activity-queue', name: 'Download Queue' },
  ],
  nzbget: [
    { id: 'activity-queue', name: 'Download Queue' },
  ],
};
const PLEX_DISCOVERY_WATCHLISTED_URL = 'https://watch.plex.tv/discover/list/top_watchlisted';
const PLEX_DISCOVERY_CACHE_TTL_MS = 15 * 60 * 1000;
let plexDiscoveryWatchlistedCache = {
  expiresAt: 0,
  payload: null,
};
const TAUTULLI_WATCH_CARDS = [
  { id: 'top_movies', name: 'Most Watched Movies' },
  { id: 'popular_movies', name: 'Most Popular Movies' },
  { id: 'top_tv', name: 'Most Watched TV Shows' },
  { id: 'popular_tv', name: 'Most Popular TV Shows' },
  { id: 'top_music', name: 'Most Played Artists' },
  { id: 'popular_music', name: 'Most Popular Artists' },
  { id: 'top_libraries', name: 'Most Active Libraries' },
  { id: 'top_users', name: 'Most Active Users' },
  { id: 'top_platforms', name: 'Most Active Platforms' },
  { id: 'last_watched', name: 'Recently Watched' },
  { id: 'most_concurrent', name: 'Most Concurrent Streams' },
];
const LOG_BUFFER = [];
const LOG_PATH = process.env.LOG_PATH || path.join(DATA_DIR, 'logs.json');

const DEFAULT_LOG_SETTINGS = {
  maxEntries: 250,
  maxDays: 7,
  visibleRows: 10,
};

const VERSION_CACHE_TTL_MS = 10 * 60 * 1000;
let versionCache = { fetchedAt: 0, payload: null };

const DEFAULT_QUEUE_DISPLAY = {
  queueShowDetail: true,
  queueShowSubDetail: true,
  queueShowSize: true,
  queueShowProtocol: true,
  queueShowTimeLeft: true,
  queueShowProgress: true,
  queueVisibleRows: 10,
};

const DEFAULT_GENERAL_SETTINGS = {
  serverName: 'Launcharr',
  remoteUrl: '',
  localUrl: '',
  restrictGuests: false,
  autoOpenSingleAppMenuItem: false,
  hideSidebarAppSettingsLink: false,
  hideSidebarActivityLink: false,
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  appriseEnabled: false,
  appriseApiUrl: '',
  appriseMode: 'targets',
  appriseConfigKey: '',
  appriseTargets: '',
  appriseTag: '',
};

function resolveGeneralSettings(config) {
  const raw = config && typeof config.general === 'object' ? config.general : {};
  const restrictGuests = raw.restrictGuests === undefined
    ? DEFAULT_GENERAL_SETTINGS.restrictGuests
    : Boolean(raw.restrictGuests);
  const autoOpenSingleAppMenuItem = raw.autoOpenSingleAppMenuItem === undefined
    ? DEFAULT_GENERAL_SETTINGS.autoOpenSingleAppMenuItem
    : Boolean(raw.autoOpenSingleAppMenuItem);
  const hideSidebarAppSettingsLink = raw.hideSidebarAppSettingsLink === undefined
    ? DEFAULT_GENERAL_SETTINGS.hideSidebarAppSettingsLink
    : Boolean(raw.hideSidebarAppSettingsLink);
  const hideSidebarActivityLink = raw.hideSidebarActivityLink === undefined
    ? DEFAULT_GENERAL_SETTINGS.hideSidebarActivityLink
    : Boolean(raw.hideSidebarActivityLink);
  return {
    serverName: String(raw.serverName || DEFAULT_GENERAL_SETTINGS.serverName || '').trim(),
    remoteUrl: String(raw.remoteUrl || DEFAULT_GENERAL_SETTINGS.remoteUrl || '').trim(),
    localUrl: String(raw.localUrl || DEFAULT_GENERAL_SETTINGS.localUrl || '').trim(),
    restrictGuests,
    autoOpenSingleAppMenuItem,
    hideSidebarAppSettingsLink,
    hideSidebarActivityLink,
  };
}

function resolveNotificationSettings(config) {
  const raw = config && typeof config.notifications === 'object' ? config.notifications : {};
  const rawMode = String(raw.appriseMode || DEFAULT_NOTIFICATION_SETTINGS.appriseMode || '').trim().toLowerCase();
  return {
    appriseEnabled: raw.appriseEnabled === undefined
      ? DEFAULT_NOTIFICATION_SETTINGS.appriseEnabled
      : Boolean(raw.appriseEnabled),
    appriseApiUrl: String(raw.appriseApiUrl || DEFAULT_NOTIFICATION_SETTINGS.appriseApiUrl || '').trim(),
    appriseMode: rawMode === 'config-key' ? 'config-key' : 'targets',
    appriseConfigKey: String(raw.appriseConfigKey || DEFAULT_NOTIFICATION_SETTINGS.appriseConfigKey || '').trim(),
    appriseTargets: String(raw.appriseTargets || DEFAULT_NOTIFICATION_SETTINGS.appriseTargets || '').trim(),
    appriseTag: String(raw.appriseTag || DEFAULT_NOTIFICATION_SETTINGS.appriseTag || '').trim(),
  };
}

function parseAppriseTargets(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function normalizeAppriseApiBaseUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    const parsed = new URL(raw);
    const pathname = String(parsed.pathname || '')
      .replace(/\/notify(?:\/.*)?$/i, '')
      .replace(/\/+$/, '');
    parsed.pathname = pathname || '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (err) {
    return '';
  }
}

function normalizeAppriseNotifyUrl(value) {
  const base = normalizeAppriseApiBaseUrl(value);
  if (!base) return '';
  return `${base}/notify`;
}

function normalizeAppriseNotifyKeyUrl(value, key) {
  const base = normalizeAppriseApiBaseUrl(value);
  const token = String(key || '').trim();
  if (!base || !token) return '';
  return `${base}/notify/${encodeURIComponent(token)}`;
}

async function sendAppriseNotification(settings, payload = {}) {
  if (!settings?.appriseEnabled) throw new Error('Apprise notifications are disabled.');
  const mode = String(settings?.appriseMode || 'targets').trim().toLowerCase() === 'config-key'
    ? 'config-key'
    : 'targets';
  const title = String(payload.title || 'Launcharr Notification').trim();
  const body = String(payload.body || '').trim();
  const tag = String(payload.tag || settings?.appriseTag || '').trim();
  const requestBody = {
    title: title || 'Launcharr Notification',
    body: body || 'Launcharr test notification.',
    type: 'info',
    format: 'text',
  };

  let notifyUrl = '';
  if (mode === 'config-key') {
    const configKey = String(settings?.appriseConfigKey || '').trim();
    if (!configKey) throw new Error('Apprise config key is required when mode is Config Key.');
    notifyUrl = normalizeAppriseNotifyKeyUrl(settings?.appriseApiUrl, configKey);
  } else {
    notifyUrl = normalizeAppriseNotifyUrl(settings?.appriseApiUrl);
    const urls = parseAppriseTargets(settings?.appriseTargets);
    if (!urls.length) throw new Error('Add at least one Apprise target URL.');
    requestBody.urls = urls;
  }

  if (!notifyUrl) throw new Error('Apprise API URL is required.');
  if (tag) requestBody.tag = tag;

  let response = null;
  try {
    response = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const cause = err && typeof err === 'object' ? err.cause : null;
    const details = [String(err?.message || 'fetch failed').trim()].filter(Boolean);
    if (cause && typeof cause === 'object') {
      if (cause.code) details.push(`code=${cause.code}`);
      if (cause.address) details.push(`address=${cause.address}`);
      if (cause.port) details.push(`port=${cause.port}`);
    }
    throw new Error(`Failed to reach Apprise API (${details.join(', ')})`);
  }

  if (!response.ok) {
    const message = String(await response.text() || '').trim();
    throw new Error(message || `Apprise request failed (${response.status}).`);
  }
}

function normalizeLocalUsers(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const username = String(entry.username || '').trim();
      const email = String(entry.email || '').trim();
      const role = String(entry.role || 'admin').trim().toLowerCase();
      const passwordHash = String(entry.passwordHash || '').trim();
      const salt = String(entry.salt || '').trim();
      if (!username || !passwordHash || !salt) return null;
      return {
        username,
        email,
        role: normalizeLocalRole(role, 'admin'),
        passwordHash,
        salt,
        createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function normalizeLocalRole(value, fallback = 'user') {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'co-admin' || role === 'user') return role;
  const fallbackRole = String(fallback || '').trim().toLowerCase();
  if (fallbackRole === 'admin' || fallbackRole === 'co-admin' || fallbackRole === 'user') return fallbackRole;
  return 'user';
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  if (!email) return false;
  return email.includes('@');
}

function findLocalUserIndex(users, identity = {}) {
  const username = normalizeUserKey(identity.username || '');
  const email = normalizeUserKey(identity.email || '');
  if (!Array.isArray(users) || !users.length) return -1;
  return users.findIndex((entry) => {
    const entryUsername = normalizeUserKey(entry?.username || '');
    const entryEmail = normalizeUserKey(entry?.email || '');
    if (username && entryUsername === username) return true;
    if (email && entryEmail && entryEmail === email) return true;
    return false;
  });
}

function resolveLocalUsers(config) {
  return normalizeLocalUsers(config?.users);
}

function hasLocalAdmin(config) {
  return resolveLocalUsers(config).some((user) => user.role === 'admin');
}

function normalizeUserKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveUserLogins(config) {
  const raw = config && typeof config.userLogins === 'object' ? config.userLogins : {};
  const plex = raw && typeof raw.plex === 'object' ? raw.plex : {};
  const launcharr = raw && typeof raw.launcharr === 'object' ? raw.launcharr : {};
  return { plex, launcharr };
}

function updateUserLogins(config, { identifier, plex, launcharr }) {
  const key = normalizeUserKey(identifier);
  if (!key) return config;
  const store = resolveUserLogins(config);
  const now = new Date().toISOString();
  const next = {
    plex: { ...store.plex },
    launcharr: { ...store.launcharr },
  };
  if (plex) next.plex[key] = typeof plex === 'string' ? plex : now;
  if (launcharr) next.launcharr[key] = typeof launcharr === 'string' ? launcharr : now;
  return { ...config, userLogins: next };
}

function normalizePlexLastSeen(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return '';
}

function resolvePlexHistoryLastSeen(xmlText) {
  const map = {};
  const tags = String(xmlText || '').match(/<[^>]+>/g) || [];
  tags.forEach((tag) => {
    if (!/(accountID|userID|userId|accountId|username|user)=/i.test(tag)) return;
    if (!/(viewedAt|lastViewedAt|viewed_at|last_viewed_at)=/i.test(tag)) return;
    const attrs = {};
    tag.replace(/(\w+)="([^"]*)"/g, (_m, key, value) => {
      attrs[key] = value;
      return '';
    });
    const rawSeen = attrs.viewedAt || attrs.lastViewedAt || attrs.viewed_at || attrs.last_viewed_at || '';
    const seenIso = normalizePlexLastSeen(rawSeen);
    if (!seenIso) return;
    const keys = [
      attrs.accountID,
      attrs.accountId,
      attrs.userID,
      attrs.userId,
      attrs.user,
      attrs.username,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    keys.forEach((key) => {
      const existing = map[key];
      if (!existing || new Date(existing) < new Date(seenIso)) {
        map[key] = seenIso;
      }
      const lower = key.toLowerCase();
      const existingLower = map[lower];
      if (!existingLower || new Date(existingLower) < new Date(seenIso)) {
        map[lower] = seenIso;
      }
    });
  });
  return map;
}

async function fetchPlexHistoryLastSeenMap(baseUrl, token) {
  if (!baseUrl || !token) return {};
  const paths = ['/status/sessions/history/all', '/status/sessions/history'];
  for (let index = 0; index < paths.length; index += 1) {
    const url = new URL(paths[index], baseUrl);
    url.searchParams.set('X-Plex-Token', token);
    url.searchParams.set('sort', 'viewedAt:desc');
    url.searchParams.set('count', '2000');
    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/xml' } });
      const xmlText = await res.text();
      if (!res.ok) continue;
      const map = resolvePlexHistoryLastSeen(xmlText);
      if (Object.keys(map).length) return map;
    } catch (err) {
      continue;
    }
  }
  return {};
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.salt) return false;
  const candidate = hashPassword(password, user.salt);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(candidate, 'hex'),
      Buffer.from(user.passwordHash, 'hex')
    );
  } catch (err) {
    return false;
  }
}

function setSessionUser(req, user, source = 'local') {
  req.session.user = {
    username: user.username,
    email: user.email || '',
    avatar: '',
    role: user.role || 'admin',
    source,
  };
  req.session.viewRole = null;
}

function resolveCombinedQueueDisplaySettings(config, key) {
  const raw = config && typeof config[key] === 'object' ? config[key] : {};
  const rowsValue = Number(raw.queueVisibleRows);
  const queueVisibleRows = Number.isFinite(rowsValue)
    ? Math.max(5, Math.min(50, rowsValue))
    : DEFAULT_QUEUE_DISPLAY.queueVisibleRows;
  const resolveBoolean = (value, fallback) => (value === undefined ? fallback : Boolean(value));
  return {
    queueShowDetail: resolveBoolean(raw.queueShowDetail, DEFAULT_QUEUE_DISPLAY.queueShowDetail),
    queueShowSubDetail: resolveBoolean(raw.queueShowSubDetail, DEFAULT_QUEUE_DISPLAY.queueShowSubDetail),
    queueShowSize: resolveBoolean(raw.queueShowSize, DEFAULT_QUEUE_DISPLAY.queueShowSize),
    queueShowProtocol: resolveBoolean(raw.queueShowProtocol, DEFAULT_QUEUE_DISPLAY.queueShowProtocol),
    queueShowTimeLeft: resolveBoolean(raw.queueShowTimeLeft, DEFAULT_QUEUE_DISPLAY.queueShowTimeLeft),
    queueShowProgress: resolveBoolean(raw.queueShowProgress, DEFAULT_QUEUE_DISPLAY.queueShowProgress),
    queueVisibleRows,
  };
}

function slugifyId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function saveCustomIcon(iconDataUrl, targetDir, nameHint = '') {
  if (!iconDataUrl) return { iconPath: '' };
  const match = String(iconDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { iconPath: '' };
  const mime = match[1].toLowerCase();
  const data = match[2];
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  const ext = extMap[mime];
  if (!ext) return { iconPath: '' };
  const baseName = String(nameHint || '').replace(/\.[^/.]+$/, '').trim();
  const nameSlug = slugifyId(baseName);
  if (!nameSlug) return { iconPath: '' };
  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const filename = `${nameSlug}.${ext}`;
    const fullPath = path.join(targetDir, filename);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(fullPath, buffer);
    return { iconPath: filename };
  } catch (err) {
    return { iconPath: '' };
  }
}

function deleteCustomIcon(iconPath, allowedBases) {
  const safePath = String(iconPath || '').trim();
  if (!safePath.startsWith('/icons/')) return false;
  const filename = path.basename(safePath);
  const baseMatch = allowedBases.find((base) => safePath.startsWith(base));
  if (!baseMatch) return false;
  const relativeBase = baseMatch.replace(/^\/+/, '');
  const absoluteDir = path.join(__dirname, '..', 'public', relativeBase);
  const fullPath = path.join(absoluteDir, filename);
  if (!fullPath.startsWith(absoluteDir)) return false;
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return true;
  } catch (err) {
    return false;
  }
}

function saveCustomAppIcon(iconDataUrl, appId, nameHint = '') {
  if (!iconDataUrl || !appId) return { iconPath: '', iconData: '' };
  const match = String(iconDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { iconPath: '', iconData: iconDataUrl };
  const mime = match[1].toLowerCase();
  const data = match[2];
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  const ext = extMap[mime];
  if (!ext) return { iconPath: '', iconData: iconDataUrl };
  try {
    const dir = path.join(__dirname, '..', 'public', 'icons', 'custom', 'apps');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const nameSlug = slugifyId(nameHint) || 'custom-app';
    const filename = `${nameSlug}-${appId}.${ext}`;
    const fullPath = path.join(dir, filename);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(fullPath, buffer);
    return { iconPath: `/icons/custom/${filename}`, iconData: '' };
  } catch (err) {
    return { iconPath: '', iconData: iconDataUrl };
  }
}

function resolveLogSettings(config) {
  const raw = config && typeof config.logs === 'object' ? config.logs : {};
  const maxEntries = Number(raw.maxEntries);
  const maxDays = Number(raw.maxDays);
  const visibleRows = Number(raw.visibleRows);
  return {
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : DEFAULT_LOG_SETTINGS.maxEntries,
    maxDays: Number.isFinite(maxDays) && maxDays > 0 ? Math.floor(maxDays) : DEFAULT_LOG_SETTINGS.maxDays,
    visibleRows: Number.isFinite(visibleRows) && visibleRows > 0 ? Math.floor(visibleRows) : DEFAULT_LOG_SETTINGS.visibleRows,
  };
}

function applyLogRetention(entries, settings) {
  const maxEntries = settings?.maxEntries || DEFAULT_LOG_SETTINGS.maxEntries;
  const maxDays = settings?.maxDays || DEFAULT_LOG_SETTINGS.maxDays;
  const now = Date.now();
  const cutoff = Number.isFinite(maxDays) && maxDays > 0 ? now - (maxDays * 24 * 60 * 60 * 1000) : null;
  const filtered = Array.isArray(entries)
    ? entries.filter((entry) => {
        if (!cutoff) return true;
        const ts = entry && entry.ts ? Date.parse(entry.ts) : NaN;
        return Number.isFinite(ts) ? ts >= cutoff : true;
      })
    : [];
  if (!Number.isFinite(maxEntries) || maxEntries <= 0) return filtered;
  if (filtered.length <= maxEntries) return filtered;
  return filtered.slice(filtered.length - maxEntries);
}

function persistLogsToDisk(settings) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const pruned = applyLogRetention(LOG_BUFFER, settings);
    fs.writeFileSync(LOG_PATH, JSON.stringify({ items: pruned }, null, 2));
  } catch (err) {
    // avoid crashing on disk errors
  }
}

function loadLogsFromDisk(settings) {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const pruned = applyLogRetention(items, settings);
    LOG_BUFFER.splice(0, LOG_BUFFER.length, ...pruned);
  } catch (err) {
    // ignore invalid log file
  }
}

function pushLog(entry) {
  const settings = resolveLogSettings(loadConfig());
  const safeEntry = {
    ts: new Date().toISOString(),
    level: entry?.level || 'info',
    app: entry?.app || 'system',
    action: entry?.action || 'event',
    message: entry?.message || '',
    meta: entry?.meta || null,
  };
  LOG_BUFFER.push(safeEntry);
  const pruned = applyLogRetention(LOG_BUFFER, settings);
  if (pruned.length !== LOG_BUFFER.length) {
    LOG_BUFFER.splice(0, LOG_BUFFER.length, ...pruned);
  }
  persistLogsToDisk(settings);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.locals.assetVersion = normalizeVersionTag(APP_VERSION || '') || String(APP_VERSION || 'dev');
  const generalSettings = resolveGeneralSettings(loadConfig());
  res.locals.autoOpenSingleAppMenuItem = Boolean(generalSettings.autoOpenSingleAppMenuItem);
  next();
});
app.use(
  cookieSession({
    name: 'launcharr_session',
    secret: SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureEnv(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);

loadLogsFromDisk(resolveLogSettings(loadConfig()));
// DEBUG: confirm Plex client id creation on startup.
console.log(`[plex] client id=${CLIENT_ID}`);

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
    return res.status(401).render('login', {
      title: 'Launcharr',
      product: PRODUCT,
      allowLocalLogin: true,
      error: 'Invalid username/email or password.',
      info: null,
    });
  }

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
    createdAt: new Date().toISOString(),
  };

  saveConfig({ ...config, users: [...users, newUser] });
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
      baseUrl: authBaseUrl,
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


app.get('/dashboard', requireUser, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const appBaseUrls = buildAppBaseUrls(apps, req);
  const arrDashboardCombine = resolveArrDashboardCombineSettings(config, apps);
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  const arrCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'arrCombinedQueueDisplay');
  const downloaderCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'downloaderCombinedQueueDisplay');
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  const dashboardCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? config.dashboardCombinedSettings
    : {};
  const dashboardCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? config.dashboardCombinedOrder
    : {};
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const rankCategory = buildCategoryRank(categoryOrder);

  const accessibleApps = apps.filter((appItem) => canAccess(appItem, role, 'overview'));
  const appById = new Map(accessibleApps.map((appItem) => [appItem.id, appItem]));
  const elementsByAppId = new Map(
    accessibleApps.map((appItem) => [appItem.id, mergeOverviewElementSettings(appItem)])
  );
  const dashboardModules = accessibleApps
    .map((appItem) => ({
      app: appItem,
      elements: (elementsByAppId.get(appItem.id) || []).filter((item) => item.enable && item.dashboard),
    }))
    .filter((entry) => entry.elements.length)
    .flatMap((entry) =>
      entry.elements.map((element) => ({
        app: entry.app,
        element,
        category: entry.app.category || 'Tools',
      }))
    )
    .sort((a, b) => {
      const orderDelta = (a.element.order || 0) - (b.element.order || 0);
      if (orderDelta !== 0) return orderDelta;
      return String(a.element.name || '').localeCompare(String(b.element.name || ''));
    })
    .map((item) => ({
      ...item,
      arrCombined: null,
      downloaderCombined: null,
      mediaCombined: null,
    }));

  const buildSectionModules = (appIds, elementId) => appIds
    .map((appId) => {
      const app = appById.get(appId);
      if (!app) return null;
      const elements = elementsByAppId.get(appId) || [];
      const element = elements.find((item) => item.id === elementId);
      if (!element) return null;
      return {
        app,
        element,
        category: app.category || 'Tools',
      };
    })
    .filter(Boolean);

  ARR_COMBINE_SECTIONS.forEach((section) => {
    const combinedKey = `combined:arr:${section.key}`;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (combinedSettings && (!combinedSettings.enable || !combinedSettings.dashboard)) return;
    const sectionModules = buildSectionModules(ARR_APP_IDS, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(arrDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedEntry = {
      ...leader,
      arrCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: combinedApps.map((item) => item.app.id),
        appNames: combinedApps.map((item) => item.app.name),
      },
      downloaderCombined: null,
      mediaCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      ARR_APP_IDS.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });

  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    const combinedKey = `combined:downloader:${section.key}`;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (combinedSettings && (!combinedSettings.enable || !combinedSettings.dashboard)) return;
    const sectionModules = buildSectionModules(DOWNLOADER_APP_IDS, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(downloaderDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedEntry = {
      ...leader,
      downloaderCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: combinedApps.map((item) => item.app.id),
        appNames: combinedApps.map((item) => item.app.name),
      },
      arrCombined: null,
      mediaCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      DOWNLOADER_APP_IDS.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });

  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    const combinedKey = `combined:media:${section.key}`;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (combinedSettings && (!combinedSettings.enable || !combinedSettings.dashboard)) return;
    const sectionModules = buildSectionModules(MEDIA_APP_IDS, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(mediaDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedEntry = {
      ...leader,
      mediaCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: combinedApps.map((item) => item.app.id),
        appNames: combinedApps.map((item) => item.app.name),
      },
      arrCombined: null,
      downloaderCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      MEDIA_APP_IDS.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });

  const getCombinedOrderKey = (item) => {
    if (item?.arrCombined) return `combined:arr:${item.arrCombined.sectionKey}`;
    if (item?.downloaderCombined) return `combined:downloader:${item.downloaderCombined.sectionKey}`;
    if (item?.mediaCombined) return `combined:media:${item.mediaCombined.sectionKey}`;
    return '';
  };
  const getDashboardOrder = (item) => {
    const combinedKey = getCombinedOrderKey(item);
    if (combinedKey) {
      const combinedValue = Number(dashboardCombinedOrder?.[combinedKey]);
      if (Number.isFinite(combinedValue)) return combinedValue;
    }
    const orderValue = Number(item?.element?.order);
    return Number.isFinite(orderValue) ? orderValue : 0;
  };
  dashboardModules.sort((a, b) => {
    const orderDelta = getDashboardOrder(a) - getDashboardOrder(b);
    if (orderDelta !== 0) return orderDelta;
    return String(a.element?.name || '').localeCompare(String(b.element?.name || ''));
  });

  res.render('dashboard', {
    user: req.session.user,
    apps: navApps,
    navCategories,
    appBaseUrls,
    dashboardModules,
    arrDashboardCombine,
    mediaDashboardCombine,
    arrCombinedQueueDisplay,
    downloaderCombinedQueueDisplay,
    downloaderDashboardCombine,
    tautulliCards: mergeTautulliCardSettings(apps.find((appItem) => appItem.id === 'tautulli')),
    role,
    actualRole,
  });
});

app.get('/apps/:id', requireUser, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const appBaseUrls = buildAppBaseUrls(apps, req);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'overview')) {
    return res.status(403).send('Overview access denied.');
  }

  res.render('app-overview', {
    user: req.session.user,
    role,
    actualRole,
    page: 'overview',
    apps: navApps,
    navCategories,
    appBaseUrls,
    app: appItem,
    overviewElements: mergeOverviewElementSettings(appItem),
    tautulliCards: mergeTautulliCardSettings(appItem),
  });
});

app.get('/apps/:id/activity', requireAdmin, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'overview')) {
    return res.status(403).send('Activity access denied.');
  }

  res.render('app-activity', {
    user: req.session.user,
    role,
    actualRole,
    page: 'activity',
    navCategories,
    app: appItem,
  });
});

app.get('/apps/:id/launch', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const appItem = apps.find((item) => item.id === req.params.id);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'launch')) {
    return res.status(403).send('Launch access denied.');
  }

  const deepQuery = String(req.query?.q || req.query?.query || '').trim();
  if (deepQuery) {
    const deepUrl = await resolveDeepLaunchUrl(appItem, req, {
      query: deepQuery,
      imdbId: String(req.query?.imdb || '').trim(),
      tmdbId: String(req.query?.tmdb || '').trim(),
      mediaType: String(req.query?.type || '').trim().toLowerCase(),
      plexToken: String(req.session?.authToken || appItem.plexToken || '').trim(),
    });
    if (deepUrl) return res.redirect(deepUrl);
  }

  const launchUrl = resolveLaunchUrl(appItem, req);
  if (!launchUrl) return res.status(400).send('Launch URL not configured.');

  const launchMode = resolveEffectiveLaunchMode(appItem, req, normalizeMenu(appItem));
  if (launchMode === 'iframe') {
    const navApps = getNavApps(apps, role, req, categoryOrder);
    const navCategories = buildNavCategories(navApps, categoryEntries);
    return res.render('app-launch', {
      user: req.session.user,
      role,
      actualRole,
      page: 'launch',
      navCategories,
      app: appItem,
      launchUrl,
    });
  }

  return res.redirect(launchUrl);
});

app.get('/apps/:id/settings', requireAdmin, (req, res) => {
  const config = loadConfig();
  const admins = loadAdmins();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'settings')) {
    return res.status(403).send('App settings access denied.');
  }

  res.render('app-settings', {
    user: req.session.user,
    admins,
    role,
    actualRole,
    page: 'settings',
    navCategories,
    app: appItem,
    overviewElements: mergeOverviewElementSettings(appItem),
    tautulliCards: mergeTautulliCardSettings(appItem),
  });
});

app.get('/settings', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const admins = loadAdmins();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const categoryIcons = getCategoryIconOptions();
  const appIcons = getAppIconOptions(apps);
  const arrDashboardCombine = resolveArrDashboardCombineSettings(config, apps);
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  const arrCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'arrCombinedQueueDisplay');
  const downloaderCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'downloaderCombinedQueueDisplay');
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  const dashboardCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? config.dashboardCombinedOrder
    : {};
  const dashboardCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? config.dashboardCombinedSettings
    : {};
  const logSettings = resolveLogSettings(config);
  const generalSettings = resolveGeneralSettings(config);
  const notificationSettings = resolveNotificationSettings(config);
  const notificationResult = String(req.query?.notificationResult || '').trim();
  const notificationError = String(req.query?.notificationError || '').trim();
  const localUsersResult = String(req.query?.localUsersResult || '').trim();
  const localUsersError = String(req.query?.localUsersError || '').trim();
  const localLoginStore = resolveUserLogins(config).launcharr || {};
  const sessionUser = req.session?.user || {};
  const sessionUsernameKey = normalizeUserKey(sessionUser.username || '');
  const sessionEmailKey = normalizeUserKey(sessionUser.email || '');
  const localUsers = resolveLocalUsers(config).map((entry) => {
    const usernameKey = normalizeUserKey(entry.username || '');
    const emailKey = normalizeUserKey(entry.email || '');
    const loginKey = emailKey || usernameKey;
    const isCurrentSessionUser = Boolean(
      sessionUsernameKey && sessionUsernameKey === usernameKey
      || (sessionEmailKey && emailKey && sessionEmailKey === emailKey)
    );
    return {
      ...entry,
      isCurrentSessionUser,
      lastLauncharrLogin: loginKey ? String(localLoginStore[loginKey] || '') : '',
    };
  });
  const rankCategory = buildCategoryRank(categoryOrder);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const settingsApps = [...apps].sort((a, b) => {
    const favouriteDelta = (b.favourite ? 1 : 0) - (a.favourite ? 1 : 0);
    if (favouriteDelta !== 0) return favouriteDelta;
    const categoryDelta = rankCategory(a.category) - rankCategory(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    const orderDelta = (a.order || 0) - (b.order || 0);
    if (orderDelta !== 0) return orderDelta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  const baseDashboardElements = settingsApps.flatMap((appItem) => {
    const hasOverviewAccess = canAccess(appItem, role, 'overview');
    if (!hasOverviewAccess && !DOWNLOADER_APP_IDS.includes(appItem.id)) return [];
    const elements = mergeOverviewElementSettings(appItem);
    return elements.map((element) => ({
      appId: appItem.id,
      appName: appItem.name,
      appOrder: appItem.order || 0,
      category: appItem.category || 'Tools',
      element,
      appAccess: hasOverviewAccess,
    }));
  });

  const applyCombinedDashboardElements = (items, options) => {
    const {
      appIds = [],
      sections = [],
      combineMap = {},
      labelPrefix,
      iconPath,
      combinedType,
    } = options;
    let updated = items.map((item) => ({ ...item }));
    sections.forEach((section) => {
      const availableAppIds = new Set(
        updated
          .filter((item) => item.element?.id === section.elementId)
          .map((item) => item.appId)
      );
      let combinedAppIds = appIds.filter(
        (appId) => availableAppIds.has(appId) && Boolean(combineMap?.[section.key]?.[appId])
      );
      if (!combinedAppIds.length) {
        combinedAppIds = appIds.filter((appId) => availableAppIds.has(appId));
      }
      const leaderId = combinedAppIds[0] || appIds.find((appId) => availableAppIds.has(appId));
      const leaderItem = updated.find((item) =>
        (leaderId ? item.appId === leaderId : appIds.includes(item.appId))
        && item.element?.id === section.elementId
      );
      if (!leaderItem) return;
      const combinedName = `${labelPrefix} ${leaderItem.element?.name || section.elementId}`;
      updated.push({
        ...leaderItem,
        displayName: combinedName,
        iconPath,
        combined: true,
        combinedType,
        combinedSection: section.key,
        combinedApps: combinedAppIds,
      });
    });
    return updated;
  };

  const arrCombinedElements = applyCombinedDashboardElements(baseDashboardElements, {
    appIds: ARR_APP_IDS,
    sections: ARR_COMBINE_SECTIONS,
    combineMap: arrDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: '/icons/arr-suite.svg',
    combinedType: 'arr',
  });
  const downloaderCombinedElements = applyCombinedDashboardElements(arrCombinedElements, {
    appIds: DOWNLOADER_APP_IDS,
    sections: DOWNLOADER_COMBINE_SECTIONS,
    combineMap: downloaderDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: '/icons/download.svg',
    combinedType: 'downloader',
  });
  const combinedDashboardElements = applyCombinedDashboardElements(downloaderCombinedElements, {
    appIds: MEDIA_APP_IDS,
    sections: MEDIA_COMBINE_SECTIONS,
    combineMap: mediaDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: '/icons/media-play.svg',
    combinedType: 'media',
  });
  const normalizedCombinedDashboardElements = combinedDashboardElements.map((item) => {
    if (!item?.combined || item.combinedType !== 'media') return item;
    const selectedApps = Array.isArray(item.combinedApps) ? item.combinedApps.filter(Boolean) : [];
    if (selectedApps.length !== 1) return item;
    const sourceId = selectedApps[0];
    const iconPath = sourceId === 'jellyfin'
      ? '/icons/jellyfin.png'
      : (sourceId === 'emby'
        ? '/icons/emby.png'
        : (sourceId === 'plex' ? '/icons/plex.png' : item.iconPath));
    return { ...item, iconPath };
  });

  const getCombinedOrderKey = (item) => {
    if (!item || !item.combined) return '';
    const section = item.combinedSection || item.element?.id || 'unknown';
    return `combined:${item.combinedType || 'mixed'}:${section}`;
  };
  const getDashboardOrder = (item) => {
    if (item?.combined) {
      const combinedKey = getCombinedOrderKey(item);
      const combinedValue = Number(dashboardCombinedOrder?.[combinedKey]);
      if (Number.isFinite(combinedValue)) return combinedValue;
    }
    const orderValue = Number(item?.element?.order);
    return Number.isFinite(orderValue) ? orderValue : 0;
  };
  const dashboardElements = normalizedCombinedDashboardElements.sort((a, b) => {
    const orderDelta = getDashboardOrder(a) - getDashboardOrder(b);
    if (orderDelta !== 0) return orderDelta;
    const appNameDelta = String(a.appName || '').localeCompare(String(b.appName || ''));
    if (appNameDelta !== 0) return appNameDelta;
    return String(a.element.name || '').localeCompare(String(b.element.name || ''));
  });
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const systemIconDefaults = getDefaultSystemIconOptions();
  const systemIconCustom = getCustomSystemIconOptions();
  const appIconDefaults = getDefaultAppIconOptions(apps);
  const appIconCustom = getCustomAppIconOptions();

  res.render('settings', {
    user: req.session.user,
    admins,
    apps: settingsApps,
    categories: categoryOrder,
    categoryEntries,
    categoryIcons,
    appIcons,
    tautulliCards: mergeTautulliCardSettings(apps.find((appItem) => appItem.id === 'tautulli')),
    dashboardElements,
    dashboardCombinedOrder,
    dashboardCombinedSettings,
    systemIconDefaults,
    systemIconCustom,
    appIconDefaults,
    appIconCustom,
    arrApps: settingsApps.filter((appItem) => ARR_APP_IDS.includes(appItem.id)),
    arrDashboardCombine,
    arrCombinedQueueDisplay,
    mediaApps: settingsApps.filter((appItem) => MEDIA_APP_IDS.includes(appItem.id)),
    mediaDashboardCombine,
    downloaderApps: apps.filter((appItem) => DOWNLOADER_APP_IDS.includes(appItem.id)),
    downloaderDashboardCombine,
    downloaderCombinedQueueDisplay,
    logSettings,
    generalSettings,
    notificationSettings,
    notificationResult,
    notificationError,
    localUsers,
    localUsersResult,
    localUsersError,
    navCategories,
    coAdmins: loadCoAdmins(),
    role,
    actualRole,
  });
});

app.post('/settings/dashboard-elements', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const shouldUpdateTautulliCards = Boolean(req.body.tautulliCardsForm);
  const dashboardCombinedOrder = {};
  Object.entries(req.body || {}).forEach(([key, value]) => {
    if (!key.startsWith('dashboard_combined_') || !key.endsWith('_order')) return;
    const raw = Number(value);
    if (!Number.isFinite(raw)) return;
    const bodyKey = key.slice('dashboard_combined_'.length, -'_order'.length);
    const parts = bodyKey.split('_');
    if (parts.length < 2) return;
    const combinedType = parts.shift();
    const combinedSection = parts.join('_');
    const mapKey = `combined:${combinedType}:${combinedSection}`;
    dashboardCombinedOrder[mapKey] = raw;
  });
  const dashboardCombinedSettings = {};
  ARR_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:arr:${section.key}`;
    dashboardCombinedSettings[mapKey] = {
      enable: Boolean(req.body[`dashboard_combined_arr_${section.key}_enable`]),
      dashboard: Boolean(req.body[`dashboard_combined_arr_${section.key}_dashboard`]),
    };
  });
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:downloader:${section.key}`;
    dashboardCombinedSettings[mapKey] = {
      enable: Boolean(req.body[`dashboard_combined_downloader_${section.key}_enable`]),
      dashboard: Boolean(req.body[`dashboard_combined_downloader_${section.key}_dashboard`]),
    };
  });
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:media:${section.key}`;
    dashboardCombinedSettings[mapKey] = {
      enable: Boolean(req.body[`dashboard_combined_media_${section.key}_enable`]),
      dashboard: Boolean(req.body[`dashboard_combined_media_${section.key}_dashboard`]),
    };
  });
  const apps = (config.apps || []).map((appItem) => ({
    ...appItem,
    overviewElements: buildDashboardElementsFromRequest(appItem, req.body),
    tautulliCards: shouldUpdateTautulliCards
      ? buildTautulliCardsFromDashboardRequest(appItem, req.body)
      : appItem.tautulliCards,
  }));
  const arrDashboardCombine = resolveArrDashboardCombineSettings(config, apps);
  ARR_COMBINE_SECTIONS.forEach((section) => {
    arrDashboardCombine[section.key] = arrDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => ARR_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `arr_combine_${section.key}_${appItem.id}`;
        arrDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    downloaderDashboardCombine[section.key] = downloaderDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => DOWNLOADER_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `downloader_combine_${section.key}_${appItem.id}`;
        downloaderDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    mediaDashboardCombine[section.key] = mediaDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => MEDIA_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `media_combine_${section.key}_${appItem.id}`;
        mediaDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const arrCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'arrCombinedQueueDisplay');
  arrCombinedQueueDisplay.queueShowDetail = Boolean(req.body.arr_combined_queue_col_detail);
  arrCombinedQueueDisplay.queueShowSubDetail = Boolean(req.body.arr_combined_queue_col_subdetail);
  arrCombinedQueueDisplay.queueShowSize = Boolean(req.body.arr_combined_queue_col_size);
  arrCombinedQueueDisplay.queueShowProtocol = Boolean(req.body.arr_combined_queue_col_protocol);
  arrCombinedQueueDisplay.queueShowTimeLeft = Boolean(req.body.arr_combined_queue_col_timeleft);
  arrCombinedQueueDisplay.queueShowProgress = Boolean(req.body.arr_combined_queue_col_progress);
  const arrQueueRows = Number(req.body.arr_combined_queue_visible_rows);
  if (Number.isFinite(arrQueueRows)) {
    arrCombinedQueueDisplay.queueVisibleRows = Math.max(5, Math.min(50, arrQueueRows));
  }

  const downloaderCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'downloaderCombinedQueueDisplay');
  downloaderCombinedQueueDisplay.queueShowDetail = Boolean(req.body.downloader_combined_queue_col_detail);
  downloaderCombinedQueueDisplay.queueShowSubDetail = Boolean(req.body.downloader_combined_queue_col_subdetail);
  downloaderCombinedQueueDisplay.queueShowSize = Boolean(req.body.downloader_combined_queue_col_size);
  downloaderCombinedQueueDisplay.queueShowProtocol = Boolean(req.body.downloader_combined_queue_col_protocol);
  downloaderCombinedQueueDisplay.queueShowTimeLeft = Boolean(req.body.downloader_combined_queue_col_timeleft);
  downloaderCombinedQueueDisplay.queueShowProgress = Boolean(req.body.downloader_combined_queue_col_progress);
  const downloaderQueueRows = Number(req.body.downloader_combined_queue_visible_rows);
  if (Number.isFinite(downloaderQueueRows)) {
    downloaderCombinedQueueDisplay.queueVisibleRows = Math.max(5, Math.min(50, downloaderQueueRows));
  }

  saveConfig({
    ...config,
    apps,
    arrDashboardCombine,
    mediaDashboardCombine,
    downloaderDashboardCombine,
    arrCombinedQueueDisplay,
    downloaderCombinedQueueDisplay,
    dashboardCombinedOrder,
    dashboardCombinedSettings,
  });
  res.redirect('/settings');
});

app.get('/user-settings', requireUser, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries);
  const generalSettings = resolveGeneralSettings(config);
  const profileResult = String(req.query?.profileResult || '').trim();
  const profileError = String(req.query?.profileError || '').trim();
  const localUsers = resolveLocalUsers(config);
  const localUserIndex = findLocalUserIndex(localUsers, {
    username: req.session?.user?.username,
    email: req.session?.user?.email,
  });
  const localProfile = localUserIndex >= 0 ? localUsers[localUserIndex] : null;
  const isLocalUser = String(req.session?.user?.source || '').trim().toLowerCase() === 'local' && Boolean(localProfile);

  res.render('user-settings', {
    user: req.session.user,
    role,
    actualRole,
    navCategories,
    generalSettings,
    isLocalUser,
    localProfile,
    profileResult,
    profileError,
  });
});

app.post('/user-settings/profile', requireUser, (req, res) => {
  const source = String(req.session?.user?.source || '').trim().toLowerCase();
  if (source !== 'local') {
    return res.redirect('/user-settings?profileError=Only+local+Launcharr+accounts+can+edit+profile+details.');
  }

  const config = loadConfig();
  const users = resolveLocalUsers(config);
  const index = findLocalUserIndex(users, {
    username: req.session?.user?.username,
    email: req.session?.user?.email,
  });
  if (index < 0) {
    return res.redirect('/user-settings?profileError=Local+account+record+was+not+found.');
  }

  const currentUser = users[index];
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!username) {
    return res.redirect('/user-settings?profileError=Username+is+required.');
  }
  if (email && !isValidEmail(email)) {
    return res.redirect('/user-settings?profileError=A+valid+email+is+required.');
  }
  if (newPassword && newPassword.length < LOCAL_AUTH_MIN_PASSWORD) {
    return res.redirect(`/user-settings?profileError=Password+must+be+at+least+${LOCAL_AUTH_MIN_PASSWORD}+characters.`);
  }
  if (newPassword && newPassword !== confirmPassword) {
    return res.redirect('/user-settings?profileError=Passwords+do+not+match.');
  }

  const nextUsernameKey = normalizeUserKey(username);
  const nextEmailKey = normalizeUserKey(email);
  const duplicate = users.find((entry, entryIndex) => {
    if (entryIndex === index) return false;
    const entryUsername = normalizeUserKey(entry?.username || '');
    const entryEmail = normalizeUserKey(entry?.email || '');
    if (entryUsername && nextUsernameKey && entryUsername === nextUsernameKey) return true;
    if (entryEmail && nextEmailKey && entryEmail === nextEmailKey) return true;
    return false;
  });
  if (duplicate) {
    return res.redirect('/user-settings?profileError=Username+or+email+is+already+in+use.');
  }

  const nextUser = {
    ...currentUser,
    username,
    email,
  };
  if (newPassword) {
    const salt = crypto.randomBytes(16).toString('hex');
    nextUser.salt = salt;
    nextUser.passwordHash = hashPassword(newPassword, salt);
  }

  const nextUsers = [...users];
  nextUsers[index] = nextUser;
  saveConfig({ ...config, users: nextUsers });
  setSessionUser(req, nextUser, 'local');

  return res.redirect('/user-settings?profileResult=saved');
});

app.post('/settings/local-users', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const users = resolveLocalUsers(config);
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const role = normalizeLocalRole(req.body?.role, 'user');

  if (!username) return res.redirect('/settings?tab=user&localUsersError=Username+is+required.');
  if (email && !isValidEmail(email)) return res.redirect('/settings?tab=user&localUsersError=A+valid+email+is+required.');
  if (!password || password.length < LOCAL_AUTH_MIN_PASSWORD) {
    return res.redirect(`/settings?tab=user&localUsersError=Password+must+be+at+least+${LOCAL_AUTH_MIN_PASSWORD}+characters.`);
  }

  const usernameKey = normalizeUserKey(username);
  const emailKey = normalizeUserKey(email);
  const duplicate = users.find((entry) => {
    const entryUsername = normalizeUserKey(entry?.username || '');
    const entryEmail = normalizeUserKey(entry?.email || '');
    if (entryUsername && usernameKey && entryUsername === usernameKey) return true;
    if (entryEmail && emailKey && entryEmail === emailKey) return true;
    return false;
  });
  if (duplicate) return res.redirect('/settings?tab=user&localUsersError=Username+or+email+already+exists.');

  const salt = crypto.randomBytes(16).toString('hex');
  const newUser = {
    username,
    email,
    role,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  saveConfig({ ...config, users: [...users, newUser] });
  return res.redirect('/settings?tab=user&localUsersResult=added');
});

app.post('/settings/local-users/role', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const users = resolveLocalUsers(config);
  const username = String(req.body?.username || '').trim();
  const role = normalizeLocalRole(req.body?.role, 'user');
  if (!username) return res.redirect('/settings?tab=user&localUsersError=Missing+username.');
  const index = users.findIndex((entry) => normalizeUserKey(entry?.username || '') === normalizeUserKey(username));
  if (index < 0) return res.redirect('/settings?tab=user&localUsersError=Launcharr+user+not+found.');

  const currentSessionSource = String(req.session?.user?.source || '').trim().toLowerCase();
  const isCurrentSessionUser = currentSessionSource === 'local'
    && normalizeUserKey(req.session?.user?.username || '') === normalizeUserKey(users[index].username || '');
  if (isCurrentSessionUser && role !== 'admin') {
    return res.redirect('/settings?tab=user&localUsersError=You+cannot+change+your+current+session+role+away+from+admin.');
  }
  if (users[index].role === 'admin' && role !== 'admin') {
    const otherAdminExists = users.some((entry, entryIndex) => entryIndex !== index && entry.role === 'admin');
    if (!otherAdminExists) {
      return res.redirect('/settings?tab=user&localUsersError=At+least+one+local+admin+is+required.');
    }
  }

  const nextUsers = [...users];
  nextUsers[index] = { ...nextUsers[index], role };
  saveConfig({ ...config, users: nextUsers });
  return res.redirect('/settings?tab=user&localUsersResult=role-saved');
});

// DEPRECATED: Legacy endpoint kept for compatibility with older clients.
// Remove in v0.3.0 after confirming no callers remain.
app.post('/user-settings/access', requireActualAdmin, (req, res) => {
  pushLog({
    level: 'warning',
    app: 'settings',
    action: 'user-settings.access.deprecated',
    message: 'Deprecated endpoint /user-settings/access was used. Remove in v0.3.0.',
  });
  const config = loadConfig();
  const generalSettings = resolveGeneralSettings(config);
  const restrictGuests = Boolean(req.body?.restrictGuests);
  const nextGeneral = {
    ...generalSettings,
    restrictGuests,
  };
  saveConfig({ ...config, general: nextGeneral });
  res.redirect('/settings?tab=user');
});

app.post('/settings/categories', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const parsedBody = String(req.body?.categories_json || '').trim();
  let requestedCategories = [];

  if (parsedBody) {
    try {
      const parsed = JSON.parse(parsedBody);
      if (Array.isArray(parsed)) requestedCategories = parsed;
    } catch (err) {
      requestedCategories = [];
    }
  }

  const categoryEntries = normalizeCategoryEntries(requestedCategories);
  const nextEntries = categoryEntries.length
    ? categoryEntries
    : loadDefaultCategories();
  const nextCategories = nextEntries.map((entry) => entry.name);
  const fallbackCategory = nextCategories.find((item) => item.toLowerCase() === 'tools')
    || nextCategories[0]
    || 'Tools';
  const categoryKeys = new Set(nextCategories.map((item) => item.toLowerCase()));
  const apps = (config.apps || []).map((appItem) => {
    const currentCategory = String(appItem?.category || '').trim().toLowerCase();
    if (currentCategory && categoryKeys.has(currentCategory)) return appItem;
    return {
      ...appItem,
      category: fallbackCategory,
    };
  });

  saveConfig({ ...config, categories: nextEntries, apps });
  res.redirect('/settings');
});

app.post('/settings/admins', requireSettingsAdmin, (req, res) => {
  const admins = parseCsv(req.body.admins || '');
  saveAdmins(admins);
  res.redirect('/settings');
});

app.post('/settings/apps', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const categoryOrder = resolveCategoryOrder(config, config.apps || [], { includeAppCategories: false });
  const categoryKeys = new Set(categoryOrder.map((item) => item.toLowerCase()));
  const fallbackCategory = categoryOrder.find((item) => item.toLowerCase() === 'utilities')
    || categoryOrder[0]
    || 'Tools';
  const apps = (config.apps || []).map((appItem) => {
    const id = appItem.id;
    const enableAdmin = Boolean(req.body[`display_enable_${id}`]);
    const overviewUserValue = req.body[`display_overview_user_${id}`];
    const launchModeInput = req.body[`display_launch_mode_${id}`];
    const launchUserValue = req.body[`display_launch_user_${id}`];
    const favouriteValue = Boolean(req.body[`display_favourite_${id}`]);
    const categoryValue = req.body[`display_category_${id}`];
    const orderValue = req.body[`display_order_${id}`];
    const parsedOrder = Number(orderValue);
    const currentLaunchMode = resolveAppLaunchMode(appItem, normalizeMenu(appItem));
    const launchMode = normalizeLaunchMode(launchModeInput, currentLaunchMode);
    const launchEnabled = launchMode !== 'disabled';
    const isCustom = Boolean(appItem.custom);
    const menu = {
      overview: {
        user: isCustom ? false : Boolean(overviewUserValue),
        admin: isCustom ? false : enableAdmin,
      },
      launch: {
        user: Boolean(launchUserValue) && launchEnabled,
        admin: enableAdmin && launchEnabled,
      },
      settings: {
        user: false,
        admin: enableAdmin,
      },
    };

    return {
      ...appItem,
      favourite: favouriteValue,
      category: categoryKeys.has(String(categoryValue || '').trim().toLowerCase())
        ? categoryValue
        : (categoryKeys.has(String(appItem.category || '').trim().toLowerCase()) ? appItem.category : fallbackCategory),
      order: Number.isFinite(parsedOrder) ? parsedOrder : appItem.order,
      launchMode,
      menu,
    };
  });
  const arrDashboardCombine = resolveArrDashboardCombineSettings(config, apps);
  ARR_COMBINE_SECTIONS.forEach((section) => {
    arrDashboardCombine[section.key] = arrDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => ARR_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `arr_combine_${section.key}_${appItem.id}`;
        arrDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    downloaderDashboardCombine[section.key] = downloaderDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => DOWNLOADER_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `downloader_combine_${section.key}_${appItem.id}`;
        downloaderDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    mediaDashboardCombine[section.key] = mediaDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => MEDIA_APP_IDS.includes(appItem.id))
      .forEach((appItem) => {
        const field = `media_combine_${section.key}_${appItem.id}`;
        mediaDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const arrCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'arrCombinedQueueDisplay');
  arrCombinedQueueDisplay.queueShowDetail = Boolean(req.body.arr_combined_queue_col_detail);
  arrCombinedQueueDisplay.queueShowSubDetail = Boolean(req.body.arr_combined_queue_col_subdetail);
  arrCombinedQueueDisplay.queueShowSize = Boolean(req.body.arr_combined_queue_col_size);
  arrCombinedQueueDisplay.queueShowProtocol = Boolean(req.body.arr_combined_queue_col_protocol);
  arrCombinedQueueDisplay.queueShowTimeLeft = Boolean(req.body.arr_combined_queue_col_timeleft);
  arrCombinedQueueDisplay.queueShowProgress = Boolean(req.body.arr_combined_queue_col_progress);
  const arrQueueRows = Number(req.body.arr_combined_queue_visible_rows);
  if (Number.isFinite(arrQueueRows)) {
    arrCombinedQueueDisplay.queueVisibleRows = Math.max(5, Math.min(50, arrQueueRows));
  }

  const downloaderCombinedQueueDisplay = resolveCombinedQueueDisplaySettings(config, 'downloaderCombinedQueueDisplay');
  downloaderCombinedQueueDisplay.queueShowDetail = Boolean(req.body.downloader_combined_queue_col_detail);
  downloaderCombinedQueueDisplay.queueShowSubDetail = Boolean(req.body.downloader_combined_queue_col_subdetail);
  downloaderCombinedQueueDisplay.queueShowSize = Boolean(req.body.downloader_combined_queue_col_size);
  downloaderCombinedQueueDisplay.queueShowProtocol = Boolean(req.body.downloader_combined_queue_col_protocol);
  downloaderCombinedQueueDisplay.queueShowTimeLeft = Boolean(req.body.downloader_combined_queue_col_timeleft);
  downloaderCombinedQueueDisplay.queueShowProgress = Boolean(req.body.downloader_combined_queue_col_progress);
  const downloaderQueueRows = Number(req.body.downloader_combined_queue_visible_rows);
  if (Number.isFinite(downloaderQueueRows)) {
    downloaderCombinedQueueDisplay.queueVisibleRows = Math.max(5, Math.min(50, downloaderQueueRows));
  }

  saveConfig({
    ...config,
    apps,
    arrDashboardCombine,
    mediaDashboardCombine,
    downloaderDashboardCombine,
    arrCombinedQueueDisplay,
    downloaderCombinedQueueDisplay,
  });
  res.redirect('/settings');
});

app.post('/settings/icons/upload', requireSettingsAdmin, (req, res) => {
  const iconType = String(req.body?.icon_type || '').trim().toLowerCase();
  const iconData = String(req.body?.icon_data || '').trim();
  const iconName = String(req.body?.icon_name || '').trim();
  const iconBase = iconName.replace(/\.[^/.]+$/, '').trim();
  if (!iconBase) {
    res.redirect('/settings?tab=custom&iconError=1');
    return;
  }
  const targetDir = iconType === 'app'
    ? path.join(__dirname, '..', 'public', 'icons', 'custom', 'apps')
    : path.join(__dirname, '..', 'public', 'icons', 'custom', 'system');
  saveCustomIcon(iconData, targetDir, iconBase);
  res.redirect('/settings?tab=custom');
});

app.post('/settings/icons/delete', requireSettingsAdmin, (req, res) => {
  const iconType = String(req.body?.icon_type || '').trim().toLowerCase();
  const iconPath = String(req.body?.icon_path || '').trim();
  const allowedBases = iconType === 'app'
    ? ['/icons/custom/apps', '/icons/custom']
    : ['/icons/custom/system'];
  deleteCustomIcon(iconPath, allowedBases);
  res.redirect('/settings?tab=custom');
});

app.post('/settings/general', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const serverName = String(req.body?.server_name || '').trim();
  const remoteUrl = String(req.body?.remote_url || '').trim();
  const localUrl = String(req.body?.local_url || '').trim();
  const restrictGuests = Boolean(req.body?.restrictGuests);
  const autoOpenSingleAppMenuItem = Boolean(req.body?.autoOpenSingleAppMenuItem);
  const hideSidebarAppSettingsLink = Boolean(req.body?.hideSidebarAppSettingsLink);
  const hideSidebarActivityLink = Boolean(req.body?.hideSidebarActivityLink);
  const nextGeneral = {
    serverName: serverName || DEFAULT_GENERAL_SETTINGS.serverName,
    remoteUrl,
    localUrl,
    restrictGuests,
    autoOpenSingleAppMenuItem,
    hideSidebarAppSettingsLink,
    hideSidebarActivityLink,
  };
  saveConfig({ ...config, general: nextGeneral });
  res.redirect('/settings');
});

function buildNotificationSettingsFromBody(body, currentSettings = DEFAULT_NOTIFICATION_SETTINGS) {
  const fallback = currentSettings || DEFAULT_NOTIFICATION_SETTINGS;
  const rawMode = String(body?.apprise_mode || fallback.appriseMode || '').trim().toLowerCase();
  return {
    appriseEnabled: Boolean(body?.apprise_enabled),
    appriseApiUrl: String(body?.apprise_api_url || fallback.appriseApiUrl || '').trim(),
    appriseMode: rawMode === 'config-key' ? 'config-key' : 'targets',
    appriseConfigKey: String(body?.apprise_config_key || fallback.appriseConfigKey || '').trim(),
    appriseTargets: String(body?.apprise_targets || fallback.appriseTargets || '').trim(),
    appriseTag: String(body?.apprise_tag || fallback.appriseTag || '').trim(),
  };
}

app.post('/settings/notifications', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const currentSettings = resolveNotificationSettings(config);
  const nextSettings = buildNotificationSettingsFromBody(req.body, currentSettings);
  saveConfig({ ...config, notifications: nextSettings });
  res.redirect('/settings?tab=notifications&notificationResult=saved');
});

app.post('/settings/notifications/test', requireSettingsAdmin, async (req, res) => {
  const config = loadConfig();
  const currentSettings = resolveNotificationSettings(config);
  const nextSettings = buildNotificationSettingsFromBody(req.body, currentSettings);
  saveConfig({ ...config, notifications: nextSettings });

  try {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await sendAppriseNotification(nextSettings, {
      title: 'Launcharr test notification',
      body: `Launcharr sent this Apprise test notification at ${timestamp}.`,
      tag: nextSettings.appriseTag,
    });
    pushLog({
      level: 'info',
      app: 'settings',
      action: 'notifications.apprise.test',
      message: 'Apprise test notification sent successfully.',
    });
    res.redirect('/settings?tab=notifications&notificationResult=test-ok');
  } catch (err) {
    const errorMessage = String(err?.message || 'Unknown Apprise error.').trim();
    pushLog({
      level: 'error',
      app: 'settings',
      action: 'notifications.apprise.test',
      message: 'Apprise test notification failed.',
      meta: { error: errorMessage },
    });
    const encoded = encodeURIComponent(errorMessage.slice(0, 240));
    res.redirect(`/settings?tab=notifications&notificationResult=test-error&notificationError=${encoded}`);
  }
});

app.post('/settings/custom-apps', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || '').trim();
  const iconData = String(req.body?.iconData || '').trim();
  const iconPath = String(req.body?.iconPath || '').trim();
  if (!name) return res.status(400).json({ error: 'Missing app name.' });

  const categoryOrder = resolveCategoryOrder(config, config.apps || [], { includeAppCategories: false });
  const categoryKeys = new Set(categoryOrder.map((item) => item.toLowerCase()));
  const fallbackCategory = categoryOrder.find((item) => item.toLowerCase() === 'utilities')
    || categoryOrder[0]
    || 'Tools';
  const resolvedCategory = categoryKeys.has(category.toLowerCase()) ? category : fallbackCategory;

  const slug = slugifyId(name) || 'custom-app';
  const id = `custom-${slug}-${crypto.randomBytes(3).toString('hex')}`;
  let iconValue = '';
  if (iconPath) {
    iconValue = iconPath;
  } else if (iconData) {
    const iconResult = saveCustomAppIcon(iconData, id, name);
    iconValue = iconResult.iconPath || iconResult.iconData || '';
  }

  const apps = Array.isArray(config.apps) ? config.apps : [];
  const maxOrder = Math.max(0, ...apps.filter((app) => app.category === resolvedCategory).map((app) => Number(app.order) || 0));
  const appItem = {
    id,
    name,
    category: resolvedCategory,
    order: maxOrder + 1,
    favourite: false,
    custom: true,
    icon: iconValue,
    url: '',
    localUrl: '',
    remoteUrl: '',
    apiKey: '',
    menu: {
      overview: { user: false, admin: false },
      launch: { user: true, admin: true },
      settings: { user: false, admin: true },
    },
    launchMode: 'new-tab',
  };

  saveConfig({ ...config, apps: [...apps, appItem] });
  res.json({ ok: true, app: appItem });
});

app.post('/settings/custom-apps/delete', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing app id.' });

  const apps = Array.isArray(config.apps) ? config.apps : [];
  const appItem = apps.find((app) => app.id === id);
  if (!appItem || !appItem.custom) return res.status(404).json({ error: 'Custom app not found.' });

  if (appItem.icon && appItem.icon.startsWith('/icons/custom/')) {
    const iconPath = path.join(__dirname, '..', 'public', appItem.icon.replace(/^\/+/, ''));
    if (fs.existsSync(iconPath)) {
      try {
        fs.unlinkSync(iconPath);
      } catch (err) {
        // ignore delete errors
      }
    }
  }

  saveConfig({ ...config, apps: apps.filter((app) => app.id !== id) });
  res.json({ ok: true });
});

app.post('/settings/custom-apps/update', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const id = String(req.body?.id || '').trim();
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || '').trim();
  const iconData = String(req.body?.iconData || '').trim();
  const iconPath = String(req.body?.iconPath || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing app id.' });
  if (!name) return res.status(400).json({ error: 'Missing app name.' });

  const apps = Array.isArray(config.apps) ? config.apps : [];
  const appIndex = apps.findIndex((app) => app.id === id && app.custom);
  if (appIndex === -1) return res.status(404).json({ error: 'Custom app not found.' });

  const categoryOrder = resolveCategoryOrder(config, apps, { includeAppCategories: false });
  const categoryKeys = new Set(categoryOrder.map((item) => item.toLowerCase()));
  const fallbackCategory = categoryOrder.find((item) => item.toLowerCase() === 'utilities')
    || categoryOrder[0]
    || 'Tools';
  const resolvedCategory = categoryKeys.has(category.toLowerCase()) ? category : fallbackCategory;

  const current = apps[appIndex];
  let iconValue = current.icon || '';
  if (iconPath) {
    if (iconValue.startsWith('/icons/custom/')) {
      const iconFile = path.join(__dirname, '..', 'public', iconValue.replace(/^\/+/, ''));
      if (fs.existsSync(iconFile)) {
        try {
          fs.unlinkSync(iconFile);
        } catch (err) {
          // ignore delete errors
        }
      }
    }
    iconValue = iconPath;
  } else if (iconData) {
    if (iconValue.startsWith('/icons/custom/')) {
      const iconPath = path.join(__dirname, '..', 'public', iconValue.replace(/^\/+/, ''));
      if (fs.existsSync(iconPath)) {
        try {
          fs.unlinkSync(iconPath);
        } catch (err) {
          // ignore delete errors
        }
      }
    }
    const iconResult = saveCustomAppIcon(iconData, id, name);
    iconValue = iconResult.iconPath || iconResult.iconData || '';
  }

  const nextApp = {
    ...current,
    name,
    category: resolvedCategory,
    icon: iconValue,
  };
  const nextApps = [...apps];
  nextApps[appIndex] = nextApp;
  saveConfig({ ...config, apps: nextApps });
  res.json({ ok: true, app: nextApp });
});

app.post('/settings/logs', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const maxEntries = Number(req.body?.log_max_entries);
  const maxDays = Number(req.body?.log_max_days);
  const visibleRows = Number(req.body?.log_visible_rows);
  const nextSettings = {
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : DEFAULT_LOG_SETTINGS.maxEntries,
    maxDays: Number.isFinite(maxDays) && maxDays > 0 ? Math.floor(maxDays) : DEFAULT_LOG_SETTINGS.maxDays,
    visibleRows: Number.isFinite(visibleRows) && visibleRows > 0 ? Math.floor(visibleRows) : DEFAULT_LOG_SETTINGS.visibleRows,
  };
  const nextConfig = { ...config, logs: nextSettings };
  saveConfig(nextConfig);
  const pruned = applyLogRetention(LOG_BUFFER, nextSettings);
  LOG_BUFFER.splice(0, LOG_BUFFER.length, ...pruned);
  persistLogsToDisk(nextSettings);
  res.redirect('/settings');
});

app.get('/settings/plex-users', requireSettingsAdmin, async (req, res) => {
  const config = loadConfig();
  const plexApp = Array.isArray(config.apps)
    ? config.apps.find((appItem) => normalizeAppId(appItem?.id) === 'plex')
    : null;
  const admins = loadAdmins();
  const ownerKey = admins[0] ? String(admins[0]).toLowerCase() : '';
  const identifiers = [
    req.session?.user?.username,
    req.session?.user?.email,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const isOwner = ownerKey ? identifiers.includes(ownerKey) : true;
  const token = String((isOwner ? req.session?.authToken : '') || plexApp?.plexToken || '').trim();
  if (!token) return res.status(401).json({ error: 'Missing Plex token.' });

  try {
    pushLog({
      level: 'info',
      app: 'plex',
      action: 'users',
      message: 'Fetching Plex users.',
    });
    const url = `https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(token)}`;
    const plexRes = await fetch(url, {
      headers: {
        ...plexHeaders(),
        Accept: 'application/xml',
      },
    });
    const xmlText = await plexRes.text();
    if (!plexRes.ok) {
      return res.status(plexRes.status).json({ error: 'Failed to fetch Plex users.' });
    }

    const machineId = String(plexApp?.plexMachine || '').trim();
    const users = parsePlexUsers(xmlText, { machineId });
    const coAdmins = loadCoAdmins();
    const loginStore = resolveUserLogins(config);
    let plexHistory = {};
    if (plexApp) {
      const sessionServerToken = String(req.session?.plexServerToken || '').trim();
      let serverToken = sessionServerToken || String(plexApp.plexToken || '').trim();
      if (!serverToken) {
        const sessionToken = String(req.session?.authToken || '').trim();
        if (sessionToken) {
          try {
            const resources = await fetchPlexResources(sessionToken);
            serverToken = resolvePlexServerToken(resources, {
              machineId,
              localUrl: plexApp?.localUrl,
              remoteUrl: plexApp?.remoteUrl,
              plexHost: plexApp?.plexHost,
            }) || '';
          } catch (err) {
            serverToken = '';
          }
        }
      }
      if (serverToken) {
        const candidates = uniqueList([
          normalizeBaseUrl(resolveLaunchUrl(plexApp, req)),
          normalizeBaseUrl(plexApp.localUrl || ''),
          normalizeBaseUrl(plexApp.remoteUrl || ''),
          normalizeBaseUrl(plexApp.url || ''),
        ]).filter(Boolean);
        for (let index = 0; index < candidates.length; index += 1) {
          const baseUrl = candidates[index];
          plexHistory = await fetchPlexHistoryLastSeenMap(baseUrl, serverToken);
          if (Object.keys(plexHistory).length) break;
        }
      }
    }
    const hasPlexHistory = Object.keys(plexHistory).length > 0;

    const payload = users.map((user) => {
      const name = user.title || user.username || user.email || 'Plex User';
      const identifier = user.email || user.username || user.title || user.id || name;
      const identLower = normalizeUserKey(identifier);
      const historySeen = plexHistory[String(user.id || '').trim()]
        || plexHistory[String(user.uuid || '').trim()]
        || plexHistory[identLower]
        || '';
      const lastPlexSeen = hasPlexHistory
        ? historySeen
        : (normalizePlexLastSeen(user.lastSeenAt) || loginStore.plex?.[identLower] || '');
      const lastLauncharrLogin = loginStore.launcharr?.[identLower] || '';
      let role = 'user';
      let locked = false;

      if (ownerKey && identLower === ownerKey) {
        role = 'admin';
        locked = true;
      } else if (admins.some((admin) => String(admin).toLowerCase() === identLower)) {
        role = 'admin';
      } else if (coAdmins.some((coAdmin) => String(coAdmin).toLowerCase() === identLower)) {
        role = 'co-admin';
      }

      return {
        id: user.id || user.uuid || identifier,
        name,
        username: user.username || '',
        email: user.email || '',
        identifier,
        lastPlexSeen,
        lastLauncharrLogin,
        role,
        locked,
      };
    });

    pushLog({
      level: 'info',
      app: 'plex',
      action: 'users',
      message: 'Plex users loaded.',
      meta: { count: payload.length },
    });
    return res.json({ users: payload });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'users',
      message: safeMessage(err) || 'Failed to fetch Plex users.',
    });
    return res.status(500).json({ error: safeMessage(err) });
  }
});

app.post('/settings/roles', requireSettingsAdmin, (req, res) => {
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const admins = loadAdmins();
  const owner = admins[0] ? String(admins[0]) : '';
  const ownerKey = owner.toLowerCase();
  const nextAdmins = owner ? [owner] : [];
  const nextCoAdmins = [];

  roles.forEach((entry) => {
    const identifier = String(entry?.identifier || '').trim();
    if (!identifier) return;
    const role = String(entry?.role || 'user').toLowerCase();
    if (ownerKey && identifier.toLowerCase() === ownerKey) return;
    if (role === 'admin') nextAdmins.push(identifier);
    if (role === 'co-admin') nextCoAdmins.push(identifier);
  });

  saveAdmins(uniqueList(nextAdmins));
  saveCoAdmins(uniqueList(nextCoAdmins));

  res.json({ ok: true });
});


app.post('/apps/:id/settings', requireAdmin, (req, res) => {
  const config = loadConfig();
  const shouldUpdateOverviewElements = Boolean(req.body.overviewElementsForm);
  const shouldUpdateTautulliCards = Boolean(req.body.tautulliCardsForm);
  const isDisplayOnlyUpdate = shouldUpdateOverviewElements || shouldUpdateTautulliCards;
  const plexAdminUser = String(req.body?.plexAdminUser || '').trim();
  const shouldIgnoreJwtToken = (value) => {
    const raw = String(value || '').trim();
    return raw && raw.split('.').length >= 3;
  };
  const apps = (config.apps || []).map((appItem) => {
    if (appItem.id !== req.params.id) return appItem;
    const overviewElements = shouldUpdateOverviewElements
      ? buildOverviewElementsFromRequest(appItem, req.body)
      : appItem.overviewElements;
    const tautulliCards = shouldUpdateTautulliCards
      ? buildTautulliCardsFromRequest(appItem, req.body)
      : appItem.tautulliCards;
    return {
      ...appItem,
      localUrl: isDisplayOnlyUpdate
        ? appItem.localUrl || ''
        : (req.body.localUrl !== undefined ? req.body.localUrl : (appItem.localUrl || '')),
      remoteUrl: isDisplayOnlyUpdate
        ? appItem.remoteUrl || ''
        : (req.body.remoteUrl !== undefined ? req.body.remoteUrl : (appItem.remoteUrl || '')),
      apiKey: isDisplayOnlyUpdate
        ? appItem.apiKey || ''
        : (req.body.apiKey !== undefined ? req.body.apiKey : (appItem.apiKey || '')),
      username: isDisplayOnlyUpdate
        ? appItem.username || ''
        : (req.body.username !== undefined ? req.body.username : (appItem.username || '')),
      password: isDisplayOnlyUpdate
        ? appItem.password || ''
        : (req.body.password !== undefined ? req.body.password : (appItem.password || '')),
      plexToken: (() => {
        if (isDisplayOnlyUpdate) return appItem.plexToken || '';
        const nextToken = req.body.plexToken !== undefined ? req.body.plexToken : (appItem.plexToken || '');
        if (appItem.id === 'plex' && shouldIgnoreJwtToken(nextToken)) {
          pushLog({
            level: 'error',
            app: 'plex',
            action: 'token.save',
            message: 'Rejected Plex auth JWT. Server token required.',
          });
          return appItem.plexToken || '';
        }
        return nextToken;
      })(),
      plexMachine: isDisplayOnlyUpdate
        ? appItem.plexMachine || ''
        : (req.body.plexMachine !== undefined ? req.body.plexMachine : (appItem.plexMachine || '')),
      overviewElements,
      tautulliCards,
    };
  });
  saveConfig({ ...config, apps });
  if (!isDisplayOnlyUpdate && req.params.id === 'plex' && plexAdminUser) {
    saveAdmins([plexAdminUser]);
  }
  const fromSettings = String(req.query?.from || req.body?.from || '').trim().toLowerCase();
  if (fromSettings === 'settings' || fromSettings === '1' || fromSettings === 'true') {
    const appId = encodeURIComponent(String(req.params.id || '').trim());
    return res.redirect(`/settings?tab=app&app=${appId}`);
  }
  res.redirect(`/apps/${req.params.id}/settings`);
});

app.get('/api/plex/token', requireAdmin, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const plexApp = apps.find((appItem) => appItem.id === 'plex');
  const sessionToken = String(req.session?.authToken || '').trim();
  const sessionServerToken = String(req.session?.plexServerToken || '').trim();
  const fallbackToken = String(plexApp?.plexToken || '').trim();
  const token = sessionServerToken || fallbackToken || sessionToken;
  if (!token) return res.status(400).json({ error: 'Missing Plex token.' });

  (async () => {
    if (sessionServerToken) return { token: sessionServerToken };
    if (!sessionToken) return { token };
    try {
      const resources = await fetchPlexResources(sessionToken);
      const serverToken = resolvePlexServerToken(resources, {
        machineId: String(plexApp?.plexMachine || '').trim(),
        localUrl: plexApp?.localUrl,
        remoteUrl: plexApp?.remoteUrl,
        plexHost: plexApp?.plexHost,
      });
      if (serverToken) return { token: serverToken };
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'token.resolve',
        message: 'Plex server token could not be resolved.',
        meta: {
          machineId: String(plexApp?.plexMachine || '').trim(),
          localUrl: plexApp?.localUrl || '',
          remoteUrl: plexApp?.remoteUrl || '',
        },
      });
      return { error: 'Unable to resolve Plex server token. Set Plex Machine/URL and try again.' };
    } catch (err) {
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'token.resolve',
        message: safeMessage(err) || 'Plex server token lookup failed.',
      });
      return { error: 'Plex server token lookup failed.' };
    }
  })()
    .then((payload) => res.json(payload))
    .catch(() => res.json({ error: 'Plex server token lookup failed.' }));
});

app.get('/api/plex/machine', requireAdmin, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const plexApp = apps.find((appItem) => appItem.id === 'plex');
  if (!plexApp) return res.status(404).json({ error: 'Plex app is not configured.' });
  const token = String(req.session?.authToken || plexApp.plexToken || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing Plex token.' });

  const candidates = uniqueList([
    normalizeBaseUrl(plexApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(plexApp, req)),
    normalizeBaseUrl(plexApp.localUrl || ''),
    normalizeBaseUrl(plexApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Plex URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const machineId = await resolvePlexMachineIdentifier({ baseUrl, token });
      if (machineId) return res.json({ machineId });
      lastError = 'Unable to resolve Plex machine identifier.';
    } catch (err) {
      lastError = safeMessage(err) || 'Failed to reach Plex.';
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to reach Plex.' });
});

app.get('/api/version', requireUser, async (_req, res) => {
  const current = normalizeVersionTag(APP_VERSION || '');
  const now = Date.now();
  if (versionCache.payload && (now - versionCache.fetchedAt) < VERSION_CACHE_TTL_MS) {
    return res.json({ ...versionCache.payload, current });
  }
  try {
    const latest = await fetchLatestDockerTag();
    const payload = {
      current,
      latest,
      upToDate: Boolean(current && latest && current === latest),
    };
    versionCache = { fetchedAt: now, payload };
    return res.json(payload);
  } catch (err) {
    const payload = { current, latest: '', upToDate: true };
    versionCache = { fetchedAt: now, payload };
    return res.json(payload);
  }
});

app.get('/api/plex/discovery/watchlisted', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const plexApp = apps.find((appItem) => appItem.id === 'plex');
  if (!plexApp) return res.status(404).json({ error: 'Plex app is not configured.' });
  if (!canAccess(plexApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Plex overview access denied.' });
  }

  try {
    const payload = await getPlexDiscoveryWatchlisted();
    pushLog({
      level: 'info',
      app: 'plex',
      action: 'discovery.watchlisted',
      message: 'Plex discovery watchlisted fetched.',
      meta: { cached: Boolean(payload?.cached), count: Array.isArray(payload?.items) ? payload.items.length : 0 },
    });
    return res.json(payload);
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'discovery.watchlisted',
      message: safeMessage(err) || 'Failed to fetch Plex discovery items.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch Plex discovery items.' });
  }
});

app.get('/api/plex/discovery/details', requireUser, async (req, res) => {
  const ratingKey = String(req.query.ratingKey || '').trim();
  const kind = String(req.query.kind || '').trim().toLowerCase();
  const slug = String(req.query.slug || '').trim();
  if (!ratingKey && (!slug || (kind !== 'movie' && kind !== 'tv'))) {
    return res.status(400).json({ error: 'Missing metadata identifier.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const plexApp = apps.find((appItem) => appItem.id === 'plex');
  if (!plexApp) return res.status(404).json({ error: 'Plex app is not configured.' });
  if (!canAccess(plexApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Plex overview access denied.' });
  }

  const token = String(req.session?.authToken || plexApp.plexToken || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing Plex token.' });

  try {
    const resolvedRatingKey = ratingKey || await resolvePlexDiscoverRatingKey({ kind, slug, token });
    const metadata = resolvedRatingKey
      ? await fetchPlexDiscoveryMetadata(resolvedRatingKey, token)
      : { summary: '', studio: '', contentRating: '', tagline: '', year: '' };
    let watchlist = { allowed: false };
    if (slug && (kind === 'movie' || kind === 'tv')) {
      const actions = await fetchPlexDiscoveryActions({ kind, slug, token });
      watchlist = buildWatchlistStateFromActions(actions);
    }
    pushLog({
      level: 'info',
      app: 'plex',
      action: 'discovery.details',
      message: 'Plex discovery details fetched.',
      meta: { ratingKey: resolvedRatingKey || '', kind: kind || '', hasSlug: Boolean(slug) },
    });
    return res.json({ ...metadata, ratingKey: resolvedRatingKey || '', watchlist });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'discovery.details',
      message: safeMessage(err) || 'Failed to fetch details.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch details.' });
  }
});

app.post('/api/plex/discovery/watchlist', requireUser, async (req, res) => {
  const kind = String(req.body?.kind || '').trim().toLowerCase();
  const slug = String(req.body?.slug || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!slug || (kind !== 'movie' && kind !== 'tv')) {
    return res.status(400).json({ error: 'Missing item identifier.' });
  }
  if (action !== 'add' && action !== 'remove') {
    return res.status(400).json({ error: 'Invalid watchlist action.' });
  }

  const token = String(req.session?.authToken || '').trim();
  if (!token) return res.status(401).json({ error: 'You must sign in with Plex to update watchlist.' });

  try {
    await updatePlexWatchlist({ kind, slug, action, token });
    const watchlist = await fetchPlexWatchlistState({ kind, slug, token });
    pushLog({
      level: 'info',
      app: 'plex',
      action: 'discovery.watchlist',
      message: `Plex watchlist ${action}.`,
      meta: { kind, slug },
    });
    return res.json({ ok: true, watchlist });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'discovery.watchlist',
      message: safeMessage(err) || 'Failed to update watchlist.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to update watchlist.' });
  }
});

function resolveJellyfinCandidates(appItem, req) {
  return uniqueList([
    normalizeBaseUrl(appItem?.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req)),
    normalizeBaseUrl(appItem?.localUrl || ''),
    normalizeBaseUrl(appItem?.url || ''),
  ]).filter(Boolean);
}

function resolveEmbyCandidates(appItem, req) {
  return uniqueList([
    normalizeBaseUrl(appItem?.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req)),
    normalizeBaseUrl(appItem?.localUrl || ''),
    normalizeBaseUrl(appItem?.url || ''),
  ]).filter(Boolean);
}

function buildJellyfinImageUrl({ baseUrl, itemId, type, apiKey, tag = '', index = '' }) {
  if (!baseUrl || !itemId || !type) return '';
  const safeType = String(type).trim();
  const safeId = encodeURIComponent(String(itemId).trim());
  const url = new URL(`/Items/${safeId}/Images/${safeType}${index !== '' ? `/${encodeURIComponent(String(index))}` : ''}`, baseUrl);
  if (apiKey) url.searchParams.set('api_key', apiKey);
  if (tag) url.searchParams.set('tag', String(tag));
  url.searchParams.set('quality', '90');
  return url.toString();
}

function buildEmbyImageUrl({ baseUrl, itemId, type, apiKey, tag = '', index = '' }) {
  if (!baseUrl || !itemId || !type) return '';
  const safeType = String(type).trim();
  const safeId = encodeURIComponent(String(itemId).trim());
  const url = new URL(`/emby/Items/${safeId}/Images/${safeType}${index !== '' ? `/${encodeURIComponent(String(index))}` : ''}`, baseUrl);
  if (apiKey) url.searchParams.set('api_key', apiKey);
  if (tag) url.searchParams.set('tag', String(tag));
  url.searchParams.set('quality', '90');
  return url.toString();
}

function formatDurationFromTicks(ticks) {
  const value = Number(ticks);
  if (!Number.isFinite(value) || value <= 0) return '';
  const totalMinutes = Math.round(value / 10000000 / 60);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '';
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${totalMinutes}m`;
}

function formatRelativeTime(value) {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return '';
  const diffMs = Date.now() - parsed;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function toPaddedEpisode(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(Math.floor(numeric)).padStart(2, '0');
}

function mapJellyfinKind(typeValue) {
  const raw = String(typeValue || '').trim().toLowerCase();
  if (raw === 'movie' || raw === 'trailer') return 'movie';
  return 'tv';
}

async function fetchJellyfinJson({ candidates, apiKey, path, query }) {
  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = new URL(path, baseUrl);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      upstreamUrl.searchParams.set(key, String(value));
    });
    if (apiKey) upstreamUrl.searchParams.set('api_key', apiKey);

    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Emby-Token': apiKey,
        },
      });
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        const bodyMessage = String(text || '').trim();
        lastError = `Jellyfin request failed (${upstreamRes.status}) via ${baseUrl}${bodyMessage ? `: ${bodyMessage.slice(0, 220)}` : ''}`;
        continue;
      }
      try {
        return { baseUrl, payload: JSON.parse(text || '{}') };
      } catch (err) {
        lastError = `Invalid JSON response from Jellyfin via ${baseUrl}.`;
      }
    } catch (err) {
      const reason = safeMessage(err) || 'fetch failed';
      lastError = `${reason} via ${baseUrl}`;
    }
  }
  throw new Error(lastError || 'Failed to reach Jellyfin.');
}

async function fetchJellyfinRecentItems({ candidates, apiKey, limit, mediaType }) {
  const usersResponse = await fetchJellyfinJson({
    candidates,
    apiKey,
    path: '/Users',
    query: {},
  });
  const users = Array.isArray(usersResponse.payload) ? usersResponse.payload : [];
  const activeUser = users.find((user) => !user?.Policy?.IsDisabled) || users[0];
  const userId = String(activeUser?.Id || '').trim();
  if (!userId) throw new Error('No Jellyfin user available for latest items.');

  const includeItemTypes = mediaType === 'movie'
    ? 'Movie'
    : (mediaType === 'show' ? 'Series,Episode' : 'Movie,Series,Episode');

  const latestResponse = await fetchJellyfinJson({
    candidates,
    apiKey,
    path: `/Users/${encodeURIComponent(userId)}/Items/Latest`,
    query: {
      Limit: limit,
      IncludeItemTypes: includeItemTypes,
      Fields: 'Overview,ProviderIds',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop',
    },
  });
  const items = Array.isArray(latestResponse.payload) ? latestResponse.payload : [];
  return { baseUrl: latestResponse.baseUrl, items };
}

async function fetchEmbyJson({ candidates, apiKey, path, query }) {
  let lastError = '';
  const pathCandidates = [path, `/emby${path}`];
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    for (let pathIndex = 0; pathIndex < pathCandidates.length; pathIndex += 1) {
      const attemptPath = pathCandidates[pathIndex];
      const upstreamUrl = new URL(attemptPath, baseUrl);
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        upstreamUrl.searchParams.set(key, String(value));
      });
      if (apiKey) upstreamUrl.searchParams.set('api_key', apiKey);

      try {
        const upstreamRes = await fetch(upstreamUrl.toString(), {
          headers: {
            Accept: 'application/json',
            'X-Emby-Token': apiKey,
          },
        });
        const text = await upstreamRes.text();
        if (!upstreamRes.ok) {
          const bodyMessage = String(text || '').trim();
          lastError = `Emby request failed (${upstreamRes.status}) via ${baseUrl}${bodyMessage ? `: ${bodyMessage.slice(0, 220)}` : ''}`;
          continue;
        }
        try {
          return { baseUrl, payload: JSON.parse(text || '{}') };
        } catch (err) {
          lastError = `Invalid JSON response from Emby via ${baseUrl}.`;
        }
      } catch (err) {
        const reason = safeMessage(err) || 'fetch failed';
        lastError = `${reason} via ${baseUrl}`;
      }
    }
  }
  throw new Error(lastError || 'Failed to reach Emby.');
}

async function fetchEmbyRecentItems({ candidates, apiKey, limit, mediaType }) {
  const usersResponse = await fetchEmbyJson({
    candidates,
    apiKey,
    path: '/Users',
    query: {},
  });
  const users = Array.isArray(usersResponse.payload) ? usersResponse.payload : [];
  const activeUser = users.find((user) => !user?.Policy?.IsDisabled) || users[0];
  const userId = String(activeUser?.Id || '').trim();
  if (!userId) throw new Error('No Emby user available for latest items.');

  const includeItemTypes = mediaType === 'movie'
    ? 'Movie'
    : (mediaType === 'show' ? 'Series,Episode' : 'Movie,Series,Episode');

  const latestResponse = await fetchEmbyJson({
    candidates,
    apiKey,
    path: `/Users/${encodeURIComponent(userId)}/Items/Latest`,
    query: {
      Limit: limit,
      IncludeItemTypes: includeItemTypes,
      Fields: 'Overview,ProviderIds',
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary,Backdrop',
    },
  });
  const items = Array.isArray(latestResponse.payload) ? latestResponse.payload : [];
  return { baseUrl: latestResponse.baseUrl, items };
}

app.get('/api/jellyfin/active', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const jellyfinApp = apps.find((appItem) => appItem.id === 'jellyfin');
  if (!jellyfinApp) return res.status(404).json({ error: 'Jellyfin app is not configured.' });
  if (!canAccess(jellyfinApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Jellyfin overview access denied.' });
  }

  const apiKey = String(jellyfinApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Jellyfin API key.' });

  const candidates = resolveJellyfinCandidates(jellyfinApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Jellyfin URL.' });

  try {
    const sessionResponse = await fetchJellyfinJson({
      candidates,
      apiKey,
      path: '/Sessions',
      query: { ActiveWithinSeconds: 21600 },
    });
    const sessions = Array.isArray(sessionResponse.payload) ? sessionResponse.payload : [];
    const items = sessions
      .filter((session) => session && session.NowPlayingItem && session.NowPlayingItem.Id)
      .map((session) => {
        const media = session.NowPlayingItem || {};
        const kind = mapJellyfinKind(media.Type);
        const seriesName = String(media.SeriesName || '').trim();
        const season = toPaddedEpisode(media.ParentIndexNumber);
        const episode = toPaddedEpisode(media.IndexNumber);
        const episodeCode = season && episode ? `S${season}E${episode}` : '';
        const subtitle = kind === 'tv'
          ? [seriesName || String(media.Name || '').trim(), episodeCode].filter(Boolean).join(' ')
          : '';
        const runtime = formatDurationFromTicks(media.RunTimeTicks);
        const user = String(session.UserName || '').trim();
        const device = String(session.Client || session.DeviceName || '').trim();
        const playState = session.PlayState || {};
        const progress = Number(media.RunTimeTicks) > 0
          ? Math.max(0, Math.min(100, Math.round((Number(playState.PositionTicks || 0) / Number(media.RunTimeTicks)) * 100)))
          : 0;
        const stateLabel = playState.IsPaused ? 'Paused' : 'Playing';
        const meta = [runtime, device].filter(Boolean).join(' • ');
        const pill = progress > 0 ? `${stateLabel} ${progress}%` : stateLabel;
        const primaryTag = String(media.PrimaryImageTag || '').trim();
        const backdropTag = Array.isArray(media.BackdropImageTags) && media.BackdropImageTags.length
          ? String(media.BackdropImageTags[0] || '').trim()
          : '';
        return {
          id: String(media.Id || ''),
          title: String(media.Name || '').trim() || 'Now Playing',
          subtitle,
          meta,
          pill,
          kind,
          user,
          overview: String(media.Overview || '').trim(),
          thumb: buildJellyfinImageUrl({
            baseUrl: sessionResponse.baseUrl,
            itemId: media.Id,
            type: 'Primary',
            apiKey,
            tag: primaryTag,
          }),
          art: backdropTag
            ? buildJellyfinImageUrl({
              baseUrl: sessionResponse.baseUrl,
              itemId: media.Id,
              type: 'Backdrop',
              index: '0',
              apiKey,
              tag: backdropTag,
            })
            : '',
        };
      });
    pushLog({
      level: 'info',
      app: 'jellyfin',
      action: 'overview.active',
      message: 'Jellyfin active sessions fetched.',
      meta: { count: items.length },
    });
    return res.json({ items });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'jellyfin',
      action: 'overview.active',
      message: safeMessage(err) || 'Failed to fetch Jellyfin active sessions.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch Jellyfin active sessions.' });
  }
});

app.get('/api/jellyfin/recent', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const jellyfinApp = apps.find((appItem) => appItem.id === 'jellyfin');
  if (!jellyfinApp) return res.status(404).json({ error: 'Jellyfin app is not configured.' });
  if (!canAccess(jellyfinApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Jellyfin overview access denied.' });
  }

  const apiKey = String(jellyfinApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Jellyfin API key.' });

  const candidates = resolveJellyfinCandidates(jellyfinApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Jellyfin URL.' });

  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;
  const requestedType = String(req.query?.type || 'movie').trim().toLowerCase();
  const mediaType = requestedType === 'show' || requestedType === 'all' ? requestedType : 'movie';

  try {
    const recentResponse = await fetchJellyfinRecentItems({
      candidates,
      apiKey,
      limit,
      mediaType,
    });
    const items = recentResponse.items.map((media) => {
      const kind = mapJellyfinKind(media.Type);
      const seriesName = String(media.SeriesName || '').trim();
      const season = toPaddedEpisode(media.ParentIndexNumber);
      const episode = toPaddedEpisode(media.IndexNumber);
      const episodeCode = season && episode ? `S${season}E${episode}` : '';
      const subtitle = kind === 'tv'
        ? [seriesName || String(media.Name || '').trim(), episodeCode].filter(Boolean).join(' ')
        : '';
      const runtime = formatDurationFromTicks(media.RunTimeTicks);
      const year = Number(media.ProductionYear);
      const yearText = Number.isFinite(year) && year > 0 ? String(year) : '';
      const meta = [yearText, runtime].filter(Boolean).join(' • ');
      const pill = formatRelativeTime(media.DateCreated) || 'Recently added';
      const primaryTag = String(media.PrimaryImageTag || '').trim();
      const backdropTag = Array.isArray(media.BackdropImageTags) && media.BackdropImageTags.length
        ? String(media.BackdropImageTags[0] || '').trim()
        : '';
      const providerIds = media.ProviderIds && typeof media.ProviderIds === 'object' ? media.ProviderIds : {};
      return {
        id: String(media.Id || ''),
        title: String(media.Name || '').trim() || 'Untitled',
        subtitle,
        meta,
        pill,
        kind,
        overview: String(media.Overview || '').trim(),
        imdbId: String(providerIds.Imdb || providerIds.IMDB || '').trim(),
        tmdbId: String(providerIds.Tmdb || providerIds.TMDB || '').trim(),
        thumb: buildJellyfinImageUrl({
          baseUrl: recentResponse.baseUrl,
          itemId: media.Id,
          type: 'Primary',
          apiKey,
          tag: primaryTag,
        }),
        art: backdropTag
          ? buildJellyfinImageUrl({
            baseUrl: recentResponse.baseUrl,
            itemId: media.Id,
            type: 'Backdrop',
            index: '0',
            apiKey,
            tag: backdropTag,
          })
          : '',
      };
    });
    pushLog({
      level: 'info',
      app: 'jellyfin',
      action: 'overview.recent',
      message: 'Jellyfin recent items fetched.',
      meta: { count: items.length, type: mediaType },
    });
    return res.json({ items });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'jellyfin',
      action: 'overview.recent',
      message: safeMessage(err) || 'Failed to fetch Jellyfin recent items.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch Jellyfin recent items.' });
  }
});

app.get('/api/emby/active', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const embyApp = apps.find((appItem) => appItem.id === 'emby');
  if (!embyApp) return res.status(404).json({ error: 'Emby app is not configured.' });
  if (!canAccess(embyApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Emby overview access denied.' });
  }

  const apiKey = String(embyApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Emby API key.' });

  const candidates = resolveEmbyCandidates(embyApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Emby URL.' });

  try {
    const sessionResponse = await fetchEmbyJson({
      candidates,
      apiKey,
      path: '/Sessions',
      query: { ActiveWithinSeconds: 21600 },
    });
    const sessions = Array.isArray(sessionResponse.payload) ? sessionResponse.payload : [];
    const items = sessions
      .filter((session) => session && session.NowPlayingItem && session.NowPlayingItem.Id)
      .map((session) => {
        const media = session.NowPlayingItem || {};
        const kind = mapJellyfinKind(media.Type);
        const seriesName = String(media.SeriesName || '').trim();
        const season = toPaddedEpisode(media.ParentIndexNumber);
        const episode = toPaddedEpisode(media.IndexNumber);
        const episodeCode = season && episode ? `S${season}E${episode}` : '';
        const subtitle = kind === 'tv'
          ? [seriesName || String(media.Name || '').trim(), episodeCode].filter(Boolean).join(' ')
          : '';
        const runtime = formatDurationFromTicks(media.RunTimeTicks);
        const user = String(session.UserName || '').trim();
        const device = String(session.Client || session.DeviceName || '').trim();
        const playState = session.PlayState || {};
        const progress = Number(media.RunTimeTicks) > 0
          ? Math.max(0, Math.min(100, Math.round((Number(playState.PositionTicks || 0) / Number(media.RunTimeTicks)) * 100)))
          : 0;
        const stateLabel = playState.IsPaused ? 'Paused' : 'Playing';
        const meta = [runtime, device].filter(Boolean).join(' • ');
        const pill = progress > 0 ? `${stateLabel} ${progress}%` : stateLabel;
        const primaryTag = String(media.PrimaryImageTag || '').trim();
        const backdropTag = Array.isArray(media.BackdropImageTags) && media.BackdropImageTags.length
          ? String(media.BackdropImageTags[0] || '').trim()
          : '';
        return {
          id: String(media.Id || ''),
          title: String(media.Name || '').trim() || 'Now Playing',
          subtitle,
          meta,
          pill,
          kind,
          user,
          overview: String(media.Overview || '').trim(),
          thumb: buildEmbyImageUrl({
            baseUrl: sessionResponse.baseUrl,
            itemId: media.Id,
            type: 'Primary',
            apiKey,
            tag: primaryTag,
          }),
          art: backdropTag
            ? buildEmbyImageUrl({
              baseUrl: sessionResponse.baseUrl,
              itemId: media.Id,
              type: 'Backdrop',
              index: '0',
              apiKey,
              tag: backdropTag,
            })
            : '',
        };
      });
    pushLog({
      level: 'info',
      app: 'emby',
      action: 'overview.active',
      message: 'Emby active sessions fetched.',
      meta: { count: items.length },
    });
    return res.json({ items });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'emby',
      action: 'overview.active',
      message: safeMessage(err) || 'Failed to fetch Emby active sessions.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch Emby active sessions.' });
  }
});

app.get('/api/emby/recent', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const embyApp = apps.find((appItem) => appItem.id === 'emby');
  if (!embyApp) return res.status(404).json({ error: 'Emby app is not configured.' });
  if (!canAccess(embyApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Emby overview access denied.' });
  }

  const apiKey = String(embyApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Emby API key.' });

  const candidates = resolveEmbyCandidates(embyApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Emby URL.' });

  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;
  const requestedType = String(req.query?.type || 'movie').trim().toLowerCase();
  const mediaType = requestedType === 'show' || requestedType === 'all' ? requestedType : 'movie';

  try {
    const recentResponse = await fetchEmbyRecentItems({
      candidates,
      apiKey,
      limit,
      mediaType,
    });
    const items = recentResponse.items.map((media) => {
      const kind = mapJellyfinKind(media.Type);
      const seriesName = String(media.SeriesName || '').trim();
      const season = toPaddedEpisode(media.ParentIndexNumber);
      const episode = toPaddedEpisode(media.IndexNumber);
      const episodeCode = season && episode ? `S${season}E${episode}` : '';
      const subtitle = kind === 'tv'
        ? [seriesName || String(media.Name || '').trim(), episodeCode].filter(Boolean).join(' ')
        : '';
      const runtime = formatDurationFromTicks(media.RunTimeTicks);
      const year = Number(media.ProductionYear);
      const yearText = Number.isFinite(year) && year > 0 ? String(year) : '';
      const meta = [yearText, runtime].filter(Boolean).join(' • ');
      const pill = formatRelativeTime(media.DateCreated) || 'Recently added';
      const primaryTag = String(media.PrimaryImageTag || '').trim();
      const backdropTag = Array.isArray(media.BackdropImageTags) && media.BackdropImageTags.length
        ? String(media.BackdropImageTags[0] || '').trim()
        : '';
      const providerIds = media.ProviderIds && typeof media.ProviderIds === 'object' ? media.ProviderIds : {};
      return {
        id: String(media.Id || ''),
        title: String(media.Name || '').trim() || 'Untitled',
        subtitle,
        meta,
        pill,
        kind,
        overview: String(media.Overview || '').trim(),
        imdbId: String(providerIds.Imdb || providerIds.IMDB || '').trim(),
        tmdbId: String(providerIds.Tmdb || providerIds.TMDB || '').trim(),
        thumb: buildEmbyImageUrl({
          baseUrl: recentResponse.baseUrl,
          itemId: media.Id,
          type: 'Primary',
          apiKey,
          tag: primaryTag,
        }),
        art: backdropTag
          ? buildEmbyImageUrl({
            baseUrl: recentResponse.baseUrl,
            itemId: media.Id,
            type: 'Backdrop',
            index: '0',
            apiKey,
            tag: backdropTag,
          })
          : '',
      };
    });
    pushLog({
      level: 'info',
      app: 'emby',
      action: 'overview.recent',
      message: 'Emby recent items fetched.',
      meta: { count: items.length, type: mediaType },
    });
    return res.json({ items });
  } catch (err) {
    pushLog({
      level: 'error',
      app: 'emby',
      action: 'overview.recent',
      message: safeMessage(err) || 'Failed to fetch Emby recent items.',
    });
    return res.status(502).json({ error: safeMessage(err) || 'Failed to fetch Emby recent items.' });
  }
});

function mapSeerrRequestStatus(statusValue) {
  const numeric = Number(statusValue);
  if (numeric === 5) return 'available';
  if (numeric === 3) return 'declined';
  return 'requested';
}

function mapSeerrFilter(statusValue) {
  const value = String(statusValue || '').trim().toLowerCase();
  if (value === 'available') return 'available';
  if (value === 'declined') return 'declined';
  if (value === 'requested') return 'pending';
  return 'all';
}

async function fetchSeerrJson({ candidates, apiKey, path, query }) {
  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = new URL(path, baseUrl);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      upstreamUrl.searchParams.set(key, String(value));
    });

    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
        },
      });
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        const bodyMessage = String(text || '').trim();
        lastError = `Seerr request failed (${upstreamRes.status}) via ${baseUrl}${bodyMessage ? `: ${bodyMessage.slice(0, 220)}` : ''}`;
        continue;
      }
      try {
        return JSON.parse(text || '{}');
      } catch (err) {
        lastError = `Invalid JSON response from Seerr via ${baseUrl}.`;
      }
    } catch (err) {
      const reason = safeMessage(err) || 'fetch failed';
      lastError = `${reason} via ${baseUrl}`;
    }
  }
  throw new Error(lastError || 'Failed to reach Seerr.');
}

app.get('/api/pulsarr/stats/:kind', requireUser, async (req, res) => {
  const kind = String(req.params.kind || '').trim().toLowerCase();
  const endpointByKind = {
    'recent-requests': '/v1/stats/recent-requests',
    movies: '/v1/stats/movies',
    shows: '/v1/stats/shows',
  };
  const endpointPath = endpointByKind[kind];
  if (!endpointPath) return res.status(400).json({ error: 'Unsupported Pulsarr stats endpoint.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const pulsarrApp = apps.find((appItem) => appItem.id === 'pulsarr');
  if (!pulsarrApp) return res.status(404).json({ error: 'Pulsarr app is not configured.' });
  if (!canAccess(pulsarrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Pulsarr overview access denied.' });
  }

  const apiKey = String(pulsarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Pulsarr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(pulsarrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(pulsarrApp, req)),
    normalizeBaseUrl(pulsarrApp.localUrl || ''),
    normalizeBaseUrl(pulsarrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Pulsarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = new URL(endpointPath, baseUrl);
    Object.entries(req.query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      upstreamUrl.searchParams.set(key, String(value));
    });

    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
        },
      });
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        const bodyMessage = String(text || '').trim();
        lastError = `Pulsarr request failed (${upstreamRes.status}) via ${baseUrl}${bodyMessage ? `: ${bodyMessage.slice(0, 220)}` : ''}`;
        continue;
      }
      try {
        const parsed = JSON.parse(text || '{}');
        pushLog({
          level: 'info',
          app: 'pulsarr',
          action: `stats.${kind}`,
          message: 'Pulsarr stats response received.',
        });
        return res.json(parsed);
      } catch (err) {
        lastError = `Invalid JSON response from Pulsarr via ${baseUrl}.`;
      }
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Pulsarr via ${baseUrl}.`;
    }
  }

  pushLog({
    level: 'error',
    app: 'pulsarr',
    action: `stats.${kind}`,
    message: lastError || 'Failed to reach Pulsarr on configured URLs.',
  });
  return res.status(502).json({ error: lastError || 'Failed to reach Pulsarr on configured URLs.' });
});

app.get('/api/seerr/stats/:kind', requireUser, async (req, res) => {
  const kind = String(req.params.kind || '').trim().toLowerCase();
  const config = loadConfig();
  const apps = config.apps || [];
  const seerrApp = apps.find((appItem) => appItem.id === 'seerr');
  if (!seerrApp) return res.status(404).json({ error: 'Seerr app is not configured.' });
  if (!canAccess(seerrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Seerr overview access denied.' });
  }

  const apiKey = String(seerrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Seerr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(seerrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(seerrApp, req)),
    normalizeBaseUrl(seerrApp.localUrl || ''),
    normalizeBaseUrl(seerrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Seerr URL.' });

  try {
    if (kind === 'recent-requests') {
      const rawLimit = Number(req.query?.limit);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;
      const filter = mapSeerrFilter(req.query?.status);
      const requestPayload = await fetchSeerrJson({
        candidates,
        apiKey,
        path: '/api/v1/request',
        query: { take: limit, skip: 0, sort: 'added', filter },
      });
      const results = Array.isArray(requestPayload?.results) ? requestPayload.results : [];
      const detailCache = new Map();

      const fetchDetail = async (mediaType, tmdbId) => {
        const detailKey = `${mediaType}:${tmdbId}`;
        if (detailCache.has(detailKey)) return detailCache.get(detailKey);
        const detailPath = mediaType === 'show'
          ? `/api/v1/tv/${encodeURIComponent(tmdbId)}`
          : `/api/v1/movie/${encodeURIComponent(tmdbId)}`;
        try {
          const detail = await fetchSeerrJson({
            candidates,
            apiKey,
            path: detailPath,
            query: {},
          });
          detailCache.set(detailKey, detail);
          return detail;
        } catch (_err) {
          detailCache.set(detailKey, null);
          return null;
        }
      };

      const selected = results.slice(0, limit).map((entry) => {
        const rawType = String(entry?.type || entry?.media?.mediaType || '').toLowerCase();
        const mediaType = rawType === 'tv' || rawType === 'show' ? 'show' : 'movie';
        const tmdbId = Number(entry?.media?.tmdbId || entry?.tmdbId || 0) || 0;
        return { entry, mediaType, tmdbId };
      });
      await Promise.all(selected.map(({ mediaType, tmdbId }) => (
        tmdbId ? fetchDetail(mediaType, tmdbId) : Promise.resolve(null)
      )));
      const normalized = selected.map(({ entry, mediaType, tmdbId }) => {
        const detail = tmdbId ? detailCache.get(`${mediaType}:${tmdbId}`) : null;
        const imdbId = String(detail?.imdbId || detail?.imdb_id || entry?.media?.imdbId || '').trim();
        return {
          title: String(
            detail?.title
            || detail?.name
            || entry?.subject
            || entry?.media?.title
            || entry?.media?.name
            || ''
          ).trim(),
          contentType: mediaType,
          createdAt: entry?.createdAt || entry?.updatedAt || '',
          status: mapSeerrRequestStatus(entry?.status),
          userName: String(entry?.requestedBy?.displayName || entry?.requestedBy?.username || '').trim(),
          guids: [
            tmdbId ? `tmdb:${tmdbId}` : '',
            imdbId ? `imdb:${imdbId}` : '',
          ].filter(Boolean),
          posterPath: detail?.posterPath || detail?.poster_path || '',
          overview: String(detail?.overview || '').trim(),
        };
      });

      pushLog({
        level: 'info',
        app: 'seerr',
        action: `stats.${kind}`,
        message: 'Seerr stats response received.',
        meta: { count: normalized.length },
      });
      return res.json({ results: normalized });
    }

    if (kind === 'movies' || kind === 'shows') {
      const rawLimit = Number(req.query?.limit);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;
      const discoverPath = kind === 'movies' ? '/api/v1/discover/movies' : '/api/v1/discover/tv';
      const discoverPayload = await fetchSeerrJson({
        candidates,
        apiKey,
        path: discoverPath,
        query: { page: 1 },
      });
      const records = Array.isArray(discoverPayload?.results) ? discoverPayload.results : [];
      const normalized = records.slice(0, limit).map((entry) => {
        const tmdbId = Number(entry?.id || entry?.tmdbId || 0) || 0;
        const mediaType = kind === 'shows' ? 'show' : 'movie';
        return {
          title: String(entry?.title || entry?.name || '').trim(),
          content_type: mediaType,
          count: Number(entry?.voteCount ?? entry?.popularity ?? 0) || 0,
          posterPath: entry?.posterPath || entry?.poster_path || '',
          overview: String(entry?.overview || '').trim(),
          guids: tmdbId ? [`tmdb:${tmdbId}`] : [],
        };
      });

      pushLog({
        level: 'info',
        app: 'seerr',
        action: `stats.${kind}`,
        message: 'Seerr stats response received.',
        meta: { count: normalized.length },
      });
      return res.json({ results: normalized });
    }

    return res.status(400).json({ error: 'Unsupported Seerr stats endpoint.' });
  } catch (err) {
    const lastError = safeMessage(err) || 'Failed to reach Seerr on configured URLs.';
    pushLog({
      level: 'error',
      app: 'seerr',
      action: `stats.${kind}`,
      message: lastError,
    });
    return res.status(502).json({ error: lastError });
  }
});

app.get('/api/pulsarr/tmdb/:kind/:id', requireUser, async (req, res) => {
  const kindRaw = String(req.params.kind || '').trim().toLowerCase();
  const kind = kindRaw === 'show' ? 'tv' : kindRaw;
  const tmdbId = String(req.params.id || '').trim();
  if (!tmdbId || (kind !== 'movie' && kind !== 'tv')) {
    return res.status(400).json({ error: 'Invalid TMDB request.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const pulsarrApp = apps.find((appItem) => appItem.id === 'pulsarr');
  if (!pulsarrApp) return res.status(404).json({ error: 'Pulsarr app is not configured.' });
  if (!canAccess(pulsarrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Pulsarr overview access denied.' });
  }

  const apiKey = String(pulsarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Pulsarr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(pulsarrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(pulsarrApp, req)),
    normalizeBaseUrl(pulsarrApp.localUrl || ''),
    normalizeBaseUrl(pulsarrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Pulsarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = new URL(`/v1/tmdb/${kind}/${encodeURIComponent(tmdbId)}`, baseUrl);
    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
        },
      });
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        const bodyMessage = String(text || '').trim();
        lastError = `Pulsarr TMDB request failed (${upstreamRes.status}) via ${baseUrl}${bodyMessage ? `: ${bodyMessage.slice(0, 220)}` : ''}`;
        continue;
      }
      try {
        const parsed = JSON.parse(text || '{}');
        pushLog({
          level: 'info',
          app: 'pulsarr',
          action: 'tmdb',
          message: 'Pulsarr TMDB response received.',
          meta: { kind, tmdbId },
        });
        return res.json(parsed);
      } catch (err) {
        lastError = `Invalid JSON response from Pulsarr via ${baseUrl}.`;
      }
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Pulsarr via ${baseUrl}.`;
    }
  }

  pushLog({
    level: 'error',
    app: 'pulsarr',
    action: 'tmdb',
    message: lastError || 'Failed to fetch Pulsarr TMDB details.',
    meta: { kind, tmdbId },
  });
  return res.status(502).json({ error: lastError || 'Failed to fetch Pulsarr TMDB details.' });
});

app.get('/api/seerr/tmdb/:kind/:id', requireUser, async (req, res) => {
  const kindRaw = String(req.params.kind || '').trim().toLowerCase();
  const kind = kindRaw === 'show' ? 'tv' : kindRaw;
  const tmdbId = String(req.params.id || '').trim();
  if (!tmdbId || (kind !== 'movie' && kind !== 'tv')) {
    return res.status(400).json({ error: 'Invalid TMDB request.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const seerrApp = apps.find((appItem) => appItem.id === 'seerr');
  if (!seerrApp) return res.status(404).json({ error: 'Seerr app is not configured.' });
  if (!canAccess(seerrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Seerr overview access denied.' });
  }

  const apiKey = String(seerrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Seerr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(seerrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(seerrApp, req)),
    normalizeBaseUrl(seerrApp.localUrl || ''),
    normalizeBaseUrl(seerrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Seerr URL.' });

  try {
    const parsed = await fetchSeerrJson({
      candidates,
      apiKey,
      path: `/api/v1/${kind === 'tv' ? 'tv' : 'movie'}/${encodeURIComponent(tmdbId)}`,
      query: {},
    });
    const payload = { ...parsed, imdb_id: parsed?.imdb_id || parsed?.imdbId || '' };
    pushLog({
      level: 'info',
      app: 'seerr',
      action: 'tmdb',
      message: 'Seerr TMDB response received.',
      meta: { kind, tmdbId },
    });
    return res.json(payload);
  } catch (err) {
    const lastError = safeMessage(err) || 'Failed to fetch Seerr TMDB details.';
    pushLog({
      level: 'error',
      app: 'seerr',
      action: 'tmdb',
      message: lastError,
      meta: { kind, tmdbId },
    });
    return res.status(502).json({ error: lastError });
  }
});

app.get('/api/prowlarr/search', requireUser, async (req, res) => {
  const query = String(req.query?.query || req.query?.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing search query.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const prowlarrApp = apps.find((appItem) => appItem.id === 'prowlarr');
  if (!prowlarrApp) return res.status(404).json({ error: 'Prowlarr app is not configured.' });
  if (!canAccess(prowlarrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Prowlarr overview access denied.' });
  }

  const apiKey = String(prowlarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Prowlarr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(prowlarrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(prowlarrApp, req)),
    normalizeBaseUrl(prowlarrApp.localUrl || ''),
    normalizeBaseUrl(prowlarrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Prowlarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const queryParams = {};
    Object.entries(req.query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (key === 'q' || key === 'query') return;
      queryParams[key] = String(value);
    });

    const tryRequest = async (method) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        if (method === 'GET') {
          const upstreamUrl = new URL('/api/v1/search', baseUrl);
          upstreamUrl.searchParams.set('query', query);
          Object.entries(queryParams).forEach(([key, value]) => upstreamUrl.searchParams.set(key, value));
          return fetch(upstreamUrl.toString(), {
            headers: {
              Accept: 'application/json',
              'X-Api-Key': apiKey,
            },
            signal: controller.signal,
          });
        }
        const upstreamUrl = new URL('/api/v1/search', baseUrl);
        return fetch(upstreamUrl.toString(), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify({ query, ...queryParams }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      let upstreamRes = await tryRequest('GET');
      let text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        upstreamRes = await tryRequest('POST');
        text = await upstreamRes.text();
      }
      if (!upstreamRes.ok) {
        lastError = `Prowlarr request failed (${upstreamRes.status}) via ${baseUrl}.`;
        pushLog({
          level: 'error',
          app: 'prowlarr',
          action: 'search',
          message: lastError,
          meta: { status: upstreamRes.status },
        });
        continue;
      }
      try {
        const parsed = JSON.parse(text || '[]');
        const list = Array.isArray(parsed)
          ? parsed
          : (Array.isArray(parsed?.records) ? parsed.records : (Array.isArray(parsed?.results) ? parsed.results : []));
        const total = Array.isArray(parsed)
          ? parsed.length
          : Number(parsed?.totalRecords || parsed?.total || list.length || 0);
        pushLog({
          level: 'info',
          app: 'prowlarr',
          action: 'search',
          message: 'Search response received.',
          meta: {
            count: list.length,
            total,
            keys: parsed && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 8) : ['array'],
          },
        });
        return res.json(parsed);
      } catch (err) {
        lastError = `Invalid JSON response from Prowlarr via ${baseUrl}.`;
        pushLog({
          level: 'error',
          app: 'prowlarr',
          action: 'search',
          message: lastError,
        });
      }
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Prowlarr via ${baseUrl}.`;
      pushLog({
        level: 'error',
        app: 'prowlarr',
        action: 'search',
        message: lastError,
      });
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to reach Prowlarr.' });
});

app.post('/api/prowlarr/download', requireUser, async (req, res) => {
  const searchId = String(req.body?.id || '').trim();
  const guid = String(req.body?.guid || '').trim();
  const indexerId = String(req.body?.indexerId || '').trim();
  const downloadClientId = String(req.body?.downloadClientId || '').trim();
  const release = req.body?.release || null;
  if (!release && !searchId && !guid) return res.status(400).json({ error: 'Missing search result details.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const prowlarrApp = apps.find((appItem) => appItem.id === 'prowlarr');
  if (!prowlarrApp) return res.status(404).json({ error: 'Prowlarr app is not configured.' });
  if (!canAccess(prowlarrApp, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Prowlarr overview access denied.' });
  }

  const apiKey = String(prowlarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Prowlarr API key.' });

  const candidates = uniqueList([
    normalizeBaseUrl(prowlarrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(prowlarrApp, req)),
    normalizeBaseUrl(prowlarrApp.localUrl || ''),
    normalizeBaseUrl(prowlarrApp.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Prowlarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const idValue = searchId || guid;
    const searchDownloadUrl = new URL(`/api/v1/search/${encodeURIComponent(idValue)}/download`, baseUrl);
    if (downloadClientId) searchDownloadUrl.searchParams.set('downloadClientId', downloadClientId);
    const releaseDownloadUrl = new URL('/api/v1/release/download', baseUrl);
    const searchGrabUrl = new URL('/api/v1/search', baseUrl);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      let upstreamRes;
      try {
        if (release) {
          const grabBody = { ...release };
          if (downloadClientId) grabBody.downloadClientId = Number(downloadClientId);
          upstreamRes = await fetch(searchGrabUrl.toString(), {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Api-Key': apiKey,
            },
            body: JSON.stringify(grabBody),
            signal: controller.signal,
          });
          if (upstreamRes.ok) {
            // handled below
          }
        }
        const releaseBody = {
          guid: guid || undefined,
          indexerId: indexerId ? Number(indexerId) : undefined,
          downloadClientId: downloadClientId ? Number(downloadClientId) : undefined,
        };
        if (!upstreamRes || !upstreamRes.ok) {
          upstreamRes = await fetch(releaseDownloadUrl.toString(), {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Api-Key': apiKey,
            },
            body: JSON.stringify(releaseBody),
            signal: controller.signal,
          });
        }
        if (!upstreamRes.ok) {
          upstreamRes = await fetch(searchDownloadUrl.toString(), {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'X-Api-Key': apiKey,
            },
            signal: controller.signal,
          });
        }
        if (!upstreamRes.ok) {
          upstreamRes = await fetch(searchDownloadUrl.toString(), {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-Api-Key': apiKey,
            },
            signal: controller.signal,
          });
        }
      } finally {
        clearTimeout(timeout);
      }
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        lastError = `Prowlarr download failed (${upstreamRes.status}) via ${baseUrl}.`;
        pushLog({
          level: 'error',
          app: 'prowlarr',
          action: 'download',
          message: lastError,
          meta: { status: upstreamRes.status, body: text.slice(0, 500) },
        });
        continue;
      }
      try {
        pushLog({
          level: 'info',
          app: 'prowlarr',
          action: 'download',
          message: 'Sent to download client.',
        });
        return res.json(text ? JSON.parse(text) : { ok: true });
      } catch (err) {
        pushLog({
          level: 'info',
          app: 'prowlarr',
          action: 'download',
          message: 'Sent to download client.',
        });
        return res.json({ ok: true });
      }
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Prowlarr via ${baseUrl}.`;
      pushLog({
        level: 'error',
        app: 'prowlarr',
        action: 'download',
        message: lastError,
      });
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to send to download client.' });
});

function buildBasicAuthHeader(username, password) {
  const user = String(username || '');
  const pass = String(password || '');
  if (!user && !pass) return '';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function fetchTransmissionQueue(baseUrl, authHeader) {
  const rpcUrl = new URL('/transmission/rpc', baseUrl);
  const payload = {
    method: 'torrent-get',
    arguments: {
      fields: [
        'id',
        'name',
        'status',
        'percentDone',
        'eta',
        'rateDownload',
        'rateUpload',
        'sizeWhenDone',
        'totalSize',
        'leftUntilDone',
        'addedDate',
        'isFinished',
        'isStalled',
        'error',
        'errorString',
      ],
    },
  };

  let sessionId = '';
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (authHeader) headers.Authorization = authHeader;
    if (sessionId) headers['X-Transmission-Session-Id'] = sessionId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(rpcUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.status === 409) {
        sessionId = response.headers.get('x-transmission-session-id') || '';
        if (sessionId) continue;
        lastError = 'Transmission session negotiation failed.';
        break;
      }
      const text = await response.text();
      if (!response.ok) {
        lastError = `Transmission request failed (${response.status}).`;
        break;
      }
      const parsed = text ? JSON.parse(text) : {};
      const list = Array.isArray(parsed?.arguments?.torrents) ? parsed.arguments.torrents : [];
      return { items: list };
    } catch (err) {
      lastError = safeMessage(err) || 'Failed to reach Transmission.';
    } finally {
      clearTimeout(timeout);
    }
  }

  return { error: lastError || 'Failed to reach Transmission.' };
}

async function fetchNzbgetQueue(baseUrl, authHeader) {
  const rpcUrl = new URL('/jsonrpc', baseUrl);
  const payload = {
    method: 'listgroups',
    params: [0],
    id: Date.now(),
  };
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (authHeader) headers.Authorization = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(rpcUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { error: `NZBGet request failed (${response.status}).` };
    }
    const parsed = text ? JSON.parse(text) : {};
    const list = Array.isArray(parsed?.result) ? parsed.result : [];
    return { items: list };
  } catch (err) {
    return { error: safeMessage(err) || 'Failed to reach NZBGet.' };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/downloaders/:appId/queue', requireUser, async (req, res) => {
  const appId = String(req.params.appId || '').trim().toLowerCase();
  if (!['transmission', 'nzbget'].includes(appId)) {
    return res.status(400).json({ error: 'Unsupported downloader app.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const appItem = apps.find((item) => item.id === appId);
  if (!appItem) return res.status(404).json({ error: `${appId} is not configured.` });
  if (!canAccess(appItem, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: `${appItem.name || appId} overview access denied.` });
  }

  const candidates = uniqueList([
    normalizeBaseUrl(appItem.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req)),
    normalizeBaseUrl(appItem.localUrl || ''),
    normalizeBaseUrl(appItem.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: `Missing ${appItem.name || appId} URL.` });

  const authHeader = buildBasicAuthHeader(appItem.username || '', appItem.password || '');
  let lastError = '';

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const result = appId === 'transmission'
        ? await fetchTransmissionQueue(baseUrl, authHeader)
        : await fetchNzbgetQueue(baseUrl, authHeader);
      if (result.items) {
        pushLog({
          level: 'info',
          app: appId,
          action: 'downloader.queue',
          message: `${appItem.name || appId} queue response received.`,
        });
        return res.json({ items: result.items });
      }
      lastError = result.error || `Failed to reach ${appItem.name || appId}.`;
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach ${appItem.name || appId}.`;
    }
  }

  pushLog({
    level: 'error',
    app: appId,
    action: 'downloader.queue',
    message: lastError || `Failed to reach ${appItem.name || appId}.`,
  });
  return res.status(502).json({ error: lastError || `Failed to reach ${appItem.name || appId}.` });
});

app.get('/api/arr/:appId/:version/*', requireUser, async (req, res) => {
  const appId = String(req.params.appId || '').trim().toLowerCase();
  const version = String(req.params.version || '').trim().toLowerCase();
  const pathSuffix = String(req.params[0] || '').trim().replace(/^\/+/, '');
  const reject = (status, message, meta = null) => {
    pushLog({
      level: status >= 500 ? 'error' : 'warn',
      app: appId || 'arr',
      action: 'arr.proxy.reject',
      message,
      meta: meta || null,
    });
    return res.status(status).json({ error: message });
  };
  if (!ARR_APP_IDS.includes(appId)) {
    return reject(400, 'Unsupported ARR app.', { appId, version, path: pathSuffix });
  }
  if (version !== 'v1' && version !== 'v3') {
    return reject(400, 'Unsupported ARR API version.', { appId, version, path: pathSuffix });
  }
  if (!pathSuffix) {
    return reject(400, 'Missing ARR endpoint path.', { appId, version });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const arrApp = apps.find((appItem) => appItem.id === appId);
  if (!arrApp) {
    return reject(404, `${appId} is not configured.`, { appId, version, path: pathSuffix });
  }
  if (!canAccess(arrApp, getEffectiveRole(req), 'overview')) {
    return reject(403, `${arrApp.name || appId} overview access denied.`, {
      appId,
      version,
      path: pathSuffix,
    });
  }

  const apiKey = String(arrApp.apiKey || '').trim();
  if (!apiKey) {
    return reject(400, `Missing ${arrApp.name || appId} API key.`, { appId, version, path: pathSuffix });
  }

  const candidates = uniqueList([
    normalizeBaseUrl(arrApp.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(arrApp, req)),
    normalizeBaseUrl(arrApp.localUrl || ''),
    normalizeBaseUrl(arrApp.url || ''),
  ]);
  if (!candidates.length) {
    return reject(400, `Missing ${arrApp.name || appId} URL.`, { appId, version, path: pathSuffix });
  }

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = new URL(`/api/${version}/${pathSuffix}`, baseUrl);
    Object.entries(req.query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      upstreamUrl.searchParams.set(key, String(value));
    });
    upstreamUrl.searchParams.set('apikey', apiKey);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      let upstreamRes;
      try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
          headers: {
            Accept: 'application/json',
            'X-Api-Key': apiKey,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await upstreamRes.text();
      if (!upstreamRes.ok) {
        lastError = `${arrApp.name || appId} request failed (${upstreamRes.status}) via ${baseUrl}.`;
        continue;
      }
      try {
        const parsed = JSON.parse(text || '{}');
        pushLog({
          level: 'info',
          app: appId,
          action: 'arr.proxy',
          message: 'ARR response received.',
          meta: { version, path: pathSuffix },
        });
        return res.json(parsed);
      } catch (err) {
        lastError = `Invalid JSON response from ${arrApp.name || appId} via ${baseUrl}.`;
      }
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach ${arrApp.name || appId} via ${baseUrl}.`;
    }
  }

  pushLog({
    level: 'error',
    app: appId,
    action: 'arr.proxy',
    message: lastError || `Failed to reach ${arrApp.name || appId}.`,
    meta: { version, path: pathSuffix },
  });
  return res.status(502).json({ error: lastError || `Failed to reach ${arrApp.name || appId}.` });
});

app.all('/api/arr/*', requireUser, (req, res) => {
  const path = String(req.path || '').trim();
  pushLog({
    level: 'warn',
    app: 'arr',
    action: 'arr.proxy.miss',
    message: 'ARR proxy route did not match request path.',
    meta: {
      method: req.method,
      path,
      query: req.query || {},
    },
  });
  return res.status(404).json({ error: 'Unknown ARR proxy route.' });
});

app.get('/api/logs', requireUser, (req, res) => {
  const appId = String(req.query?.appId || '').trim().toLowerCase();
  const level = String(req.query?.level || '').trim().toLowerCase();
  const limitValue = Number(req.query?.limit || 120);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(250, limitValue)) : 120;
  const list = LOG_BUFFER
    .filter((entry) => !appId || entry.app === appId)
    .filter((entry) => !level || entry.level === level)
    .slice(-limit);
  res.json({ items: list });
});

app.post('/api/logs/client', requireUser, (req, res) => {
  const appId = String(req.body?.app || '').trim().toLowerCase();
  const level = String(req.body?.level || '').trim().toLowerCase() || 'info';
  const action = String(req.body?.action || '').trim() || 'event';
  const message = String(req.body?.message || '').trim();
  const meta = req.body?.meta || null;
  if (!appId) return res.status(400).json({ error: 'Missing app id.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const appItem = apps.find((item) => String(item.id || '').toLowerCase() === appId);
  if (!appItem) return res.status(404).json({ error: 'Unknown app.' });
  if (!canAccess(appItem, getEffectiveRole(req), 'overview')) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  pushLog({
    level,
    app: appId,
    action,
    message,
    meta,
  });

  res.json({ ok: true });
});

app.get('/switch-view', requireUser, (req, res) => {
  const actualRole = getActualRole(req);
  if (actualRole !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  const desired = String(req.query?.role || '').trim().toLowerCase();
  if (desired === 'user') {
    req.session.viewRole = 'user';
  } else {
    req.session.viewRole = null;
  }
  const fallback = '/dashboard';
  const referrer = resolveReturnPath(req, fallback);
  if (desired === 'user') {
    try {
      const host = req.headers.host || '';
      const url = new URL(referrer, `http://${host}`);
      const path = url.pathname || '';
      if ((path.startsWith('/apps/') && path.endsWith('/settings'))
        || (path.startsWith('/apps/') && path.endsWith('/activity'))) {
        return res.redirect(fallback);
      }
    } catch (err) {
      return res.redirect(fallback);
    }
  }
  res.redirect(referrer);
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

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  pushLog({
    level: 'error',
    app: 'system',
    action: 'server.error',
    message: safeMessage(err) || 'Unhandled server error.',
    meta: { path: req.originalUrl || req.url || '' },
  });
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Launcharr listening on port ${PORT}`);
});

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items) {
  const seen = new Set();
  const out = [];
  items.forEach((item) => {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function isSecureEnv() {
  return (process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
}

function loadPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw);
    return String(parsed?.version || '').trim();
  } catch (err) {
    return '';
  }
}

function normalizeVersionTag(value) {
  const tag = String(value || '').trim();
  if (!tag) return '';
  return tag.startsWith('v') ? tag : `v${tag}`;
}

function parseSemver(value) {
  const raw = String(value || '').trim().replace(/^v/i, '');
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function getNavApps(apps, role, req, categoryOrder = DEFAULT_CATEGORY_ORDER, generalSettings = resolveGeneralSettings(loadConfig())) {
  const rankCategory = buildCategoryRank(categoryOrder);
  const isFavourite = (appItem) => Boolean(appItem?.favourite || appItem?.favorite);
  const orderValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  return apps
    .map((appItem) => {
      const access = getMenuAccess(appItem, role);
      const menuAccess = {
        ...access,
        settings: access.settings && !generalSettings.hideSidebarAppSettingsLink,
        activity: access.overview && role === 'admin' && !generalSettings.hideSidebarActivityLink,
      };
      return {
        ...appItem,
        launchMode: resolveAppLaunchMode(appItem, normalizeMenu(appItem)),
        effectiveLaunchMode: resolveEffectiveLaunchMode(appItem, req),
        menuAccess,
      };
    })
    .filter((appItem) => hasAnyMenuAccess(appItem.menuAccess))
    .sort((a, b) => {
      const favouriteDelta = (isFavourite(b) ? 1 : 0) - (isFavourite(a) ? 1 : 0);
      if (favouriteDelta !== 0) return favouriteDelta;
      const categoryDelta = rankCategory(a.category) - rankCategory(b.category);
      if (categoryDelta !== 0) return categoryDelta;
      const orderDelta = orderValue(a.order) - orderValue(b.order);
      if (orderDelta !== 0) return orderDelta;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function buildNavCategories(navApps, categoryEntries) {
  const defaultIcon = DEFAULT_CATEGORY_ICON;
  const entries = Array.isArray(categoryEntries) ? categoryEntries : [];
  const isFavourite = (appItem) => Boolean(appItem?.favourite || appItem?.favorite);
  const grouped = new Map();
  entries.forEach((entry) => {
    grouped.set(entry.name, []);
  });
  (Array.isArray(navApps) ? navApps : []).forEach((appItem) => {
    const rawCategory = String(appItem?.category || '').trim();
    const category = rawCategory || 'Apps';
    const key = category.toLowerCase();
    const existingName = Array.from(grouped.keys()).find((name) => name.toLowerCase() === key);
    const target = existingName || category;
    if (!grouped.has(target)) grouped.set(target, []);
    grouped.get(target).push(appItem);
  });

  const result = [];
  const seen = new Set();
  entries.forEach((entry) => {
    const apps = grouped.get(entry.name) || [];
    seen.add(entry.name.toLowerCase());
    if (!apps.length) return;
    const filteredApps = entry.sidebarMenu ? apps : apps.filter((appItem) => !isFavourite(appItem));
    if (!filteredApps.length) return;
    result.push({
      name: entry.name,
      sidebarMenu: Boolean(entry.sidebarMenu),
      icon: entry.icon || defaultIcon,
      apps: filteredApps,
    });
  });
  grouped.forEach((apps, name) => {
    if (!apps.length) return;
    if (seen.has(name.toLowerCase())) return;
    result.push({ name, sidebarMenu: false, icon: defaultIcon, apps });
  });
  const favourites = (Array.isArray(navApps) ? navApps : [])
    .filter(isFavourite)
    .map((appItem) => ({ ...appItem, navFavourite: true }));
  if (favourites.length) {
    result.unshift({
      name: 'Favourites',
      sidebarMenu: false,
      icon: '/icons/favourite.svg',
      apps: favourites,
    });
  }
  return result;
}

function hasAnyMenuAccess(access) {
  if (!access) return false;
  return Boolean(access.overview || access.launch || access.settings || access.activity);
}

function canAccess(appItem, role, key) {
  const access = getMenuAccess(appItem, role);
  return Boolean(access && access[key]);
}

function getMenuAccess(appItem, role) {
  const menu = normalizeMenu(appItem);
  const launchMode = resolveAppLaunchMode(appItem, menu);
  const launchEnabled = launchMode !== 'disabled';
  if (role === 'admin') {
    return {
      overview: Boolean(menu.overview.admin),
      launch: Boolean(menu.launch.admin) && launchEnabled,
      settings: Boolean(menu.settings.admin),
    };
  }
  if (role === 'co-admin') {
    return {
      overview: Boolean(menu.overview.admin),
      launch: Boolean(menu.launch.admin) && launchEnabled,
      settings: false,
    };
  }
  return {
    overview: Boolean(menu.overview.user),
    launch: Boolean(menu.launch.user) && launchEnabled,
    settings: Boolean(menu.settings.user),
  };
}

function normalizeMenu(appItem) {
  if (appItem && appItem.menu) {
    return {
      overview: { user: false, admin: false, ...appItem.menu.overview },
      launch: { user: false, admin: false, ...appItem.menu.launch },
      settings: { user: false, admin: false, ...appItem.menu.settings },
    };
  }

  const roles = normalizeRoles(appItem);
  const allowUser = !roles.length || roles.includes('user') || roles.includes('both');
  const allowAdmin = !roles.length || roles.includes('admin') || roles.includes('both');

  return {
    overview: { user: allowUser, admin: allowAdmin },
    launch: { user: allowUser, admin: allowAdmin },
    settings: { user: false, admin: allowAdmin },
  };
}

function getOverviewElements(appItem) {
  if (!appItem) return [];
  return APP_OVERVIEW_ELEMENTS[appItem.id] || [];
}

function normalizeCategoryName(value) {
  const name = String(value || '').trim();
  const key = name.toLowerCase();
  if (key === 'media manager') return 'Manager';
  if (key === 'utilities') return 'Tools';
  return name;
}

function normalizeCategoryEntries(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const entries = [];
  items.forEach((value) => {
    let label = '';
    let sidebarMenu = false;
    let icon = '';
    if (typeof value === 'string') {
      label = value;
    } else if (value && typeof value === 'object') {
      label = value.name || value.category || value.label || value.value || '';
      sidebarMenu = Boolean(
        value.sidebarMenu
        || value.sidebar_menu
        || value.submenu
        || value.sidebarSubmenu
        || value.grouped
      );
      icon = value.icon || value.iconPath || value.iconUrl || value.icon_url || '';
    }
    const name = normalizeCategoryName(label);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    entries.push({ name, sidebarMenu, icon: String(icon || '').trim() });
  });
  return entries;
}

function normalizeCategoryList(items) {
  return normalizeCategoryEntries(items).map((entry) => entry.name);
}

function resolveDefaultCategoryIcon(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return DEFAULT_CATEGORY_ICON;
  if (key === 'admin') return '/icons/admin.svg';
  if (key === 'media') return '/icons/media-play.svg';
  if (key === 'manager') return '/icons/settings.svg';
  if (key === 'arr suite') return '/icons/app.svg';
  if (key === 'downloaders') return '/icons/download.svg';
  if (key === 'tools') return '/icons/tools.svg';
  return DEFAULT_CATEGORY_ICON;
}

function resolveCategoryEntries(config, apps = [], options = {}) {
  const includeAppCategories = options.includeAppCategories !== false;
  const configured = normalizeCategoryEntries(config?.categories);
  const entries = configured.length
    ? [...configured]
    : DEFAULT_CATEGORY_ORDER.map((name) => ({ name, sidebarMenu: false, icon: DEFAULT_CATEGORY_ICON }));
  if (!includeAppCategories) return entries;

  const seen = new Set(entries.map((entry) => entry.name.toLowerCase()));
  (Array.isArray(apps) ? apps : []).forEach((appItem) => {
    const category = normalizeCategoryName(appItem?.category);
    const key = category.toLowerCase();
    if (!category || seen.has(key)) return;
    seen.add(key);
    entries.push({ name: category, sidebarMenu: false, icon: DEFAULT_CATEGORY_ICON });
  });
  return entries.map((entry) => {
    const iconValue = String(entry.icon || '').trim();
    if (!iconValue || iconValue === DEFAULT_CATEGORY_ICON) {
      return { ...entry, icon: resolveDefaultCategoryIcon(entry.name) };
    }
    return entry;
  });
}

function resolveCategoryOrder(config, apps = [], options = {}) {
  return resolveCategoryEntries(config, apps, options).map((entry) => entry.name);
}

function listIconFiles(dir, baseUrl) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /\.(svg|png|jpe?g|webp)$/i.test(name))
      .map((name) => `${baseUrl}/${name}`);
  } catch (err) {
    return [];
  }
}

function getDefaultSystemIconOptions() {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');
  const excluded = new Set([
    'launcharr-icon.png',
    'launcharr.svg',
    'appsa.png',
    'appsa.svg',
    'app-arr.svg',
    'arr-suite.svg',
    'prowlarr.svg',
    'prowlarr.png',
    'pulsarr.svg',
    'pulsarr.png',
    'seerr.svg',
    'seerr.png',
    'plex.svg',
    'plex.png',
    'jellyfin.svg',
    'jellyfin.png',
    'emby.svg',
    'emby.png',
    'radarr.svg',
    'radarr.png',
    'sonarr.svg',
    'sonarr.png',
    'lidarr.svg',
    'lidarr.png',
    'readarr.svg',
    'readarr.png',
    'bazarr.svg',
    'bazarr.png',
    'tautulli.svg',
    'tautulli.png',
    'transmission.svg',
    'transmission.png',
    'huntarr.svg',
    'huntarr.png',
    'cleanuparr.svg',
    'cleanuparr.png',
    'nzbget.svg',
  ]);
  try {
    return fs
      .readdirSync(iconsDir)
      .filter((name) => /\.svg$/i.test(name))
      .filter((name) => !excluded.has(name))
      .map((name) => `/icons/${name}`);
  } catch (err) {
    return [];
  }
}

function getCustomSystemIconOptions() {
  const dir = path.join(__dirname, '..', 'public', 'icons', 'custom', 'system');
  return listIconFiles(dir, '/icons/custom/system');
}

function migrateLegacyCustomAppIcons() {
  const legacyDir = path.join(__dirname, '..', 'public', 'icons', 'custom');
  const targetDir = path.join(__dirname, '..', 'public', 'icons', 'custom', 'apps');
  try {
    if (!fs.existsSync(legacyDir)) return;
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.readdirSync(legacyDir).forEach((name) => {
      const legacyPath = path.join(legacyDir, name);
      const stat = fs.statSync(legacyPath);
      if (!stat.isFile()) return;
      if (!/\.(svg|png|jpe?g|webp)$/i.test(name)) return;
      const targetPath = path.join(targetDir, name);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(legacyPath);
        return;
      }
      fs.renameSync(legacyPath, targetPath);
    });
  } catch (err) {
    return;
  }
}

function getCategoryIconOptions() {
  return [...getDefaultSystemIconOptions(), ...getCustomSystemIconOptions()];
}

function getDefaultAppIconOptions(apps = []) {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');
  const appIds = (Array.isArray(apps) ? apps : [])
    .map((appItem) => String(appItem?.id || '').trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set();
  const options = [];
  appIds.forEach((appId) => {
    const pngPath = path.join(iconsDir, `${appId}.png`);
    const svgPath = path.join(iconsDir, `${appId}.svg`);
    if (fs.existsSync(pngPath)) {
      options.push(`/icons/${appId}.png`);
      seen.add(`/icons/${appId}.png`);
    } else if (fs.existsSync(svgPath)) {
      options.push(`/icons/${appId}.svg`);
      seen.add(`/icons/${appId}.svg`);
    }
  });
  try {
    fs.readdirSync(iconsDir)
      .filter((name) => /\.png$/i.test(name))
      .forEach((name) => {
        const url = `/icons/${name}`;
        if (!seen.has(url)) options.push(url);
      });
  } catch (err) {
    return options;
  }
  return options;
}

function getCustomAppIconOptions() {
  migrateLegacyCustomAppIcons();
  const appsDir = path.join(__dirname, '..', 'public', 'icons', 'custom', 'apps');
  return listIconFiles(appsDir, '/icons/custom/apps');
}

function getAppIconOptions(apps = []) {
  return [...getDefaultAppIconOptions(apps), ...getCustomAppIconOptions()];
}

function buildCategoryRank(categoryOrder) {
  const categories = normalizeCategoryList(categoryOrder);
  const rank = new Map(categories.map((value, index) => [value.toLowerCase(), index]));
  return (value) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return categories.length;
    return rank.has(key) ? rank.get(key) : categories.length;
  };
}

function mergeOverviewElementSettings(appItem) {
  const elements = getOverviewElements(appItem);
  if (!elements.length) return [];
  const saved = Array.isArray(appItem.overviewElements) ? appItem.overviewElements : [];
  const savedMap = new Map(saved.map((item) => [item.id, item]));
  const merged = elements.map((element, index) => {
    const savedItem = savedMap.get(element.id) || {};
    const orderValue = Number(savedItem.order);
    const resolveBoolean = (value, fallback) => (value === undefined ? fallback : Boolean(value));
    const rawQueueRows = Number(savedItem.queueVisibleRows);
    const queueVisibleRows = Number.isFinite(rawQueueRows)
      ? Math.max(5, Math.min(50, rawQueueRows))
      : 10;
    const queueLabels = resolveQueueColumnLabels(appItem);
    return {
      id: element.id,
      name: element.name,
      enable: resolveBoolean(savedItem.enable, true),
      dashboard: resolveBoolean(savedItem.dashboard, true),
      favourite: resolveBoolean(savedItem.favourite, false),
      showSubtitle: resolveBoolean(savedItem.showSubtitle, true),
      showMeta: resolveBoolean(savedItem.showMeta, true),
      showPill: resolveBoolean(savedItem.showPill, true),
      showTypeIcon: resolveBoolean(savedItem.showTypeIcon, true),
      showViewIcon: resolveBoolean(savedItem.showViewIcon, true),
      showUsername: resolveBoolean(savedItem.showUsername, true),
      queueShowDetail: resolveBoolean(savedItem.queueShowDetail, true),
      queueShowSubDetail: resolveBoolean(savedItem.queueShowSubDetail, true),
      queueShowSize: resolveBoolean(savedItem.queueShowSize, true),
      queueShowProtocol: resolveBoolean(savedItem.queueShowProtocol, true),
      queueShowTimeLeft: resolveBoolean(savedItem.queueShowTimeLeft, true),
      queueShowProgress: resolveBoolean(savedItem.queueShowProgress, true),
      queueDetailLabel: queueLabels.detailLabel,
      queueSubDetailLabel: queueLabels.subDetailLabel,
      queueVisibleRows,
      order: Number.isFinite(orderValue) ? orderValue : index + 1,
    };
  });
  return merged.sort((a, b) => {
    const favouriteDelta = (b.favourite ? 1 : 0) - (a.favourite ? 1 : 0);
    if (favouriteDelta !== 0) return favouriteDelta;
    const orderDelta = a.order - b.order;
    if (orderDelta !== 0) return orderDelta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function buildOverviewElementsFromRequest(appItem, body) {
  const elements = getOverviewElements(appItem);
  if (!elements.length) return appItem.overviewElements;
  return elements.map((element, index) => {
    const orderValue = body[`element_order_${element.id}`];
    const parsedOrder = Number(orderValue);
    const isQueue = element.id === 'activity-queue';
    const queueRowsValue = Number(body[`element_queue_visible_rows_${element.id}`]);
    const queueVisibleRows = Number.isFinite(queueRowsValue)
      ? Math.max(5, Math.min(50, queueRowsValue))
      : undefined;
    return {
      id: element.id,
      enable: Boolean(body[`element_enable_${element.id}`]),
      dashboard: Boolean(body[`element_dashboard_${element.id}`]),
      favourite: Boolean(body[`element_favourite_${element.id}`]),
      showSubtitle: Boolean(body[`element_showSubtitle_${element.id}`]),
      showMeta: Boolean(body[`element_showMeta_${element.id}`]),
      showPill: Boolean(body[`element_showPill_${element.id}`]),
      showTypeIcon: Boolean(body[`element_showTypeIcon_${element.id}`]),
      showViewIcon: Boolean(body[`element_showViewIcon_${element.id}`]),
      showUsername: Boolean(body[`element_showUsername_${element.id}`]),
      queueShowDetail: isQueue ? Boolean(body[`element_queue_col_detail_${element.id}`]) : undefined,
      queueShowSubDetail: isQueue ? Boolean(body[`element_queue_col_subdetail_${element.id}`]) : undefined,
      queueShowSize: isQueue ? Boolean(body[`element_queue_col_size_${element.id}`]) : undefined,
      queueShowProtocol: isQueue ? Boolean(body[`element_queue_col_protocol_${element.id}`]) : undefined,
      queueShowTimeLeft: isQueue ? Boolean(body[`element_queue_col_timeLeft_${element.id}`]) : undefined,
      queueShowProgress: isQueue ? Boolean(body[`element_queue_col_progress_${element.id}`]) : undefined,
      queueVisibleRows,
      order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
    };
  });
}

function buildDashboardElementsFromRequest(appItem, body) {
  const elements = getOverviewElements(appItem);
  if (!elements.length) return appItem.overviewElements;
  const existingSettings = new Map(
    mergeOverviewElementSettings(appItem).map((item) => [item.id, item])
  );
  return elements.map((element, index) => {
    const prefix = `dashboard_${appItem.id}_${element.id}_`;
    const isPresent = Boolean(body[`${prefix}present`]);
    if (!isPresent) {
      const fallback = existingSettings.get(element.id);
      if (fallback) {
        return {
          id: element.id,
          enable: Boolean(fallback.enable),
          dashboard: Boolean(fallback.dashboard),
          favourite: Boolean(fallback.favourite),
          showSubtitle: Boolean(fallback.showSubtitle),
          showMeta: Boolean(fallback.showMeta),
          showPill: Boolean(fallback.showPill),
          showTypeIcon: Boolean(fallback.showTypeIcon),
          showViewIcon: Boolean(fallback.showViewIcon),
          showUsername: Boolean(fallback.showUsername),
          queueShowDetail: fallback.queueShowDetail !== undefined ? Boolean(fallback.queueShowDetail) : undefined,
          queueShowSubDetail: fallback.queueShowSubDetail !== undefined ? Boolean(fallback.queueShowSubDetail) : undefined,
          queueShowSize: fallback.queueShowSize !== undefined ? Boolean(fallback.queueShowSize) : undefined,
          queueShowProtocol: fallback.queueShowProtocol !== undefined ? Boolean(fallback.queueShowProtocol) : undefined,
          queueShowTimeLeft: fallback.queueShowTimeLeft !== undefined ? Boolean(fallback.queueShowTimeLeft) : undefined,
          queueShowProgress: fallback.queueShowProgress !== undefined ? Boolean(fallback.queueShowProgress) : undefined,
          queueVisibleRows: fallback.queueVisibleRows,
          order: Number.isFinite(fallback.order) ? fallback.order : index + 1,
        };
      }
    }
    const orderValue = body[`${prefix}order`];
    const parsedOrder = Number(orderValue);
    const isQueue = element.id === 'activity-queue';
    const queueRowsValue = Number(body[`${prefix}queue_visible_rows`]);
    const queueVisibleRows = Number.isFinite(queueRowsValue)
      ? Math.max(5, Math.min(50, queueRowsValue))
      : undefined;
    return {
      id: element.id,
      enable: Boolean(body[`${prefix}enable`]),
      dashboard: Boolean(body[`${prefix}dashboard`]),
      favourite: Boolean(body[`${prefix}favourite`]),
      showSubtitle: Boolean(body[`${prefix}showSubtitle`]),
      showMeta: Boolean(body[`${prefix}showMeta`]),
      showPill: Boolean(body[`${prefix}showPill`]),
      showTypeIcon: Boolean(body[`${prefix}showTypeIcon`]),
      showViewIcon: Boolean(body[`${prefix}showViewIcon`]),
      showUsername: Boolean(body[`${prefix}showUsername`]),
      queueShowDetail: isQueue ? Boolean(body[`${prefix}queue_col_detail`]) : undefined,
      queueShowSubDetail: isQueue ? Boolean(body[`${prefix}queue_col_subdetail`]) : undefined,
      queueShowSize: isQueue ? Boolean(body[`${prefix}queue_col_size`]) : undefined,
      queueShowProtocol: isQueue ? Boolean(body[`${prefix}queue_col_protocol`]) : undefined,
      queueShowTimeLeft: isQueue ? Boolean(body[`${prefix}queue_col_timeLeft`]) : undefined,
      queueShowProgress: isQueue ? Boolean(body[`${prefix}queue_col_progress`]) : undefined,
      queueVisibleRows,
      order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
    };
  });
}

function getTautulliCards(appItem) {
  if (!appItem || appItem.id !== 'tautulli') return [];
  return TAUTULLI_WATCH_CARDS;
}

function mergeTautulliCardSettings(appItem) {
  const cards = getTautulliCards(appItem);
  if (!cards.length) return [];
  const saved = Array.isArray(appItem.tautulliCards) ? appItem.tautulliCards : [];
  const savedMap = new Map(saved.map((item) => [item.id, item]));
  return cards
    .map((card, index) => {
      const savedItem = savedMap.get(card.id) || {};
      const orderValue = Number(savedItem.order);
      return {
        id: card.id,
        name: card.name,
        enable: savedItem.enable === undefined ? true : Boolean(savedItem.enable),
        order: Number.isFinite(orderValue) ? orderValue : index + 1,
      };
    })
    .sort((a, b) => {
      const orderDelta = a.order - b.order;
      if (orderDelta !== 0) return orderDelta;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function buildTautulliCardsFromRequest(appItem, body) {
  const cards = getTautulliCards(appItem);
  if (!cards.length) return appItem.tautulliCards;
  return cards.map((card, index) => {
    const orderValue = body[`tautulli_card_order_${card.id}`];
    const parsedOrder = Number(orderValue);
    return {
      id: card.id,
      enable: Boolean(body[`tautulli_card_enable_${card.id}`]),
      order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
    };
  });
}

function buildTautulliCardsFromDashboardRequest(appItem, body) {
  const cards = getTautulliCards(appItem);
  if (!cards.length) return appItem.tautulliCards;
  const candidates = ['watch-stats', 'watch-stats-wheel'];
  const activePrefix = candidates.find((prefix) =>
    cards.some((card) =>
      body[`dashboard_tautulli_card_enable_${prefix}_${card.id}`] !== undefined
      || body[`dashboard_tautulli_card_order_${prefix}_${card.id}`] !== undefined
    )
  );
  if (!activePrefix) return appItem.tautulliCards;
  return cards.map((card, index) => {
    const orderValue = body[`dashboard_tautulli_card_order_${activePrefix}_${card.id}`];
    const parsedOrder = Number(orderValue);
    return {
      id: card.id,
      enable: Boolean(body[`dashboard_tautulli_card_enable_${activePrefix}_${card.id}`]),
      order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
    };
  });
}


function resolveLaunchUrl(appItem, req) {
  const localUrl = appItem.localUrl || appItem.url || '';
  const remoteUrl = appItem.remoteUrl || appItem.url || '';
  const host = getRequestHost(req);
  const clientIp = req.ip || '';
  const hostIsLocal = host ? isLocalHost(host) : false;
  const ipIsLocal = isPrivateIp(clientIp);
  const isLocal = host ? hostIsLocal : ipIsLocal;

  if (isLocal) return localUrl || remoteUrl;
  return remoteUrl || localUrl;
}

async function resolveDeepLaunchUrl(appItem, req, options = {}) {
  const query = String(options.query || '').trim();
  const imdbId = String(options.imdbId || '').trim();
  const tmdbId = String(options.tmdbId || '').trim();
  const mediaType = String(options.mediaType || '').trim().toLowerCase();
  const plexToken = String(options.plexToken || '').trim();
  const effectiveQuery = query || imdbId || tmdbId;
  if (!effectiveQuery) return '';
  const launchUrl = String(resolveLaunchUrl(appItem, req) || '').trim();
  if (!launchUrl) return '';

  if (appItem?.id === 'tautulli') {
    const base = normalizeBaseUrl(launchUrl);
    const apiKey = String(appItem.apiKey || '').trim();
    const ratingKey = await resolveTautulliRatingKey({ base, apiKey, query: effectiveQuery, imdbId, tmdbId, mediaType });
    if (ratingKey) {
      return base.replace(/\/+$/, '') + '/info?rating_key=' + encodeURIComponent(ratingKey);
    }
    return base.replace(/\/+$/, '') + '/search?query=' + encodeURIComponent(effectiveQuery);
  }

  if (appItem?.id === 'plex') {
    let url = launchUrl;
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      const pathName = String(parsed.pathname || '').replace(/\/+$/, '');
      const ratingKey = await resolvePlexRatingKey({
        baseUrl: origin,
        token: plexToken,
        query: effectiveQuery,
        imdbId,
        tmdbId,
      });
      const detailsKey = ratingKey ? '/library/metadata/' + ratingKey : '';
      const machineId = detailsKey
        ? await resolvePlexMachineIdentifier({ baseUrl: origin, token: plexToken })
        : '';
      const detailsHash = detailsKey
        ? (machineId
          ? ('#!/server/' + encodeURIComponent(machineId) + '/details?key=' + encodeURIComponent(detailsKey))
          : ('#!/details?key=' + encodeURIComponent(detailsKey)))
        : '';
      if (/\/web\/index\.html$/i.test(pathName)) {
        return detailsHash
          ? (origin + pathName + detailsHash)
          : (origin + pathName + '#!/search?query=' + encodeURIComponent(effectiveQuery));
      }
      if (/\/web$/i.test(pathName)) {
        return detailsHash
          ? (origin + pathName + '/index.html' + detailsHash)
          : (origin + pathName + '/index.html#!/search?query=' + encodeURIComponent(effectiveQuery));
      }
      return detailsHash
        ? (origin + '/web/index.html' + detailsHash)
        : (origin + '/web/index.html#!/search?query=' + encodeURIComponent(effectiveQuery));
    } catch (err) {
      return launchUrl;
    }
  }

  return launchUrl;
}

async function resolveTautulliRatingKey({ base, apiKey, query, imdbId, tmdbId, mediaType }) {
  if (!base || !apiKey) return '';
  const hasIds = Boolean(imdbId || tmdbId);
  const searchTerms = [];
  if (imdbId) searchTerms.push(imdbId);
  if (tmdbId) searchTerms.push(tmdbId);
  if (!hasIds && query) searchTerms.push(query);
  if (!searchTerms.length) return '';
  try {
    for (let termIndex = 0; termIndex < searchTerms.length; termIndex += 1) {
      const term = String(searchTerms[termIndex] || '').trim();
      if (!term) continue;
      const url = new URL('/api/v2', base);
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('cmd', 'search');
      url.searchParams.set('query', term);
      url.searchParams.set('limit', '20');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ({}));
      const responseData = payload?.response?.data || {};
      const directRows = Array.isArray(responseData) ? responseData : [];
      const resultLists = responseData && typeof responseData.results_list === 'object'
        ? Object.values(responseData.results_list).flatMap((value) => (Array.isArray(value) ? value : []))
        : [];
      const data = directRows.concat(resultLists);
      if (!data.length) continue;
      const normalizedType = mediaType === 'show' ? 'tv' : mediaType;
      const direct = data.find((row) => {
        const guid = String(row?.guid || '').toLowerCase();
        const guids = Array.isArray(row?.guids) ? row.guids.map((g) => String(g || '').toLowerCase()) : [];
        const guidText = [guid].concat(guids).join(' ');
        if (imdbId && guid.includes(String(imdbId).toLowerCase())) return true;
        if (imdbId && guidText.includes(String(imdbId).toLowerCase())) return true;
        if (tmdbId && (guid.includes('tmdb://' + String(tmdbId).toLowerCase()) || guidText.includes(String(tmdbId).toLowerCase()))) return true;
        return false;
      }) || (!hasIds && data.find((row) => {
        if (!normalizedType) return true;
        const rowType = String(row?.media_type || row?.mediaType || '').toLowerCase();
        if (!rowType) return true;
        if (normalizedType === 'tv') return rowType.includes('show') || rowType.includes('episode');
        return rowType.includes(normalizedType);
      })) || (!hasIds ? data[0] : null);
      const ratingKey = String(direct?.rating_key || direct?.grandparent_rating_key || '').trim();
      if (ratingKey) return ratingKey;
    }
    return '';
  } catch (err) {
    return '';
  }
}

async function resolvePlexRatingKey({ baseUrl, token, query, imdbId, tmdbId }) {
  if (!baseUrl || !token) return '';
  const hasIds = Boolean(imdbId || tmdbId);
  const searchTerms = [];
  if (imdbId) searchTerms.push(imdbId);
  if (tmdbId) searchTerms.push(tmdbId);
  if (!hasIds && query) searchTerms.push(query);
  if (!searchTerms.length) return '';
  try {
    for (let termIndex = 0; termIndex < searchTerms.length; termIndex += 1) {
      const term = String(searchTerms[termIndex] || '').trim();
      if (!term) continue;
      const url = new URL('/search', baseUrl);
      url.searchParams.set('query', term);
      url.searchParams.set('X-Plex-Token', token);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/xml' } });
      if (!response.ok) continue;
      const xml = await response.text();
      const nodes = parsePlexSearchNodes(xml);
      if (!nodes.length) continue;
      const normalizedQuery = String(term || '').trim().toLowerCase();
      if (imdbId || tmdbId) {
        const normalizedImdb = String(imdbId || '').toLowerCase();
        const normalizedTmdb = String(tmdbId || '').toLowerCase();
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index];
          const guidText = node.guids.join(' ');
          if (normalizedImdb && guidText.includes(normalizedImdb)) return node.ratingKey;
          if (normalizedTmdb && guidText.includes(normalizedTmdb)) return node.ratingKey;
        }
      }
      if (!hasIds) {
        const exactTitle = nodes.find((node) => String(node.title || '').toLowerCase() === normalizedQuery);
        if (exactTitle?.ratingKey) return exactTitle.ratingKey;
        if (nodes[0]?.ratingKey) return String(nodes[0].ratingKey).trim();
      }
    }
    return '';
  } catch (err) {
    return '';
  }
}

function parsePlexSearchNodes(xmlText) {
  const xml = String(xmlText || '');
  const nodes = [];
  const pattern = /<(Video|Directory|Track)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(xml);
  while (match) {
    const attrs = String(match[2] || '');
    const body = String(match[3] || '');
    const ratingKeyMatch = attrs.match(/\bratingKey="([^"]+)"/i);
    const titleMatch = attrs.match(/\btitle="([^"]+)"/i)
      || attrs.match(/\bgrandparentTitle="([^"]+)"/i)
      || attrs.match(/\bparentTitle="([^"]+)"/i);
    const ratingKey = String(ratingKeyMatch?.[1] || '').trim();
    if (ratingKey) {
      const guids = Array.from(body.matchAll(/<Guid\b[^>]*\bid="([^"]+)"/gi))
        .map((guidMatch) => String(guidMatch?.[1] || '').toLowerCase())
        .filter(Boolean);
      nodes.push({
        ratingKey,
        title: String(titleMatch?.[1] || '').trim(),
        guids,
      });
    }
    match = pattern.exec(xml);
  }
  return nodes;
}

async function resolvePlexMachineIdentifier({ baseUrl, token }) {
  if (!baseUrl || !token) return '';
  try {
    const url = new URL('/identity', baseUrl);
    url.searchParams.set('X-Plex-Token', token);
    const response = await fetch(url.toString(), { headers: { Accept: 'application/xml' } });
    if (!response.ok) return '';
    const xml = await response.text();
    const match = xml.match(/\bmachineIdentifier="([^"]+)"/i);
    return String(match?.[1] || '').trim();
  } catch (err) {
    return '';
  }
}

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

function buildAppBaseUrls(apps, req) {
  return (apps || []).reduce((acc, appItem) => {
    if (!appItem?.id) return acc;
    acc[appItem.id] = resolveLaunchUrl(appItem, req);
    return acc;
  }, {});
}

function normalizeLaunchMode(value, fallback = 'new-tab') {
  const allowed = new Set(['disabled', 'new-tab', 'iframe']);
  const next = String(value || '').toLowerCase();
  if (allowed.has(next)) return next;
  return fallback;
}

function resolveAppLaunchMode(appItem, menu) {
  const configured = normalizeLaunchMode(appItem?.launchMode, '');
  if (configured) return configured;
  const accessMenu = menu || normalizeMenu(appItem);
  return accessMenu.launch.user || accessMenu.launch.admin ? 'new-tab' : 'disabled';
}

function resolveEffectiveLaunchMode(appItem, req, menu) {
  const configured = resolveAppLaunchMode(appItem, menu);
  return configured;
}

function shouldForceLocalNewTab(appItem, mode, req) {
  return false;
}

function getRequestHost(req) {
  if (!req) return '';
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || req.hostname || '';
  return String(host || '').trim();
}

function getRequestProto(req) {
  if (!req) return '';
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  if (forwardedProto) return forwardedProto;
  const proto = String(req.protocol || '').trim();
  if (proto) return proto;
  return isSecureEnv() ? 'https' : 'http';
}

function resolvePublicBaseUrl(req) {
  const config = loadConfig();
  const generalSettings = resolveGeneralSettings(config);
  const host = getRequestHost(req);
  if (generalSettings.localUrl && isLocalHost(host)) {
    const configuredLocal = normalizeBaseUrl(generalSettings.localUrl || '');
    if (configuredLocal) return configuredLocal;
  }
  const configured = normalizeBaseUrl(generalSettings.remoteUrl || '');
  if (configured) return configured;
  const proto = getRequestProto(req);
  if (host) return normalizeBaseUrl(`${proto}://${host}`);
  return normalizeBaseUrl(BASE_URL) || BASE_URL;
}

function isLocalHost(host) {
  if (!host) return false;
  const raw = String(host).trim().toLowerCase();
  const unwrapped = raw.startsWith('[') ? raw.slice(1, raw.indexOf(']')) : raw;
  const withoutPort = unwrapped.includes(':') && !unwrapped.includes('::')
    ? unwrapped.split(':')[0]
    : unwrapped;
  if (!withoutPort) return false;
  if (withoutPort === 'localhost' || withoutPort === '::1' || withoutPort.endsWith('.local')) return true;
  if (isPrivateIp(withoutPort)) return true;
  if (!withoutPort.includes('.')) return true;
  return false;
}

function isPrivateIp(ip) {
  if (!ip) return false;
  const normalized = ip.replace(/^::ffff:/, '');
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  const parts = normalized.split('.').map((part) => Number(part));
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function getOrCreatePlexClientId() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const idPath = path.join(DATA_DIR, 'plex_client_id.txt');
    if (fs.existsSync(idPath)) {
      const stored = fs.readFileSync(idPath, 'utf8').trim();
      if (stored) return stored;
    }
    const created = `launcharr-${crypto.randomBytes(12).toString('hex')}`;
    fs.writeFileSync(idPath, created);
    return created;
  } catch (err) {
    return `launcharr-${crypto.randomBytes(12).toString('hex')}`;
  }
}

function resolveArrDashboardCombineSettings(config, apps) {
  const configured = (config && typeof config.arrDashboardCombine === 'object' && config.arrDashboardCombine)
    ? config.arrDashboardCombine
    : {};
  const appIds = (Array.isArray(apps) ? apps : [])
    .map((appItem) => String(appItem?.id || '').trim().toLowerCase())
    .filter((id) => ARR_APP_IDS.includes(id));
  const hasConfigured = ARR_COMBINE_SECTIONS.some((section) => {
    const sectionValue = configured && typeof configured[section.key] === 'object' ? configured[section.key] : null;
    return sectionValue && Object.keys(sectionValue).length > 0;
  });

  return ARR_COMBINE_SECTIONS.reduce((acc, section) => {
    const sectionValue = (configured && typeof configured[section.key] === 'object' && configured[section.key])
      ? configured[section.key]
      : {};
    acc[section.key] = appIds.reduce((sectionAcc, appId) => {
      sectionAcc[appId] = hasConfigured ? Boolean(sectionValue[appId]) : true;
      return sectionAcc;
    }, {});
    return acc;
  }, {});
}

function resolveDownloaderDashboardCombineSettings(config, apps) {
  const configured = (config && typeof config.downloaderDashboardCombine === 'object' && config.downloaderDashboardCombine)
    ? config.downloaderDashboardCombine
    : {};
  const appIds = (Array.isArray(apps) ? apps : [])
    .map((appItem) => String(appItem?.id || '').trim().toLowerCase())
    .filter((id) => DOWNLOADER_APP_IDS.includes(id));
  const hasConfigured = DOWNLOADER_COMBINE_SECTIONS.some((section) => {
    const sectionValue = configured && typeof configured[section.key] === 'object' ? configured[section.key] : null;
    return sectionValue && Object.keys(sectionValue).length > 0;
  });

  return DOWNLOADER_COMBINE_SECTIONS.reduce((acc, section) => {
    const sectionValue = (configured && typeof configured[section.key] === 'object' && configured[section.key])
      ? configured[section.key]
      : {};
    acc[section.key] = appIds.reduce((sectionAcc, appId) => {
      sectionAcc[appId] = hasConfigured ? Boolean(sectionValue[appId]) : true;
      return sectionAcc;
    }, {});
    return acc;
  }, {});
}

function resolveMediaDashboardCombineSettings(config, apps) {
  const configured = (config && typeof config.mediaDashboardCombine === 'object' && config.mediaDashboardCombine)
    ? config.mediaDashboardCombine
    : {};
  const appIds = (Array.isArray(apps) ? apps : [])
    .map((appItem) => String(appItem?.id || '').trim().toLowerCase())
    .filter((id) => MEDIA_APP_IDS.includes(id));
  const hasConfigured = MEDIA_COMBINE_SECTIONS.some((section) => {
    const sectionValue = configured && typeof configured[section.key] === 'object' ? configured[section.key] : null;
    return sectionValue && Object.keys(sectionValue).length > 0;
  });

  return MEDIA_COMBINE_SECTIONS.reduce((acc, section) => {
    const sectionValue = (configured && typeof configured[section.key] === 'object' && configured[section.key])
      ? configured[section.key]
      : {};
    acc[section.key] = appIds.reduce((sectionAcc, appId) => {
      sectionAcc[appId] = hasConfigured ? Boolean(sectionValue[appId]) : true;
      return sectionAcc;
    }, {});
    return acc;
  }, {});
}

function normalizeAppId(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveQueueColumnLabels(appItem) {
  const appId = String(appItem?.id || '').trim().toLowerCase();
  if (appId === 'nzbget') {
    return { detailLabel: 'Category', subDetailLabel: 'Status' };
  }
  if (appId === 'transmission') {
    return { detailLabel: 'Status', subDetailLabel: 'Rate' };
  }
  if (appId === 'radarr') {
    return { detailLabel: 'Year', subDetailLabel: 'Studio' };
  }
  if (appId === 'lidarr') {
    return { detailLabel: 'Album', subDetailLabel: 'Track' };
  }
  if (appId === 'readarr') {
    return { detailLabel: 'Author', subDetailLabel: 'Book' };
  }
  return { detailLabel: 'Episode', subDetailLabel: 'Episode Title' };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function loadDefaultApps() {
  const fallbackPath = path.join(__dirname, '..', 'config', 'default-apps.json');
  try {
    const raw = fs.readFileSync(DEFAULT_APPS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.apps) ? parsed.apps : []);
    return dedupeApps(list);
  } catch (err) {
    try {
      const raw = fs.readFileSync(fallbackPath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.apps) ? parsed.apps : []);
      return dedupeApps(list);
    } catch (fallbackErr) {
      return [];
    }
  }
}

function loadDefaultCategories() {
  const fallbackPath = path.join(__dirname, '..', 'config', 'default-categories.json');
  try {
    const raw = fs.readFileSync(DEFAULT_CATEGORIES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeCategoryEntries(parsed);
  } catch (err) {
    try {
      const raw = fs.readFileSync(fallbackPath, 'utf8');
      const parsed = JSON.parse(raw);
      return normalizeCategoryEntries(parsed);
    } catch (fallbackErr) {
      return [];
    }
  }
}

function dedupeApps(apps) {
  const seen = new Set();
  const out = [];
  (Array.isArray(apps) ? apps : []).forEach((app) => {
    const id = normalizeAppId(app?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(app);
  });
  return out;
}

function mergeAppDefaults(defaultApps, overrideApps) {
  const defaults = dedupeApps(defaultApps);
  const overrides = dedupeApps(overrideApps);
  const overrideMap = new Map(
    overrides
      .filter((app) => normalizeAppId(app?.id))
      .map((app) => [normalizeAppId(app.id), app])
  );

  const merged = defaults
    .filter((app) => normalizeAppId(app?.id))
    .map((app) => {
      const override = overrideMap.get(normalizeAppId(app.id));
      return override ? { ...app, ...override } : app;
    });

  const defaultIds = new Set(defaults.map((app) => normalizeAppId(app?.id)).filter(Boolean));
  const custom = overrides
    .filter((app) => {
      const id = normalizeAppId(app?.id);
      return id && !defaultIds.has(id);
    });

  return [...merged, ...custom];
}

function mergeCategoryDefaults(defaultCategories, overrideCategories) {
  const defaults = normalizeCategoryEntries(defaultCategories);
  const overrides = normalizeCategoryEntries(overrideCategories);
  const defaultMap = new Map(
    defaults
      .filter((entry) => entry?.name)
      .map((entry) => [String(entry.name).toLowerCase(), entry])
  );
  const seen = new Set();
  const ordered = overrides
    .filter((entry) => entry?.name)
    .map((entry) => {
      const key = String(entry.name).toLowerCase();
      const base = defaultMap.get(key);
      seen.add(key);
      if (!base) return entry;
      const mergedEntry = { ...base, ...entry };
      const iconValue = String(entry.icon || '').trim();
      if (!iconValue || iconValue === '/icons/category.svg') {
        mergedEntry.icon = base.icon;
      }
      return mergedEntry;
    });

  const missingDefaults = defaults.filter((entry) => {
    const key = String(entry.name || '').toLowerCase();
    return key && !seen.has(key);
  });

  return [...ordered, ...missingDefaults];
}

function buildCategoryOverrides(defaultCategories, mergedCategories) {
  return normalizeCategoryEntries(mergedCategories);
}

function buildAppOverrides(defaultApps, mergedApps) {
  const defaults = Array.isArray(defaultApps) ? defaultApps : [];
  const apps = Array.isArray(mergedApps) ? mergedApps : [];
  const defaultMap = new Map(
    defaults
      .filter((app) => normalizeAppId(app?.id))
      .map((app) => [normalizeAppId(app.id), app])
  );

  return apps
    .map((app) => {
      const id = normalizeAppId(app?.id);
      if (!id) return null;
      const base = defaultMap.get(id);
      if (!base) return app;
      const override = { id: app.id };
      Object.keys(app).forEach((key) => {
        if (key === 'id') return;
        if (!deepEqual(app[key], base[key])) {
          override[key] = app[key];
        }
      });
      return Object.keys(override).length > 1 ? override : null;
    })
    .filter(Boolean);
}

function loadConfig() {
  const defaults = loadDefaultApps();
  const defaultCategories = loadDefaultCategories();
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      }
      if (fs.existsSync(CONFIG_EXAMPLE_PATH)) {
        fs.copyFileSync(CONFIG_EXAMPLE_PATH, CONFIG_PATH);
      } else {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apps: [], categories: [] }, null, 2));
      }
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const overrideApps = parsed && Array.isArray(parsed.apps) ? parsed.apps : [];
    const overrideCategories = parsed && Array.isArray(parsed.categories) ? parsed.categories : [];
    const mergedApps = mergeAppDefaults(defaults, overrideApps);
    const mergedCategories = mergeCategoryDefaults(defaultCategories, overrideCategories);
    return { ...parsed, apps: mergedApps, categories: mergedCategories };
  } catch (err) {
    return { apps: defaults, categories: defaultCategories };
  }
}

function saveConfig(config) {
  const defaults = loadDefaultApps();
  const defaultCategories = loadDefaultCategories();
  const nextConfig = { ...config };
  if (defaults.length) {
    nextConfig.apps = buildAppOverrides(defaults, nextConfig.apps);
  }
  if (defaultCategories.length) {
    nextConfig.categories = buildCategoryOverrides(defaultCategories, nextConfig.categories);
  }
  if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
}

function groupByCategory(apps) {
  const grouped = new Map();
  for (const appItem of apps) {
    const key = appItem.category || 'apps';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(appItem);
  }
  return Array.from(grouped.entries()).map(([category, items]) => ({
    category,
    items,
  }));
}

function isVisible(appItem, role) {
  if (!role) return false;
  const access = getMenuAccess(appItem, role);
  return hasAnyMenuAccess(access);
}

function normalizeRoles(appItem) {
  if (!appItem) return [];
  if (Array.isArray(appItem.roles)) return appItem.roles.map((r) => r.toLowerCase());
  if (appItem.role) return [String(appItem.role).toLowerCase()];
  return [];
}

function resolveRole(plexUser) {
  const identifiers = [
    plexUser.username,
    plexUser.email,
    plexUser.title,
  ].filter(Boolean);

  const admins = loadAdmins();
  if (matches(admins, identifiers)) return 'admin';

  const coAdmins = loadCoAdmins();
  if (matches(coAdmins, identifiers)) return 'co-admin';

  if (admins.length === 0) {
    const adminKey = identifiers[0];
    if (adminKey) {
      saveAdmins([adminKey]);
      return 'admin';
    }
  }

  return 'user';
}

function matches(list, identifiers) {
  const normalized = list.map((value) => value.toLowerCase());
  return identifiers.some((value) => normalized.includes(String(value).toLowerCase()));
}

function loadAdmins() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const adminPath = path.join(DATA_DIR, 'admins.json');
  if (fs.existsSync(adminPath)) {
    try {
      const raw = fs.readFileSync(adminPath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.admins)) return data.admins;
    } catch (err) {
      return [];
    }
  }

  if (ADMIN_USERS.length) {
    saveAdmins(ADMIN_USERS);
    return ADMIN_USERS;
  }

  return [];
}

function saveAdmins(admins) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const adminPath = path.join(DATA_DIR, 'admins.json');
  fs.writeFileSync(adminPath, JSON.stringify({ admins }, null, 2));
}

function loadCoAdmins() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const coAdminPath = path.join(DATA_DIR, 'coadmins.json');
  if (fs.existsSync(coAdminPath)) {
    try {
      const raw = fs.readFileSync(coAdminPath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.coAdmins)) return data.coAdmins;
    } catch (err) {
      return [];
    }
  }

  return [];
}

function saveCoAdmins(coAdmins) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const coAdminPath = path.join(DATA_DIR, 'coadmins.json');
  fs.writeFileSync(coAdminPath, JSON.stringify({ coAdmins }, null, 2));
}

async function getPlexDiscoveryWatchlisted() {
  const now = Date.now();
  if (plexDiscoveryWatchlistedCache.payload && plexDiscoveryWatchlistedCache.expiresAt > now) {
    return { ...plexDiscoveryWatchlistedCache.payload, cached: true };
  }

  const response = await fetch(PLEX_DISCOVERY_WATCHLISTED_URL, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': PRODUCT,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Plex discovery request failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const html = await response.text();
  const items = parsePlexDiscoveryTiles(html).slice(0, 80);
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: PLEX_DISCOVERY_WATCHLISTED_URL,
    items,
  };
  const ttlMs = items.length ? PLEX_DISCOVERY_CACHE_TTL_MS : 30 * 1000;

  plexDiscoveryWatchlistedCache = {
    expiresAt: now + ttlMs,
    payload,
  };

  return { ...payload, cached: false };
}

function parsePlexDiscoveryTiles(html) {
  const source = String(html || '');
  const normalized = source
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=');
  const sources = [normalized, source];
  const dedupe = new Map();

  sources.forEach((blob) => {
    const chunks = String(blob || '').split('"_component":"ArtworkTile"');
    for (let i = 0; i < chunks.length - 1; i += 1) {
      const prefix = chunks[i].slice(-5000);
      const suffix = chunks[i + 1].slice(0, 800);

      const linkMatches = Array.from(prefix.matchAll(/"link":{"url":"([^"]+)","external":(?:true|false)}/g));
      const imageMatches = Array.from(prefix.matchAll(/"image":{"url":"([^"]+)"/g));
      const ratingKeyMatches = Array.from(prefix.matchAll(/"ratingKey":"([^"]+)"/g));
      const titleMatch = suffix.match(/,"title":"((?:\\.|[^"\\])+)"/);
      const subtitleMatch = suffix.match(/"subtitles":\[(.*?)\]/);

      const rawLink = decodePlexEscapes(linkMatches.length ? linkMatches[linkMatches.length - 1][1] : '');
      const title = decodePlexEscapes(titleMatch ? titleMatch[1] : '').trim();
      if (!rawLink || !title) continue;

      const link = rawLink.startsWith('http') ? rawLink : `https://watch.plex.tv${rawLink}`;
      if (dedupe.has(link)) continue;

      const thumbRaw = imageMatches.length ? imageMatches[imageMatches.length - 1][1] : '';
      const ratingKey = decodePlexEscapes(ratingKeyMatches.length ? ratingKeyMatches[ratingKeyMatches.length - 1][1] : '');
      const subtitleValues = parsePlexSubtitleList(subtitleMatch ? subtitleMatch[1] : '');
      const year = subtitleValues.find((value) => /^\d{4}$/.test(value)) || '';
      const watchlistedCountLabel = extractWatchlistedCountLabel(subtitleValues, prefix + suffix);
      const kind = rawLink.includes('/show/') ? 'tv' : (rawLink.includes('/movie/') ? 'movie' : 'movie');
      const slug = String(rawLink)
        .replace(/^https?:\/\/[^/]+/i, '')
        .split('?')[0]
        .split('/')
        .filter(Boolean)
        .slice(1)
        .join('/');

      dedupe.set(link, {
        kind,
        title,
        year,
        subtitle: subtitleValues.join(' • '),
        watchlistedCountLabel,
        thumb: decodePlexEscapes(thumbRaw),
        ratingKey,
        slug,
        link,
      });
    }
  });

  return Array.from(dedupe.values());
}

function parsePlexSubtitleList(value) {
  const source = decodePlexEscapes(value || '');
  const matches = source.match(/"([^"]+)"/g) || [];
  return matches.map((entry) => entry.replace(/^"|"$/g, '').trim()).filter(Boolean);
}

function extractWatchlistedCountLabel(values, rawChunk = '') {
  const list = Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];
  for (let index = 0; index < list.length; index += 1) {
    const value = list[index];
    const lower = value.toLowerCase();
    if (!lower.includes('watchlist')) continue;
    const countMatch = value.match(/(\d[\d.,]*\s*[kmb]?)/i);
    if (countMatch) {
      const raw = String(countMatch[1] || '').replace(/\s+/g, '').trim();
      if (raw) return raw + ' watchlists';
    }
    return value;
  }
  const raw = decodePlexEscapes(String(rawChunk || ''));
  const patterns = [
    /(\d[\d.,]*\s*[kmb]?)\s+(?:people\s+)?watchlist(?:ed|s)?/i,
    /watchlist(?:ed|s)?\s+by\s+(\d[\d.,]*\s*[kmb]?)/i,
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = raw.match(patterns[index]);
    if (!match) continue;
    const rawCount = String(match[1] || '').replace(/\s+/g, '').trim();
    if (rawCount) return rawCount + ' watchlists';
  }
  return '';
}

async function fetchPlexDiscoveryMetadata(ratingKey, token) {
  const url = `https://discover.provider.plex.tv/library/metadata/${encodeURIComponent(ratingKey)}?X-Plex-Token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/xml',
      ...plexHeaders(),
    },
  });
  const xmlText = await response.text();
  if (!response.ok) {
    throw new Error(`Plex metadata request failed (${response.status}): ${xmlText.slice(0, 180)}`);
  }

  const match = xmlText.match(/<(Video|Directory)\b[^>]*>/);
  const attrs = parseXmlAttributes(match ? match[0] : '');
  const guidCandidates = Array.from(xmlText.matchAll(/<Guid\b[^>]*\bid="([^"]+)"/gi))
    .map((entry) => String(entry?.[1] || '').trim())
    .concat([
      String(attrs.guid || '').trim(),
      String(attrs.parentGuid || '').trim(),
      String(attrs.grandparentGuid || '').trim(),
    ])
    .filter(Boolean);
  let imdbId = '';
  let tmdbId = '';
  guidCandidates.forEach((guidValue) => {
    const value = String(guidValue || '').trim();
    const lower = value.toLowerCase();
    if (!imdbId && lower.startsWith('imdb://')) {
      const id = value.slice('imdb://'.length).split('?')[0].trim();
      if (/^tt\d+$/i.test(id)) imdbId = id;
    }
    if (!tmdbId && lower.startsWith('tmdb://')) {
      const id = value.slice('tmdb://'.length).split('?')[0].trim();
      if (/^\d+$/.test(id)) tmdbId = id;
    }
  });
  return {
    summary: String(attrs.summary || '').trim(),
    studio: String(attrs.studio || '').trim(),
    contentRating: String(attrs.contentRating || '').trim(),
    tagline: String(attrs.tagline || '').trim(),
    year: String(attrs.year || '').trim(),
    imdbId,
    tmdbId,
  };
}

function buildWatchlistStateFromActions(actions) {
  const addAction = actions.find((action) => action && action.id === 'addToWatchlist');
  const removeAction = actions.find((action) => action && action.id === 'removeFromWatchlist');
  const upsell = actions.find((action) => action && action.id === 'upsellWatchlist');

  if (upsell && upsell.visible) {
    return {
      allowed: false,
      signedIn: false,
      isWatchlisted: false,
      nextAction: 'add',
      label: 'Sign in to Watchlist',
    };
  }

  if (!addAction && !removeAction) {
    return {
      allowed: false,
      signedIn: true,
      isWatchlisted: false,
      nextAction: 'add',
      label: 'Watchlist unavailable',
    };
  }

  const isWatchlisted = Boolean(removeAction && removeAction.visible);
  return {
    allowed: true,
    signedIn: true,
    isWatchlisted,
    nextAction: isWatchlisted ? 'remove' : 'add',
    label: isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist',
  };
}

async function fetchPlexWatchlistState({ kind, slug, token }) {
  const actions = await fetchPlexDiscoveryActions({ kind, slug, token });
  return buildWatchlistStateFromActions(actions);
}

async function resolvePlexDiscoverRatingKey({ kind, slug, token }) {
  const actions = await fetchPlexDiscoveryActions({ kind, slug, token });
  for (const action of actions) {
    const key = action?.data?.ratingKey;
    if (key) return String(key);
  }
  return '';
}

async function updatePlexWatchlist({ kind, slug, action, token }) {
  const actions = await fetchPlexDiscoveryActions({ kind, slug, token });
  const actionId = action === 'remove' ? 'removeFromWatchlist' : 'addToWatchlist';
  const target = actions.find((entry) => entry && entry.id === actionId);
  if (!target || !target.data || !target.data.url) {
    throw new Error(`Watchlist action not available (${actionId}).`);
  }

  const method = String(target.data.method || 'PUT').toUpperCase();
  const response = await fetch(String(target.data.url), {
    method,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'X-Plex-Token': token,
      ...plexHeaders(),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Watchlist update failed (${response.status}): ${text.slice(0, 180)}`);
  }
}

async function fetchPlexDiscoveryActions({ kind, slug, token }) {
  const sourceKind = kind === 'tv' ? 'show' : 'movie';
  const normalizedSlug = String(slug || '').replace(/^\/+/, '').replace(/^.*\//, '');
  const discoverSlug = `${sourceKind}:${normalizedSlug}`;
  const url = `https://luma.plex.tv/api/action/get-actions-for-metadata-item?slug=${encodeURIComponent(discoverSlug)}&detailsSource=discover&screen.type=List`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
      ...plexHeaders(),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Plex action request failed (${response.status}).`);
  }
  return Array.isArray(payload.actions) ? payload.actions : [];
}

function parseXmlAttributes(tag) {
  const attrs = {};
  String(tag || '').replace(/(\w+)="([^"]*)"/g, (_m, key, value) => {
    attrs[key] = decodeXmlEntities(value);
    return '';
  });
  return attrs;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code) || 0))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16) || 0));
}

function decodePlexEscapes(value) {
  return String(value || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

function requireAdmin(req, res, next) {
  const role = getEffectiveRole(req);
  if (role === 'admin') return next();
  pushLog({
    level: 'error',
    app: 'system',
    action: 'access.denied',
    message: 'Admin access required.',
    meta: { path: req.originalUrl || req.url || '' },
  });
  res.status(403).send('Admin access required.');
}

function requireActualAdmin(req, res, next) {
  const role = getActualRole(req);
  if (role === 'admin') return next();
  pushLog({
    level: 'error',
    app: 'system',
    action: 'access.denied',
    message: 'Admin access required.',
    meta: { path: req.originalUrl || req.url || '' },
  });
  res.status(403).send('Admin access required.');
}

function requireSettingsAdmin(req, res, next) {
  const role = getActualRole(req);
  if (role === 'admin') return next();
  pushLog({
    level: 'error',
    app: 'system',
    action: 'access.denied',
    message: 'Settings access denied.',
    meta: { path: req.originalUrl || req.url || '' },
  });
  res.status(403).send('Admin access required.');
}

function requireUser(req, res, next) {
  const role = getActualRole(req);
  if (role) return next();
  pushLog({
    level: 'error',
    app: 'system',
    action: 'auth.required',
    message: 'User authentication required.',
    meta: { path: req.originalUrl || req.url || '' },
  });
  res.redirect('/login');
}

function getActualRole(req) {
  return req.session?.user?.role;
}

function getEffectiveRole(req) {
  const actualRole = getActualRole(req);
  const viewRole = req.session?.viewRole;
  if (actualRole === 'admin' && viewRole === 'user') return 'user';
  return actualRole;
}

function resolveReturnPath(req, fallback = '/dashboard') {
  const referrer = req.get('referer');
  if (!referrer) return fallback;
  try {
    const host = req.headers.host || '';
    const url = new URL(referrer, `http://${host}`);
    if (url.host !== host) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (err) {
    return fallback;
  }
}

async function completePlexLogin(req, authToken) {
  const plexUser = await fetchPlexUser(authToken);
  const role = resolveRole(plexUser);
  const config = loadConfig();
  const apps = config.apps || [];
  const generalSettings = resolveGeneralSettings(config);
  const plexApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'plex');
  let serverResource = null;
  let serverToken = '';
  let isServerOwner = false;

  if (!role) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'login.callback',
      message: 'Access denied for Plex user.',
      meta: { user: plexUser?.username || plexUser?.title || plexUser?.email || '' },
    });
    throw new Error('Access denied for this Plex user.');
  }

  if (plexApp) {
    try {
      const resources = await fetchPlexResources(authToken);
      serverResource = resolvePlexServerResource(resources, {
        machineId: String(plexApp?.plexMachine || '').trim(),
        localUrl: plexApp?.localUrl,
        remoteUrl: plexApp?.remoteUrl,
        plexHost: plexApp?.plexHost,
      });
      serverToken = String(serverResource?.accessToken || '').trim();
      isServerOwner = isPlexServerOwner(serverResource);
      const debug = buildPlexResourceDebug(resources, {
        machineId: String(plexApp?.plexMachine || '').trim(),
        localUrl: plexApp?.localUrl,
        remoteUrl: plexApp?.remoteUrl,
        plexHost: plexApp?.plexHost,
      });
      pushLog({
        level: 'info',
        app: 'plex',
        action: 'login.resources',
        message: serverToken ? 'Plex server token resolved.' : 'Plex server token not resolved.',
        meta: debug,
      });
    } catch (err) {
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'login.resources',
        message: safeMessage(err) || 'Failed to resolve Plex server resources.',
      });
      if (generalSettings.restrictGuests) {
        const denied = new Error('Access restricted to Plex server users.');
        denied.status = 403;
        throw denied;
      }
    }
  }

  if (generalSettings.restrictGuests && plexApp) {
    const hasAccess = Boolean(serverResource && String(serverResource.accessToken || '').trim());
    if (!hasAccess) {
      pushLog({
        level: 'error',
        app: 'plex',
        action: 'login.denied',
        message: 'Blocked Plex guest user login.',
        meta: { user: plexUser?.username || plexUser?.title || plexUser?.email || '' },
      });
      const denied = new Error('Access restricted to Plex server users.');
      denied.status = 403;
      throw denied;
    }
  }

  const rawAvatar = plexUser.thumb || plexUser.avatar || plexUser.photo || null;
  const avatar = rawAvatar
    ? (rawAvatar.startsWith('http') ? rawAvatar : `https://plex.tv${rawAvatar}`)
    : null;

  req.session.user = {
    username: plexUser.username || plexUser.title || 'Plex User',
    email: plexUser.email || null,
    avatar,
    role,
    source: 'plex',
  };
  req.session.viewRole = null;
  req.session.authToken = authToken;
  req.session.plexServerToken = null;
  req.session.pinId = null;

  const loginIdentifier = plexUser.email || plexUser.username || plexUser.title || plexUser.id || '';
  let nextConfig = updateUserLogins(config, {
    identifier: loginIdentifier,
    launcharr: true,
  });
  let configUpdated = nextConfig !== config;

  if (serverToken) {
    req.session.plexServerToken = serverToken;
    if (role === 'admin' && isServerOwner && serverToken !== plexApp.plexToken) {
      const nextApps = apps.map((appItem) => (normalizeAppId(appItem?.id) === 'plex'
        ? { ...appItem, plexToken: serverToken }
        : appItem
      ));
      nextConfig = { ...nextConfig, apps: nextApps };
      configUpdated = true;
    } else if (role === 'admin' && !isServerOwner && serverToken !== plexApp.plexToken) {
      pushLog({
        level: 'info',
        app: 'plex',
        action: 'token.save',
        message: 'Skipped Plex token update; only server owner can update token.',
        meta: { user: req.session?.user?.username || '' },
      });
    }
  }

  if (configUpdated) {
    saveConfig(nextConfig);
  }

  pushLog({
    level: 'info',
    app: 'plex',
    action: 'login.success',
    message: 'Plex login successful.',
    meta: { user: req.session.user.username || '', role },
  });
}

function plexHeaders() {
  return {
    'X-Plex-Client-Identifier': CLIENT_ID,
    'X-Plex-Product': PRODUCT,
    'X-Plex-Platform': PLATFORM,
    'X-Plex-Device': PLATFORM,
    'X-Plex-Device-Name': DEVICE_NAME,
  };
}

async function fetchPlexResources(token) {
  const res = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
      ...plexHeaders(),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plex resources request failed (${res.status}): ${text.slice(0, 180)}`);
  }
  return res.json();
}

function resolvePlexServerToken(resources, { machineId, localUrl, remoteUrl, plexHost }) {
  const match = resolvePlexServerResource(resources, { machineId, localUrl, remoteUrl, plexHost });
  return match?.accessToken || '';
}

function resolvePlexServerResource(resources, { machineId, localUrl, remoteUrl, plexHost }) {
  const list = Array.isArray(resources)
    ? resources
    : (resources?.MediaContainer?.Device || resources?.mediaContainer?.Device || []);
  const servers = (Array.isArray(list) ? list : [])
    .filter((item) => String(item?.provides || '').includes('server'));
  const normalizeId = (value) => String(value || '').trim();
  const machine = normalizeId(machineId);
  if (machine) {
    const match = servers.find((item) =>
      normalizeId(item?.clientIdentifier || item?.clientidentifier) === machine
    );
    if (match) return match;
  }

  const toHost = (value) => {
    if (!value) return '';
    try {
      return new URL(String(value)).hostname.toLowerCase();
    } catch (err) {
      return String(value).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    }
  };
  const hostCandidates = [localUrl, remoteUrl, plexHost]
    .map(toHost)
    .filter(Boolean);

  if (hostCandidates.length) {
    for (const server of servers) {
      const connections = Array.isArray(server?.connections)
        ? server.connections
        : (Array.isArray(server?.Connection) ? server.Connection : []);
      const connectionHosts = connections
        .map((conn) => toHost(conn?.uri || conn?.address || conn?.host))
        .filter(Boolean);
      if (connectionHosts.some((host) => hostCandidates.includes(host))) {
        return server;
      }
    }
  }

  if (servers.length === 1) return servers[0];
  return null;
}

function isPlexServerOwner(server) {
  if (!server) return false;
  const value = server?.owned ?? server?.owner ?? server?.isOwner;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return false;
}

function buildPlexResourceDebug(resources, { machineId, localUrl, remoteUrl, plexHost }) {
  const list = Array.isArray(resources)
    ? resources
    : (resources?.MediaContainer?.Device || resources?.mediaContainer?.Device || []);
  const servers = (Array.isArray(list) ? list : [])
    .filter((item) => String(item?.provides || '').includes('server'));
  const normalizeId = (value) => String(value || '').trim();
  const machine = normalizeId(machineId);
  const toHost = (value) => {
    if (!value) return '';
    try {
      return new URL(String(value)).hostname.toLowerCase();
    } catch (err) {
      return String(value).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    }
  };
  const hostCandidates = [localUrl, remoteUrl, plexHost]
    .map(toHost)
    .filter(Boolean);
  const machineMatch = machine
    ? servers.some((item) => normalizeId(item?.clientIdentifier || item?.clientidentifier) === machine)
    : false;
  const hostMatch = hostCandidates.length
    ? servers.some((server) => {
      const connections = Array.isArray(server?.connections)
        ? server.connections
        : (Array.isArray(server?.Connection) ? server.Connection : []);
      const connectionHosts = connections
        .map((conn) => toHost(conn?.uri || conn?.address || conn?.host))
        .filter(Boolean);
      return connectionHosts.some((host) => hostCandidates.includes(host));
    })
    : false;
  const serverSummaries = servers.map((server) => {
    const connections = Array.isArray(server?.connections)
      ? server.connections
      : (Array.isArray(server?.Connection) ? server.Connection : []);
    const connectionHosts = connections
      .map((conn) => toHost(conn?.uri || conn?.address || conn?.host))
      .filter(Boolean);
    return {
      name: String(server?.name || ''),
      clientIdentifier: normalizeId(server?.clientIdentifier || server?.clientidentifier),
      connectionHosts,
    };
  });
  return {
    serverCount: servers.length,
    machineMatch,
    hostMatch,
    hasMachineId: Boolean(machine),
    hostCandidates,
    servers: serverSummaries,
  };
}

async function fetchLatestDockerTag() {
  const res = await fetch('https://registry.hub.docker.com/v2/repositories/mickygx/launcharr/tags?page_size=50', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docker Hub tag lookup failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const payload = await res.json();
  const tags = Array.isArray(payload?.results) ? payload.results : [];
  const parsed = tags
    .map((tag) => {
      const name = String(tag?.name || '').trim();
      const semver = parseSemver(name);
      if (!semver) return null;
      return { name: normalizeVersionTag(name), semver };
    })
    .filter(Boolean);
  if (!parsed.length) return '';
  parsed.sort((a, b) => compareSemver(b.semver, a.semver));
  return parsed[0].name;
}

function parsePlexUsers(xmlText, options = {}) {
  const machineId = String(options.machineId || '').trim();
  const users = [];
  const blocks = String(xmlText || '').match(/<User\b[^>]*>[\s\S]*?<\/User>/g) || [];
  blocks.forEach((block) => {
    const userTagMatch = block.match(/<User\b[^>]*>/);
    if (!userTagMatch) return;
    const attrs = {};
    userTagMatch[0].replace(/(\w+)="([^"]*)"/g, (_m, key, value) => {
      attrs[key] = value;
      return '';
    });
    const serverTags = block.match(/<Server\b[^>]*>/g) || [];
    const servers = serverTags.map((tag) => {
      const serverAttrs = {};
      tag.replace(/(\w+)="([^"]*)"/g, (_m, key, value) => {
        serverAttrs[key] = value;
        return '';
      });
      return serverAttrs;
    });
    let serverMatch = null;
    if (machineId) {
      serverMatch = servers.find((server) => String(server.machineIdentifier || '') === machineId) || null;
    }
    if (!serverMatch) {
      serverMatch = servers.find((server) => String(server.owned || '') === '1') || null;
    }
    if (!serverMatch) {
      serverMatch = servers[0] || null;
    }
    users.push({
      id: attrs.id || attrs.uuid || '',
      uuid: attrs.uuid || '',
      username: attrs.username || '',
      email: attrs.email || '',
      title: attrs.title || '',
      lastSeenAt: serverMatch?.lastSeenAt || serverMatch?.last_seen_at || '',
    });
  });
  return users;
}

async function ensureKeypair() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const privatePath = path.join(DATA_DIR, 'plex_private.pem');
  const publicPath = path.join(DATA_DIR, 'plex_public.json');

  if (fs.existsSync(privatePath) && fs.existsSync(publicPath)) {
    const privatePem = fs.readFileSync(privatePath, 'utf8');
    const publicBundle = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
    return { privatePem, publicJwk: publicBundle.jwk, kid: publicBundle.kid };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'EdDSA';
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;

  fs.writeFileSync(privatePath, privatePem);
  fs.writeFileSync(publicPath, JSON.stringify({ jwk: publicJwk, kid }, null, 2));

  return { privatePem, publicJwk, kid };
}

function buildAuthUrl(code, pinId, baseUrl = BASE_URL) {
  const params = new URLSearchParams();
  params.set('clientID', CLIENT_ID);
  params.set('code', code);
  const callbackUrl = new URL('/oauth/callback', baseUrl);
  if (pinId) callbackUrl.searchParams.set('pinId', String(pinId));
  params.set('forwardUrl', callbackUrl.toString());
  params.set('context[device][product]', PRODUCT);
  params.set('context[device][platform]', PLATFORM);

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

async function exchangePin(pinId) {
  const url = `https://plex.tv/api/v2/pins/${pinId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...plexHeaders(),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PIN exchange failed (${res.status}): ${text}`);
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`PIN exchange JSON parse failed: ${text.slice(0, 180)}`);
  }
  if (!data?.authToken) {
    pushLog({
      level: 'error',
      app: 'plex',
      action: 'login.pin',
      message: 'PIN exchange returned no authToken.',
      meta: { pinId: String(pinId || ''), payload: data || {} },
    });
  }
  return data.authToken || null;
}

async function exchangePinWithRetry(pinId, attempts = 20, delayMs = 1000) {
  let lastError = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const token = await exchangePin(pinId);
      if (token) {
        return { token, attempts: i + 1, error: '' };
      }
    } catch (err) {
      lastError = safeMessage(err) || '';
    }
    await sleep(delayMs);
  }
  return { token: null, attempts, error: lastError };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPlexUser(token) {
  const res = await fetch('https://plex.tv/api/v2/user', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
      ...plexHeaders(),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plex user lookup failed (${res.status}): ${text}`);
  }

  return res.json();
}

function safeMessage(err) {
  if (!err) return 'Unknown error';
  const message = String(err.message || String(err) || '').trim();
  const cause = err && typeof err === 'object' ? err.cause : null;
  if (!cause || typeof cause !== 'object') return message || 'Unknown error';
  const parts = [message].filter(Boolean);
  if (cause.code) parts.push(`code=${cause.code}`);
  if (cause.address) parts.push(`address=${cause.address}`);
  if (cause.port) parts.push(`port=${cause.port}`);
  return parts.join(', ') || 'Unknown error';
}
