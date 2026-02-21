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
const ASSET_VERSION_BASE = normalizeVersionTag(APP_VERSION || '') || String(APP_VERSION || 'dev');
const ASSET_VERSION = `${ASSET_VERSION_BASE}-${String(process.env.ASSET_BUILD_ID || Date.now().toString(36))}`;
const RELEASE_NOTES_BASE_URL = 'https://github.com/MickyGX/launcharr/releases/tag/';
const RELEASE_NOTES_DIR = path.join(__dirname, '..', 'docs', 'release', 'releases');
const RELEASE_HIGHLIGHT_SECTIONS = ['Added', 'Changed', 'Fixed'];
const RELEASE_HIGHLIGHT_LIMIT = 6;
const DEFAULT_APPS_PATH = process.env.DEFAULT_APPS_PATH || path.join(__dirname, '..', 'default-apps.json');
const DEFAULT_CATEGORIES_PATH = process.env.DEFAULT_CATEGORIES_PATH || path.join(__dirname, '..', 'config', 'default-categories.json');
const BUNDLED_DEFAULT_APPS_PATH = path.join(__dirname, '..', 'default-apps.json');
const SOURCE_DEFAULT_APPS_PATH = path.join(__dirname, '..', 'config', 'default-apps.json');
const BUNDLED_DEFAULT_CATEGORIES_PATH = path.join(__dirname, '..', 'default-categories.json');
const SOURCE_DEFAULT_CATEGORIES_PATH = path.join(__dirname, '..', 'config', 'default-categories.json');
const CONFIG_EXAMPLE_PATH = process.env.CONFIG_EXAMPLE_PATH || path.join(__dirname, '..', 'config', 'config.example.json');
const BUNDLED_CONFIG_EXAMPLE_PATH = path.join(__dirname, '..', 'config.example.json');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const USER_AVATAR_DIR = path.join(ICONS_DIR, 'custom', 'avatars');
const USER_AVATAR_BASE = '/icons/custom/avatars';
const MAX_USER_AVATAR_BYTES = 2 * 1024 * 1024;
const USER_AVATAR_ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const ADMIN_USERS = parseCsv(process.env.ADMIN_USERS || '');
const ARR_APP_IDS = ['radarr', 'sonarr', 'lidarr', 'readarr'];
const DOWNLOADER_APP_IDS = ['transmission', 'nzbget', 'qbittorrent', 'sabnzbd'];
const MEDIA_APP_IDS = ['plex', 'jellyfin', 'emby'];
const LEGACY_MULTI_INSTANCE_APP_IDS = ['radarr', 'sonarr', 'bazarr', 'transmission'];
const DEFAULT_MAX_MULTI_INSTANCES_PER_APP = 5;
const DEFAULT_INSTANCE_NAME_PLACEHOLDER = 'Instance (e.g. Main)';
const DEFAULT_CATEGORY_ORDER = ['Admin', 'Media', 'Requesters', 'Manager', 'Games', 'Arr Suite', 'Indexers', 'Downloaders', 'Tools'];
const DEFAULT_CATEGORY_ICON = '/icons/category.svg';
const ARR_COMBINE_SECTIONS = [
  { key: 'downloadingSoon', elementId: 'downloading-soon' },
  { key: 'recentlyDownloaded', elementId: 'recently-downloaded' },
  { key: 'activityQueue', elementId: 'activity-queue' },
  { key: 'calendar', elementId: 'calendar' },
];
const ARR_COMBINED_SECTION_PREFIX = {
  downloadingSoon: 'arrcombinedsoon',
  recentlyDownloaded: 'arrcombinedrecent',
  activityQueue: 'arrcombinedqueue',
  calendar: 'arrcombinedcalendar',
};
const DOWNLOADER_COMBINE_SECTIONS = [
  { key: 'activityQueue', elementId: 'activity-queue' },
];
const DOWNLOADER_COMBINED_SECTION_PREFIX = {
  activityQueue: 'downloaderscombinedqueue',
};
const MEDIA_COMBINE_SECTIONS = [
  { key: 'active', elementId: 'active' },
  { key: 'recent', elementId: 'recent' },
];
const MEDIA_COMBINED_SECTION_PREFIX = {
  active: 'mediacombinedactive',
  recent: 'mediacombinedrecent',
};
const ENABLE_ARR_UNIFIED_CARDS = true;
const ENABLE_DOWNLOADER_UNIFIED_CARDS = true;
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
  jackett: [
    { id: 'search', name: 'Indexer Search' },
  ],
  bazarr: [
    { id: 'subtitle-queue', name: 'Subtitle Queue' },
  ],
  autobrr: [
    { id: 'recent-matches', name: 'Recent Matches' },
    { id: 'delivery-queue', name: 'Delivery Queue' },
  ],
  romm: [
    { id: 'recently-added', name: 'Recently Added' },
    { id: 'consoles', name: 'Consoles' },
  ],
  maintainerr: [
    { id: 'library-media', name: 'Library Media' },
    { id: 'rules', name: 'Rules' },
    { id: 'collections-media', name: 'Collections Media' },
  ],
  transmission: [
    { id: 'activity-queue', name: 'Download Queue' },
  ],
  nzbget: [
    { id: 'activity-queue', name: 'Download Queue' },
  ],
  qbittorrent: [
    { id: 'activity-queue', name: 'Download Queue' },
  ],
  sabnzbd: [
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
const DEFAULT_ONBOARDING_SETTINGS = {
  quickStartPending: false,
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
  basePath: '',
  restrictGuests: false,
  autoOpenSingleAppMenuItem: false,
  sidebarButtonShortPressAction: 'default',
  sidebarButtonLongPressAction: 'default',
  sidebarButtonPressActions: {
    guest: { short: 'default', long: 'default' },
    user: { short: 'default', long: 'default' },
    'co-admin': { short: 'default', long: 'default' },
    admin: { short: 'default', long: 'default' },
  },
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
const ALLOWED_BRAND_THEMES = new Set(['custom', 'launcharr', 'rocketship', 'pulsarr', 'plex', 'radarr', 'sonarr', 'lidarr', 'readarr']);
const DEFAULT_THEME_SETTINGS = {
  mode: '',
  brandTheme: 'pulsarr',
  customColor: '#1cc6c2',
  sidebarInvert: false,
  squareCorners: false,
  bgMotion: true,
  carouselFreeScroll: false,
};

const APP_BASE_NAME_MAP = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  bazarr: 'Bazarr',
  transmission: 'Transmission',
};
const APP_INSTANCE_PLACEHOLDER_MAP = {
  radarr: 'Movies (e.g. 4K)',
  sonarr: 'TV (e.g. Anime)',
  bazarr: 'Subtitles (e.g. Foreign)',
  transmission: 'Client (e.g. Main)',
};
let RUNTIME_MULTI_INSTANCE_BASE_IDS = [...LEGACY_MULTI_INSTANCE_APP_IDS];
const VISIBILITY_ROLE_ORDER = ['disabled', 'guest', 'user', 'co-admin', 'admin'];
const VISIBILITY_ROLE_RANK = {
  disabled: -1,
  guest: 0,
  user: 1,
  'co-admin': 2,
  admin: 3,
};
const SIDEBAR_APP_BUTTON_ACTIONS = new Set(['default', 'launch', 'settings', 'activity']);

function normalizeSidebarAppButtonAction(value, fallback = 'default') {
  const raw = String(value || '').trim().toLowerCase();
  if (SIDEBAR_APP_BUTTON_ACTIONS.has(raw)) return raw;
  const fallbackRaw = String(fallback || '').trim().toLowerCase();
  if (SIDEBAR_APP_BUTTON_ACTIONS.has(fallbackRaw)) return fallbackRaw;
  return 'default';
}

function normalizeSidebarButtonPressActions(value, fallback = DEFAULT_GENERAL_SETTINGS.sidebarButtonPressActions) {
  const source = value && typeof value === 'object' ? value : {};
  const fallbackSource = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_GENERAL_SETTINGS.sidebarButtonPressActions;
  const resolveRoleActions = (roleKey) => {
    const roleSource = source[roleKey] && typeof source[roleKey] === 'object' ? source[roleKey] : {};
    const roleFallback = fallbackSource[roleKey] && typeof fallbackSource[roleKey] === 'object'
      ? fallbackSource[roleKey]
      : DEFAULT_GENERAL_SETTINGS.sidebarButtonPressActions[roleKey];
    return {
      short: normalizeSidebarAppButtonAction(roleSource.short, roleFallback.short),
      long: normalizeSidebarAppButtonAction(roleSource.long, roleFallback.long),
    };
  };
  return {
    guest: resolveRoleActions('guest'),
    user: resolveRoleActions('user'),
    'co-admin': resolveRoleActions('co-admin'),
    admin: resolveRoleActions('admin'),
  };
}

function resolveGeneralSettings(config) {
  const raw = config && typeof config.general === 'object' ? config.general : {};
  const restrictGuests = raw.restrictGuests === undefined
    ? DEFAULT_GENERAL_SETTINGS.restrictGuests
    : Boolean(raw.restrictGuests);
  const autoOpenSingleAppMenuItem = raw.autoOpenSingleAppMenuItem === undefined
    ? DEFAULT_GENERAL_SETTINGS.autoOpenSingleAppMenuItem
    : Boolean(raw.autoOpenSingleAppMenuItem);
  const sidebarButtonShortPressAction = normalizeSidebarAppButtonAction(
    raw.sidebarButtonShortPressAction,
    DEFAULT_GENERAL_SETTINGS.sidebarButtonShortPressAction
  );
  const sidebarButtonLongPressAction = normalizeSidebarAppButtonAction(
    raw.sidebarButtonLongPressAction,
    DEFAULT_GENERAL_SETTINGS.sidebarButtonLongPressAction
  );
  const legacyRolePressActions = {
    guest: { short: sidebarButtonShortPressAction, long: sidebarButtonLongPressAction },
    user: { short: sidebarButtonShortPressAction, long: sidebarButtonLongPressAction },
    'co-admin': { short: sidebarButtonShortPressAction, long: sidebarButtonLongPressAction },
    admin: { short: sidebarButtonShortPressAction, long: sidebarButtonLongPressAction },
  };
  const sidebarButtonPressActions = normalizeSidebarButtonPressActions(
    raw.sidebarButtonPressActions,
    legacyRolePressActions
  );
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
    basePath: normalizeBasePath(raw.basePath || DEFAULT_GENERAL_SETTINGS.basePath || ''),
    restrictGuests,
    autoOpenSingleAppMenuItem,
    sidebarButtonShortPressAction: sidebarButtonPressActions.user.short,
    sidebarButtonLongPressAction: sidebarButtonPressActions.user.long,
    sidebarButtonPressActions,
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

function normalizeThemeMode(value, fallback = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'day' || raw === 'night') return raw;
  return fallback;
}

function normalizeThemeBrandTheme(value, fallback = DEFAULT_THEME_SETTINGS.brandTheme) {
  const raw = String(value || '').trim().toLowerCase();
  if (ALLOWED_BRAND_THEMES.has(raw)) return raw;
  return ALLOWED_BRAND_THEMES.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : DEFAULT_THEME_SETTINGS.brandTheme;
}

function normalizeThemeCustomColor(value, fallback = DEFAULT_THEME_SETTINGS.customColor) {
  const raw = String(value || '').trim();
  if (!raw) return String(fallback || DEFAULT_THEME_SETTINGS.customColor).toLowerCase();
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized)
    ? normalized.toLowerCase()
    : String(fallback || DEFAULT_THEME_SETTINGS.customColor).toLowerCase();
}

function normalizeThemeFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return Boolean(fallback);
}

function normalizeThemeSettings(settings, fallback = DEFAULT_THEME_SETTINGS) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const base = fallback && typeof fallback === 'object'
    ? {
      ...DEFAULT_THEME_SETTINGS,
      ...fallback,
    }
    : { ...DEFAULT_THEME_SETTINGS };
  return {
    mode: normalizeThemeMode(source.mode, normalizeThemeMode(base.mode, '')),
    brandTheme: normalizeThemeBrandTheme(source.brandTheme, base.brandTheme),
    customColor: normalizeThemeCustomColor(source.customColor, base.customColor),
    sidebarInvert: normalizeThemeFlag(source.sidebarInvert, base.sidebarInvert),
    squareCorners: normalizeThemeFlag(source.squareCorners, base.squareCorners),
    bgMotion: normalizeThemeFlag(source.bgMotion, base.bgMotion),
    carouselFreeScroll: normalizeThemeFlag(source.carouselFreeScroll, base.carouselFreeScroll),
  };
}

function resolveThemeDefaults(config) {
  const raw = config && typeof config.themeDefaults === 'object' ? config.themeDefaults : {};
  return normalizeThemeSettings(raw, DEFAULT_THEME_SETTINGS);
}

function resolveUserThemePreferences(config, fallback = DEFAULT_THEME_SETTINGS) {
  const raw = config && typeof config.userThemePreferences === 'object' ? config.userThemePreferences : {};
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey) return;
    normalized[normalizedKey] = normalizeThemeSettings(value, fallback);
  });
  return normalized;
}

function serializeUserThemePreferences(preferences, fallback = DEFAULT_THEME_SETTINGS) {
  if (!preferences || typeof preferences !== 'object') return {};
  const normalized = {};
  Object.entries(preferences).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey) return;
    normalized[normalizedKey] = normalizeThemeSettings(value, fallback);
  });
  return normalized;
}

function resolveThemePreferenceKey(user) {
  const source = String(user?.source || '').trim().toLowerCase() === 'plex' ? 'plex' : 'local';
  const username = normalizeUserKey(user?.username || '');
  const email = normalizeUserKey(user?.email || '');
  const identity = source === 'plex'
    ? (email || username)
    : (username || email);
  if (!identity) return '';
  return `${source}:${identity}`;
}

function resolveThemeSettingsForUser(config, user) {
  const defaults = resolveThemeDefaults(config);
  const key = resolveThemePreferenceKey(user);
  if (!key) return defaults;
  const preferences = resolveUserThemePreferences(config, defaults);
  const match = preferences[key];
  return match ? normalizeThemeSettings(match, defaults) : defaults;
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
  const normalized = items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const username = String(entry.username || '').trim();
      const email = String(entry.email || '').trim();
      const role = String(entry.role || 'admin').trim().toLowerCase();
      const passwordHash = String(entry.passwordHash || '').trim();
      const salt = String(entry.salt || '').trim();
      if (!username || !passwordHash || !salt) return null;
      const rawAvatar = String(entry.avatar || '').trim();
      const avatar = normalizeStoredAvatarPath(rawAvatar);
      const createdByRaw = String(entry.createdBy || '').trim().toLowerCase();
      const createdBy = createdByRaw === 'setup' ? 'setup' : 'system';
      const setupAccount = entry.setupAccount === true || createdBy === 'setup';
      const systemCreated = entry.systemCreated !== false;
      return {
        username,
        email,
        role: normalizeLocalRole(role, 'admin'),
        passwordHash,
        salt,
        avatar,
        createdBy,
        setupAccount,
        systemCreated,
        createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString(),
      };
    })
    .filter(Boolean);

  const setupAdminKey = resolveSetupAdminUserKey(normalized);
  return normalized.map((entry) => {
    const usernameKey = normalizeUserKey(entry.username || '');
    const isSetupAdmin = Boolean(setupAdminKey && usernameKey && setupAdminKey === usernameKey);
    return {
      ...entry,
      isSetupAdmin,
      avatarFallback: resolveLocalAvatarFallback({ ...entry, isSetupAdmin }),
    };
  });
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

function serializeLocalUsers(users) {
  if (!Array.isArray(users)) return [];
  return users
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const username = String(entry.username || '').trim();
      const email = String(entry.email || '').trim();
      const role = normalizeLocalRole(entry.role, 'user');
      const passwordHash = String(entry.passwordHash || '').trim();
      const salt = String(entry.salt || '').trim();
      if (!username || !passwordHash || !salt) return null;
      const createdByRaw = String(entry.createdBy || '').trim().toLowerCase();
      const createdBy = createdByRaw === 'setup' ? 'setup' : 'system';
      return {
        username,
        email,
        role,
        passwordHash,
        salt,
        avatar: normalizeStoredAvatarPath(entry.avatar || ''),
        createdBy,
        setupAccount: entry.setupAccount === true || createdBy === 'setup',
        systemCreated: entry.systemCreated !== false,
        createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function hasLocalAdmin(config) {
  return resolveLocalUsers(config).some((user) => user.role === 'admin');
}

function normalizeUserKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveSetupAdminUserKey(users) {
  if (!Array.isArray(users) || !users.length) return '';
  const explicit = users.find((entry) => entry?.setupAccount === true || entry?.createdBy === 'setup');
  if (explicit) return normalizeUserKey(explicit.username || explicit.email || '');

  const adminUsers = users.filter((entry) => entry?.role === 'admin');
  if (!adminUsers.length) return '';

  const sorted = adminUsers
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(String(a?.createdAt || '').trim());
      const bTime = Date.parse(String(b?.createdAt || '').trim());
      const safeATime = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
      const safeBTime = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
      if (safeATime !== safeBTime) return safeATime - safeBTime;
      return String(a?.username || '').localeCompare(String(b?.username || ''));
    });
  const firstAdmin = sorted[0];
  return normalizeUserKey(firstAdmin?.username || firstAdmin?.email || '');
}

function resolveLocalAvatarFallback(user) {
  const isSetupAdmin = Boolean(
    user?.isSetupAdmin
    || user?.setupAccount === true
    || String(user?.createdBy || '').trim().toLowerCase() === 'setup'
  );
  return isSetupAdmin ? '/icons/role.svg' : '/icons/user-profile.svg';
}

function normalizeStoredAvatarPath(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (avatar.startsWith('/icons/')) return avatar;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  return '';
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
    const url = buildAppApiUrl(baseUrl, paths[index]);
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
  const normalizedSource = String(source || '').trim().toLowerCase() || 'local';
  const avatar = normalizeStoredAvatarPath(user?.avatar || '');
  const avatarFallback = normalizedSource === 'local'
    ? resolveLocalAvatarFallback(user)
    : '/icons/user-profile.svg';
  req.session.user = {
    username: user.username,
    email: user.email || '',
    avatar,
    avatarFallback,
    role: user.role || 'admin',
    source: normalizedSource,
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

function detectAvatarMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4E
    && buffer[3] === 0x47
    && buffer[4] === 0x0D
    && buffer[5] === 0x0A
    && buffer[6] === 0x1A
    && buffer[7] === 0x0A
  ) {
    return 'image/png';
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return '';
}

function parseUserAvatarDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw) return { ok: false, error: 'Avatar image data is missing.' };
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, error: 'Avatar must be a valid PNG, JPG, or WEBP image.' };

  const requestedMime = String(match[1] || '').trim().toLowerCase();
  const mime = requestedMime === 'image/jpg' ? 'image/jpeg' : requestedMime;
  if (!USER_AVATAR_ALLOWED_MIME.has(mime)) {
    return { ok: false, error: 'Avatar type is not allowed. Use PNG, JPG, or WEBP.' };
  }

  const encoded = String(match[2] || '').trim();
  let buffer = null;
  try {
    buffer = Buffer.from(encoded, 'base64');
  } catch (err) {
    return { ok: false, error: 'Avatar image could not be decoded.' };
  }
  if (!buffer || !buffer.length) return { ok: false, error: 'Avatar image is empty.' };
  if (buffer.length > MAX_USER_AVATAR_BYTES) {
    return { ok: false, error: 'Avatar image is too large. Maximum size is 2 MB.' };
  }

  const decodedMime = detectAvatarMimeFromBuffer(buffer);
  if (!decodedMime || decodedMime !== mime) {
    return { ok: false, error: 'Avatar image content does not match the selected file type.' };
  }

  const ext = mime === 'image/png'
    ? 'png'
    : (mime === 'image/webp' ? 'webp' : 'jpg');
  return { ok: true, mime, ext, buffer };
}

function saveCustomUserAvatar(buffer, ext, nameHint = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  const safeExt = String(ext || '').trim().toLowerCase();
  if (!['png', 'jpg', 'webp'].includes(safeExt)) return '';
  try {
    if (!fs.existsSync(USER_AVATAR_DIR)) fs.mkdirSync(USER_AVATAR_DIR, { recursive: true });
    const baseName = slugifyId(nameHint) || 'avatar';
    const filename = `${baseName}-${Date.now()}.${safeExt}`;
    const fullPath = path.join(USER_AVATAR_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    return `${USER_AVATAR_BASE}/${filename}`;
  } catch (err) {
    return '';
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

function resolveOnboardingSettings(config) {
  const raw = config && typeof config.onboarding === 'object' ? config.onboarding : {};
  return {
    quickStartPending: raw.quickStartPending === undefined
      ? DEFAULT_ONBOARDING_SETTINGS.quickStartPending
      : Boolean(raw.quickStartPending),
  };
}

function hasActiveOnboardingApps(config) {
  const apps = Array.isArray(config?.apps) ? config.apps : [];
  return apps.some((appItem) => !appItem?.removed);
}

function shouldShowQuickStartOnboarding(config) {
  const onboarding = resolveOnboardingSettings(config);
  if (!onboarding.quickStartPending) return false;
  return !hasActiveOnboardingApps(config);
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
  res.locals.assetVersion = ASSET_VERSION;
  const generalSettings = resolveGeneralSettings(loadConfig());
  res.locals.autoOpenSingleAppMenuItem = Boolean(generalSettings.autoOpenSingleAppMenuItem);
  res.locals.sidebarButtonPressActions = generalSettings.sidebarButtonPressActions;
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
app.use((req, res, next) => {
  const sessionUser = req.session?.user;
  if (!sessionUser || typeof sessionUser !== 'object') return next();

  const source = String(sessionUser.source || '').trim().toLowerCase();
  if (source === 'local') {
    const config = loadConfig();
    const users = resolveLocalUsers(config);
    const index = findLocalUserIndex(users, {
      username: sessionUser.username,
      email: sessionUser.email,
    });
    if (index >= 0) {
      const localUser = users[index];
      req.session.user = {
        ...sessionUser,
        username: localUser.username,
        email: localUser.email || '',
        role: localUser.role || sessionUser.role || 'user',
        avatar: normalizeStoredAvatarPath(localUser.avatar || ''),
        avatarFallback: resolveLocalAvatarFallback(localUser),
        source: 'local',
      };
      return next();
    }
  }

  req.session.user = {
    ...sessionUser,
    avatar: normalizeStoredAvatarPath(sessionUser.avatar || ''),
    avatarFallback: sessionUser.avatarFallback || '/icons/user-profile.svg',
    source: source || sessionUser.source || 'local',
  };
  return next();
});
app.use((req, res, next) => {
  const config = loadConfig();
  res.locals.themeDefaults = resolveThemeSettingsForUser(config, req.session?.user);
  next();
});

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


app.get('/dashboard', requireUser, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? config.dashboardRemovedElements
    : {};
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
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const rankCategory = buildCategoryRank(categoryOrder);

  const dashboardAccessibleApps = apps.filter((appItem) => !appItem?.removed && canAccessDashboardApp(config, appItem, role));
  const arrDashboardCombinedCards = resolveArrDashboardCombinedCards(config, dashboardAccessibleApps);
  const downloaderDashboardCards = resolveDownloaderDashboardCards(config, dashboardAccessibleApps);
  const mediaDashboardCards = resolveMediaDashboardCards(config, dashboardAccessibleApps);
  const arrDashboardAppIds = dashboardAccessibleApps
    .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
    .map((appItem) => appItem.id);
  const arrDashboardAppLookup = new Map(
    dashboardAccessibleApps
      .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const downloaderDashboardAppIds = dashboardAccessibleApps
    .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
    .map((appItem) => appItem.id);
  const downloaderDashboardAppLookup = new Map(
    dashboardAccessibleApps
      .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const mediaDashboardAppIds = dashboardAccessibleApps
    .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
    .map((appItem) => appItem.id);
  const mediaDashboardAppLookup = new Map(
    dashboardAccessibleApps
      .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const appById = new Map(dashboardAccessibleApps.map((appItem) => [appItem.id, appItem]));
  const elementsByAppId = new Map(
    dashboardAccessibleApps.map((appItem) => [appItem.id, mergeOverviewElementSettings(appItem)])
  );
  const dashboardModules = dashboardAccessibleApps
    .map((appItem) => ({
      app: appItem,
      elements: (elementsByAppId.get(appItem.id) || []).filter((item) => (
        canAccessDashboardElement(appItem, item, role)
        && !dashboardRemovedElements[`app:${appItem.id}:${item.id}`]
      )),
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
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(arrDashboardAppIds, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(arrDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedAppIds = combinedApps.map((item) => normalizeAppId(item.app.id)).filter(Boolean);
    const meta = buildArrCombinedDisplayMeta(arrDashboardAppLookup, section.key, combinedAppIds);
    const combinedEntry = {
      ...leader,
      arrCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: false,
        cardId: '',
        moduleKey: ARR_COMBINED_SECTION_PREFIX[section.key] || (`arrcombined-${section.key}`),
      },
      downloaderCombined: null,
      mediaCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      arrDashboardAppIds.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });
  arrDashboardCombinedCards.forEach((card, index) => {
    const section = getArrCombineSection(card.sectionKey);
    if (!section) return;
    const customToken = normalizeCombinedCardToken(card.id) || `card-${index + 1}`;
    const combinedKey = `combined:arrcustom:${customToken}`;
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(card.appIds, section.elementId);
    if (!sectionModules.length) return;
    const leader = sectionModules[0];
    const orderedAppIds = [...new Set(sectionModules.map((item) => normalizeAppId(item.app.id)).filter(Boolean))];
    const meta = buildArrCombinedDisplayMeta(arrDashboardAppLookup, card.sectionKey, orderedAppIds);
    if (!meta.appIds.length) return;
    const modulePrefixBase = ARR_COMBINED_SECTION_PREFIX[card.sectionKey] || `arrcombined-${card.sectionKey}`;
    dashboardModules.push({
      ...leader,
      arrCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
      downloaderCombined: null,
      mediaCombined: null,
    });
  });

  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    const combinedKey = `combined:downloader:${section.key}`;
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(downloaderDashboardAppIds, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(downloaderDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedAppIds = combinedApps.map((item) => normalizeAppId(item.app.id)).filter(Boolean);
    const meta = buildDownloaderCombinedDisplayMeta(downloaderDashboardAppLookup, section.key, combinedAppIds);
    const combinedEntry = {
      ...leader,
      downloaderCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: false,
        cardId: '',
        moduleKey: DOWNLOADER_COMBINED_SECTION_PREFIX[section.key] || `downloaderscombined-${section.key}`,
      },
      arrCombined: null,
      mediaCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      downloaderDashboardAppIds.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });
  downloaderDashboardCards.forEach((card, index) => {
    const section = getDownloaderCombineSection(card.sectionKey);
    if (!section) return;
    const customToken = normalizeCombinedCardToken(card.id) || `card-${index + 1}`;
    const combinedKey = `combined:downloadercustom:${customToken}`;
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(card.appIds, section.elementId);
    if (!sectionModules.length) return;
    const leader = sectionModules[0];
    const orderedAppIds = [...new Set(sectionModules.map((item) => normalizeAppId(item.app.id)).filter(Boolean))];
    const meta = buildDownloaderCombinedDisplayMeta(downloaderDashboardAppLookup, card.sectionKey, orderedAppIds);
    if (!meta.appIds.length) return;
    const modulePrefixBase = DOWNLOADER_COMBINED_SECTION_PREFIX[card.sectionKey] || `downloaderscombined-${card.sectionKey}`;
    dashboardModules.push({
      ...leader,
      downloaderCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
      arrCombined: null,
      mediaCombined: null,
    });
  });

  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    const combinedKey = `combined:media:${section.key}`;
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(mediaDashboardAppIds, section.elementId);
    const combinedModules = sectionModules.filter((item) =>
      Boolean(mediaDashboardCombine?.[section.key]?.[item.app.id])
    );
    const combinedApps = combinedModules.length ? combinedModules : sectionModules;
    if (!combinedApps.length) return;

    const leader = combinedApps[0];
    const combinedAppIds = combinedApps.map((item) => normalizeAppId(item.app.id)).filter(Boolean);
    const meta = buildMediaCombinedDisplayMeta(mediaDashboardAppLookup, section.key, combinedAppIds);
    const combinedEntry = {
      ...leader,
      mediaCombined: {
        sectionKey: section.key,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: false,
        cardId: '',
        moduleKey: MEDIA_COMBINED_SECTION_PREFIX[section.key] || `mediacombined-${section.key}`,
      },
      arrCombined: null,
      downloaderCombined: null,
    };
    const insertIndex = dashboardModules.findIndex((item) =>
      mediaDashboardAppIds.includes(item.app.id) && item.element.id === section.elementId
    );
    dashboardModules.splice(insertIndex === -1 ? dashboardModules.length : insertIndex, 0, combinedEntry);
  });
  mediaDashboardCards.forEach((card, index) => {
    const section = getMediaCombineSection(card.sectionKey);
    if (!section) return;
    const customToken = normalizeCombinedCardToken(card.id) || `card-${index + 1}`;
    const combinedKey = `combined:mediacustom:${customToken}`;
    if (dashboardRemovedElements[combinedKey]) return;
    const combinedSettings = dashboardCombinedSettings[combinedKey];
    if (!canAccessCombinedDashboardVisibility(combinedSettings, role, 'user')) return;
    const sectionModules = buildSectionModules(card.appIds, section.elementId);
    if (!sectionModules.length) return;
    const leader = sectionModules[0];
    const orderedAppIds = [...new Set(sectionModules.map((item) => normalizeAppId(item.app.id)).filter(Boolean))];
    const meta = buildMediaCombinedDisplayMeta(mediaDashboardAppLookup, card.sectionKey, orderedAppIds);
    if (!meta.appIds.length) return;
    const modulePrefixBase = MEDIA_COMBINED_SECTION_PREFIX[card.sectionKey] || `mediacombined-${card.sectionKey}`;
    dashboardModules.push({
      ...leader,
      mediaCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
      arrCombined: null,
      downloaderCombined: null,
    });
  });

  const getCombinedOrderKey = (item) => {
    if (item?.arrCombined) {
      if (item.arrCombined.custom) return `combined:arrcustom:${item.arrCombined.cardId}`;
      return `combined:arr:${item.arrCombined.sectionKey}`;
    }
    if (item?.downloaderCombined) {
      if (item.downloaderCombined.custom) return `combined:downloadercustom:${item.downloaderCombined.cardId}`;
      return `combined:downloader:${item.downloaderCombined.sectionKey}`;
    }
    if (item?.mediaCombined) {
      if (item.mediaCombined.custom) return `combined:mediacustom:${item.mediaCombined.cardId}`;
      return `combined:media:${item.mediaCombined.sectionKey}`;
    }
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
    const appOrderDelta = (Number(a.app?.order) || 0) - (Number(b.app?.order) || 0);
    if (appOrderDelta !== 0) return appOrderDelta;
    const appNameDelta = String(a.app?.name || '').localeCompare(String(b.app?.name || ''));
    if (appNameDelta !== 0) return appNameDelta;
    return String(a.element?.name || '').localeCompare(String(b.element?.name || ''));
  });

  res.render('dashboard', {
    user: req.session.user,
    apps: navApps,
    navCategories,
    multiInstanceBaseIds: getMultiInstanceBaseIds(),
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
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'overview')) {
    return res.status(403).send('Overview access denied.');
  }
  const appWithIcon = { ...appItem, icon: resolvePersistedAppIconPath(appItem) };
  const overviewElements = mergeOverviewElementSettings(appItem).map((element) => ({
    ...element,
    enable: element.enable !== false && canAccessOverviewElement(appItem, element, role),
  }));

  res.render('app-overview', {
    user: req.session.user,
    role,
    actualRole,
    page: 'overview',
    apps: navApps,
    navCategories,
    multiInstanceBaseIds: getMultiInstanceBaseIds(),
    appBaseUrls,
    app: appWithIcon,
    overviewElements,
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
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'overview')) {
    return res.status(403).send('Activity access denied.');
  }
  const appWithIcon = { ...appItem, icon: resolvePersistedAppIconPath(appItem) };

  res.render('app-activity', {
    user: req.session.user,
    role,
    actualRole,
    page: 'activity',
    navCategories,
    app: appWithIcon,
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
  const appWithIcon = { ...appItem, icon: resolvePersistedAppIconPath(appItem) };

  const deepQuery = String(req.query?.q || req.query?.query || '').trim();
  if (deepQuery) {
    const deepUrl = await resolveDeepLaunchUrl(appWithIcon, req, {
      query: deepQuery,
      imdbId: String(req.query?.imdb || '').trim(),
      tmdbId: String(req.query?.tmdb || '').trim(),
      mediaType: String(req.query?.type || '').trim().toLowerCase(),
      plexToken: String(req.session?.authToken || appWithIcon.plexToken || '').trim(),
    });
    if (deepUrl) return res.redirect(deepUrl);
  }

  const launchUrl = resolveLaunchUrl(appWithIcon, req);
  if (!launchUrl) return res.status(400).send('Launch URL not configured.');

  const launchMode = resolveEffectiveLaunchMode(appWithIcon, req, normalizeMenu(appWithIcon));
  if (launchMode === 'iframe') {
    const navApps = getNavApps(apps, role, req, categoryOrder);
    const navCategories = buildNavCategories(navApps, categoryEntries, role);
    const iframeLaunchUrl = resolveIframeLaunchUrl(req, launchUrl);
    return res.render('app-launch', {
      user: req.session.user,
      role,
      actualRole,
      page: 'launch',
      navCategories,
      app: appWithIcon,
      launchUrl: iframeLaunchUrl || launchUrl,
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
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const appItem = apps.find((item) => item.id === req.params.id);

  if (!appItem) return res.status(404).send('App not found.');
  if (!canAccess(appItem, role, 'settings')) {
    return res.status(403).send('App settings access denied.');
  }
  const appWithIcon = { ...appItem, icon: resolvePersistedAppIconPath(appItem) };

  res.render('app-settings', {
    user: req.session.user,
    admins,
    role,
    actualRole,
    page: 'settings',
    navCategories,
    multiInstanceBaseIds: getMultiInstanceBaseIds(),
    app: appWithIcon,
    overviewElements: mergeOverviewElementSettings(appWithIcon),
    tautulliCards: mergeTautulliCardSettings(appWithIcon),
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
  const themeDefaultsResult = String(req.query?.themeDefaultsResult || '').trim();
  const themeDefaultsError = String(req.query?.themeDefaultsError || '').trim();
  const appInstanceResult = String(req.query?.appInstanceResult || '').trim();
  const appInstanceError = String(req.query?.appInstanceError || '').trim();
  const defaultAppResult = String(req.query?.defaultAppResult || '').trim();
  const defaultAppError = String(req.query?.defaultAppError || '').trim();
  const selectedSettingsAppId = normalizeAppId(req.query?.instance || req.query?.app || '');
  const aboutCurrentVersion = normalizeVersionTag(APP_VERSION || '');
  const aboutReleases = loadSettingsReleases({ limit: 12, currentVersion: aboutCurrentVersion });
  const aboutLatestVersion = String(aboutReleases[0]?.tag || '').trim();
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
    const isOwnerAccount = Boolean(
      entry?.isSetupAdmin
      || entry?.setupAccount === true
      || String(entry?.createdBy || '').trim().toLowerCase() === 'setup'
    );
    return {
      ...entry,
      isCurrentSessionUser,
      isOwnerAccount,
      canDelete: !isOwnerAccount && !isCurrentSessionUser && entry?.systemCreated !== false,
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
  const settingsAppsWithIcons = settingsApps.map((appItem) => ({
    ...appItem,
    icon: resolvePersistedAppIconPath(appItem),
    canRemoveDefaultApp: canManageWithDefaultAppManager(appItem),
  }));
  const dashboardSettingsApps = settingsAppsWithIcons.filter((appItem) => !appItem?.removed);
  const multiInstanceBaseIds = getMultiInstanceBaseIds();
  const multiInstanceTitleMap = getMultiInstanceTitleMap();
  const multiInstanceMaxMap = getMultiInstanceMaxMap(settingsAppsWithIcons);
  const multiInstancePlaceholderMap = getMultiInstancePlaceholderMap(settingsAppsWithIcons);
  const arrDashboardCombinedCards = resolveArrDashboardCombinedCards(config, dashboardSettingsApps);
  const downloaderDashboardCards = resolveDownloaderDashboardCards(config, dashboardSettingsApps);
  const mediaDashboardCards = resolveMediaDashboardCards(config, dashboardSettingsApps);
  const arrSettingsAppIds = dashboardSettingsApps
    .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
    .map((appItem) => appItem.id);
  const arrAppLookup = new Map(
    dashboardSettingsApps
      .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const downloaderSettingsAppIds = dashboardSettingsApps
    .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
    .map((appItem) => appItem.id);
  const downloaderAppLookup = new Map(
    dashboardSettingsApps
      .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const mediaSettingsAppIds = dashboardSettingsApps
    .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
    .map((appItem) => appItem.id);
  const mediaAppLookup = new Map(
    dashboardSettingsApps
      .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
      .map((appItem) => [normalizeAppId(appItem.id), appItem])
  );
  const multiInstanceCountsByBase = dashboardSettingsApps.reduce((acc, appItem) => {
    const baseId = getAppBaseId(appItem?.id);
    if (!supportsAppInstances(baseId)) return acc;
    acc[baseId] = (acc[baseId] || 0) + 1;
    return acc;
  }, {});
  const baseDashboardElements = dashboardSettingsApps.flatMap((appItem) => {
    const elements = mergeOverviewElementSettings(appItem);
    const baseId = getAppBaseId(appItem?.id);
    const isMultiInstanceGroup = supportsAppInstances(baseId) && Number(multiInstanceCountsByBase[baseId] || 0) > 1;
    const appTitle = String(appItem?.name || '').trim() || getDefaultInstanceName(baseId, appItem?.id);
    const itemIconPath = resolvePersistedAppIconPath(appItem);
    return elements.map((element) => ({
      appId: appItem.id,
      appName: appItem.name,
      appOrder: appItem.order || 0,
      category: appItem.category || 'Tools',
      element,
      displayName: isMultiInstanceGroup ? `${appTitle} ${element.name || ''}`.trim() : (element.name || ''),
      iconPath: itemIconPath,
      appAccess: true,
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
    const resolveCombinedIconPath = (section) => {
      if (typeof iconPath === 'function') return iconPath(section);
      if (iconPath && typeof iconPath === 'object') {
        const bySection = String(section?.key || '').trim();
        if (bySection && String(iconPath[bySection] || '').trim()) {
          return String(iconPath[bySection]).trim();
        }
        return String(iconPath.default || '').trim();
      }
      return String(iconPath || '').trim();
    };
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
      if (combinedType === 'arr') {
        const meta = buildArrCombinedDisplayMeta(arrAppLookup, section.key, combinedAppIds);
        updated.push({
          ...leaderItem,
          displayName: meta.displayName,
          iconPath: meta.iconPath,
          combined: true,
          combinedType,
          combinedSection: section.key,
          combinedApps: meta.appIds,
          arrCombined: {
            sectionKey: section.key,
            elementId: section.elementId,
            appIds: meta.appIds,
            appNames: meta.appNames,
            displayName: meta.displayName,
            iconPath: meta.iconPath,
            custom: false,
            cardId: '',
            moduleKey: ARR_COMBINED_SECTION_PREFIX[section.key] || (`arrcombined-${section.key}`),
          },
        });
        return;
      }
      if (combinedType === 'downloader') {
        const meta = buildDownloaderCombinedDisplayMeta(downloaderAppLookup, section.key, combinedAppIds);
        updated.push({
          ...leaderItem,
          displayName: meta.displayName,
          iconPath: meta.iconPath,
          combined: true,
          combinedType,
          combinedSection: section.key,
          combinedApps: meta.appIds,
          downloaderCombined: {
            sectionKey: section.key,
            elementId: section.elementId,
            appIds: meta.appIds,
            appNames: meta.appNames,
            displayName: meta.displayName,
            iconPath: meta.iconPath,
            custom: false,
            cardId: '',
            moduleKey: DOWNLOADER_COMBINED_SECTION_PREFIX[section.key] || `downloaderscombined-${section.key}`,
          },
        });
        return;
      }
      const combinedName = `${labelPrefix} ${leaderItem.element?.name || section.elementId}`;
      updated.push({
        ...leaderItem,
        displayName: combinedName,
        iconPath: resolveCombinedIconPath(section),
        combined: true,
        combinedType,
        combinedSection: section.key,
        combinedApps: combinedAppIds,
      });
    });
    return updated;
  };

  const arrCombinedElements = applyCombinedDashboardElements(baseDashboardElements, {
    appIds: arrSettingsAppIds,
    sections: ARR_COMBINE_SECTIONS,
    combineMap: arrDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: '/icons/arr-suite.svg',
    combinedType: 'arr',
  });
  const arrCombinedElementsWithCustom = arrCombinedElements.map((item) => ({ ...item }));
  arrDashboardCombinedCards.forEach((card, cardIndex) => {
    const section = getArrCombineSection(card.sectionKey);
    if (!section) return;
    const sourceItems = baseDashboardElements.filter((item) =>
      item.element?.id === section.elementId
      && Array.isArray(card.appIds)
      && card.appIds.includes(item.appId)
    );
    if (!sourceItems.length) return;
    const orderedAppIds = [...new Set(sourceItems.map((item) => normalizeAppId(item.appId)).filter(Boolean))];
    const meta = buildArrCombinedDisplayMeta(arrAppLookup, card.sectionKey, orderedAppIds);
    if (!meta.appIds.length) return;
    const leaderItem = sourceItems[0];
    const customToken = normalizeCombinedCardToken(card.id) || `card-${cardIndex + 1}`;
    const modulePrefixBase = ARR_COMBINED_SECTION_PREFIX[card.sectionKey] || `arrcombined-${card.sectionKey}`;
    arrCombinedElementsWithCustom.push({
      ...leaderItem,
      displayName: meta.displayName,
      iconPath: meta.iconPath,
      combined: true,
      combinedType: 'arrcustom',
      combinedSection: customToken,
      combinedApps: meta.appIds,
      arrCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
    });
  });
  const downloaderCombinedElements = applyCombinedDashboardElements(arrCombinedElementsWithCustom, {
    appIds: downloaderSettingsAppIds,
    sections: DOWNLOADER_COMBINE_SECTIONS,
    combineMap: downloaderDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: '/icons/download.svg',
    combinedType: 'downloader',
  });
  const downloaderCombinedElementsWithCustom = downloaderCombinedElements.map((item) => ({ ...item }));
  downloaderDashboardCards.forEach((card, cardIndex) => {
    const section = getDownloaderCombineSection(card.sectionKey);
    if (!section) return;
    const sectionItems = baseDashboardElements.filter((item) =>
      item.element?.id === section.elementId
      && isAppInSet(item.appId, DOWNLOADER_APP_IDS)
    );
    if (!sectionItems.length) return;
    const sourceItems = sectionItems.filter((item) =>
      item.element?.id === section.elementId
      && Array.isArray(card.appIds)
      && card.appIds.includes(normalizeAppId(item.appId))
    );
    const orderedAppIds = [...new Set(sourceItems.map((item) => normalizeAppId(item.appId)).filter(Boolean))];
    const meta = buildDownloaderCombinedDisplayMeta(downloaderAppLookup, card.sectionKey, orderedAppIds);
    const leaderItem = sourceItems[0] || sectionItems[0];
    const customToken = normalizeCombinedCardToken(card.id) || `card-${cardIndex + 1}`;
    const modulePrefixBase = DOWNLOADER_COMBINED_SECTION_PREFIX[card.sectionKey] || `downloaderscombined-${card.sectionKey}`;
    downloaderCombinedElementsWithCustom.push({
      ...leaderItem,
      displayName: meta.displayName,
      iconPath: meta.iconPath,
      combined: true,
      combinedType: 'downloadercustom',
      combinedSection: customToken,
      combinedApps: meta.appIds,
      downloaderCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
    });
  });
  const combinedDashboardElements = applyCombinedDashboardElements(downloaderCombinedElementsWithCustom, {
    appIds: mediaSettingsAppIds,
    sections: MEDIA_COMBINE_SECTIONS,
    combineMap: mediaDashboardCombine,
    labelPrefix: 'Combined',
    iconPath: {
      active: '/icons/media-play.svg',
      recent: '/icons/recently-added.svg',
      default: '/icons/media-play.svg',
    },
    combinedType: 'media',
  });
  const combinedDashboardElementsWithMediaCustom = combinedDashboardElements.map((item) => ({ ...item }));
  mediaDashboardCards.forEach((card, cardIndex) => {
    const section = getMediaCombineSection(card.sectionKey);
    if (!section) return;
    const sectionItems = baseDashboardElements.filter((item) =>
      item.element?.id === section.elementId
      && isAppInSet(item.appId, MEDIA_APP_IDS)
    );
    if (!sectionItems.length) return;
    const sourceItems = sectionItems.filter((item) =>
      item.element?.id === section.elementId
      && Array.isArray(card.appIds)
      && card.appIds.includes(normalizeAppId(item.appId))
    );
    const orderedAppIds = [...new Set(sourceItems.map((item) => normalizeAppId(item.appId)).filter(Boolean))];
    const meta = buildMediaCombinedDisplayMeta(mediaAppLookup, card.sectionKey, orderedAppIds);
    const leaderItem = sourceItems[0] || sectionItems[0];
    const customToken = normalizeCombinedCardToken(card.id) || `card-${cardIndex + 1}`;
    const modulePrefixBase = MEDIA_COMBINED_SECTION_PREFIX[card.sectionKey] || `mediacombined-${card.sectionKey}`;
    combinedDashboardElementsWithMediaCustom.push({
      ...leaderItem,
      displayName: meta.displayName,
      iconPath: meta.iconPath,
      combined: true,
      combinedType: 'mediacustom',
      combinedSection: customToken,
      combinedApps: meta.appIds,
      mediaCombined: {
        sectionKey: card.sectionKey,
        elementId: section.elementId,
        appIds: meta.appIds,
        appNames: meta.appNames,
        displayName: meta.displayName,
        iconPath: meta.iconPath,
        custom: true,
        cardId: customToken,
        moduleKey: `${modulePrefixBase}-${customToken}`,
      },
    });
  });

  const getCombinedOrderKey = (item) => {
    if (!item || !item.combined) return '';
    if (item.combinedType === 'arrcustom') {
      const customId = String(item.combinedSection || item.arrCombined?.cardId || '').trim();
      return customId ? `combined:arrcustom:${customId}` : '';
    }
    if (item.combinedType === 'downloadercustom') {
      const customId = String(item.combinedSection || item.downloaderCombined?.cardId || '').trim();
      return customId ? `combined:downloadercustom:${customId}` : '';
    }
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
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? config.dashboardRemovedElements
    : {};
  const getDashboardElementKey = (item) => {
    if (!item) return '';
    if (item.combined) {
      if (item.combinedType === 'arrcustom') {
        const customId = String(item.arrCombined?.cardId || item.combinedSection || '').trim();
        return customId ? `combined:arrcustom:${customId}` : '';
      }
      if (item.combinedType === 'downloadercustom') {
        const customId = String(item.downloaderCombined?.cardId || item.combinedSection || '').trim();
        return customId ? `combined:downloadercustom:${customId}` : '';
      }
      const section = String(item.combinedSection || item.element?.id || '').trim();
      return section ? `combined:${item.combinedType || 'mixed'}:${section}` : '';
    }
    const appId = String(item.appId || '').trim();
    const elementId = String(item.element?.id || '').trim();
    if (!appId || !elementId) return '';
    return `app:${appId}:${elementId}`;
  };
  const dashboardElementsWithKeys = combinedDashboardElementsWithMediaCustom.map((item) => ({
    ...item,
    dashboardElementKey: getDashboardElementKey(item),
  }));
  const resolveDashboardAddCategory = (value, fallback = 'Tools') => {
    const normalized = normalizeCategoryName(value || fallback);
    return normalized || normalizeCategoryName(fallback) || 'Tools';
  };
  const resolveSetCategory = (baseIds, fallback) => {
    const match = settingsAppsWithIcons.find((appItem) => (
      !appItem?.removed
      && isAppInSet(appItem?.id, baseIds)
      && String(appItem?.category || '').trim()
    ));
    return resolveDashboardAddCategory(match?.category, fallback);
  };
  const arrCategoryGroup = resolveSetCategory(ARR_APP_IDS, 'Arr Suite');
  const mediaCategoryGroup = resolveSetCategory(MEDIA_APP_IDS, 'Media');
  const downloaderCategoryGroup = resolveSetCategory(DOWNLOADER_APP_IDS, 'Downloaders');
  const appNameById = new Map(
    settingsAppsWithIcons
      .map((appItem) => {
        const id = normalizeAppId(appItem?.id);
        if (!id) return null;
        const fallbackName = getBaseAppTitle(getAppBaseId(id));
        const name = String(appItem?.name || '').trim() || fallbackName;
        return [id, name];
      })
      .filter(Boolean)
  );
  const hasAppBasePrefix = (appId, baseIds) => {
    const normalizedAppId = normalizeAppId(appId);
    if (!normalizedAppId || !Array.isArray(baseIds) || !baseIds.length) return false;
    return baseIds.some((baseIdRaw) => {
      const baseId = normalizeAppId(baseIdRaw);
      if (!baseId) return false;
      return normalizedAppId === baseId || normalizedAppId.startsWith(`${baseId}-`);
    });
  };
  const allArrAddSourceIds = [...new Set(
    settingsAppsWithIcons
      .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, ARR_APP_IDS))
      .map((appItem) => normalizeAppId(appItem?.id))
      .filter(Boolean)
  )];
  const allMediaAddSourceIds = [...new Set(
    settingsAppsWithIcons
      .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, MEDIA_APP_IDS))
      .map((appItem) => normalizeAppId(appItem?.id))
      .filter(Boolean)
  )];
  const allDownloaderAddSourceIds = [...new Set(
    settingsAppsWithIcons
      .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, DOWNLOADER_APP_IDS))
      .map((appItem) => normalizeAppId(appItem?.id))
      .filter(Boolean)
  )];
  const sameIdSet = (left, right) => {
    const leftSet = [...new Set((Array.isArray(left) ? left : []).map((entry) => normalizeAppId(entry)).filter(Boolean))].sort();
    const rightSet = [...new Set((Array.isArray(right) ? right : []).map((entry) => normalizeAppId(entry)).filter(Boolean))].sort();
    if (leftSet.length !== rightSet.length) return false;
    return leftSet.every((value, index) => value === rightSet[index]);
  };
  const dashboardBaseAddOptions = dashboardElementsWithKeys
    .filter((item) => item?.dashboardElementKey)
    .map((item) => {
      const optionKey = String(item?.dashboardElementKey || '').trim();
      const appKeyMatch = optionKey.match(/^app:([^:]+):(.+)$/);
      const keyAppId = appKeyMatch ? normalizeAppId(appKeyMatch[1]) : '';
      const keyElementId = appKeyMatch ? String(appKeyMatch[2] || '').trim() : '';
      const resolvedAppId = normalizeAppId(item?.appId || keyAppId);
      const resolvedElementId = String(item?.element?.id || keyElementId).trim().replace(/,+$/, '');
      const appLabel = String(item.appName || '').trim();
      const baseName = String(item.displayName || item.element?.name || 'Dashboard card').trim() || 'Dashboard card';
      const combinedType = String(item?.combinedType || '').trim();
      const isUnifiedCombinedCard = Boolean(item?.combined);
      const isUnifiedCustomCard = Boolean(
        isUnifiedCombinedCard
        && ['arrcustom', 'downloadercustom', 'mediacustom'].includes(combinedType)
      );
      const combinedSourceNames = isUnifiedCustomCard
        ? [...new Set(
          (Array.isArray(item?.combinedApps) ? item.combinedApps : [])
            .map((appId) => normalizeAppId(appId))
            .filter(Boolean)
            .map((appId) => appNameById.get(appId) || getBaseAppTitle(getAppBaseId(appId)))
            .map((name) => String(name || '').trim())
            .filter(Boolean)
        )]
        : [];
      const unifiedBaseName = isUnifiedCustomCard && !/^new\s+/i.test(baseName)
        ? `New ${baseName}`
        : baseName;
      const optionBaseName = (isUnifiedCustomCard && combinedSourceNames.length)
        ? `${unifiedBaseName} (${combinedSourceNames.join(' + ')})`
        : unifiedBaseName;
      const prefixedName = (
        !isUnifiedCombinedCard
        && appLabel
        && !optionBaseName.toLowerCase().startsWith(appLabel.toLowerCase())
      )
        ? `${appLabel} ${optionBaseName}`.trim()
        : optionBaseName;
      const isOnDashboard = !dashboardRemovedElements[item.dashboardElementKey];
      const sourceSectionKey = String(
        item?.arrCombined?.sectionKey
        || item?.downloaderCombined?.sectionKey
        || item?.mediaCombined?.sectionKey
        || ''
      ).trim();
      const sourceAppIds = [...new Set(
        (Array.isArray(item?.combinedApps) ? item.combinedApps : [])
          .map((appId) => normalizeAppId(appId))
          .filter(Boolean)
      )];
      const isRemovedCustomCard = Boolean(
        isUnifiedCustomCard
        && dashboardRemovedElements[item.dashboardElementKey]
      );
      const hideInAddPicker = Boolean(
        isRemovedCustomCard
        || (
          isUnifiedCustomCard
          && (
          (combinedType === 'arrcustom' && sourceSectionKey && sameIdSet(sourceAppIds, allArrAddSourceIds))
          || (combinedType === 'mediacustom' && sourceSectionKey && sameIdSet(sourceAppIds, allMediaAddSourceIds))
          || (combinedType === 'downloadercustom' && sourceSectionKey && sameIdSet(sourceAppIds, allDownloaderAddSourceIds))
          )
        )
      );
      const isDeprecatedLegacyCombined = Boolean(
        item?.combined
        && ['arr', 'downloader', 'media'].includes(String(item?.combinedType || '').trim())
      );
      const isDeprecatedAppCard = Boolean(
        !item?.combined
        && optionKey.startsWith('app:')
        && resolvedAppId
        && resolvedElementId
        && (
          (
            (isAppInSet(resolvedAppId, ARR_APP_IDS) || hasAppBasePrefix(resolvedAppId, ARR_APP_IDS))
            && ARR_COMBINE_SECTIONS.some((section) => section.elementId === resolvedElementId)
          )
          || (
            (isAppInSet(resolvedAppId, DOWNLOADER_APP_IDS) || hasAppBasePrefix(resolvedAppId, DOWNLOADER_APP_IDS))
            && DOWNLOADER_COMBINE_SECTIONS.some((section) => section.elementId === resolvedElementId)
          )
          || (
            (isAppInSet(resolvedAppId, MEDIA_APP_IDS) || hasAppBasePrefix(resolvedAppId, MEDIA_APP_IDS))
            && MEDIA_COMBINE_SECTIONS.some((section) => section.elementId === resolvedElementId)
          )
        )
      );
      const deprecated = isDeprecatedLegacyCombined || isDeprecatedAppCard;
      return {
        key: optionKey,
        group: resolveDashboardAddCategory(item.category, 'Tools'),
        name: prefixedName,
        icon: String(item.iconPath || resolvePersistedAppIconPath({ id: resolvedAppId || item.appId }) || '/icons/app.svg').trim() || '/icons/app.svg',
        disabled: isOnDashboard,
        deprecated,
        hideInAddPicker,
      };
    });
  const dashboardCardStateByKey = new Map(
    dashboardBaseAddOptions
      .map((entry) => {
        const key = String(entry?.key || '').trim();
        if (!key) return null;
        const deprecated = Boolean(entry?.deprecated);
        return [key, { deprecated, current: !deprecated }];
      })
      .filter(Boolean)
  );
  const hasMediaSources = settingsAppsWithIcons.some((appItem) => !appItem?.removed && isAppInSet(appItem.id, MEDIA_APP_IDS));
  const dashboardAvailableBaseAddOptions = dashboardBaseAddOptions.filter((entry) => !entry?.disabled && !entry?.deprecated && !entry?.hideInAddPicker);
  const dashboardDeprecatedAddOptions = [];
  const dashboardUnifiedAddOptions = [...dashboardAvailableBaseAddOptions];
  const dashboardCombinedAddOptions = [...dashboardUnifiedAddOptions];
  const pushDashboardCombinedAddOption = (entry) => {
    dashboardUnifiedAddOptions.push(entry);
    dashboardCombinedAddOptions.push(entry);
  };
  if (ENABLE_ARR_UNIFIED_CARDS && settingsAppsWithIcons.some((appItem) => !appItem?.removed && isAppInSet(appItem.id, ARR_APP_IDS))) {
    ARR_COMBINE_SECTIONS.forEach((section) => {
      pushDashboardCombinedAddOption({
        key: `new:arr:${section.key}`,
        group: arrCategoryGroup,
        name: `New ${getArrCombineSectionLabel(section.key)}`,
        icon: getArrCombineSectionIconPath(section.key),
        disabled: false,
        deprecated: false,
      });
    });
  }
  if (hasMediaSources) {
    MEDIA_COMBINE_SECTIONS.forEach((section) => {
      pushDashboardCombinedAddOption({
        key: `new:media:${section.key}`,
        group: mediaCategoryGroup,
        name: `New ${getMediaCombineSectionLabel(section.key)}`,
        icon: getMediaCombineSectionIconPath(section.key),
        disabled: false,
        deprecated: false,
      });
    });
  }
  if (ENABLE_DOWNLOADER_UNIFIED_CARDS && settingsAppsWithIcons.some((appItem) => !appItem?.removed && isAppInSet(appItem.id, DOWNLOADER_APP_IDS))) {
    DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
      pushDashboardCombinedAddOption({
        key: `new:downloader:${section.key}`,
        group: downloaderCategoryGroup,
        name: `New ${getDownloaderCombineSectionLabel(section.key)}`,
        icon: getDownloaderCombineSectionIconPath(section.key),
        disabled: false,
        deprecated: false,
      });
    });
  }
  const sortDashboardAddOptions = (a, b) => {
    const categoryDelta = rankCategory(a.group) - rankCategory(b.group);
    if (categoryDelta !== 0) return categoryDelta;
    const groupDelta = String(a.group || '').localeCompare(String(b.group || ''));
    if (groupDelta !== 0) return groupDelta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  };
  dashboardDeprecatedAddOptions.sort(sortDashboardAddOptions);
  dashboardCombinedAddOptions.sort(sortDashboardAddOptions);
  dashboardUnifiedAddOptions.sort(sortDashboardAddOptions);
  const dashboardElements = dashboardElementsWithKeys
    .map((item) => {
      const key = String(item?.dashboardElementKey || '').trim();
      const state = key ? dashboardCardStateByKey.get(key) : null;
      return {
        ...item,
        dashboardIsDeprecated: Boolean(state?.deprecated),
        dashboardIsCurrent: Boolean(state?.current),
      };
    })
    .filter((item) => !item.dashboardElementKey || !dashboardRemovedElements[item.dashboardElementKey])
    .sort((a, b) => {
    const orderDelta = getDashboardOrder(a) - getDashboardOrder(b);
    if (orderDelta !== 0) return orderDelta;
    const appOrderDelta = (Number(a.appOrder) || 0) - (Number(b.appOrder) || 0);
    if (appOrderDelta !== 0) return appOrderDelta;
    const appNameDelta = String(a.appName || '').localeCompare(String(b.appName || ''));
    if (appNameDelta !== 0) return appNameDelta;
    return String(a.element.name || '').localeCompare(String(b.element.name || ''));
  });
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const defaultAppCatalog = loadDefaultApps()
    .map((appItem) => {
      const id = normalizeAppId(appItem?.id);
      if (!id) return null;
      const parsedOrder = Number(appItem?.order);
      return {
        id,
        name: String(appItem?.name || '').trim() || getBaseAppTitle(getAppBaseId(id)),
        icon: resolvePersistedAppIconPath({ ...appItem, id }),
        category: String(appItem?.category || '').trim() || 'Tools',
        order: Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const categoryDelta = rankCategory(a.category) - rankCategory(b.category);
      if (categoryDelta !== 0) return categoryDelta;
      const groupDelta = String(a.category || '').localeCompare(String(b.category || ''));
      if (groupDelta !== 0) return groupDelta;
      const leftOrder = Number(a?.order);
      const rightOrder = Number(b?.order);
      const orderDelta = (Number.isFinite(leftOrder) ? leftOrder : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightOrder) ? rightOrder : Number.MAX_SAFE_INTEGER);
      if (orderDelta !== 0) return orderDelta;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  const defaultCategoryCatalog = loadDefaultCategories()
    .map((entry) => {
      const name = normalizeCategoryName(entry?.name);
      if (!name) return null;
      const iconValue = String(entry?.icon || '').trim();
      const sidebarMinRole = normalizeVisibilityRole(
        entry?.sidebarMinRole,
        entry?.sidebarMenu ? 'user' : 'disabled'
      );
      return {
        name,
        sidebarMenu: sidebarMinRole !== 'disabled',
        sidebarMinRole,
        icon: iconValue || resolveDefaultCategoryIcon(name),
      };
    })
    .filter(Boolean)
    .filter((entry, index, list) => (
      list.findIndex((candidate) => String(candidate?.name || '').toLowerCase() === String(entry?.name || '').toLowerCase()) === index
    ));
  const systemIconDefaults = getDefaultSystemIconOptions();
  const systemIconCustom = getCustomSystemIconOptions();
  const appIconDefaults = getDefaultAppIconOptions(apps);
  const appIconCustom = getCustomAppIconOptions();

  res.render('settings', {
    user: req.session.user,
    admins,
    apps: settingsAppsWithIcons,
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
    arrApps: settingsAppsWithIcons.filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, ARR_APP_IDS)),
    arrDashboardCombine,
    arrCombinedQueueDisplay,
    mediaApps: settingsAppsWithIcons.filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, MEDIA_APP_IDS)),
    mediaDashboardCombine,
    downloaderApps: settingsAppsWithIcons.filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, DOWNLOADER_APP_IDS)),
    downloaderDashboardCombine,
    downloaderCombinedQueueDisplay,
    logSettings,
    generalSettings,
    notificationSettings,
    notificationResult,
    notificationError,
    themeDefaultsResult,
    themeDefaultsError,
    appInstanceResult,
    appInstanceError,
    arrCombinedCardResult: String(req.query?.arrCombinedCardResult || '').trim(),
    arrCombinedCardError: String(req.query?.arrCombinedCardError || '').trim(),
    arrDashboardCombinedCards,
    downloaderDashboardCards,
    mediaDashboardCards,
    dashboardAddOptions: dashboardUnifiedAddOptions,
    dashboardDeprecatedAddOptions,
    dashboardCombinedAddOptions,
    dashboardElementResult: String(req.query?.dashboardElementResult || '').trim(),
    dashboardElementError: String(req.query?.dashboardElementError || '').trim(),
    defaultAppCatalog,
    defaultCategoryCatalog,
    defaultAppResult,
    defaultAppError,
    aboutCurrentVersion,
    aboutLatestVersion,
    aboutReleases,
    aboutDataDirectory: DATA_DIR,
    selectedSettingsAppId,
    localUsers,
    localUsersResult,
    localUsersError,
    navCategories,
    coAdmins: loadCoAdmins(),
    multiInstanceBaseIds,
    multiInstanceTitleMap,
    multiInstanceMaxMap,
    multiInstancePlaceholderMap,
    role,
    actualRole,
  });
});

app.post('/settings/theme-defaults', requireSettingsAdmin, (req, res) => {
  try {
    const config = loadConfig();
    const currentDefaults = resolveThemeDefaults(config);
    const nextDefaults = normalizeThemeSettings({
      mode: req.body?.theme_mode,
      brandTheme: req.body?.theme_brand_theme,
      customColor: req.body?.theme_custom_color,
      sidebarInvert: req.body?.theme_sidebar_invert,
      squareCorners: req.body?.theme_square_corners,
      bgMotion: req.body?.theme_bg_motion,
      carouselFreeScroll: req.body?.theme_carousel_free_scroll,
    }, currentDefaults);
    saveConfig({
      ...config,
      themeDefaults: nextDefaults,
    });
    return res.redirect('/settings?tab=custom&settingsCustomTab=themes&themeDefaultsResult=saved');
  } catch (err) {
    const encoded = encodeURIComponent('Failed to save default theme.');
    return res.redirect(`/settings?tab=custom&settingsCustomTab=themes&themeDefaultsError=${encoded}`);
  }
});

app.post('/settings/dashboard-elements', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const shouldUpdateTautulliCards = Boolean(req.body.tautulliCardsForm);
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? config.dashboardRemovedElements
    : {};
  const existingDashboardCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? config.dashboardCombinedOrder
    : {};
  const dashboardCombinedOrder = { ...existingDashboardCombinedOrder };
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
  const existingDashboardCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? config.dashboardCombinedSettings
    : {};
  const dashboardCombinedSettings = {};
  ARR_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:arr:${section.key}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    if (dashboardRemovedElements[mapKey] && existingDashboardCombinedSettings[mapKey]) {
      dashboardCombinedSettings[mapKey] = existingDashboardCombinedSettings[mapKey];
      return;
    }
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_arr_${section.key}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:downloader:${section.key}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    if (dashboardRemovedElements[mapKey] && existingDashboardCombinedSettings[mapKey]) {
      dashboardCombinedSettings[mapKey] = existingDashboardCombinedSettings[mapKey];
      return;
    }
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_downloader_${section.key}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:media:${section.key}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    if (dashboardRemovedElements[mapKey] && existingDashboardCombinedSettings[mapKey]) {
      dashboardCombinedSettings[mapKey] = existingDashboardCombinedSettings[mapKey];
      return;
    }
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_media_${section.key}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  Object.keys(req.body || {}).forEach((key) => {
    const match = key.match(/^dashboard_combined_arrcustom_(.+)_present$/);
    if (!match) return;
    const customToken = normalizeCombinedCardToken(match[1] || '');
    if (!customToken) return;
    const mapKey = `combined:arrcustom:${customToken}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_arrcustom_${customToken}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  Object.keys(req.body || {}).forEach((key) => {
    const match = key.match(/^dashboard_combined_downloadercustom_(.+)_present$/);
    if (!match) return;
    const customToken = normalizeCombinedCardToken(match[1] || '');
    if (!customToken) return;
    const mapKey = `combined:downloadercustom:${customToken}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_downloadercustom_${customToken}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  Object.keys(req.body || {}).forEach((key) => {
    const match = key.match(/^dashboard_combined_mediacustom_(.+)_present$/);
    if (!match) return;
    const customToken = normalizeCombinedCardToken(match[1] || '');
    if (!customToken) return;
    const mapKey = `combined:mediacustom:${customToken}`;
    const existing = existingDashboardCombinedSettings[mapKey] || {};
    const visibilityRole = normalizeVisibilityRole(
      req.body[`dashboard_combined_mediacustom_${customToken}_visibility_role`],
      resolveCombinedDashboardVisibilityRole(existing, 'user')
    );
    dashboardCombinedSettings[mapKey] = {
      ...existing,
      visibilityRole,
      enable: visibilityRole !== 'disabled',
      dashboard: visibilityRole !== 'disabled',
    };
  });
  Object.entries(existingDashboardCombinedSettings).forEach(([mapKey, value]) => {
    if (
      !String(mapKey || '').startsWith('combined:arrcustom:')
      && !String(mapKey || '').startsWith('combined:downloadercustom:')
      && !String(mapKey || '').startsWith('combined:mediacustom:')
    ) return;
    if (!dashboardRemovedElements[mapKey]) return;
    if (dashboardCombinedSettings[mapKey]) return;
    dashboardCombinedSettings[mapKey] = value;
  });
  const apps = (config.apps || []).map((appItem) => ({
    ...appItem,
    overviewElements: buildDashboardElementsFromRequest(appItem, req.body),
    tautulliCards: shouldUpdateTautulliCards
      ? buildTautulliCardsFromDashboardRequest(appItem, req.body)
      : appItem.tautulliCards,
  }));
  const combinedOverviewScopes = [
    { prefix: 'arr', appIds: ARR_APP_IDS, sections: ARR_COMBINE_SECTIONS, getSection: getArrCombineSection },
    { prefix: 'downloader', appIds: DOWNLOADER_APP_IDS, sections: DOWNLOADER_COMBINE_SECTIONS, getSection: getDownloaderCombineSection },
    { prefix: 'media', appIds: MEDIA_APP_IDS, sections: MEDIA_COMBINE_SECTIONS, getSection: getMediaCombineSection },
  ];
  const currentCombinedOverviewRoleByKey = new Map();
  apps.forEach((appItem) => {
    const normalizedAppId = normalizeAppId(appItem?.id);
    if (!normalizedAppId) return;
    const overviewElements = mergeOverviewElementSettings(appItem);
    combinedOverviewScopes.forEach((scope) => {
      if (!isAppInSet(normalizedAppId, scope.appIds)) return;
      scope.sections.forEach((section) => {
        const sectionElement = overviewElements.find((element) => element.id === section.elementId);
        const overviewVisibilityRole = normalizeVisibilityRole(
          sectionElement?.overviewVisibilityRole,
          (sectionElement && sectionElement.enable === false) ? 'disabled' : 'user'
        );
        currentCombinedOverviewRoleByKey.set(`${scope.prefix}:${section.key}:${normalizedAppId}`, overviewVisibilityRole);
      });
    });
  });
  const combinedOverviewRoleUpdates = new Map();
  Object.keys(req.body || {}).forEach((key) => {
    combinedOverviewScopes.forEach((scope) => {
      const match = key.match(new RegExp(`^${scope.prefix}_app_state_present__(.+?)__(.+?)__(.+)$`));
      if (!match) return;
      const token = String(match[1] || '').trim();
      const sectionKey = String(match[2] || '').trim();
      const rawAppId = String(match[3] || '').trim();
      const normalizedAppId = normalizeAppId(rawAppId);
      if (!token || !sectionKey || !normalizedAppId) return;
      if (!isAppInSet(normalizedAppId, scope.appIds)) return;
      const section = scope.getSection(sectionKey);
      if (!section) return;
      const overviewRoleField = `${scope.prefix}_app_overview_role__${token}__${sectionKey}__${rawAppId}`;
      const updateKey = `${scope.prefix}:${section.key}:${normalizedAppId}`;
      const currentOverviewRole = currentCombinedOverviewRoleByKey.get(updateKey) || 'user';
      const nextUpdate = {
        appId: normalizedAppId,
        elementId: section.elementId,
        overviewVisibilityRole: normalizeVisibilityRole(req.body[overviewRoleField], currentOverviewRole),
      };
      const existingUpdate = combinedOverviewRoleUpdates.get(updateKey);
      if (!existingUpdate) {
        combinedOverviewRoleUpdates.set(updateKey, nextUpdate);
        return;
      }
      const existingDiffers = existingUpdate.overviewVisibilityRole !== currentOverviewRole;
      const nextDiffers = nextUpdate.overviewVisibilityRole !== currentOverviewRole;
      if (!existingDiffers && nextDiffers) {
        combinedOverviewRoleUpdates.set(updateKey, nextUpdate);
        return;
      }
      if (existingDiffers === nextDiffers) {
        combinedOverviewRoleUpdates.set(updateKey, nextUpdate);
      }
    });
  });
  if (combinedOverviewRoleUpdates.size) {
    const combinedUpdatesByAppId = new Map();
    combinedOverviewRoleUpdates.forEach((update) => {
      const appUpdates = combinedUpdatesByAppId.get(update.appId) || [];
      appUpdates.push(update);
      combinedUpdatesByAppId.set(update.appId, appUpdates);
    });
    for (let appIndex = 0; appIndex < apps.length; appIndex += 1) {
      const appItem = apps[appIndex];
      const normalizedAppId = normalizeAppId(appItem?.id);
      if (!normalizedAppId) continue;
      const appUpdates = combinedUpdatesByAppId.get(normalizedAppId);
      if (!appUpdates || !appUpdates.length) continue;
      const nextOverviewElements = mergeOverviewElementSettings(appItem).map((element) => {
        const elementUpdate = appUpdates.find((update) => update.elementId === element.id);
        if (!elementUpdate) return element;
        const overviewVisibilityRole = normalizeVisibilityRole(
          elementUpdate.overviewVisibilityRole,
          element.enable === false ? 'disabled' : 'user'
        );
        return {
          ...element,
          enable: overviewVisibilityRole !== 'disabled',
          overviewVisibilityRole,
        };
      });
      apps[appIndex] = {
        ...appItem,
        overviewElements: nextOverviewElements,
      };
    }
  }
  const arrDashboardCombine = resolveArrDashboardCombineSettings(config, apps);
  ARR_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:arr:${section.key}`;
    if (dashboardRemovedElements[mapKey]) return;
    arrDashboardCombine[section.key] = arrDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
      .forEach((appItem) => {
        const field = `arr_combine_${section.key}_${appItem.id}`;
        arrDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const arrSelectableAppIds = apps
    .filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, ARR_APP_IDS))
    .map((appItem) => normalizeAppId(appItem.id))
    .filter(Boolean);
  const arrDashboardCombinedCards = resolveArrDashboardCombinedCards(config, apps).map((card) => {
    const cardKey = `combined:arrcustom:${card.id}`;
    if (dashboardRemovedElements[cardKey]) return card;
    const selected = arrSelectableAppIds.filter((appId) => Boolean(req.body[`arrcustom_combine_${card.id}_${appId}`]));
    return {
      ...card,
      appIds: selected.length ? selected : [...arrSelectableAppIds],
    };
  });
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:downloader:${section.key}`;
    if (dashboardRemovedElements[mapKey]) return;
    downloaderDashboardCombine[section.key] = downloaderDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
      .forEach((appItem) => {
        const field = `downloader_combine_${section.key}_${appItem.id}`;
        downloaderDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const downloaderSelectableAppIds = apps
    .filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
    .map((appItem) => normalizeAppId(appItem.id))
    .filter(Boolean);
  const downloaderDashboardCards = resolveDownloaderDashboardCards(config, apps).map((card) => {
    const cardKey = `combined:downloadercustom:${card.id}`;
    if (dashboardRemovedElements[cardKey]) return card;
    const selected = downloaderSelectableAppIds.filter((appId) => Boolean(req.body[`downloadercustom_combine_${card.id}_${appId}`]));
    return {
      ...card,
      appIds: selected,
    };
  });
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    const mapKey = `combined:media:${section.key}`;
    if (dashboardRemovedElements[mapKey]) return;
    mediaDashboardCombine[section.key] = mediaDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
      .forEach((appItem) => {
        const field = `media_combine_${section.key}_${appItem.id}`;
        mediaDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const mediaSelectableAppIds = apps
    .filter((appItem) => !appItem?.removed && isAppInSet(appItem.id, MEDIA_APP_IDS))
    .map((appItem) => normalizeAppId(appItem.id))
    .filter(Boolean);
  const mediaDashboardCards = resolveMediaDashboardCards(config, apps).map((card) => {
    const cardKey = `combined:mediacustom:${card.id}`;
    if (dashboardRemovedElements[cardKey]) return card;
    const selected = mediaSelectableAppIds.filter((appId) => Boolean(req.body[`mediacustom_combine_${card.id}_${appId}`]));
    return {
      ...card,
      appIds: selected,
    };
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
    arrDashboardCombinedCards,
    downloaderDashboardCards,
    mediaDashboardCards,
    dashboardCombinedOrder,
    dashboardCombinedSettings,
  });
  res.redirect('/settings');
});

app.post('/settings/dashboard-elements/remove', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const key = String(req.body?.dashboard_element_key || req.body?.key || '').trim();
  if (!key) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&dashboardElementError=Missing+dashboard+item+key.');
  }

  const customCombinedMatch = key.match(/^combined:(arrcustom|downloadercustom|mediacustom):(.+)$/);
  if (customCombinedMatch) {
    const customType = String(customCombinedMatch[1] || '').trim();
    const customToken = normalizeCombinedCardToken(customCombinedMatch[2] || '');
    if (!customToken) {
      return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&dashboardElementError=Invalid+custom+dashboard+card+id.');
    }
    const listField = customType === 'arrcustom'
      ? 'arrDashboardCombinedCards'
      : (customType === 'downloadercustom' ? 'downloaderDashboardCards' : 'mediaDashboardCards');
    const customKey = `combined:${customType}:${customToken}`;
    const existingCards = Array.isArray(config?.[listField]) ? config[listField] : [];
    const nextCards = existingCards.filter((card) => normalizeCombinedCardToken(card?.id || '') !== customToken);
    const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    const dashboardCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
      ? { ...config.dashboardCombinedSettings }
      : {};
    const dashboardCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
      ? { ...config.dashboardCombinedOrder }
      : {};
    delete dashboardRemovedElements[key];
    delete dashboardRemovedElements[customKey];
    delete dashboardCombinedSettings[key];
    delete dashboardCombinedSettings[customKey];
    delete dashboardCombinedOrder[key];
    delete dashboardCombinedOrder[customKey];
    saveConfig({
      ...config,
      [listField]: nextCards,
      dashboardRemovedElements,
      dashboardCombinedSettings,
      dashboardCombinedOrder,
    });
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&dashboardElementResult=removed');
  }

  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  dashboardRemovedElements[key] = true;
  saveConfig({
    ...config,
    dashboardRemovedElements,
  });
  return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&dashboardElementResult=removed');
});

const DASHBOARD_SETTINGS_REDIRECT = '/settings?tab=custom&settingsCustomTab=dashboard';

function redirectDashboardAddError(res, message) {
  return res.redirect(`${DASHBOARD_SETTINGS_REDIRECT}&dashboardElementError=${encodeURIComponent(message)}`);
}

function redirectDashboardAddResult(res, result = 'added') {
  return res.redirect(`${DASHBOARD_SETTINGS_REDIRECT}&dashboardElementResult=${encodeURIComponent(result)}`);
}

function resolveNextDashboardOrder(config) {
  const apps = Array.isArray(config?.apps) ? config.apps : [];
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? config.dashboardRemovedElements
    : {};
  const dashboardCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? config.dashboardCombinedOrder
    : {};
  let maxOrder = 0;

  const updateMaxOrder = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    if (parsed > maxOrder) maxOrder = parsed;
  };

  apps
    .filter((appItem) => !appItem?.removed)
    .forEach((appItem) => {
      const appId = String(appItem?.id || '').trim();
      if (!appId) return;
      const overviewElements = mergeOverviewElementSettings(appItem);
      overviewElements.forEach((element) => {
        const elementId = String(element?.id || '').trim();
        if (!elementId) return;
        if (dashboardRemovedElements[`app:${appId}:${elementId}`]) return;
        updateMaxOrder(element?.order);
      });
    });

  Object.entries(dashboardCombinedOrder).forEach(([combinedKey, orderValue]) => {
    if (dashboardRemovedElements[combinedKey]) return;
    updateMaxOrder(orderValue);
  });

  return maxOrder + 1;
}

function handleDashboardAddRequest(req, res) {
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const normalizeSubmittedValues = (value) => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => normalizeSubmittedValues(entry));
    }
    const text = String(value || '').trim();
    if (!text) return [];
    return text
      .split(',')
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  };
  const submittedKeys = [
    ...normalizeSubmittedValues(req.body?.dashboard_add_key_current),
    ...normalizeSubmittedValues(req.body?.dashboard_add_key_deprecated),
    ...normalizeSubmittedValues(req.body?.dashboard_add_key),
    ...normalizeSubmittedValues(req.body?.dashboard_element_key),
    ...normalizeSubmittedValues(req.body?.dashboard_combined_key),
    ...normalizeSubmittedValues(req.body?.key),
  ];
  const key = submittedKeys.find((entry) => /^(app:|new:|combined:)/.test(entry)) || submittedKeys[0] || '';
  if (!key) {
    return redirectDashboardAddError(res, 'Select a dashboard card to add.');
  }

  const deprecatedDescriptor = resolveDeprecatedDashboardCardDescriptor(key);
  if (deprecatedDescriptor) {
    const draftDashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    delete draftDashboardRemovedElements[key];
    const draftConfig = {
      ...config,
      dashboardRemovedElements: draftDashboardRemovedElements,
    };
    const nextOrder = resolveNextDashboardOrder(config);

    if (deprecatedDescriptor.kind === 'app') {
      draftConfig.apps = apps.map((appItem) => {
        if (normalizeAppId(appItem?.id) !== deprecatedDescriptor.appId) return appItem;
        const existingOverview = Array.isArray(appItem?.overviewElements) ? appItem.overviewElements : [];
        const nextOverview = existingOverview.map((entry) => ({ ...(entry || {}) }));
        const existingIndex = nextOverview.findIndex((entry) => String(entry?.id || '').trim() === deprecatedDescriptor.elementId);
        if (existingIndex >= 0) {
          nextOverview[existingIndex] = {
            ...nextOverview[existingIndex],
            id: deprecatedDescriptor.elementId,
            dashboard: true,
            dashboardVisibilityRole: normalizeVisibilityRole(nextOverview[existingIndex]?.dashboardVisibilityRole, 'user') === 'disabled'
              ? 'user'
              : normalizeVisibilityRole(nextOverview[existingIndex]?.dashboardVisibilityRole, 'user'),
            order: nextOrder,
          };
        } else {
          nextOverview.push({
            id: deprecatedDescriptor.elementId,
            dashboard: true,
            dashboardVisibilityRole: 'user',
            order: nextOrder,
          });
        }
        return {
          ...appItem,
          overviewElements: nextOverview,
        };
      });
    } else if (deprecatedDescriptor.kind === 'combined') {
      const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
        ? { ...config.dashboardCombinedSettings }
        : {};
      const existingSetting = existingCombinedSettings[key] && typeof existingCombinedSettings[key] === 'object'
        ? existingCombinedSettings[key]
        : {};
      const visibilityRole = resolveCombinedDashboardVisibilityRole(existingSetting, 'user') === 'disabled'
        ? 'user'
        : resolveCombinedDashboardVisibilityRole(existingSetting, 'user');
      existingCombinedSettings[key] = {
        ...existingSetting,
        visibilityRole,
        enable: visibilityRole !== 'disabled',
        dashboard: visibilityRole !== 'disabled',
      };
      draftConfig.dashboardCombinedSettings = existingCombinedSettings;
      const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
        ? { ...config.dashboardCombinedOrder }
        : {};
      if (!Number.isFinite(Number(existingCombinedOrder[key]))) {
        existingCombinedOrder[key] = nextOrder;
      }
      draftConfig.dashboardCombinedOrder = existingCombinedOrder;
    }

    const migration = migrateDeprecatedDashboardCards(draftConfig);
    if (migration.changed) {
      saveConfig(migration.config);
      return redirectDashboardAddResult(res, 'added');
    }
  }

  if (key.startsWith('app:')) {
    const appMatch = key.match(/^app:([^:]+):(.+)$/);
    if (!appMatch) {
      return redirectDashboardAddError(res, 'Invalid app card selection.');
    }
    const selectedAppId = String(appMatch[1] || '').trim();
    const selectedElementId = String(appMatch[2] || '').trim();
    if (!selectedAppId || !selectedElementId) {
      return redirectDashboardAddError(res, 'Invalid app card selection.');
    }
    const nextDashboardOrder = resolveNextDashboardOrder(config);
    const nextApps = apps.map((appItem) => {
      if (String(appItem?.id || '').trim() !== selectedAppId) return appItem;
      const existingOverview = Array.isArray(appItem?.overviewElements) ? appItem.overviewElements : [];
      const nextOverview = existingOverview.map((entry) => ({ ...(entry || {}) }));
      const existingIndex = nextOverview.findIndex((entry) => String(entry?.id || '').trim() === selectedElementId);
      if (existingIndex >= 0) {
        nextOverview[existingIndex] = {
          ...nextOverview[existingIndex],
          id: selectedElementId,
          dashboard: true,
          order: nextDashboardOrder,
        };
      } else {
        nextOverview.push({
          id: selectedElementId,
          dashboard: true,
          order: nextDashboardOrder,
        });
      }
      return {
        ...appItem,
        overviewElements: nextOverview,
      };
    });
    const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    delete dashboardRemovedElements[key];
    saveConfig({
      ...config,
      apps: nextApps,
      dashboardRemovedElements,
    });
    return redirectDashboardAddResult(res, 'added');
  }

  const newArrMatch = key.match(/^new:arr:(.+)$/);
  if (newArrMatch) {
    if (!ENABLE_ARR_UNIFIED_CARDS) {
      return redirectDashboardAddError(res, 'ARR unified cards are currently disabled.');
    }
    const sectionKey = String(newArrMatch[1] || '').trim();
    if (!getArrCombineSection(sectionKey)) {
      return redirectDashboardAddError(res, 'Invalid combined section selected.');
    }
    const allowedAppIds = [
      ...new Set(
        apps
          .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, ARR_APP_IDS))
          .map((appItem) => normalizeAppId(appItem?.id))
          .filter(Boolean)
      ),
    ];
    if (!allowedAppIds.length) {
      return redirectDashboardAddError(res, 'No ARR sources available to build a dashboard card.');
    }
    const existingCards = resolveArrDashboardCombinedCards(config, apps);
    const cardId = normalizeCombinedCardToken(buildCombinedCardId());
    const nextCards = [...existingCards, {
      id: cardId,
      sectionKey,
      appIds: allowedAppIds,
    }];

    const combinedKey = `combined:arrcustom:${cardId}`;
    const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
      ? { ...config.dashboardCombinedSettings }
      : {};
    existingCombinedSettings[combinedKey] = { enable: true, dashboard: true, visibilityRole: 'user' };
    const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
      ? { ...config.dashboardCombinedOrder }
      : {};
    const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    existingCombinedOrder[combinedKey] = resolveNextDashboardOrder(config);
    delete dashboardRemovedElements[combinedKey];

    saveConfig({
      ...config,
      arrDashboardCombinedCards: nextCards,
      dashboardCombinedSettings: existingCombinedSettings,
      dashboardCombinedOrder: existingCombinedOrder,
      dashboardRemovedElements,
    });
    return redirectDashboardAddResult(res, 'added');
  }

  const newMediaMatch = key.match(/^new:media:(.+)$/);
  if (newMediaMatch) {
    const sectionKey = String(newMediaMatch[1] || '').trim();
    if (!getMediaCombineSection(sectionKey)) {
      return redirectDashboardAddError(res, 'Invalid combined section selected.');
    }
    const allowedAppIds = [
      ...new Set(
        apps
          .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, MEDIA_APP_IDS))
          .map((appItem) => normalizeAppId(appItem?.id))
          .filter(Boolean)
      ),
    ];
    if (!allowedAppIds.length) {
      return redirectDashboardAddError(res, 'No media sources available to build a dashboard card.');
    }
    const existingCards = resolveMediaDashboardCards(config, apps);
    const cardId = normalizeCombinedCardToken(buildCombinedCardId());
    const nextCards = [...existingCards, {
      id: cardId,
      sectionKey,
      appIds: allowedAppIds,
    }];
    const combinedKey = `combined:mediacustom:${cardId}`;
    const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
      ? { ...config.dashboardCombinedSettings }
      : {};
    existingCombinedSettings[combinedKey] = { enable: true, dashboard: true, visibilityRole: 'user' };
    const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
      ? { ...config.dashboardCombinedOrder }
      : {};
    const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    existingCombinedOrder[combinedKey] = resolveNextDashboardOrder(config);
    delete dashboardRemovedElements[combinedKey];

    saveConfig({
      ...config,
      mediaDashboardCards: nextCards,
      dashboardCombinedSettings: existingCombinedSettings,
      dashboardCombinedOrder: existingCombinedOrder,
      dashboardRemovedElements,
    });
    return redirectDashboardAddResult(res, 'added');
  }

  const newDownloaderMatch = key.match(/^new:downloader:(.+)$/);
  if (newDownloaderMatch) {
    if (!ENABLE_DOWNLOADER_UNIFIED_CARDS) {
      return redirectDashboardAddError(res, 'Downloader unified cards are currently disabled.');
    }
    const sectionKey = String(newDownloaderMatch[1] || '').trim();
    if (!getDownloaderCombineSection(sectionKey)) {
      return redirectDashboardAddError(res, 'Invalid combined section selected.');
    }
    const allowedAppIds = [
      ...new Set(
        apps
          .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, DOWNLOADER_APP_IDS))
          .map((appItem) => normalizeAppId(appItem?.id))
          .filter(Boolean)
      ),
    ];
    if (!allowedAppIds.length) {
      return redirectDashboardAddError(res, 'No downloader sources available to build a dashboard card.');
    }
    const existingCards = resolveDownloaderDashboardCards(config, apps);
    const cardId = normalizeCombinedCardToken(buildCombinedCardId());
    const nextCards = [...existingCards, {
      id: cardId,
      sectionKey,
      appIds: allowedAppIds,
    }];
    const combinedKey = `combined:downloadercustom:${cardId}`;
    const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
      ? { ...config.dashboardCombinedSettings }
      : {};
    existingCombinedSettings[combinedKey] = { enable: true, dashboard: true, visibilityRole: 'user' };
    const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
      ? { ...config.dashboardCombinedOrder }
      : {};
    const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
      ? { ...config.dashboardRemovedElements }
      : {};
    existingCombinedOrder[combinedKey] = resolveNextDashboardOrder(config);
    delete dashboardRemovedElements[combinedKey];

    saveConfig({
      ...config,
      downloaderDashboardCards: nextCards,
      dashboardCombinedSettings: existingCombinedSettings,
      dashboardCombinedOrder: existingCombinedOrder,
      dashboardRemovedElements,
    });
    return redirectDashboardAddResult(res, 'added');
  }

  const arrCustomAddKeys = resolveArrDashboardCombinedCards(config, apps).map((card, index) => {
    const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
    return `combined:arrcustom:${customToken}`;
  });
  const downloaderCustomAddKeys = resolveDownloaderDashboardCards(config, apps).map((card, index) => {
    const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
    return `combined:downloadercustom:${customToken}`;
  });
  const mediaCustomAddKeys = resolveMediaDashboardCards(config, apps).map((card, index) => {
    const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
    return `combined:mediacustom:${customToken}`;
  });
  const allowedKeys = new Set([
    ...ARR_COMBINE_SECTIONS.map((section) => `combined:arr:${section.key}`),
    ...DOWNLOADER_COMBINE_SECTIONS.map((section) => `combined:downloader:${section.key}`),
    ...MEDIA_COMBINE_SECTIONS.map((section) => `combined:media:${section.key}`),
    ...arrCustomAddKeys,
    ...downloaderCustomAddKeys,
    ...mediaCustomAddKeys,
  ]);
  if (!allowedKeys.has(key)) {
    return redirectDashboardAddError(res, 'Invalid combined card selection.');
  }

  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? { ...config.dashboardCombinedOrder }
    : {};
  existingCombinedOrder[key] = resolveNextDashboardOrder(config);
  delete dashboardRemovedElements[key];
  saveConfig({
    ...config,
    dashboardCombinedOrder: existingCombinedOrder,
    dashboardRemovedElements,
  });
  return redirectDashboardAddResult(res, 'added');
}

app.post('/settings/dashboard/add', requireSettingsAdmin, handleDashboardAddRequest);

app.post('/settings/dashboard-elements/add', requireSettingsAdmin, handleDashboardAddRequest);

app.post('/settings/dashboard-combined/add', requireSettingsAdmin, handleDashboardAddRequest);

app.post('/settings/dashboard-combined/arr/add', requireSettingsAdmin, (req, res) => {
  if (!ENABLE_ARR_UNIFIED_CARDS) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=ARR+unified+cards+are+currently+disabled.');
  }
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const sectionKey = String(req.body?.arr_combined_section || req.body?.section || '').trim();
  if (!getArrCombineSection(sectionKey)) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=Invalid+combined+section+selected.');
  }

  const allowedAppIds = [
    ...new Set(
      apps
        .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, ARR_APP_IDS))
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter(Boolean)
    ),
  ];
  if (!allowedAppIds.length) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=No+ARR+sources+available+to+build+a+dashboard+card.');
  }

  const existingCards = resolveArrDashboardCombinedCards(config, apps);
  const cardId = normalizeCombinedCardToken(buildCombinedCardId());
  const nextCards = [...existingCards, {
    id: cardId,
    sectionKey,
    appIds: allowedAppIds,
  }];

  const combinedKey = `combined:arrcustom:${cardId}`;
  const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? { ...config.dashboardCombinedSettings }
    : {};
  existingCombinedSettings[combinedKey] = { enable: true, dashboard: true };
  const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? { ...config.dashboardCombinedOrder }
    : {};
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  existingCombinedOrder[combinedKey] = resolveNextDashboardOrder(config);
  delete dashboardRemovedElements[combinedKey];

  saveConfig({
    ...config,
    arrDashboardCombinedCards: nextCards,
    dashboardCombinedSettings: existingCombinedSettings,
    dashboardCombinedOrder: existingCombinedOrder,
    dashboardRemovedElements,
  });
  return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardResult=added');
});

app.post('/settings/dashboard-combined/arr/delete', requireSettingsAdmin, (req, res) => {
  if (!ENABLE_ARR_UNIFIED_CARDS) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=ARR+unified+cards+are+currently+disabled.');
  }
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const cardId = normalizeCombinedCardToken(req.body?.id || '');
  if (!cardId) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=Missing+combined+card+id.');
  }
  const existingCards = resolveArrDashboardCombinedCards(config, apps);
  const nextCards = existingCards.filter((card) => card.id !== cardId);
  if (nextCards.length === existingCards.length) {
    return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardError=Combined+card+not+found.');
  }

  const combinedKey = `combined:arrcustom:${cardId}`;
  const existingCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? { ...config.dashboardCombinedSettings }
    : {};
  const existingCombinedOrder = (config && typeof config.dashboardCombinedOrder === 'object' && config.dashboardCombinedOrder)
    ? { ...config.dashboardCombinedOrder }
    : {};
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  delete existingCombinedSettings[combinedKey];
  delete existingCombinedOrder[combinedKey];
  delete dashboardRemovedElements[combinedKey];

  saveConfig({
    ...config,
    arrDashboardCombinedCards: nextCards,
    dashboardCombinedSettings: existingCombinedSettings,
    dashboardCombinedOrder: existingCombinedOrder,
    dashboardRemovedElements,
  });
  return res.redirect('/settings?tab=custom&settingsCustomTab=dashboard&arrCombinedCardResult=removed');
});

app.get('/user-settings', requireUser, (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const categoryEntries = resolveCategoryEntries(config, apps);
  const categoryOrder = categoryEntries.map((entry) => entry.name);
  const role = getEffectiveRole(req);
  const actualRole = getActualRole(req);
  const navApps = getNavApps(apps, role, req, categoryOrder);
  const navCategories = buildNavCategories(navApps, categoryEntries, role);
  const generalSettings = resolveGeneralSettings(config);
  const profileResult = String(req.query?.profileResult || '').trim();
  const profileError = String(req.query?.profileError || '').trim();
  const themeResult = String(req.query?.themeResult || '').trim();
  const themeError = String(req.query?.themeError || '').trim();
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
    themeResult,
    themeError,
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
  const avatarDataUrl = String(req.body?.avatarDataUrl || '').trim();

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
  if (avatarDataUrl) {
    const parsedAvatar = parseUserAvatarDataUrl(avatarDataUrl);
    if (!parsedAvatar.ok) {
      const encodedError = encodeURIComponent(parsedAvatar.error || 'Invalid avatar image.');
      return res.redirect(`/user-settings?profileError=${encodedError}`);
    }
    const savedAvatar = saveCustomUserAvatar(parsedAvatar.buffer, parsedAvatar.ext, `${username}-avatar`);
    if (!savedAvatar) {
      return res.redirect('/user-settings?profileError=Failed+to+save+avatar+image.');
    }
    const previousAvatar = normalizeStoredAvatarPath(currentUser.avatar || '');
    nextUser.avatar = savedAvatar;
    if (previousAvatar && previousAvatar !== savedAvatar) {
      deleteCustomIcon(previousAvatar, [USER_AVATAR_BASE]);
    }
  }

  const nextUsers = [...users];
  nextUsers[index] = nextUser;
  const userThemePreferences = resolveUserThemePreferences(config, resolveThemeDefaults(config));
  const previousThemeKey = resolveThemePreferenceKey({
    source: 'local',
    username: currentUser.username,
    email: currentUser.email,
  });
  const nextThemeKey = resolveThemePreferenceKey({
    source: 'local',
    username: nextUser.username,
    email: nextUser.email,
  });
  if (previousThemeKey && nextThemeKey && previousThemeKey !== nextThemeKey && userThemePreferences[previousThemeKey]) {
    if (!userThemePreferences[nextThemeKey]) {
      userThemePreferences[nextThemeKey] = userThemePreferences[previousThemeKey];
    }
    delete userThemePreferences[previousThemeKey];
  }
  saveConfig({
    ...config,
    users: serializeLocalUsers(nextUsers),
    userThemePreferences: serializeUserThemePreferences(userThemePreferences, resolveThemeDefaults(config)),
  });
  setSessionUser(req, nextUser, 'local');

  return res.redirect('/user-settings?profileResult=saved');
});

app.post('/user-settings/theme', requireUser, (req, res) => {
  try {
    const config = loadConfig();
    const userKey = resolveThemePreferenceKey(req.session?.user);
    if (!userKey) {
      return res.redirect('/user-settings?themeError=Unable+to+resolve+your+theme+profile.');
    }
    const defaults = resolveThemeDefaults(config);
    const userThemePreferences = resolveUserThemePreferences(config, defaults);
    userThemePreferences[userKey] = normalizeThemeSettings({
      mode: req.body?.theme_mode,
      brandTheme: req.body?.theme_brand_theme,
      customColor: req.body?.theme_custom_color,
      sidebarInvert: req.body?.theme_sidebar_invert,
      squareCorners: req.body?.theme_square_corners,
      bgMotion: req.body?.theme_bg_motion,
      carouselFreeScroll: req.body?.theme_carousel_free_scroll,
    }, defaults);
    saveConfig({
      ...config,
      userThemePreferences: serializeUserThemePreferences(userThemePreferences, defaults),
    });
    return res.redirect('/user-settings?themeResult=saved');
  } catch (err) {
    const encoded = encodeURIComponent('Failed to save your theme preference.');
    return res.redirect(`/user-settings?themeError=${encoded}`);
  }
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
    avatar: '',
    createdBy: 'system',
    setupAccount: false,
    systemCreated: true,
    createdAt: new Date().toISOString(),
  };
  saveConfig({ ...config, users: serializeLocalUsers([...users, newUser]) });
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
  saveConfig({ ...config, users: serializeLocalUsers(nextUsers) });
  return res.redirect('/settings?tab=user&localUsersResult=role-saved');
});

app.post('/settings/local-users/delete', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const users = resolveLocalUsers(config);
  const username = String(req.body?.username || '').trim();
  if (!username) return res.redirect('/settings?tab=user&localUsersError=Missing+username.');

  const index = users.findIndex((entry) => normalizeUserKey(entry?.username || '') === normalizeUserKey(username));
  if (index < 0) return res.redirect('/settings?tab=user&localUsersError=Launcharr+user+not+found.');

  const targetUser = users[index];
  const isOwnerAccount = Boolean(
    targetUser?.isSetupAdmin
    || targetUser?.setupAccount === true
    || String(targetUser?.createdBy || '').trim().toLowerCase() === 'setup'
  );
  if (isOwnerAccount) {
    return res.redirect('/settings?tab=user&localUsersError=Owner+admin+account+cannot+be+deleted.');
  }
  if (targetUser?.systemCreated === false) {
    return res.redirect('/settings?tab=user&localUsersError=Only+system-generated+local+users+can+be+deleted.');
  }

  const currentSessionSource = String(req.session?.user?.source || '').trim().toLowerCase();
  const isCurrentSessionUser = currentSessionSource === 'local'
    && normalizeUserKey(req.session?.user?.username || '') === normalizeUserKey(targetUser.username || '');
  if (isCurrentSessionUser) {
    return res.redirect('/settings?tab=user&localUsersError=You+cannot+delete+your+current+session+account.');
  }

  const avatarPath = normalizeStoredAvatarPath(targetUser.avatar || '');
  if (avatarPath) {
    deleteCustomIcon(avatarPath, [USER_AVATAR_BASE]);
  }

  const nextUsers = users.filter((_entry, entryIndex) => entryIndex !== index);
  saveConfig({ ...config, users: serializeLocalUsers(nextUsers) });
  return res.redirect('/settings?tab=user&localUsersResult=removed');
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
    const launchModeInput = req.body[`display_launch_mode_${id}`];
    const favouriteValue = Boolean(req.body[`display_favourite_${id}`]);
    const categoryValue = req.body[`display_category_${id}`];
    const orderValue = req.body[`display_order_${id}`];
    const parsedOrder = Number(orderValue);
    const currentMenu = normalizeMenu(appItem);
    const currentLaunchMode = resolveAppLaunchMode(appItem, currentMenu);
    const launchMode = normalizeLaunchMode(
      launchModeInput,
      currentLaunchMode === 'disabled' ? 'new-tab' : currentLaunchMode
    );
    const isCustom = Boolean(appItem.custom);
    const sidebarMinRole = normalizeVisibilityRole(
      req.body[`display_sidebar_min_role_${id}`],
      currentMenu.sidebar?.minRole || 'disabled'
    );
    const overviewSidebarMinRole = isCustom
      ? 'disabled'
      : normalizeVisibilityRole(
        req.body[`display_overview_min_role_${id}`] || req.body[`display_dashboard_min_role_${id}`],
        currentMenu.sidebarOverview?.minRole || currentMenu.overview?.minRole || 'disabled'
      );
    const appSettingsSidebarMinRole = normalizeVisibilityRole(
      req.body[`display_app_settings_min_role_${id}`],
      currentMenu.sidebarSettings?.minRole || currentMenu.settings?.minRole || 'admin'
    );
    const activitySidebarMinRole = normalizeVisibilityRole(
      req.body[`display_activity_min_role_${id}`],
      currentMenu.sidebarActivity?.minRole || 'admin'
    );
    const launchMinRoleInput = normalizeVisibilityRole(
      req.body[`display_launch_min_role_${id}`],
      currentMenu.launch?.minRole || 'disabled'
    );
    const launchMinRole = launchMode === 'disabled' ? 'disabled' : launchMinRoleInput;
    const settingsMinRole = normalizeVisibilityRole(currentMenu.settings?.minRole || 'admin', 'admin');
    const menu = buildMenuAccessConfig({
      sidebar: sidebarMinRole,
      sidebarOverview: overviewSidebarMinRole,
      sidebarSettings: appSettingsSidebarMinRole,
      sidebarActivity: activitySidebarMinRole,
      overview: isCustom ? 'disabled' : overviewSidebarMinRole,
      launch: launchMinRole,
      settings: settingsMinRole,
    });

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
      .filter((appItem) => isAppInSet(appItem.id, ARR_APP_IDS))
      .forEach((appItem) => {
        const field = `arr_combine_${section.key}_${appItem.id}`;
        arrDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const downloaderDashboardCombine = resolveDownloaderDashboardCombineSettings(config, apps);
  DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
    downloaderDashboardCombine[section.key] = downloaderDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => isAppInSet(appItem.id, DOWNLOADER_APP_IDS))
      .forEach((appItem) => {
        const field = `downloader_combine_${section.key}_${appItem.id}`;
        downloaderDashboardCombine[section.key][appItem.id] = Boolean(req.body[field]);
      });
  });
  const mediaDashboardCombine = resolveMediaDashboardCombineSettings(config, apps);
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    mediaDashboardCombine[section.key] = mediaDashboardCombine[section.key] || {};
    apps
      .filter((appItem) => isAppInSet(appItem.id, MEDIA_APP_IDS))
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

app.post('/settings/apps/instances/add', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const sourceId = normalizeAppId(req.body?.sourceId || '');
  const baseId = getAppBaseId(req.body?.baseId || sourceId);
  const maxInstances = getMaxMultiInstancesForBase(baseId, apps);
  const focusApp = sourceId || baseId;
  const redirectWithError = (message) => {
    const appParam = encodeURIComponent(String(focusApp || baseId || '').trim());
    const encodedMessage = encodeURIComponent(String(message || 'Unable to add instance.').trim());
    return res.redirect(`/settings?tab=app&app=${appParam}&appInstanceError=${encodedMessage}`);
  };

  if (!supportsAppInstances(baseId)) {
    return redirectWithError('Unsupported app for instances.');
  }

  const sameBaseApps = apps.filter((appItem) => getAppBaseId(appItem?.id) === baseId);
  if (sameBaseApps.length >= maxInstances) {
    return redirectWithError(`Maximum ${maxInstances} instances reached for ${getBaseAppTitle(baseId)}.`);
  }

  const nextId = buildNextInstanceId(baseId, apps);
  if (!nextId) {
    return redirectWithError(`Unable to allocate a new ${getBaseAppTitle(baseId)} instance id.`);
  }

  const sourceApp = sameBaseApps.find((appItem) => normalizeAppId(appItem?.id) === sourceId)
    || sameBaseApps[0]
    || loadDefaultApps().find((appItem) => normalizeAppId(appItem?.id) === baseId);
  if (!sourceApp) {
    return redirectWithError(`Missing ${getBaseAppTitle(baseId)} template app.`);
  }

  const category = String(sourceApp.category || 'Arr Suite').trim() || 'Arr Suite';
  const maxOrder = Math.max(
    0,
    ...apps
      .filter((appItem) => String(appItem?.category || '').trim().toLowerCase() === category.toLowerCase())
      .map((appItem) => Number(appItem?.order) || 0)
  );

  const newApp = {
    ...sourceApp,
    id: nextId,
    name: getDefaultInstanceName(baseId, nextId),
    instanceName: '',
    icon: resolvePersistedAppIconPath({ ...sourceApp, id: nextId }),
    localUrl: '',
    remoteUrl: '',
    url: '',
    apiKey: '',
    username: '',
    password: '',
    plexToken: '',
    plexMachine: '',
    order: maxOrder + 1,
    favourite: false,
  };
  if (Array.isArray(newApp.overviewElements) && newApp.overviewElements.length) {
    const activeAppsMaxOverviewOrder = Math.max(
      0,
      ...apps
        .filter((appItem) => !appItem?.removed)
        .flatMap((appItem) =>
          mergeOverviewElementSettings(appItem).map((entry) => Number(entry?.order))
        )
        .filter((value) => Number.isFinite(value))
    );
    const orderedOverviewElements = [...newApp.overviewElements]
      .map((entry) => ({ ...(entry || {}) }))
      .sort((left, right) => {
        const leftOrder = Number(left?.order);
        const rightOrder = Number(right?.order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) return leftOrder - rightOrder;
        if (Number.isFinite(leftOrder)) return -1;
        if (Number.isFinite(rightOrder)) return 1;
        return String(left?.id || '').localeCompare(String(right?.id || ''));
      })
      .map((entry, index) => ({
        ...entry,
        order: activeAppsMaxOverviewOrder + index + 1,
      }));
    newApp.overviewElements = orderedOverviewElements;
  }

  const deprecatedElementIdSet = new Set(resolveDeprecatedDashboardElementIdsForApp(nextId));
  if (deprecatedElementIdSet.size && Array.isArray(newApp.overviewElements)) {
    newApp.overviewElements = newApp.overviewElements.map((entry) => {
      const elementId = String(entry?.id || '').trim();
      if (!deprecatedElementIdSet.has(elementId)) return entry;
      return {
        ...(entry || {}),
        id: elementId,
        dashboard: false,
        dashboardVisibilityRole: 'disabled',
      };
    });
  }
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  deprecatedElementIdSet.forEach((elementId) => {
    dashboardRemovedElements[`app:${nextId}:${elementId}`] = true;
  });

  saveConfig({ ...config, apps: [...apps, newApp], dashboardRemovedElements });
  const appParam = encodeURIComponent(nextId);
  return res.redirect(`/settings?tab=app&app=${appParam}&appInstanceResult=added`);
});

app.post('/settings/apps/instances/delete', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const appId = normalizeAppId(req.body?.appId || '');
  const baseId = getAppBaseId(appId);
  const appParam = encodeURIComponent(baseId || appId || '');
  const redirectWithError = (message) => {
    const encodedMessage = encodeURIComponent(String(message || 'Unable to delete instance.').trim());
    return res.redirect(`/settings?tab=app&app=${appParam}&appInstanceError=${encodedMessage}`);
  };

  if (!appId || !supportsAppInstances(baseId)) {
    return redirectWithError('Unsupported app for instance deletion.');
  }

  const sameBaseApps = apps.filter((appItem) => getAppBaseId(appItem?.id) === baseId);
  if (!sameBaseApps.length) {
    return redirectWithError('Instance not found.');
  }

  if (getInstanceSuffix(appId, baseId) === 1) {
    return redirectWithError('The first instance cannot be deleted.');
  }

  if (!sameBaseApps.some((appItem) => normalizeAppId(appItem?.id) === appId)) {
    return redirectWithError('Instance not found.');
  }

  const nextApps = apps.filter((appItem) => normalizeAppId(appItem?.id) !== appId);
  saveConfig({ ...config, apps: nextApps });
  return res.redirect(`/settings?tab=app&app=${appParam}&appInstanceResult=deleted`);
});

app.post('/settings/default-apps/add', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const defaultAppId = normalizeAppId(req.body?.default_app_id || req.body?.id || '');
  const requestedCategory = String(req.body?.default_app_category || req.body?.category || '').trim();
  const redirectWithError = (message) => {
    const encodedMessage = encodeURIComponent(String(message || 'Unable to add default app.').trim());
    return res.redirect(`/settings?tab=custom&defaultAppError=${encodedMessage}`);
  };

  if (!defaultAppId) {
    return redirectWithError('Select a default app to add.');
  }

  const existingApp = apps.find((appItem) => normalizeAppId(appItem?.id) === defaultAppId);
  const catalogTemplate = loadDefaultApps().find((appItem) => normalizeAppId(appItem?.id) === defaultAppId);
  const defaultTemplate = catalogTemplate
    || (canManageWithDefaultAppManager(existingApp) ? existingApp : null);
  if (!defaultTemplate) {
    return redirectWithError('Default app not found.');
  }

  const categoryOrder = resolveCategoryOrder(config, apps, { includeAppCategories: false });
  const categoryKeys = new Set(categoryOrder.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  const fallbackCategory = categoryOrder.find((item) => String(item || '').trim().toLowerCase() === 'tools')
    || categoryOrder[0]
    || 'Tools';
  const templateCategory = String(defaultTemplate?.category || '').trim();
  const resolvedCategory = categoryKeys.has(requestedCategory.toLowerCase())
    ? requestedCategory
    : (categoryKeys.has(templateCategory.toLowerCase()) ? templateCategory : fallbackCategory);

  const existingIndex = apps.findIndex((appItem) => normalizeAppId(appItem?.id) === defaultAppId);
  const baseTemplate = {
    ...defaultTemplate,
    id: defaultAppId,
    name: String(defaultTemplate?.name || '').trim() || getBaseAppTitle(getAppBaseId(defaultAppId)),
    icon: resolvePersistedAppIconPath({ ...defaultTemplate, id: defaultAppId }),
    category: resolvedCategory,
  };
  const current = existingIndex >= 0 ? apps[existingIndex] : null;
  const nextAppSeed = current ? { ...baseTemplate, ...current, id: defaultAppId } : baseTemplate;
  const removedStateBackup = (current?.removed && current.removedStateBackup && typeof current.removedStateBackup === 'object')
    ? current.removedStateBackup
    : null;
  const normalizedSeedMenu = normalizeMenu(nextAppSeed);
  const shouldRecoverLegacyRemovedMenu = Boolean(
    current?.removed
    && !removedStateBackup
    && normalizedSeedMenu.sidebar?.minRole === 'disabled'
    && normalizedSeedMenu.sidebarOverview?.minRole === 'disabled'
    && normalizedSeedMenu.sidebarSettings?.minRole === 'disabled'
    && normalizedSeedMenu.overview?.minRole === 'disabled'
    && normalizedSeedMenu.launch?.minRole === 'disabled'
    && normalizedSeedMenu.settings?.minRole === 'disabled'
  );
  const shouldRecoverLegacyRemovedOverview = Boolean(
    current?.removed
    && !removedStateBackup
    && deepEqual(nextAppSeed?.overviewElements, buildDisabledOverviewElements(nextAppSeed))
  );
  const recoveryTemplate = catalogTemplate || defaultTemplate || {};
  const legacyRecoveredMenu = shouldRecoverLegacyRemovedMenu
    ? normalizeMenu({
      ...nextAppSeed,
      custom: false,
      menu: recoveryTemplate?.menu,
    })
    : null;
  const legacyRecoveredOverviewElements = shouldRecoverLegacyRemovedOverview
    ? recoveryTemplate?.overviewElements
    : null;
  const legacyRecoveredLaunchMode = shouldRecoverLegacyRemovedMenu
    ? String(recoveryTemplate?.launchMode || '').trim()
    : '';
  const legacyRecoveredFavourite = shouldRecoverLegacyRemovedMenu
    ? Boolean(recoveryTemplate?.favourite || recoveryTemplate?.favorite)
    : null;
  const recoveredMenu = removedStateBackup?.menu
    || legacyRecoveredMenu
    || nextAppSeed.menu
    || buildDisabledMenuAccess();
  const recoveredOverviewElements = removedStateBackup?.overviewElements
    || legacyRecoveredOverviewElements
    || nextAppSeed.overviewElements;
  const recoveredLaunchMode = String(
    removedStateBackup?.launchMode
    || legacyRecoveredLaunchMode
    || nextAppSeed.launchMode
    || 'new-tab'
  ).trim() || 'new-tab';
  const recoveredFavourite = removedStateBackup
    ? Boolean(removedStateBackup.favourite)
    : Boolean(
      legacyRecoveredFavourite
      || nextAppSeed.favourite
      || nextAppSeed.favorite
    );
  const nextApp = {
    ...nextAppSeed,
    custom: false,
    removed: false,
    favourite: recoveredFavourite,
    launchMode: recoveredLaunchMode,
    menu: recoveredMenu,
    overviewElements: Array.isArray(recoveredOverviewElements) && recoveredOverviewElements.length
      ? recoveredOverviewElements
      : buildDisabledOverviewElements(nextAppSeed),
  };
  const shouldAppendOverviewOrders = Boolean((existingIndex === -1 || current?.removed) && !removedStateBackup);
  if (shouldAppendOverviewOrders && Array.isArray(nextApp.overviewElements) && nextApp.overviewElements.length) {
    const activeAppsMaxOverviewOrder = Math.max(
      0,
      ...apps
        .filter((appItem) => !appItem?.removed && normalizeAppId(appItem?.id) !== defaultAppId)
        .flatMap((appItem) =>
          mergeOverviewElementSettings(appItem).map((entry) => Number(entry?.order))
        )
        .filter((value) => Number.isFinite(value))
    );
    const orderedOverviewElements = [...nextApp.overviewElements]
      .map((entry) => ({ ...(entry || {}) }))
      .sort((left, right) => {
        const leftOrder = Number(left?.order);
        const rightOrder = Number(right?.order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) return leftOrder - rightOrder;
        if (Number.isFinite(leftOrder)) return -1;
        if (Number.isFinite(rightOrder)) return 1;
        return String(left?.id || '').localeCompare(String(right?.id || ''));
      })
      .map((entry, index) => ({
        ...entry,
        order: activeAppsMaxOverviewOrder + index + 1,
      }));
    nextApp.overviewElements = orderedOverviewElements;
  }
  delete nextApp.favorite;
  delete nextApp.removedStateBackup;
  const deprecatedElementIdSet = new Set(resolveDeprecatedDashboardElementIdsForApp(defaultAppId));
  if (deprecatedElementIdSet.size && Array.isArray(nextApp.overviewElements)) {
    nextApp.overviewElements = nextApp.overviewElements.map((entry) => {
      const elementId = String(entry?.id || '').trim();
      if (!deprecatedElementIdSet.has(elementId)) return entry;
      return {
        ...(entry || {}),
        id: elementId,
        dashboard: false,
        dashboardVisibilityRole: 'disabled',
      };
    });
  }
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? { ...config.dashboardRemovedElements }
    : {};
  deprecatedElementIdSet.forEach((elementId) => {
    dashboardRemovedElements[`app:${defaultAppId}:${elementId}`] = true;
  });

  if (existingIndex >= 0) {
    const nextApps = [...apps];
    nextApps[existingIndex] = nextApp;
    saveConfig({ ...config, apps: nextApps, dashboardRemovedElements });
  } else {
    const category = String(nextApp.category || 'Tools').trim() || 'Tools';
    const maxOrder = Math.max(
      0,
      ...apps
        .filter((appItem) => String(appItem?.category || '').trim().toLowerCase() === category.toLowerCase())
        .map((appItem) => Number(appItem?.order) || 0)
    );
    saveConfig({ ...config, apps: [...apps, { ...nextApp, order: maxOrder + 1 }], dashboardRemovedElements });
  }

  return res.redirect('/settings?tab=custom&defaultAppResult=added');
});

app.post('/settings/default-apps/remove', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const apps = Array.isArray(config.apps) ? config.apps : [];
  const defaultAppId = normalizeAppId(req.body?.id || req.body?.default_app_id || '');
  const wantsJson = String(req.get('content-type') || '').toLowerCase().includes('application/json')
    || String(req.get('accept') || '').toLowerCase().includes('application/json');
  const replyError = (message, status = 400) => {
    if (wantsJson) return res.status(status).json({ error: String(message || 'Unable to remove default app.') });
    const encodedMessage = encodeURIComponent(String(message || 'Unable to remove default app.').trim());
    return res.redirect(`/settings?tab=custom&defaultAppError=${encodedMessage}`);
  };

  if (!defaultAppId) {
    return replyError('Missing default app id.');
  }

  const appIndex = apps.findIndex((appItem) => normalizeAppId(appItem?.id) === defaultAppId);
  if (appIndex === -1) {
    return replyError('Default app not found.', 404);
  }

  const current = apps[appIndex];
  if (current?.custom) {
    return replyError('Custom apps must be removed with the custom app delete action.');
  }
  if (!canManageWithDefaultAppManager(current)) {
    return replyError('Only built-in primary apps can be removed here.');
  }

  const removalBackup = {
    menu: current?.menu,
    overviewElements: current?.overviewElements,
    launchMode: String(current?.launchMode || '').trim() || 'new-tab',
    favourite: Boolean(current?.favourite || current?.favorite),
  };
  const nextApps = [...apps];
  nextApps[appIndex] = {
    ...current,
    removed: true,
    favourite: false,
    removedStateBackup: removalBackup,
  };
  saveConfig({ ...config, apps: nextApps });
  if (wantsJson) return res.json({ ok: true });
  return res.redirect('/settings?tab=custom&defaultAppResult=removed');
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
  const basePath = normalizeBasePath(req.body?.base_path || '');
  const restrictGuests = Boolean(req.body?.restrictGuests);
  const autoOpenSingleAppMenuItem = Boolean(req.body?.autoOpenSingleAppMenuItem);
  const parseRolePressActions = (roleKey) => ({
    short: normalizeSidebarAppButtonAction(req.body?.[`sidebar_button_short_press_action_${roleKey}`], 'default'),
    long: normalizeSidebarAppButtonAction(req.body?.[`sidebar_button_long_press_action_${roleKey}`], 'default'),
  });
  const sidebarButtonPressActions = normalizeSidebarButtonPressActions({
    guest: parseRolePressActions('guest'),
    user: parseRolePressActions('user'),
    'co-admin': parseRolePressActions('co-admin'),
    admin: parseRolePressActions('admin'),
  });
  const hideSidebarAppSettingsLink = Boolean(req.body?.hideSidebarAppSettingsLink);
  const hideSidebarActivityLink = Boolean(req.body?.hideSidebarActivityLink);
  const nextGeneral = {
    serverName: serverName || DEFAULT_GENERAL_SETTINGS.serverName,
    remoteUrl,
    localUrl,
    basePath,
    restrictGuests,
    autoOpenSingleAppMenuItem,
    sidebarButtonShortPressAction: sidebarButtonPressActions.user.short,
    sidebarButtonLongPressAction: sidebarButtonPressActions.user.long,
    sidebarButtonPressActions,
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
    menu: buildMenuAccessConfig({
      sidebar: 'user',
      overview: 'disabled',
      launch: 'user',
      settings: 'admin',
    }),
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
          normalizeBaseUrl(resolveLaunchUrl(plexApp, req), { stripWeb: true }),
          normalizeBaseUrl(plexApp.localUrl || '', { stripWeb: true }),
          normalizeBaseUrl(plexApp.remoteUrl || '', { stripWeb: true }),
          normalizeBaseUrl(plexApp.url || '', { stripWeb: true }),
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
    const baseId = getAppBaseId(appItem.id);
    const supportsInstances = supportsAppInstances(baseId);
    const nextInstanceName = supportsInstances && !isDisplayOnlyUpdate
      ? String(req.body?.instanceName || '').trim()
      : String(appItem.instanceName || '').trim();
    const nextName = supportsInstances
      ? (nextInstanceName || getDefaultInstanceName(baseId, appItem.id))
      : String(appItem.name || '').trim();
    const overviewElements = shouldUpdateOverviewElements
      ? buildOverviewElementsFromRequest(appItem, req.body)
      : appItem.overviewElements;
    const tautulliCards = shouldUpdateTautulliCards
      ? buildTautulliCardsFromRequest(appItem, req.body)
      : appItem.tautulliCards;
    return {
      ...appItem,
      name: nextName || appItem.name || getBaseAppTitle(baseId),
      instanceName: supportsInstances ? nextInstanceName : '',
      icon: resolvePersistedAppIconPath(appItem),
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
    normalizeBaseUrl(plexApp.remoteUrl || '', { stripWeb: true }),
    normalizeBaseUrl(resolveLaunchUrl(plexApp, req), { stripWeb: true }),
    normalizeBaseUrl(plexApp.localUrl || '', { stripWeb: true }),
    normalizeBaseUrl(plexApp.url || '', { stripWeb: true }),
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

app.get('/api/onboarding/quick-start', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const onboarding = resolveOnboardingSettings(config);
  const hasActiveApps = hasActiveOnboardingApps(config);
  if (onboarding.quickStartPending && hasActiveApps) {
    const source = (config && typeof config.onboarding === 'object') ? config.onboarding : {};
    saveConfig({
      ...config,
      onboarding: {
        ...source,
        quickStartPending: false,
      },
    });
    return res.json({ show: false, steps: [], actions: {} });
  }
  const show = shouldShowQuickStartOnboarding(config);
  return res.json({
    show,
    steps: [
      'Go to Settings -> Custom -> Sidebar and restore the default apps you want to use.',
      'Go to Settings -> Apps, configure each app URL/API details, and save.',
      'Go to Settings -> Custom -> Dashboard, add the cards you want for Dashboard and Overview, set role visibility, and adjust order as needed.',
      'Open Dashboard or Overview to review the layout and fine-tune anything you want to change.',
    ],
    actions: {
      sidebar: '/settings?tab=custom&settingsCustomTab=sidebar',
    },
  });
});

app.post('/api/onboarding/quick-start/dismiss', requireSettingsAdmin, (req, res) => {
  const config = loadConfig();
  const onboarding = resolveOnboardingSettings(config);
  if (!onboarding.quickStartPending) {
    return res.json({ ok: true, show: false });
  }
  const source = (config && typeof config.onboarding === 'object') ? config.onboarding : {};
  saveConfig({
    ...config,
    onboarding: {
      ...source,
      quickStartPending: false,
    },
  });
  return res.json({ ok: true, show: false });
});

app.get('/api/version', requireUser, async (_req, res) => {
  const current = normalizeVersionTag(APP_VERSION || '');
  const releaseNotesUrl = buildReleaseNotesUrl(current);
  const highlights = loadReleaseHighlights(current);
  const now = Date.now();
  if (versionCache.payload && (now - versionCache.fetchedAt) < VERSION_CACHE_TTL_MS) {
    return res.json({ ...versionCache.payload, current, releaseNotesUrl, highlights });
  }
  try {
    const latest = await fetchLatestDockerTag();
    const payload = {
      current,
      latest,
      upToDate: Boolean(current && latest && current === latest),
      releaseNotesUrl,
      highlights,
    };
    versionCache = { fetchedAt: now, payload };
    return res.json(payload);
  } catch (err) {
    const payload = {
      current,
      latest: '',
      upToDate: true,
      releaseNotesUrl,
      highlights,
    };
    versionCache = { fetchedAt: now, payload };
    return res.json(payload);
  }
});

app.get('/api/plex/discovery/watchlisted', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const plexApp = apps.find((appItem) => appItem.id === 'plex');
  if (!plexApp) return res.status(404).json({ error: 'Plex app is not configured.' });
  if (!canAccessDashboardApp(config, plexApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Plex dashboard access denied.' });
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
  if (!canAccessDashboardApp(config, plexApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Plex dashboard access denied.' });
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
    normalizeBaseUrl(appItem?.remoteUrl || '', { stripWeb: true }),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req), { stripWeb: true }),
    normalizeBaseUrl(appItem?.localUrl || '', { stripWeb: true }),
    normalizeBaseUrl(appItem?.url || '', { stripWeb: true }),
  ]).filter(Boolean);
}

function resolveEmbyCandidates(appItem, req) {
  return uniqueList([
    normalizeBaseUrl(appItem?.remoteUrl || '', { stripWeb: true }),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req), { stripWeb: true }),
    normalizeBaseUrl(appItem?.localUrl || '', { stripWeb: true }),
    normalizeBaseUrl(appItem?.url || '', { stripWeb: true }),
  ]).filter(Boolean);
}

function buildJellyfinImageUrl({ baseUrl, itemId, type, apiKey, tag = '', index = '' }) {
  if (!baseUrl || !itemId || !type) return '';
  const safeType = String(type).trim();
  const safeId = encodeURIComponent(String(itemId).trim());
  const url = buildAppApiUrl(baseUrl, `Items/${safeId}/Images/${safeType}${index !== '' ? `/${encodeURIComponent(String(index))}` : ''}`);
  if (apiKey) url.searchParams.set('api_key', apiKey);
  if (tag) url.searchParams.set('tag', String(tag));
  url.searchParams.set('quality', '90');
  return url.toString();
}

function buildEmbyImageUrl({ baseUrl, itemId, type, apiKey, tag = '', index = '' }) {
  if (!baseUrl || !itemId || !type) return '';
  const safeType = String(type).trim();
  const safeId = encodeURIComponent(String(itemId).trim());
  const url = buildAppApiUrl(baseUrl, `emby/Items/${safeId}/Images/${safeType}${index !== '' ? `/${encodeURIComponent(String(index))}` : ''}`);
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
    const upstreamUrl = buildAppApiUrl(baseUrl, path);
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
      const upstreamUrl = buildAppApiUrl(baseUrl, attemptPath);
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
  if (!canAccessDashboardApp(config, jellyfinApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Jellyfin dashboard access denied.' });
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
  if (!canAccessDashboardApp(config, jellyfinApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Jellyfin dashboard access denied.' });
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
  if (!canAccessDashboardApp(config, embyApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Emby dashboard access denied.' });
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
  if (!canAccessDashboardApp(config, embyApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Emby dashboard access denied.' });
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
  const attempted = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    attempted.push(baseUrl);
    const upstreamUrl = buildAppApiUrl(baseUrl, path);
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
  const attemptsSummary = attempted.length ? ` (tried: ${attempted.join(', ')})` : '';
  throw new Error((lastError || 'Failed to reach Seerr.') + attemptsSummary);
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
  if (!canAccessDashboardApp(config, pulsarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Pulsarr dashboard access denied.' });
  }

  const apiKey = String(pulsarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Pulsarr API key.' });

  const candidates = resolveRequestApiCandidates(pulsarrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Pulsarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = buildAppApiUrl(baseUrl, endpointPath);
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
  if (!canAccessDashboardApp(config, seerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Seerr dashboard access denied.' });
  }

  const apiKey = String(seerrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Seerr API key.' });

  const candidates = resolveRequestApiCandidates(seerrApp, req);
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
  if (!canAccessDashboardApp(config, pulsarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Pulsarr dashboard access denied.' });
  }

  const apiKey = String(pulsarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Pulsarr API key.' });

  const candidates = resolveRequestApiCandidates(pulsarrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Pulsarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    const upstreamUrl = buildAppApiUrl(baseUrl, `v1/tmdb/${kind}/${encodeURIComponent(tmdbId)}`);
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
  if (!canAccessDashboardApp(config, seerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Seerr dashboard access denied.' });
  }

  const apiKey = String(seerrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Seerr API key.' });

  const candidates = resolveRequestApiCandidates(seerrApp, req);
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

app.get('/api/prowlarr/search/filters', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const prowlarrApp = apps.find((appItem) => appItem.id === 'prowlarr');
  if (!prowlarrApp) return res.status(404).json({ error: 'Prowlarr app is not configured.' });
  if (!canAccessDashboardApp(config, prowlarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Prowlarr dashboard access denied.' });
  }

  const apiKey = String(prowlarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Prowlarr API key.' });

  const candidates = resolveAppApiCandidates(prowlarrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Prowlarr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let indexerPayload = [];
      let categoriesPayload = null;
      try {
        const indexerUrl = buildAppApiUrl(baseUrl, 'api/v1/indexer');
        const indexerRes = await fetch(indexerUrl.toString(), {
          headers: {
            Accept: 'application/json',
            'X-Api-Key': apiKey,
          },
          signal: controller.signal,
        });
        const indexerText = await indexerRes.text();
        if (!indexerRes.ok) {
          lastError = `Prowlarr indexer metadata failed (${indexerRes.status}) via ${baseUrl}.`;
          continue;
        }
        indexerPayload = indexerText ? JSON.parse(indexerText) : [];

        const categoriesUrl = buildAppApiUrl(baseUrl, 'api/v1/indexercategory');
        const categoriesRes = await fetch(categoriesUrl.toString(), {
          headers: {
            Accept: 'application/json',
            'X-Api-Key': apiKey,
          },
          signal: controller.signal,
        });
        if (categoriesRes.ok) {
          const categoriesText = await categoriesRes.text();
          categoriesPayload = categoriesText ? JSON.parse(categoriesText) : [];
        }
      } finally {
        clearTimeout(timeout);
      }

      const rawIndexers = Array.isArray(indexerPayload) ? indexerPayload : [];
      const categoryProtocols = new Map();
      const indexers = rawIndexers
        .map((entry) => {
          const enabled = entry?.enable !== false && entry?.enabled !== false;
          if (!enabled) return null;
          const id = String(entry?.id || entry?.indexerId || '').trim();
          const name = String(entry?.name || entry?.title || '').trim();
          if (!id || !name) return null;
          const protocol = normalizeIndexerProtocol(entry?.protocol || entry?.implementation || entry?.implementationName) || 'torrent';
          const categoryIds = extractTopLevelCategoryIds(entry?.capabilities?.categories || entry?.categories || entry?.caps?.categories);
          categoryIds.forEach((categoryId) => {
            if (!categoryProtocols.has(categoryId)) categoryProtocols.set(categoryId, new Set());
            categoryProtocols.get(categoryId).add(protocol);
          });
          return { id, name, protocol };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      const categorySource = categoriesPayload !== null
        ? categoriesPayload
        : rawIndexers.map((entry) => entry?.capabilities?.categories || entry?.categories || entry?.caps?.categories);
      const categories = toTopLevelCategoryOptions(categorySource).map((entry) => {
        const numericId = Number(entry.id);
        const protocols = categoryProtocols.has(numericId)
          ? Array.from(categoryProtocols.get(numericId))
          : [];
        return {
          id: entry.id,
          name: entry.name,
          protocols,
        };
      });

      return res.json({ indexers, categories });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Prowlarr via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to fetch Prowlarr search filters.' });
});

app.get('/api/prowlarr/search', requireUser, async (req, res) => {
  const query = String(req.query?.query || req.query?.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing search query.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const prowlarrApp = apps.find((appItem) => appItem.id === 'prowlarr');
  if (!prowlarrApp) return res.status(404).json({ error: 'Prowlarr app is not configured.' });
  if (!canAccessDashboardApp(config, prowlarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Prowlarr dashboard access denied.' });
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
      if (Array.isArray(value)) {
        const entries = value.map((entry) => String(entry || '').trim()).filter(Boolean);
        if (entries.length) queryParams[key] = entries;
        return;
      }
      if (['indexerids', 'categories'].includes(String(key || '').trim().toLowerCase())) {
        const entries = String(value)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        if (entries.length > 1) {
          queryParams[key] = entries;
          return;
        }
      }
      queryParams[key] = String(value);
    });

    const tryRequest = async (method) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        if (method === 'GET') {
          const upstreamUrl = buildAppApiUrl(baseUrl, 'api/v1/search');
          upstreamUrl.searchParams.set('query', query);
          Object.entries(queryParams).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              value.forEach((entry) => upstreamUrl.searchParams.append(key, String(entry)));
              return;
            }
            upstreamUrl.searchParams.set(key, String(value));
          });
          return fetch(upstreamUrl.toString(), {
            headers: {
              Accept: 'application/json',
              'X-Api-Key': apiKey,
            },
            signal: controller.signal,
          });
        }
        const upstreamUrl = buildAppApiUrl(baseUrl, 'api/v1/search');
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
  if (!canAccessDashboardApp(config, prowlarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Prowlarr dashboard access denied.' });
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
    const searchDownloadUrl = buildAppApiUrl(baseUrl, `api/v1/search/${encodeURIComponent(idValue)}/download`);
    if (downloadClientId) searchDownloadUrl.searchParams.set('downloadClientId', downloadClientId);
    const releaseDownloadUrl = buildAppApiUrl(baseUrl, 'api/v1/release/download');
    const searchGrabUrl = buildAppApiUrl(baseUrl, 'api/v1/search');
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

function resolveAppApiCandidates(appItem, req) {
  return uniqueList([
    normalizeBaseUrl(appItem?.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req)),
    normalizeBaseUrl(appItem?.localUrl || ''),
    normalizeBaseUrl(appItem?.url || ''),
  ]);
}

function isLoopbackHost(host) {
  const value = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!value) return false;
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function isLoopbackBaseUrl(value) {
  const normalized = normalizeBaseUrl(value || '');
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return isLoopbackHost(parsed.hostname);
  } catch (err) {
    return false;
  }
}

function resolveRequestApiCandidates(appItem, req) {
  const remoteUrl = normalizeBaseUrl(appItem?.remoteUrl || '');
  const localUrl = normalizeBaseUrl(appItem?.localUrl || '');
  const launchUrl = normalizeBaseUrl(resolveLaunchUrl(appItem, req));
  const fallbackUrl = normalizeBaseUrl(appItem?.url || '');
  const explicitCandidates = uniqueList([remoteUrl, localUrl]).filter(Boolean);
  const explicitSet = new Set(explicitCandidates);
  const hasExplicitNonLoopback = explicitCandidates.some((candidate) => !isLoopbackBaseUrl(candidate));

  return uniqueList([...explicitCandidates, launchUrl, fallbackUrl])
    .filter(Boolean)
    .filter((candidate) => {
      if (!hasExplicitNonLoopback) return true;
      if (explicitSet.has(candidate)) return true;
      return !isLoopbackBaseUrl(candidate);
    });
}

function parseFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatBytesLabel(value) {
  const size = parseFiniteNumber(value, 0);
  if (!size || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = size;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const decimals = amount >= 10 || index === 0 ? 0 : 1;
  return `${amount.toFixed(decimals)} ${units[index]}`;
}

const TORZNAB_TOP_LEVEL_CATEGORY_LABELS = {
  1000: 'Console',
  2000: 'Movies',
  3000: 'Audio',
  4000: 'PC',
  5000: 'TV',
  6000: 'XXX',
  7000: 'Books',
  8000: 'Other',
};

function normalizeIndexerProtocol(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('usenet') || raw.includes('newznab') || raw === '1') return 'usenet';
  if (raw.includes('torrent') || raw.includes('torznab') || raw === '2') return 'torrent';
  return '';
}

function toTopLevelCategoryId(value) {
  const numeric = Number(String(value || '').trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric / 1000) * 1000;
}

function collectTopLevelCategoryIds(value, bucket = new Set()) {
  if (value === null || value === undefined) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTopLevelCategoryIds(entry, bucket));
    return bucket;
  }
  if (typeof value === 'object') {
    const idCandidates = [
      value.id,
      value.Id,
      value.ID,
      value.categoryId,
      value.categoryID,
      value.category,
      value.Category,
      value.cat,
    ];
    idCandidates.forEach((entry) => {
      const topLevel = toTopLevelCategoryId(entry);
      if (topLevel) bucket.add(topLevel);
    });
    Object.values(value).forEach((entry) => collectTopLevelCategoryIds(entry, bucket));
    return bucket;
  }
  if (typeof value === 'string' && /[,;|\s]/.test(value)) {
    value
      .split(/[,;|\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => collectTopLevelCategoryIds(entry, bucket));
    return bucket;
  }
  const topLevel = toTopLevelCategoryId(value);
  if (topLevel) bucket.add(topLevel);
  return bucket;
}

function extractTopLevelCategoryIds(value) {
  return Array.from(collectTopLevelCategoryIds(value, new Set())).sort((a, b) => a - b);
}

function toTopLevelCategoryOptions(value) {
  const labels = new Map();
  const walk = (entry) => {
    if (entry === null || entry === undefined) return;
    if (Array.isArray(entry)) {
      entry.forEach((item) => walk(item));
      return;
    }
    if (typeof entry === 'object') {
      const id = toTopLevelCategoryId(entry.id ?? entry.Id ?? entry.ID ?? entry.categoryId ?? entry.category ?? entry.Category);
      const rawName = String(entry.name || entry.Name || entry.label || entry.Label || '').trim();
      if (id) {
        const fallback = TORZNAB_TOP_LEVEL_CATEGORY_LABELS[id] || `Category ${id}`;
        const label = rawName
          ? rawName.split(/[\\/]/)[0].trim() || fallback
          : fallback;
        if (!labels.has(id) || labels.get(id) === fallback) labels.set(id, label);
      }
      Object.values(entry).forEach((item) => walk(item));
      return;
    }
    const id = toTopLevelCategoryId(entry);
    if (id && !labels.has(id)) labels.set(id, TORZNAB_TOP_LEVEL_CATEGORY_LABELS[id] || `Category ${id}`);
  };

  walk(value);
  if (!labels.size) {
    Object.entries(TORZNAB_TOP_LEVEL_CATEGORY_LABELS).forEach(([id, label]) => labels.set(Number(id), label));
  }
  return Array.from(labels.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => ({ id: String(id), name }));
}

function escapeRegexLiteral(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseJackettTorznabItems(xmlText) {
  const text = String(xmlText || '');
  const itemMatches = text.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map((rawItem) => {
    const readTag = (tagName) => {
      const match = rawItem.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
      return decodeXmlEntities(match?.[1] || '').trim();
    };
    const readAttr = (name) => {
      const match = rawItem.match(new RegExp(`<(?:torznab:)?attr[^>]*name=["']${escapeRegexLiteral(name)}["'][^>]*value=["']([^"']*)["'][^>]*\\/?>`, 'i'));
      return decodeXmlEntities(match?.[1] || '').trim();
    };
    const title = readTag('title');
    const guid = readTag('guid');
    const infoUrl = readTag('comments') || readTag('link');
    const downloadUrl = readTag('link') || readTag('enclosure');
    const size = parseFiniteNumber(readTag('size') || readAttr('size'));
    const seeders = parseFiniteNumber(readAttr('seeders'));
    const leechers = parseFiniteNumber(readAttr('peers') || readAttr('leechers'));
    const indexer = readAttr('indexer') || readTag('author');
    const indexerId = readAttr('indexerid') || readAttr('indexerId');
    const protocolRaw = readAttr('downloadvolumefactor') === '0'
      ? 'usenet'
      : (readAttr('protocol') || '');
    const protocol = normalizeIndexerProtocol(protocolRaw) || 'torrent';
    const categoryMatches = [...rawItem.matchAll(/<(?:torznab:)?attr[^>]*name=["']category["'][^>]*value=["']([^"']+)["'][^>]*\/?>/gi)];
    const categoryIds = extractTopLevelCategoryIds(categoryMatches.map((match) => decodeXmlEntities(match?.[1] || '').trim()));
    return {
      id: guid || infoUrl || downloadUrl || title,
      guid,
      title: title || 'Untitled',
      indexer: indexer || '',
      indexerId: String(indexerId || '').trim(),
      protocol,
      categoryIds,
      size,
      seeders,
      leechers,
      publishDate: readTag('pubDate'),
      infoUrl,
      downloadUrl,
    };
  }).filter((entry) => Boolean(entry.title));
}

function parseJackettJsonItems(payload) {
  const list = Array.isArray(payload?.Results)
    ? payload.Results
    : (Array.isArray(payload?.results)
      ? payload.results
      : (Array.isArray(payload) ? payload : []));
  return list.map((item) => {
    const protocolRaw = item?.Protocol || item?.protocol || item?.Type || item?.type || '';
    return {
      id: String(item?.Guid || item?.guid || item?.InfoHash || item?.link || item?.Title || item?.title || '').trim(),
      guid: String(item?.Guid || item?.guid || '').trim(),
      title: String(item?.Title || item?.title || 'Untitled').trim() || 'Untitled',
      indexer: String(item?.Tracker || item?.tracker || item?.Indexer || item?.indexer || item?.JackettIndexer || '').trim(),
      indexerId: String(item?.TrackerId || item?.trackerId || item?.IndexerId || item?.indexerId || item?.JackettIndexer || '').trim(),
      protocol: normalizeIndexerProtocol(protocolRaw) || 'torrent',
      categoryIds: extractTopLevelCategoryIds(item?.Category || item?.Categories || item?.category || item?.categories || item?.Cat || item?.cat),
      size: parseFiniteNumber(item?.Size || item?.size || item?.Length || item?.length || 0),
      seeders: parseFiniteNumber(item?.Seeders || item?.seeders || 0),
      leechers: parseFiniteNumber(item?.Peers || item?.peers || item?.Leechers || item?.leechers || 0),
      publishDate: String(item?.PublishDate || item?.publishDate || item?.Published || '').trim(),
      infoUrl: String(item?.Details || item?.details || item?.Comments || item?.comments || '').trim(),
      downloadUrl: String(item?.Link || item?.link || item?.MagnetUri || item?.magnetUri || '').trim(),
    };
  }).filter((entry) => Boolean(entry.title));
}

function mapBazarrStatusKey(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return 'queued';
  if (status.includes('error') || status.includes('fail')) return 'error';
  if (status.includes('done') || status.includes('complete') || status.includes('downloaded')) return 'completed';
  if (status.includes('active') || status.includes('downloading') || status.includes('processing')) return 'active';
  if (status.includes('pause')) return 'paused';
  return 'queued';
}

function mapAutobrrStatusKey(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return 'queued';
  if (status.includes('error') || status.includes('fail') || status.includes('reject')) return 'error';
  if (status.includes('push') || status.includes('deliver') || status.includes('accept') || status.includes('complete')) return 'completed';
  if (status.includes('active') || status.includes('match') || status.includes('run')) return 'active';
  if (status.includes('pause')) return 'paused';
  return 'queued';
}

function pickFirstNonEmpty(values = []) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function mapBazarrQueueItem(entry) {
  const mediaType = String(entry?.type || entry?.mediaType || (entry?.movieTitle ? 'movie' : 'tv')).trim().toLowerCase();
  const seriesTitle = pickFirstNonEmpty([entry?.seriesTitle, entry?.showTitle, entry?.series, entry?.title]);
  const movieTitle = pickFirstNonEmpty([entry?.movieTitle, entry?.movie, entry?.title]);
  const season = parseFiniteNumber(entry?.season, NaN);
  const episode = parseFiniteNumber(entry?.episode, NaN);
  const episodeLabel = Number.isFinite(season) && Number.isFinite(episode)
    ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
    : '';
  const subtitleLanguages = Array.isArray(entry?.missing_subtitles)
    ? entry.missing_subtitles
    : (Array.isArray(entry?.missingSubtitles) ? entry.missingSubtitles : []);
  const languageLabel = subtitleLanguages
    .map((language) => String(language?.name || language?.code2 || language || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  const statusText = pickFirstNonEmpty([entry?.status, entry?.state, entry?.subtitlesStatus, entry?.subtitleStatus, 'Wanted']);
  const statusKey = mapBazarrStatusKey(statusText);
  const detail = mediaType === 'movie'
    ? (pickFirstNonEmpty([entry?.year, entry?.releaseYear]) || 'Movie')
    : (episodeLabel || 'Episode');
  const subDetail = pickFirstNonEmpty([
    languageLabel,
    entry?.episodeTitle,
    entry?.title,
    statusText,
    '-',
  ]);
  return {
    kind: mediaType === 'movie' ? 'movie' : 'tv',
    title: pickFirstNonEmpty([movieTitle, seriesTitle, 'Unknown']),
    episode: detail,
    episodeTitle: subDetail,
    quality: languageLabel || '-',
    protocol: 'subtitle',
    timeLeft: '-',
    progress: statusKey === 'completed' ? 100 : 0,
    statusKey,
    statusKeys: [statusKey],
  };
}

function mapAutobrrQueueItem(entry, mode = 'recent-matches') {
  const statusText = pickFirstNonEmpty([entry?.status, entry?.state, entry?.result, entry?.action, entry?.type]);
  const statusKey = mapAutobrrStatusKey(statusText);
  const protocolRaw = pickFirstNonEmpty([entry?.protocol, entry?.source, entry?.kind, entry?.type]);
  const protocol = protocolRaw.toLowerCase().includes('usenet') ? 'usenet' : 'torrent';
  const sizeBytes = parseFiniteNumber(entry?.size || entry?.bytes || entry?.totalSize || 0);
  const quality = sizeBytes > 0 ? formatBytesLabel(sizeBytes) : '-';
  const sourceName = pickFirstNonEmpty([
    entry?.indexer,
    entry?.indexerName,
    entry?.tracker,
    entry?.filter,
    entry?.filterName,
    mode === 'delivery-queue' ? 'Delivery' : 'Match',
  ]);
  const subDetail = pickFirstNonEmpty([
    entry?.title,
    entry?.releaseTitle,
    entry?.releaseName,
    entry?.name,
    '-',
  ]);
  return {
    kind: protocol,
    title: pickFirstNonEmpty([entry?.name, entry?.releaseName, entry?.releaseTitle, entry?.title, 'Unknown']),
    episode: sourceName,
    episodeTitle: subDetail,
    quality,
    protocol,
    timeLeft: '-',
    progress: statusKey === 'completed' ? 100 : (statusKey === 'active' ? 50 : 0),
    statusKey,
    statusKeys: [statusKey],
  };
}

function parseMaintainerrTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1e11) return Math.round(numeric); // milliseconds
    return Math.round(numeric * 1000); // seconds
  }
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMaintainerrDateLabel(value) {
  const timestamp = parseMaintainerrTimestamp(value);
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (err) {
    return '';
  }
}

function formatMaintainerrRelativePill(value) {
  const timestamp = parseMaintainerrTimestamp(value);
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function normalizeMaintainerrMediaKind(value, fallback = 'movie') {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  if (text === 'movie' || text === 'movies') return 'movie';
  if (text === 'show' || text === 'shows' || text === 'tv' || text === 'series') return 'show';
  if (text === 'season' || text === 'episode') return 'show';
  if (text === '1') return 'movie';
  if (text === '2') return 'show';
  return fallback;
}

function normalizeMaintainerrInitial(value) {
  const text = String(value || '').trim();
  if (!text) return '#';
  const first = text[0].toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

function resolveMaintainerrAssetUrl(baseUrl, candidate = '') {
  const value = String(candidate || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  try {
    const normalizedBase = normalizeBaseUrl(baseUrl || '');
    const relativeBase = normalizedBase || baseUrl;
    return new URL(value, relativeBase).toString();
  } catch (err) {
    return value;
  }
}

function isMaintainerrPlaceholderArtwork(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  const normalized = decodeURIComponent(text).toLowerCase();
  if (normalized.includes('/icons/maintainerr.svg') || normalized.includes('/icons/app.svg')) return true;
  if (!normalized.includes('maintainerr')) {
    return /(placeholder|fallback|no[-_ ]?art(?:work)?|no[-_ ]?poster|default[-_ ]?(poster|art|image)|missing[-_ ]?(poster|art|image))/i.test(normalized);
  }
  return /(placeholder|fallback|no[-_ ]?art(?:work)?|no[-_ ]?poster|default[-_ ]?(poster|art|image)|missing[-_ ]?(poster|art|image))/i.test(normalized);
}

function isMaintainerrPlexLibraryAssetPath(value = '') {
  return /^\/library\/metadata\/\d+\/(?:thumb|art|clearLogo)(?:\/\d+)?$/i.test(String(value || '').trim());
}

function normalizeMaintainerrTmdbKind(value, fallback = 'movie') {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'tv' || text === 'show' || text === 'shows' || text === 'series') return 'tv';
  if (text === 'movie' || text === 'movies') return 'movie';
  return fallback;
}

function extractMaintainerrTmdbId(source = {}) {
  const direct = parseFiniteNumber(
    source?.tmdbId
    ?? source?.tmdbID
    ?? source?.tmdb_id
    ?? source?.metadata?.tmdbId
    ?? source?.metadata?.tmdb_id
    ?? source?.parentTmdbId
    ?? source?.parentTmdbID,
    0
  );
  if (direct > 0) return direct;

  const guidCandidates = [];
  const pushGuid = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    guidCandidates.push(text);
  };
  pushGuid(source?.guid);
  if (Array.isArray(source?.Guid)) {
    source.Guid.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        pushGuid(entry.id || entry.guid || entry.url || '');
      } else {
        pushGuid(entry);
      }
    });
  }
  if (Array.isArray(source?.guids)) {
    source.guids.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        pushGuid(entry.id || entry.guid || entry.url || '');
      } else {
        pushGuid(entry);
      }
    });
  }
  for (let index = 0; index < guidCandidates.length; index += 1) {
    const match = guidCandidates[index].match(/tmdb:\/\/(\d+)/i);
    if (match && match[1]) {
      const parsed = parseFiniteNumber(match[1], 0);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

function buildMaintainerrTmdbImageUrl(path = '', size = 'w500') {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  if (value.startsWith('/')) return `https://image.tmdb.org/t/p/${size}${value}`;
  if (/^[\w-]+\.(jpg|jpeg|png|webp)$/i.test(value)) return `https://image.tmdb.org/t/p/${size}/${value}`;
  return '';
}

function parseMaintainerrRuleJson(value) {
  if (!value && value !== 0) return {};
  if (typeof value === 'object') return value || {};
  const text = String(value || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function formatMaintainerrRuleValue(value) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
    return normalized.join(', ');
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '';
    }
  }
  return String(value ?? '').trim();
}

function summarizeMaintainerrRuleCondition(condition = {}) {
  const sectionValue = String(condition.section ?? '').trim();
  const actionValue = String(condition.action ?? '').trim();
  const operatorValue = String(condition.operator ?? '').trim();
  const firstValue = formatMaintainerrRuleValue(condition.firstVal);
  const lastValue = formatMaintainerrRuleValue(condition.lastVal);
  const pieces = [];

  if (sectionValue) pieces.push(`Section ${sectionValue}`);
  if (actionValue) pieces.push(`Action ${actionValue}`);
  if (operatorValue === '0') pieces.push('AND');
  if (operatorValue === '1') pieces.push('OR');
  if (firstValue) pieces.push(`Value A: ${firstValue}`);
  if (lastValue) pieces.push(`Value B: ${lastValue}`);
  return pieces.join(' • ');
}

function mapMaintainerrLibraryItem(entry, options = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const imageList = Array.isArray(source.Image) ? source.Image : [];
  const posterFromImage = imageList.find((item) => String(item?.type || '').toLowerCase().includes('cover'))?.url || '';
  const artFromImage = imageList.find((item) => String(item?.type || '').toLowerCase().includes('background'))?.url || '';
  const kind = normalizeMaintainerrMediaKind(source.type || options.libraryType, 'movie');
  const tmdbKind = normalizeMaintainerrTmdbKind(kind, 'movie');
  const tmdbId = extractMaintainerrTmdbId(source);
  const rawThumbCandidate = pickFirstNonEmpty([source.thumb, source.poster, posterFromImage]);
  const rawArtCandidate = pickFirstNonEmpty([source.art, source.background, artFromImage]);
  const resolvedThumb = resolveMaintainerrAssetUrl(options.baseUrl, rawThumbCandidate);
  const resolvedArt = resolveMaintainerrAssetUrl(options.baseUrl, rawArtCandidate);
  const thumb = isMaintainerrPlexLibraryAssetPath(rawThumbCandidate)
    || isMaintainerrPlexLibraryAssetPath(resolvedThumb)
    || isMaintainerrPlaceholderArtwork(rawThumbCandidate)
    || isMaintainerrPlaceholderArtwork(resolvedThumb)
    ? ''
    : resolvedThumb;
  const art = isMaintainerrPlexLibraryAssetPath(rawArtCandidate)
    || isMaintainerrPlexLibraryAssetPath(resolvedArt)
    || isMaintainerrPlaceholderArtwork(rawArtCandidate)
    || isMaintainerrPlaceholderArtwork(resolvedArt)
    ? ''
    : resolvedArt;
  const posterProxy = tmdbId > 0 ? `/api/maintainerr-poster/${tmdbKind}/${tmdbId}` : '';
  const backdropProxy = tmdbId > 0 ? `/api/maintainerr-backdrop/${tmdbKind}/${tmdbId}` : '';
  const year = parseFiniteNumber(source.year, 0);
  const addedAt = source.addedAt || source.updatedAt || source.originallyAvailableAt || source.lastViewedAt;
  const addedLabel = formatMaintainerrDateLabel(addedAt);
  const subtitle = pickFirstNonEmpty([options.libraryTitle, kind === 'show' ? 'TV' : 'Movies']);
  const metaParts = [];
  if (year > 0) metaParts.push(String(year));
  if (subtitle) metaParts.push(subtitle);
  return {
    id: pickFirstNonEmpty([source.ratingKey, source.guid, source.key, source.title]),
    title: pickFirstNonEmpty([source.title, 'Untitled']),
    kind,
    subtitle,
    meta: metaParts.join(' • '),
    pill: formatMaintainerrRelativePill(addedAt),
    sortTs: parseMaintainerrTimestamp(addedAt),
    addedLabel: addedLabel ? `Added ${addedLabel}` : '',
    year: year || undefined,
    letter: normalizeMaintainerrInitial(source.title),
    thumb: pickFirstNonEmpty([posterProxy, thumb]),
    art: pickFirstNonEmpty([backdropProxy, art]),
    overview: pickFirstNonEmpty([source.summary, source.tagline]),
    libraryId: parseFiniteNumber(options.libraryId, 0),
    libraryTitle: subtitle,
    tmdbId: tmdbId || undefined,
  };
}

function mapMaintainerrRuleItem(entry) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const dataType = parseFiniteNumber(source.dataType || source.collection?.type, 0);
  const kind = normalizeMaintainerrMediaKind(String(dataType || ''), 'movie');
  const statusLabel = source.isActive === false ? 'Paused' : 'Active';
  const rules = Array.isArray(source.rules) ? source.rules : [];
  const ruleConditions = rules
    .map((ruleEntry) => {
      const parsed = parseMaintainerrRuleJson(ruleEntry?.ruleJson);
      const summary = summarizeMaintainerrRuleCondition(parsed);
      if (!summary) return '';
      return summary;
    })
    .filter(Boolean);
  return {
    id: parseFiniteNumber(source.id, 0),
    name: pickFirstNonEmpty([source.name, source.collection?.title, `Rule ${source.id || ''}`]).trim(),
    description: pickFirstNonEmpty([source.description, source.collection?.description]),
    isActive: source.isActive !== false,
    status: statusLabel,
    kind,
    libraryId: parseFiniteNumber(source.libraryId || source.collection?.libraryId, 0),
    libraryLabel: kind === 'show' ? 'TV' : 'Movies',
    collectionId: parseFiniteNumber(source.collection?.id || source.collectionId, 0),
    collectionTitle: pickFirstNonEmpty([source.collection?.title, source.manualCollectionName]),
    rulesCount: rules.length,
    ruleConditions,
    useRules: source.useRules !== false,
    cronSchedule: pickFirstNonEmpty([source.ruleHandlerCronSchedule]),
    handledMediaAmount: parseFiniteNumber(source.collection?.handledMediaAmount, 0),
    deleteAfterDays: parseFiniteNumber(source.collection?.deleteAfterDays, 0),
    keepLogsForMonths: parseFiniteNumber(source.collection?.keepLogsForMonths, 0),
    arrAction: pickFirstNonEmpty([source.collection?.arrAction]),
    lastDurationSeconds: parseFiniteNumber(source.collection?.lastDurationInSeconds, 0),
  };
}

function mapMaintainerrCollectionMediaItem(entry, options = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const plexData = source.plexData && typeof source.plexData === 'object'
    ? source.plexData
    : {};
  const imageList = Array.isArray(plexData.Image) ? plexData.Image : [];
  const posterFromImage = imageList.find((item) => String(item?.type || '').toLowerCase().includes('cover'))?.url || '';
  const artFromImage = imageList.find((item) => String(item?.type || '').toLowerCase().includes('background'))?.url || '';
  const kind = normalizeMaintainerrMediaKind(plexData.type || options.type, 'movie');
  const tmdbKind = normalizeMaintainerrTmdbKind(kind, 'movie');
  const tmdbId = extractMaintainerrTmdbId({
    ...source,
    ...plexData,
    tmdbId: source.tmdbId ?? plexData.tmdbId,
  });
  const imagePathPoster = isMaintainerrPlaceholderArtwork(source.image_path)
    ? ''
    : buildMaintainerrTmdbImageUrl(source.image_path, 'w500');
  const rawThumbCandidate = pickFirstNonEmpty([plexData.thumb, source.thumb, posterFromImage]);
  const rawArtCandidate = pickFirstNonEmpty([plexData.art, plexData.background, artFromImage]);
  const resolvedThumb = resolveMaintainerrAssetUrl(options.baseUrl, rawThumbCandidate);
  const resolvedArt = resolveMaintainerrAssetUrl(options.baseUrl, rawArtCandidate);
  const thumb = isMaintainerrPlexLibraryAssetPath(rawThumbCandidate)
    || isMaintainerrPlexLibraryAssetPath(resolvedThumb)
    || isMaintainerrPlaceholderArtwork(rawThumbCandidate)
    || isMaintainerrPlaceholderArtwork(resolvedThumb)
    ? ''
    : resolvedThumb;
  const art = isMaintainerrPlexLibraryAssetPath(rawArtCandidate)
    || isMaintainerrPlexLibraryAssetPath(resolvedArt)
    || isMaintainerrPlaceholderArtwork(rawArtCandidate)
    || isMaintainerrPlaceholderArtwork(resolvedArt)
    ? ''
    : resolvedArt;
  const posterProxy = tmdbId > 0 ? `/api/maintainerr-poster/${tmdbKind}/${tmdbId}` : '';
  const backdropProxy = tmdbId > 0 ? `/api/maintainerr-backdrop/${tmdbKind}/${tmdbId}` : '';
  const title = pickFirstNonEmpty([plexData.title, source.title, plexData.parentTitle, 'Untitled']);
  const year = parseFiniteNumber(plexData.year, 0);
  const addedAt = source.addDate || source.addedAt || plexData.addedAt || plexData.updatedAt;
  const addedLabel = formatMaintainerrDateLabel(addedAt);
  return {
    id: pickFirstNonEmpty([source.id, plexData.ratingKey, title]),
    title,
    kind,
    subtitle: pickFirstNonEmpty([options.collectionTitle, source.collectionTitle]),
    meta: year > 0 ? String(year) : '',
    pill: formatMaintainerrRelativePill(addedAt),
    sortTs: parseMaintainerrTimestamp(addedAt),
    addedLabel: addedLabel ? `Added ${addedLabel}` : '',
    year: year || undefined,
    letter: normalizeMaintainerrInitial(title),
    thumb: pickFirstNonEmpty([imagePathPoster, posterProxy, thumb]),
    art: pickFirstNonEmpty([backdropProxy, art]),
    overview: pickFirstNonEmpty([plexData.summary, plexData.tagline]),
    collectionId: parseFiniteNumber(options.collectionId || source.collectionId, 0),
    collectionTitle: pickFirstNonEmpty([options.collectionTitle, source.collectionTitle]),
    tmdbId: tmdbId || undefined,
  };
}

function normalizeRommMediaKind(value, fallback = 'game') {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  if (text.includes('handheld') || text.includes('portable')) return 'handheld';
  if (text.includes('console') || text.includes('system') || text.includes('platform')) return 'console';
  if (text.includes('bios') || text.includes('firmware')) return 'bios';
  if (text.includes('homebrew')) return 'homebrew';
  if (text.includes('game') || text.includes('rom')) return 'game';
  return fallback;
}

function parseRommTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1e17) return Math.round(numeric / 1e6); // nanoseconds
    if (numeric > 1e14) return Math.round(numeric / 1e3); // microseconds
    if (numeric > 1e11) return Math.round(numeric); // milliseconds
    return Math.round(numeric * 1000); // seconds
  }
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRommDateLabel(value) {
  const timestamp = parseRommTimestamp(value);
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (err) {
    return '';
  }
}

function formatRommRelativePill(value) {
  const timestamp = parseRommTimestamp(value);
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function resolveRommAssetUrl(baseUrl, candidates = []) {
  let relativeBase = '';
  let basePathPrefix = '';
  try {
    const normalizedBase = normalizeBaseUrl(baseUrl || '');
    if (normalizedBase) {
      const parsedBase = new URL(normalizedBase);
      if (!String(parsedBase.pathname || '/').endsWith('/')) {
        parsedBase.pathname = `${parsedBase.pathname}/`;
      }
      parsedBase.search = '';
      parsedBase.hash = '';
      relativeBase = parsedBase.toString();
      basePathPrefix = normalizeBasePath(parsedBase.pathname || '');
    }
  } catch (err) {
    relativeBase = '';
    basePathPrefix = '';
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = String(candidates[index] || '').trim();
    if (!candidate) continue;
    if (candidate === '[object Object]') continue;
    if (/^data:image\//i.test(candidate)) return candidate;
    if (/^https?:\/\//i.test(candidate)) return candidate;
    if (/^\/\//.test(candidate)) return `https:${candidate}`;

    const attempts = [candidate];
    if (
      candidate.startsWith('/')
      && basePathPrefix
      && basePathPrefix !== '/'
      && candidate !== basePathPrefix
      && !candidate.startsWith(`${basePathPrefix}/`)
    ) {
      attempts.unshift(`${basePathPrefix}${candidate}`);
    }

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      try {
        return new URL(attempts[attemptIndex], relativeBase || baseUrl).toString();
      } catch (err) {
        continue;
      }
    }
  }
  return '';
}

function normalizeRommAssetKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function collectRommAssetValues(value, bucket = []) {
  if (value === null || value === undefined) return bucket;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) bucket.push(text);
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRommAssetValues(entry, bucket));
    return bucket;
  }
  if (typeof value === 'object') {
    const directKeys = ['url', 'href', 'src', 'path', 'image', 'thumb', 'cover', 'poster', 'icon', 'logo', 'background', 'backdrop', 'banner', 'fanart', 'art', 'artwork'];
    directKeys.forEach((key) => {
      if (value[key] !== undefined) collectRommAssetValues(value[key], bucket);
    });
  }
  return bucket;
}

function normalizeRommPlatformSlug(value) {
  if (value === null || value === undefined) return '';
  let raw = String(value).trim().toLowerCase();
  if (!raw) return '';
  try {
    raw = decodeURIComponent(raw);
  } catch (err) {
    // Keep original when the value isn't URI-encoded.
  }
  raw = raw.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,6}$/i, '');
  return raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildRommPlatformAssetCandidates(entry, title = '') {
  const source = entry && typeof entry === 'object' ? entry : {};
  const slugValues = uniqueList([
    source.slug,
    source.platformSlug,
    source.platform_slug,
    source.consoleSlug,
    source.console_slug,
    source.systemSlug,
    source.system_slug,
    source.fsSlug,
    source.fs_slug,
    source.igdbSlug,
    source.igdb_slug,
    source.assets?.slug,
    source.assets?.platformSlug,
    source.metadata?.slug,
    source.metadata?.platformSlug,
    source.platform?.slug,
    source.console?.slug,
    source.system?.slug,
    title,
    source.name,
    source.platformName,
    source.consoleName,
    source.systemName,
  ]);
  const slugs = uniqueList(slugValues.map((value) => normalizeRommPlatformSlug(value)).filter(Boolean));
  const extensions = ['ico', 'png', 'svg', 'webp', 'jpg', 'jpeg'];
  const candidates = [];
  slugs.forEach((slug) => {
    extensions.forEach((ext) => {
      candidates.push(`assets/platforms/${slug}.${ext}`);
      candidates.push(`/assets/platforms/${slug}.${ext}`);
    });
  });
  return uniqueList(candidates);
}

function findRommAssetCandidates(entry, options = {}) {
  const exactKeySet = new Set((Array.isArray(options.exactKeys) ? options.exactKeys : []).map(normalizeRommAssetKey).filter(Boolean));
  const containsTokens = (Array.isArray(options.containsTokens) ? options.containsTokens : [])
    .map(normalizeRommAssetKey)
    .filter(Boolean);
  const maxDepth = Math.max(1, Math.min(6, parseFiniteNumber(options.maxDepth, 4)));
  const candidates = [];
  const seenValues = new Set();
  const seenObjects = new Set();
  const queue = [{ value: entry, depth: 0 }];

  const pushCandidate = (rawValue) => {
    const text = String(rawValue || '').trim();
    if (!text) return;
    if (seenValues.has(text)) return;
    seenValues.add(text);
    candidates.push(text);
  };

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (seenObjects.has(value)) continue;
    seenObjects.add(value);
    if (depth > maxDepth) continue;

    if (Array.isArray(value)) {
      value.forEach((entryValue) => {
        if (entryValue && typeof entryValue === 'object') {
          queue.push({ value: entryValue, depth: depth + 1 });
        } else {
          collectRommAssetValues(entryValue).forEach(pushCandidate);
        }
      });
      continue;
    }

    Object.entries(value).forEach(([rawKey, rawValue]) => {
      const key = normalizeRommAssetKey(rawKey);
      const matchesExact = exactKeySet.has(key);
      const matchesToken = containsTokens.some((token) => key.includes(token));
      if (matchesExact || matchesToken) {
        collectRommAssetValues(rawValue).forEach(pushCandidate);
      }
      if (rawValue && typeof rawValue === 'object' && depth < maxDepth) {
        queue.push({ value: rawValue, depth: depth + 1 });
      }
    });
  }

  return candidates;
}

function isLikelyRommCollection(value) {
  if (!Array.isArray(value)) return false;
  if (!value.length) return true;
  return value.some((entry) => entry && typeof entry === 'object');
}

function extractRommList(payload, kind = 'recently-added') {
  const preferredKeys = kind === 'consoles'
    ? ['platforms', 'consoles', 'systems', 'items', 'results', 'records', 'data']
    : ['games', 'roms', 'items', 'results', 'records', 'data'];

  const fromContainer = (container) => {
    if (!container || typeof container !== 'object') return null;
    for (let index = 0; index < preferredKeys.length; index += 1) {
      const key = preferredKeys[index];
      if (isLikelyRommCollection(container[key])) return container[key];
    }
    const values = Object.values(container);
    for (let index = 0; index < values.length; index += 1) {
      if (isLikelyRommCollection(values[index])) return values[index];
    }
    return null;
  };

  if (isLikelyRommCollection(payload)) return payload;
  const direct = fromContainer(payload);
  if (direct) return direct;

  const nestedKeys = ['data', 'result', 'results', 'payload', 'response'];
  for (let index = 0; index < nestedKeys.length; index += 1) {
    const nested = payload?.[nestedKeys[index]];
    if (!nested || typeof nested !== 'object') continue;
    if (isLikelyRommCollection(nested)) return nested;
    const nestedCollection = fromContainer(nested);
    if (nestedCollection) return nestedCollection;
  }

  const visited = new Set();
  const queue = [{ value: payload, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (visited.has(value)) continue;
    visited.add(value);
    if (isLikelyRommCollection(value)) return value;
    if (depth >= 3) continue;
    Object.values(value).forEach((entry) => {
      if (entry && typeof entry === 'object') queue.push({ value: entry, depth: depth + 1 });
    });
  }

  return null;
}

function parseRommNumericValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const direct = Number(value);
  if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
  if (typeof value !== 'string') return 0;
  const text = value.trim();
  if (!text) return 0;
  const compact = text.replace(/[\s,]+/g, '');
  if (/^-?\d+(\.\d+)?$/.test(compact)) {
    const numeric = Number(compact);
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
  }
  const embedded = text.match(/(\d[\d,]*)/);
  if (!embedded || !embedded[1]) return 0;
  const parsed = Number(embedded[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function parseRommCount(value, seen = new Set()) {
  const numeric = parseRommNumericValue(value);
  if (numeric > 0) return numeric;
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);

  const preferredCandidates = [
    value.romCount,
    value.romsCount,
    value.rom_count,
    value.roms_count,
    value.totalRoms,
    value.total_roms,
    value.gameCount,
    value.gamesCount,
    value.game_count,
    value.games_count,
    value.totalGames,
    value.total_games,
    value.count,
    value.total,
    value.entries,
    value.items,
    value.roms,
    value.games,
    value.stats,
    value.totals,
    value.summary,
  ];
  for (let index = 0; index < preferredCandidates.length; index += 1) {
    const parsed = parseRommCount(preferredCandidates[index], seen);
    if (parsed > 0) return parsed;
  }

  let best = 0;
  Object.entries(value).forEach(([rawKey, rawValue]) => {
    const key = normalizeRommAssetKey(rawKey);
    if (!key) return;
    const isCountish = key.includes('count')
      || key.includes('total')
      || key.startsWith('num')
      || key.includes('rom')
      || key.includes('game')
      || key.includes('entry')
      || key.includes('item');
    if (!isCountish) return;
    const parsed = parseRommCount(rawValue, seen);
    if (parsed > best) best = parsed;
  });
  if (best > 0) return best;

  const nestedContainers = [
    value.data,
    value.result,
    value.results,
    value.payload,
    value.response,
    value.meta,
    value.metadata,
    value.pagination,
    value.page,
    value.pageInfo,
  ];
  for (let index = 0; index < nestedContainers.length; index += 1) {
    const parsed = parseRommCount(nestedContainers[index], seen);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function pickRommCount(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  let best = 0;
  for (let index = 0; index < list.length; index += 1) {
    const parsed = parseRommCount(list[index]);
    if (parsed > best) best = parsed;
    if (parsed > 0) return parsed;
  }
  return best;
}

function mapRommRecentlyAddedItem(entry, baseUrl = '') {
  const source = entry && typeof entry === 'object' ? entry : {};
  const game = source?.game || source?.gameInfo || source?.gameData || source?.games?.[0] || null;
  const rom = source?.rom || source?.romInfo || source?.romData || source?.roms?.[0] || null;
  const kind = normalizeRommMediaKind(
    pickFirstNonEmpty([
      source?.type,
      source?.category,
      source?.romType,
      source?.kind,
      game?.type,
      game?.category,
      game?.kind,
      rom?.type,
      rom?.category,
      rom?.kind,
    ]),
    'game'
  );
  const addedAt = pickFirstNonEmpty([
    source?.addedAt,
    source?.added_at,
    source?.createdAt,
    source?.created_at,
    source?.created,
    source?.createdOn,
    source?.created_on,
    source?.added,
    source?.addedOn,
    source?.added_on,
    source?.importedAt,
    source?.imported_at,
    source?.imported,
    source?.importedOn,
    source?.imported_on,
    source?.insertedAt,
    source?.inserted_at,
    source?.inserted,
    source?.insertedOn,
    source?.inserted_on,
    source?.timestamp,
    source?.timeAdded,
    source?.time_added,
    source?.sortTs,
    source?.sort_ts,
    source?.sortValue,
    source?.sort_value,
    game?.addedAt,
    game?.added_at,
    game?.createdAt,
    game?.created_at,
    game?.created,
    game?.createdOn,
    game?.created_on,
    game?.added,
    game?.addedOn,
    game?.added_on,
    game?.importedAt,
    game?.imported_at,
    game?.imported,
    game?.importedOn,
    game?.imported_on,
    game?.insertedAt,
    game?.inserted_at,
    game?.inserted,
    game?.insertedOn,
    game?.inserted_on,
    game?.timestamp,
    game?.timeAdded,
    game?.time_added,
    game?.sortTs,
    game?.sort_ts,
    game?.sortValue,
    game?.sort_value,
    rom?.addedAt,
    rom?.added_at,
    rom?.createdAt,
    rom?.created_at,
    rom?.created,
    rom?.createdOn,
    rom?.created_on,
    rom?.added,
    rom?.addedOn,
    rom?.added_on,
    rom?.importedAt,
    rom?.imported_at,
    rom?.imported,
    rom?.importedOn,
    rom?.imported_on,
    rom?.insertedAt,
    rom?.inserted_at,
    rom?.inserted,
    rom?.insertedOn,
    rom?.inserted_on,
    rom?.timestamp,
    rom?.timeAdded,
    rom?.time_added,
    rom?.sortTs,
    rom?.sort_ts,
    rom?.sortValue,
    rom?.sort_value,
    source?.updatedAt,
    source?.updated_at,
    source?.modifiedAt,
    source?.modified_at,
    source?.lastModified,
    source?.last_modified,
    game?.updatedAt,
    game?.updated_at,
    rom?.updatedAt,
    rom?.updated_at,
    source?.releasedAt,
    source?.releaseDate,
    source?.release_date,
    game?.releasedAt,
    game?.releaseDate,
    game?.release_date,
    rom?.releasedAt,
    rom?.releaseDate,
    rom?.release_date,
  ]);
  const addedTs = parseRommTimestamp(addedAt);
  const addedLabel = formatRommDateLabel(addedAt);
  const addedPill = formatRommRelativePill(addedAt);
  const region = pickFirstNonEmpty([
    source?.region,
    source?.releaseRegion,
    source?.country,
    source?.locale,
    game?.region,
    game?.releaseRegion,
    game?.country,
    game?.locale,
    rom?.region,
    rom?.releaseRegion,
    rom?.country,
    rom?.locale,
  ]);
  const platformName = pickFirstNonEmpty([
    source?.platformName,
    source?.platform_name,
    source?.consoleName,
    source?.systemName,
    source?.platform?.name,
    source?.console?.name,
    source?.system?.name,
    source?.platform,
    source?.console,
    source?.system,
    game?.platformName,
    game?.platform_name,
    game?.consoleName,
    game?.systemName,
    game?.platform?.name,
    game?.console?.name,
    game?.system?.name,
    game?.platform,
    game?.console,
    game?.system,
    rom?.platformName,
    rom?.platform_name,
    rom?.consoleName,
    rom?.systemName,
    rom?.platform?.name,
    rom?.console?.name,
    rom?.system?.name,
    rom?.platform,
    rom?.console,
    rom?.system,
  ]);
  const addedSummary = [addedLabel ? `Added ${addedLabel}` : '', region].filter(Boolean).join(' • ');
  const sizeBytes = parseFiniteNumber(
    source?.sizeBytes
      ?? source?.size_bytes
      ?? source?.fileSize
      ?? source?.file_size
      ?? source?.size
      ?? game?.sizeBytes
      ?? game?.size_bytes
      ?? game?.fileSize
      ?? game?.file_size
      ?? game?.size
      ?? rom?.sizeBytes
      ?? rom?.size_bytes
      ?? rom?.fileSize
      ?? rom?.file_size
      ?? rom?.size,
    0
  );
  const sizeLabel = sizeBytes > 0 ? formatBytesLabel(sizeBytes) : '';
  const extension = pickFirstNonEmpty([
    source?.extension,
    source?.fileExtension,
    source?.fileType,
    source?.format,
    game?.extension,
    game?.fileExtension,
    game?.fileType,
    game?.format,
    rom?.extension,
    rom?.fileExtension,
    rom?.fileType,
    rom?.format,
  ]).toUpperCase();
  const preferredThumbCandidates = [
    source?.url_cover,
    source?.path_cover_small,
    source?.path_cover_large,
    source?.path_cover,
    game?.coverUrl,
    game?.coverURL,
    game?.cover_url,
    game?.url_cover,
    game?.path_cover_small,
    game?.path_cover_large,
    game?.path_cover,
    game?.coverImage,
    game?.cover_image,
    game?.cover,
    game?.boxArt,
    game?.boxart,
    game?.posterUrl,
    game?.poster_url,
    game?.poster,
    game?.thumbnail,
    game?.thumb,
    rom?.coverUrl,
    rom?.coverURL,
    rom?.cover_url,
    rom?.url_cover,
    rom?.path_cover_small,
    rom?.path_cover_large,
    rom?.path_cover,
    rom?.coverImage,
    rom?.cover_image,
    rom?.cover,
    rom?.boxArt,
    rom?.boxart,
    rom?.posterUrl,
    rom?.poster_url,
    rom?.poster,
    rom?.thumbnail,
    rom?.thumb,
    source?.coverUrl,
    source?.coverURL,
    source?.cover_url,
    source?.coverImage,
    source?.cover_image,
    source?.cover,
    source?.boxArt,
    source?.boxart,
    source?.posterUrl,
    source?.poster_url,
    source?.poster,
    source?.thumbnail,
    source?.thumb,
    source?.metadatum?.url_cover,
    source?.metadatum?.path_cover_small,
    source?.metadatum?.path_cover_large,
    source?.metadatum?.path_cover,
  ];
  const thumbCandidates = [
    source?.url_cover,
    source?.path_cover_small,
    source?.path_cover_large,
    source?.path_cover,
    source?.coverUrl,
    source?.coverURL,
    source?.cover_url,
    source?.coverImage,
    source?.cover_image,
    source?.cover,
    source?.boxArt,
    source?.boxart,
    source?.posterUrl,
    source?.poster_url,
    source?.poster,
    source?.thumbnail,
    source?.thumb,
    source?.media?.cover,
    source?.assets?.cover,
    source?.assets?.boxArt,
    source?.assets?.box_art,
    source?.assets?.poster,
    source?.metadata?.cover,
    source?.metadata?.boxArt,
    source?.metadata?.box_art,
    source?.metadata?.poster,
    source?.metadatum?.url_cover,
    source?.metadatum?.path_cover_small,
    source?.metadatum?.path_cover_large,
    source?.metadatum?.path_cover,
    game?.coverUrl,
    game?.coverURL,
    game?.cover_url,
    game?.url_cover,
    game?.path_cover_small,
    game?.path_cover_large,
    game?.path_cover,
    game?.coverImage,
    game?.cover_image,
    game?.cover,
    game?.boxArt,
    game?.boxart,
    game?.posterUrl,
    game?.poster_url,
    game?.poster,
    game?.thumbnail,
    game?.thumb,
    game?.media?.cover,
    game?.assets?.cover,
    game?.assets?.boxArt,
    game?.assets?.box_art,
    game?.assets?.poster,
    game?.metadata?.cover,
    game?.metadata?.boxArt,
    game?.metadata?.box_art,
    game?.metadata?.poster,
    rom?.coverUrl,
    rom?.coverURL,
    rom?.cover_url,
    rom?.url_cover,
    rom?.path_cover_small,
    rom?.path_cover_large,
    rom?.path_cover,
    rom?.coverImage,
    rom?.cover_image,
    rom?.cover,
    rom?.boxArt,
    rom?.boxart,
    rom?.posterUrl,
    rom?.poster_url,
    rom?.poster,
    rom?.thumbnail,
    rom?.thumb,
    rom?.media?.cover,
    rom?.assets?.cover,
    rom?.assets?.boxArt,
    rom?.assets?.box_art,
    rom?.assets?.poster,
    rom?.metadata?.cover,
    rom?.metadata?.boxArt,
    rom?.metadata?.box_art,
    rom?.metadata?.poster,
    ...findRommAssetCandidates(source, {
      exactKeys: ['cover', 'cover_url', 'coverurl', 'cover_path', 'coverpath', 'path_cover', 'path_cover_small', 'path_cover_large', 'url_cover', 'box_art', 'boxart', 'poster', 'thumbnail', 'thumb'],
      containsTokens: ['cover', 'thumb', 'poster', 'boxart'],
      maxDepth: 5,
    }),
  ];
  const thumb = resolveRommAssetUrl(baseUrl, preferredThumbCandidates) || resolveRommAssetUrl(baseUrl, thumbCandidates);
  const preferredArtCandidates = [
    game?.background,
    game?.backgroundUrl,
    game?.background_url,
    game?.backdrop,
    game?.backdropUrl,
    game?.backdrop_url,
    game?.banner,
    game?.fanart,
    rom?.background,
    rom?.backgroundUrl,
    rom?.background_url,
    rom?.backdrop,
    rom?.backdropUrl,
    rom?.backdrop_url,
    rom?.banner,
    rom?.fanart,
    source?.background,
    source?.backgroundUrl,
    source?.background_url,
    source?.backdrop,
    source?.backdropUrl,
    source?.backdrop_url,
    source?.banner,
    source?.fanart,
  ];
  const artCandidates = [
    source?.background,
    source?.backgroundUrl,
    source?.background_url,
    source?.backdrop,
    source?.backdropUrl,
    source?.backdrop_url,
    source?.banner,
    source?.fanart,
    source?.media?.background,
    source?.media?.fanart,
    source?.assets?.background,
    source?.assets?.backdrop,
    source?.assets?.banner,
    source?.assets?.fanart,
    source?.metadata?.background,
    source?.metadata?.backdrop,
    source?.metadata?.banner,
    source?.metadata?.fanart,
    game?.background,
    game?.backgroundUrl,
    game?.background_url,
    game?.backdrop,
    game?.backdropUrl,
    game?.backdrop_url,
    game?.banner,
    game?.fanart,
    game?.media?.background,
    game?.media?.fanart,
    game?.assets?.background,
    game?.assets?.backdrop,
    game?.assets?.banner,
    game?.assets?.fanart,
    game?.metadata?.background,
    game?.metadata?.backdrop,
    game?.metadata?.banner,
    game?.metadata?.fanart,
    rom?.background,
    rom?.backgroundUrl,
    rom?.background_url,
    rom?.backdrop,
    rom?.backdropUrl,
    rom?.backdrop_url,
    rom?.banner,
    rom?.fanart,
    rom?.media?.background,
    rom?.media?.fanart,
    rom?.assets?.background,
    rom?.assets?.backdrop,
    rom?.assets?.banner,
    rom?.assets?.fanart,
    rom?.metadata?.background,
    rom?.metadata?.backdrop,
    rom?.metadata?.banner,
    rom?.metadata?.fanart,
    ...findRommAssetCandidates(source, {
      exactKeys: ['background', 'background_url', 'backgroundurl', 'backdrop', 'backdrop_url', 'backdropurl', 'banner', 'fanart', 'wallpaper', 'hero'],
      containsTokens: ['background', 'backdrop', 'banner', 'fanart', 'wallpaper', 'hero'],
      maxDepth: 5,
    }),
  ];
  const art = resolveRommAssetUrl(baseUrl, preferredArtCandidates) || resolveRommAssetUrl(baseUrl, artCandidates);
  const overview = pickFirstNonEmpty([
    source?.overview,
    source?.summary,
    source?.description,
    source?.synopsis,
    source?.plot,
    game?.overview,
    game?.summary,
    game?.description,
    game?.synopsis,
    game?.plot,
    rom?.overview,
    rom?.summary,
    rom?.description,
    rom?.synopsis,
    rom?.plot,
  ]);
  const subtitle = platformName || '-';
  const metaParts = [];
  if (platformName && addedSummary) metaParts.push(addedSummary);
  if (!platformName && addedLabel) metaParts.push(`Added ${addedLabel}`);
  if (!platformName && region) metaParts.push(region);
  if (sizeLabel) metaParts.push(sizeLabel);
  if (extension) metaParts.push(extension);
  return {
    id: pickFirstNonEmpty([
      source?.id,
      source?.uuid,
      source?.slug,
      source?.romId,
      source?.gameId,
      game?.id,
      game?.uuid,
      game?.slug,
      rom?.id,
      rom?.uuid,
      rom?.slug,
      source?.name,
      source?.title,
    ]),
    kind,
    title: pickFirstNonEmpty([
      game?.title,
      game?.name,
      game?.gameTitle,
      source?.title,
      source?.name,
      source?.gameTitle,
      source?.romName,
      rom?.title,
      rom?.name,
      rom?.romName,
      source?.filename,
      rom?.filename,
      game?.filename,
      'Unknown',
    ]),
    subtitle,
    meta: metaParts.join(' • '),
    pill: addedPill,
    user: '',
    overview,
    thumb,
    art,
    sortTs: addedTs,
  };
}

function mapRommConsoleItem(entry, baseUrl = '') {
  const kind = normalizeRommMediaKind(
    pickFirstNonEmpty([entry?.type, entry?.category, entry?.platformType, entry?.deviceType]),
    'console'
  );
  const title = pickFirstNonEmpty([entry?.name, entry?.title, entry?.platformName, entry?.consoleName, entry?.systemName, 'Unknown Console']);
  const romCount = pickRommCount([
    entry?.romCount,
    entry?.romsCount,
    entry?.rom_count,
    entry?.roms_count,
    entry?.totalRoms,
    entry?.total_roms,
    entry?.stats?.roms,
    entry?.stats?.romCount,
    entry?.stats?.rom_count,
    entry?.totals?.roms,
    entry?.totals?.romCount,
    entry?.totals?.rom_count,
    entry?.roms,
    entry?.count,
    entry?.totals,
    entry?.stats,
    entry?.gameCount,
    entry?.gamesCount,
    entry?.game_count,
    entry?.games_count,
    entry?.games,
  ]);
  const gameCount = pickRommCount([
    entry?.gameCount,
    entry?.gamesCount,
    entry?.game_count,
    entry?.games_count,
    entry?.totalGames,
    entry?.total_games,
    entry?.stats?.games,
    entry?.stats?.gameCount,
    entry?.stats?.game_count,
    entry?.totals?.games,
    entry?.totals?.gameCount,
    entry?.totals?.game_count,
    entry?.games,
  ]);
  const biosCount = pickRommCount([
    entry?.biosCount,
    entry?.bios_count,
    entry?.stats?.bios,
    entry?.stats?.biosCount,
    entry?.stats?.bios_count,
    entry?.totals?.bios,
    entry?.totals?.biosCount,
    entry?.totals?.bios_count,
    entry?.bios,
  ]);
  const saveCount = pickRommCount([
    entry?.saveCount,
    entry?.save_count,
    entry?.savesCount,
    entry?.saves_count,
    entry?.stats?.saves,
    entry?.stats?.saveCount,
    entry?.stats?.save_count,
    entry?.totals?.saves,
    entry?.totals?.saveCount,
    entry?.totals?.save_count,
    entry?.saves,
  ]);
  const screenshotCount = pickRommCount([
    entry?.screenshotCount,
    entry?.screenshot_count,
    entry?.screenshotsCount,
    entry?.screenshots_count,
    entry?.stats?.screenshots,
    entry?.stats?.screenshotCount,
    entry?.stats?.screenshot_count,
    entry?.totals?.screenshots,
    entry?.totals?.screenshotCount,
    entry?.totals?.screenshot_count,
    entry?.screenshots,
  ]);
  const generation = pickFirstNonEmpty([entry?.generation, entry?.era, entry?.family, entry?.releaseYear, entry?.year]);
  const manufacturer = pickFirstNonEmpty([entry?.manufacturer, entry?.vendor, entry?.company]);
  const statItems = [];
  const pushStat = (label, rawValue) => {
    const textLabel = String(label || '').trim();
    const textValue = String(rawValue || '').trim();
    if (!textLabel || !textValue) return;
    if (statItems.some((item) => item.label === textLabel)) return;
    statItems.push({ label: textLabel, value: textValue });
  };
  pushStat('ROMs', romCount > 0 ? romCount.toLocaleString() : '0');
  if (gameCount > 0 && gameCount !== romCount) pushStat('Games', gameCount.toLocaleString());
  if (biosCount > 0) pushStat('BIOS', biosCount.toLocaleString());
  if (saveCount > 0) pushStat('Saves', saveCount.toLocaleString());
  if (screenshotCount > 0) pushStat('Screenshots', screenshotCount.toLocaleString());
  if (manufacturer) pushStat('Manufacturer', manufacturer);
  if (generation) pushStat('Generation', generation);
  const subDetail = `${romCount.toLocaleString()} ROM${romCount === 1 ? '' : 's'}`;
  const fallbackPlatformAssets = buildRommPlatformAssetCandidates(entry, title);
  const thumbCandidates = [
    entry?.icon,
    entry?.iconUrl,
    entry?.icon_url,
    entry?.iconPath,
    entry?.icon_path,
    entry?.iconFile,
    entry?.icon_file,
    entry?.logo,
    entry?.logoUrl,
    entry?.logo_url,
    entry?.logoPath,
    entry?.logo_path,
    entry?.image,
    entry?.imageUrl,
    entry?.image_url,
    entry?.imagePath,
    entry?.image_path,
    entry?.cover,
    entry?.coverUrl,
    entry?.cover_url,
    entry?.coverPath,
    entry?.cover_path,
    entry?.coverImage,
    entry?.cover_image,
    entry?.boxArt,
    entry?.box_art,
    entry?.boxart,
    entry?.poster,
    entry?.posterUrl,
    entry?.poster_url,
    entry?.artwork,
    entry?.artworkUrl,
    entry?.artwork_url,
    entry?.thumbnail,
    entry?.thumb,
    entry?.banner,
    entry?.asset,
    entry?.assetUrl,
    entry?.asset_url,
    entry?.assets?.icon,
    entry?.assets?.iconUrl,
    entry?.assets?.icon_url,
    entry?.assets?.logo,
    entry?.assets?.logoUrl,
    entry?.assets?.logo_url,
    entry?.assets?.cover,
    entry?.assets?.coverUrl,
    entry?.assets?.cover_url,
    entry?.assets?.boxArt,
    entry?.assets?.box_art,
    entry?.assets?.poster,
    entry?.assets?.thumbnail,
    entry?.assets?.image,
    entry?.assets?.artwork,
    entry?.assets?.banner,
    entry?.metadata?.icon,
    entry?.metadata?.logo,
    entry?.metadata?.cover,
    entry?.metadata?.boxArt,
    entry?.metadata?.box_art,
    entry?.metadata?.poster,
    entry?.metadata?.thumbnail,
    entry?.metadata?.image,
    entry?.metadata?.artwork,
    entry?.metadata?.banner,
    entry?.metadata?.iconPath,
    entry?.metadata?.icon_path,
    entry?.metadata?.coverPath,
    entry?.metadata?.cover_path,
    entry?.roms?.[0]?.cover,
    entry?.roms?.[0]?.coverUrl,
    entry?.roms?.[0]?.cover_url,
    entry?.roms?.[0]?.thumb,
    entry?.roms?.[0]?.thumbnail,
    entry?.games?.[0]?.cover,
    entry?.games?.[0]?.coverUrl,
    entry?.games?.[0]?.cover_url,
    entry?.games?.[0]?.thumb,
    entry?.games?.[0]?.thumbnail,
    ...fallbackPlatformAssets,
    ...findRommAssetCandidates(entry, {
      exactKeys: ['icon', 'icon_path', 'iconpath', 'logo', 'image', 'image_path', 'imagepath', 'cover', 'cover_url', 'coverurl', 'cover_path', 'coverpath', 'box_art', 'boxart', 'poster', 'thumbnail', 'thumb', 'artwork', 'custom_cover', 'customcover', 'screenshot', 'screenshots'],
      containsTokens: ['cover', 'thumb', 'poster', 'logo', 'icon', 'image', 'boxart', 'artwork', 'screenshot', 'asset'],
      maxDepth: 5,
    }),
  ];
  const thumb = resolveRommAssetUrl(baseUrl, thumbCandidates);
  const artCandidates = [
    entry?.background,
    entry?.backgroundUrl,
    entry?.background_url,
    entry?.banner,
    entry?.fanart,
    entry?.backdrop,
    entry?.backdropUrl,
    entry?.backdrop_url,
    entry?.wallpaper,
    entry?.hero,
    entry?.assets?.background,
    entry?.assets?.backdrop,
    entry?.assets?.banner,
    entry?.assets?.fanart,
    entry?.assets?.wallpaper,
    entry?.metadata?.background,
    entry?.metadata?.backdrop,
    entry?.metadata?.banner,
    entry?.metadata?.fanart,
    entry?.metadata?.wallpaper,
    ...findRommAssetCandidates(entry, {
      exactKeys: ['background', 'background_url', 'backgroundurl', 'backdrop', 'backdrop_url', 'backdropurl', 'banner', 'fanart', 'wallpaper', 'hero'],
      containsTokens: ['background', 'backdrop', 'banner', 'fanart', 'wallpaper', 'hero'],
      maxDepth: 5,
    }),
  ];
  const art = resolveRommAssetUrl(baseUrl, artCandidates);
  const resolvedThumb = thumb || art;
  const resolvedArt = art || thumb;
  const existingOverview = pickFirstNonEmpty([
    entry?.overview,
    entry?.summary,
    entry?.description,
    entry?.notes,
  ]);
  const generatedOverview = statItems.length
    ? `Library summary: ${statItems.map((item) => `${item.label}: ${item.value}`).join(' • ')}.`
    : '';
  const overview = existingOverview || generatedOverview;
  return {
    id: pickFirstNonEmpty([entry?.id, entry?.uuid, entry?.slug, entry?.platformId, entry?.consoleId, entry?.name]),
    kind,
    title,
    subtitle: subDetail,
    meta: [manufacturer, generation].filter(Boolean).join(' • '),
    pill: generation || '',
    user: '',
    overview,
    romCount,
    stats: statItems,
    thumb: resolvedThumb,
    art: resolvedArt,
    sortTs: romCount,
  };
}

app.get('/api/jackett/search/filters', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const jackettApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'jackett');
  if (!jackettApp) return res.status(404).json({ error: 'Jackett app is not configured.' });
  if (!canAccessDashboardApp(config, jackettApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Jackett dashboard access denied.' });
  }

  const apiKey = String(jackettApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Jackett API key.' });

  const candidates = resolveAppApiCandidates(jackettApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Jackett URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let payload = {};
      try {
        const upstreamUrl = buildAppApiUrl(baseUrl, 'api/v2.0/indexers');
        upstreamUrl.searchParams.set('apikey', apiKey);
        const upstreamRes = await fetch(upstreamUrl.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const text = await upstreamRes.text();
        if (!upstreamRes.ok) {
          lastError = `Jackett indexer metadata failed (${upstreamRes.status}) via ${baseUrl}.`;
          continue;
        }
        payload = text ? JSON.parse(text) : {};
      } finally {
        clearTimeout(timeout);
      }

      const rawIndexers = Array.isArray(payload?.Indexers)
        ? payload.Indexers
        : (Array.isArray(payload?.indexers)
          ? payload.indexers
          : (Array.isArray(payload) ? payload : []));
      const categoryProtocols = new Map();
      const indexers = rawIndexers
        .map((entry) => {
          const enabled = entry?.enabled !== false && entry?.Enabled !== false;
          if (!enabled) return null;
          const id = String(entry?.id || entry?.Id || entry?.ID || entry?.name || entry?.Name || '').trim();
          const name = String(entry?.name || entry?.Name || id || '').trim();
          if (!id || !name) return null;
          const protocol = normalizeIndexerProtocol(
            entry?.type
            || entry?.Type
            || entry?.protocol
            || entry?.Protocol
            || entry?.searchType
            || entry?.SearchType
            || entry?.caps?.type
          ) || 'torrent';
          const categoryIds = extractTopLevelCategoryIds(
            entry?.categories
            || entry?.Categories
            || entry?.caps?.categories
            || entry?.caps?.Categories
          );
          categoryIds.forEach((categoryId) => {
            if (!categoryProtocols.has(categoryId)) categoryProtocols.set(categoryId, new Set());
            categoryProtocols.get(categoryId).add(protocol);
          });
          return { id, name, protocol };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      const categories = toTopLevelCategoryOptions(
        payload?.Categories
        || payload?.categories
        || rawIndexers.map((entry) => entry?.categories || entry?.Categories || entry?.caps?.categories || entry?.caps?.Categories)
      ).map((entry) => {
        const numericId = Number(entry.id);
        const protocols = categoryProtocols.has(numericId)
          ? Array.from(categoryProtocols.get(numericId))
          : [];
        return {
          id: entry.id,
          name: entry.name,
          protocols,
        };
      });

      return res.json({ indexers, categories });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Jackett via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to fetch Jackett search filters.' });
});

app.get('/api/jackett/search', requireUser, async (req, res) => {
  const query = String(req.query?.query || req.query?.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Missing search query.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const jackettApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'jackett');
  if (!jackettApp) return res.status(404).json({ error: 'Jackett app is not configured.' });
  if (!canAccessDashboardApp(config, jackettApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Jackett dashboard access denied.' });
  }

  const apiKey = String(jackettApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Jackett API key.' });

  const limit = Math.max(1, Math.min(250, parseFiniteNumber(req.query?.limit || 25, 25)));
  const offset = Math.max(0, parseFiniteNumber(req.query?.offset || 0, 0));
  const protocolFilter = normalizeIndexerProtocol(req.query?.protocol || req.query?.type || '');
  const indexerFilter = String(req.query?.indexer || req.query?.indexerId || '').trim().toLowerCase();
  const indexerNameFilter = String(req.query?.indexerName || '').trim().toLowerCase();
  const categoryFilter = toTopLevelCategoryId(req.query?.category || req.query?.categories || '');
  const candidates = resolveAppApiCandidates(jackettApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Jackett URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const jsonUrl = buildAppApiUrl(baseUrl, 'api/v2.0/indexers/all/results');
      jsonUrl.searchParams.set('apikey', apiKey);
      jsonUrl.searchParams.set('Query', query);
      jsonUrl.searchParams.set('limit', String(Math.max(limit + offset + 100, 250)));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch(jsonUrl.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const bodyText = await response.text();
      if (!response.ok) {
        lastError = `Jackett request failed (${response.status}) via ${baseUrl}.`;
        continue;
      }
      let items = [];
      try {
        const parsed = bodyText ? JSON.parse(bodyText) : {};
        items = parseJackettJsonItems(parsed);
      } catch (err) {
        items = parseJackettTorznabItems(bodyText);
      }
      if (protocolFilter) {
        items = items.filter((item) => normalizeIndexerProtocol(item?.protocol) === protocolFilter);
      }
      if (indexerFilter || indexerNameFilter) {
        items = items.filter((item) => {
          const candidateValues = [
            item?.indexerId,
            item?.indexer,
          ]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean);
          if (indexerFilter && candidateValues.includes(indexerFilter)) return true;
          if (indexerNameFilter && candidateValues.includes(indexerNameFilter)) return true;
          return false;
        });
      }
      if (categoryFilter) {
        items = items.filter((item) => Array.isArray(item?.categoryIds) && item.categoryIds.includes(categoryFilter));
      }
      const total = items.length;
      const pageItems = items.slice(offset, offset + limit);
      return res.json({
        records: pageItems,
        totalRecords: total,
        offset,
        limit,
      });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Jackett via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to reach Jackett.' });
});

app.get('/api/bazarr/subtitle-queue', requireUser, async (req, res) => {
  const config = loadConfig();
  const apps = config.apps || [];
  const bazarrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'bazarr');
  if (!bazarrApp) return res.status(404).json({ error: 'Bazarr app is not configured.' });
  if (!canAccessDashboardApp(config, bazarrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Bazarr dashboard access denied.' });
  }

  const apiKey = String(bazarrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Bazarr API key.' });

  const candidates = resolveAppApiCandidates(bazarrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Bazarr URL.' });

  const fetchWanted = async (baseUrl, suffix) => {
    const url = buildAppApiUrl(baseUrl, suffix);
    url.searchParams.set('start', '0');
    url.searchParams.set('length', '200');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, error: `Bazarr request failed (${response.status}).` };
      }
      const parsed = text ? JSON.parse(text) : {};
      const list = Array.isArray(parsed?.data)
        ? parsed.data
        : (Array.isArray(parsed?.records)
          ? parsed.records
          : (Array.isArray(parsed) ? parsed : []));
      return { ok: true, items: list };
    } catch (err) {
      return { ok: false, error: safeMessage(err) || 'Failed to reach Bazarr.' };
    } finally {
      clearTimeout(timeout);
    }
  };

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const episodeResult = await fetchWanted(baseUrl, 'api/episodes/wanted');
      const movieResult = await fetchWanted(baseUrl, 'api/movies/wanted');
      if (!episodeResult.ok && !movieResult.ok) {
        lastError = episodeResult.error || movieResult.error || `Failed to reach Bazarr via ${baseUrl}.`;
        continue;
      }
      const episodeItems = Array.isArray(episodeResult.items) ? episodeResult.items : [];
      const movieItems = Array.isArray(movieResult.items) ? movieResult.items : [];
      const mapped = [...episodeItems, ...movieItems]
        .map(mapBazarrQueueItem)
        .filter((item) => Boolean(item?.title));
      return res.json({ items: mapped });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Bazarr via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to fetch Bazarr subtitle queue.' });
});

app.get('/api/autobrr/:kind', requireUser, async (req, res) => {
  const kind = String(req.params.kind || '').trim().toLowerCase();
  if (!['recent-matches', 'delivery-queue'].includes(kind)) {
    return res.status(400).json({ error: 'Unsupported Autobrr endpoint.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const autobrrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'autobrr');
  if (!autobrrApp) return res.status(404).json({ error: 'Autobrr app is not configured.' });
  if (!canAccessDashboardApp(config, autobrrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Autobrr dashboard access denied.' });
  }

  const apiKey = String(autobrrApp.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Missing Autobrr API key.' });

  const candidates = resolveAppApiCandidates(autobrrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Autobrr URL.' });

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const url = buildAppApiUrl(baseUrl, 'api/release');
      url.searchParams.set('limit', '200');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            'X-API-Token': apiKey,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await response.text();
      if (!response.ok) {
        lastError = `Autobrr request failed (${response.status}) via ${baseUrl}.`;
        continue;
      }
      const parsed = text ? JSON.parse(text) : {};
      const list = Array.isArray(parsed?.items)
        ? parsed.items
        : (Array.isArray(parsed?.releases)
          ? parsed.releases
          : (Array.isArray(parsed) ? parsed : []));
      const mapped = list.map((entry) => mapAutobrrQueueItem(entry, kind)).filter((item) => Boolean(item?.title));
      const filtered = kind === 'delivery-queue'
        ? mapped.filter((item) => ['queued', 'active', 'paused', 'completed', 'error'].includes(item.statusKey))
        : mapped;
      const items = filtered.length ? filtered : mapped;
      return res.json({ items: items.slice(0, 200) });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Autobrr via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to fetch Autobrr data.' });
});

const maintainerrTmdbAssetCache = new Map();

app.get('/api/maintainerr-poster/:kind/:id', requireUser, async (req, res) => {
  const rawKind = String(req.params.kind || '').trim().toLowerCase();
  const kind = normalizeMaintainerrTmdbKind(rawKind, '');
  const tmdbId = parseFiniteNumber(req.params.id, 0);
  if (!['movie', 'tv'].includes(kind) || !tmdbId) {
    return res.status(400).json({ error: 'Invalid poster request.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const maintainerrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'maintainerr');
  if (!maintainerrApp) return res.status(404).json({ error: 'Maintainerr app is not configured.' });
  if (!canAccessDashboardApp(config, maintainerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Maintainerr dashboard access denied.' });
  }

  const cacheKey = `poster:${kind}:${tmdbId}`;
  const cached = maintainerrTmdbAssetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.url) {
    return res.redirect(302, cached.url);
  }

  const candidates = resolveAppApiCandidates(maintainerrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Maintainerr URL.' });

  const apiKey = String(maintainerrApp.apiKey || '').trim();
  const authHeader = buildBasicAuthHeader(maintainerrApp.username || '', maintainerrApp.password || '');
  const headers = { Accept: 'text/plain,application/json' };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    headers['X-API-KEY'] = apiKey;
    if (!authHeader) headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }
  if (authHeader) headers.Authorization = authHeader;

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const url = buildAppApiUrl(baseUrl, `api/moviedb/image/${kind}/${tmdbId}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = (await response.text()).trim();
      if (!response.ok) {
        lastError = `Poster lookup failed (${response.status}) via ${baseUrl}.`;
        continue;
      }
      const resolved = buildMaintainerrTmdbImageUrl(text, 'w500');
      if (!resolved) {
        lastError = `Poster lookup returned empty path via ${baseUrl}.`;
        continue;
      }
      maintainerrTmdbAssetCache.set(cacheKey, {
        url: resolved,
        expiresAt: Date.now() + (6 * 60 * 60 * 1000),
      });
      return res.redirect(302, resolved);
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Maintainerr via ${baseUrl}.`;
    }
  }

  return res.status(404).json({ error: lastError || 'Poster not found.' });
});

app.get('/api/maintainerr-backdrop/:kind/:id', requireUser, async (req, res) => {
  const rawKind = String(req.params.kind || '').trim().toLowerCase();
  const kind = normalizeMaintainerrTmdbKind(rawKind, '');
  const tmdbId = parseFiniteNumber(req.params.id, 0);
  if (!['movie', 'tv'].includes(kind) || !tmdbId) {
    return res.status(400).json({ error: 'Invalid backdrop request.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const maintainerrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'maintainerr');
  if (!maintainerrApp) return res.status(404).json({ error: 'Maintainerr app is not configured.' });
  if (!canAccessDashboardApp(config, maintainerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Maintainerr dashboard access denied.' });
  }

  const cacheKey = `backdrop:${kind}:${tmdbId}`;
  const cached = maintainerrTmdbAssetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.url) {
    return res.redirect(302, cached.url);
  }

  const candidates = resolveAppApiCandidates(maintainerrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Maintainerr URL.' });

  const apiKey = String(maintainerrApp.apiKey || '').trim();
  const authHeader = buildBasicAuthHeader(maintainerrApp.username || '', maintainerrApp.password || '');
  const headers = { Accept: 'text/plain,application/json' };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    headers['X-API-KEY'] = apiKey;
    if (!authHeader) headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }
  if (authHeader) headers.Authorization = authHeader;

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const url = buildAppApiUrl(baseUrl, `api/moviedb/backdrop/${kind}/${tmdbId}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = (await response.text()).trim();
      if (!response.ok) {
        lastError = `Backdrop lookup failed (${response.status}) via ${baseUrl}.`;
        continue;
      }
      const resolved = buildMaintainerrTmdbImageUrl(text, 'w1280');
      if (!resolved) {
        lastError = `Backdrop lookup returned empty path via ${baseUrl}.`;
        continue;
      }
      maintainerrTmdbAssetCache.set(cacheKey, {
        url: resolved,
        expiresAt: Date.now() + (6 * 60 * 60 * 1000),
      });
      return res.redirect(302, resolved);
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Maintainerr via ${baseUrl}.`;
    }
  }

  return res.status(404).json({ error: lastError || 'Backdrop not found.' });
});

app.get('/api/maintainerr/:kind', requireUser, async (req, res) => {
  const kind = String(req.params.kind || '').trim().toLowerCase();
  if (!['library-media', 'rules', 'collections-media'].includes(kind)) {
    return res.status(400).json({ error: 'Unsupported Maintainerr endpoint.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const maintainerrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'maintainerr');
  if (!maintainerrApp) return res.status(404).json({ error: 'Maintainerr app is not configured.' });
  if (!canAccessDashboardApp(config, maintainerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Maintainerr dashboard access denied.' });
  }

  const candidates = resolveAppApiCandidates(maintainerrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Maintainerr URL.' });

  const apiKey = String(maintainerrApp.apiKey || '').trim();
  const authHeader = buildBasicAuthHeader(maintainerrApp.username || '', maintainerrApp.password || '');
  const headers = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    headers['X-API-KEY'] = apiKey;
    if (!authHeader) headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }
  if (authHeader) headers.Authorization = authHeader;

  const fetchMaintainerrJson = async (baseUrl, path, query = {}) => {
    const url = buildAppApiUrl(baseUrl, path);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (err) {
        payload = {};
      }
      if (!response.ok) {
        const message = String(payload?.message || payload?.error || '').trim();
        throw new Error(message || `Maintainerr request failed (${response.status}).`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };

  const mediaFilterRaw = String(req.query?.media || 'all').trim().toLowerCase();
  const mediaFilter = mediaFilterRaw === 'movie' || mediaFilterRaw === 'show' ? mediaFilterRaw : 'all';
  const requestedLimitRaw = String(req.query?.limit || '').trim().toLowerCase();
  const maxCap = kind === 'library-media' ? 8000 : 1200;
  let itemLimit = kind === 'library-media' ? 2000 : 200;
  if (requestedLimitRaw === 'all') {
    itemLimit = maxCap;
  } else if (requestedLimitRaw) {
    const parsed = Number(requestedLimitRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      itemLimit = Math.min(maxCap, Math.max(1, Math.round(parsed)));
    }
  }

  let lastError = '';
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const baseUrl = candidates[candidateIndex];
    if (!baseUrl) continue;
    try {
      if (kind === 'rules') {
        const payload = await fetchMaintainerrJson(baseUrl, 'api/rules');
        const list = Array.isArray(payload)
          ? payload
          : (Array.isArray(payload?.items) ? payload.items : []);
        let items = list.map((entry) => mapMaintainerrRuleItem(entry)).filter((entry) => Boolean(entry?.id));
        if (mediaFilter !== 'all') {
          items = items.filter((entry) => String(entry?.kind || '').toLowerCase() === mediaFilter);
        }
        items = items.sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')));
        return res.json({ items: items.slice(0, itemLimit) });
      }

      if (kind === 'library-media') {
        const librariesPayload = await fetchMaintainerrJson(baseUrl, 'api/plex/libraries');
        const librariesList = Array.isArray(librariesPayload)
          ? librariesPayload
          : (Array.isArray(librariesPayload?.items) ? librariesPayload.items : []);
        const libraries = librariesList
          .map((library) => {
            const libraryId = parseFiniteNumber(library?.id || library?.key || library?.librarySectionID, 0);
            const mediaKind = normalizeMaintainerrMediaKind(library?.type, '');
            if (!libraryId || !['movie', 'show'].includes(mediaKind)) return null;
            return {
              id: libraryId,
              title: pickFirstNonEmpty([library?.title, `Library ${libraryId}`]),
              kind: mediaKind,
            };
          })
          .filter(Boolean)
          .filter((library) => mediaFilter === 'all' || library.kind === mediaFilter);

        const perPage = Math.max(50, Math.min(500, parseFiniteNumber(req.query?.pageSize || 200, 200)));
        const maxPages = Math.max(1, Math.min(100, parseFiniteNumber(req.query?.maxPages || 50, 50)));
        const items = [];

        for (let libraryIndex = 0; libraryIndex < libraries.length; libraryIndex += 1) {
          const library = libraries[libraryIndex];
          let page = 1;
          let loaded = 0;
          let expectedTotal = Number.POSITIVE_INFINITY;
          while (
            items.length < itemLimit
            && page <= maxPages
            && loaded < expectedTotal
          ) {
            const pagePayload = await fetchMaintainerrJson(baseUrl, `api/plex/library/${library.id}/content/${page}`, {
              amount: perPage,
            });
            const pageItems = Array.isArray(pagePayload?.items)
              ? pagePayload.items
              : (Array.isArray(pagePayload) ? pagePayload : []);
            if (!pageItems.length) break;
            expectedTotal = Math.max(loaded + pageItems.length, parseFiniteNumber(pagePayload?.totalSize, loaded + pageItems.length));
            pageItems.forEach((entry) => {
              const mapped = mapMaintainerrLibraryItem(entry, {
                baseUrl,
                libraryId: library.id,
                libraryTitle: library.title,
                libraryType: library.kind,
              });
              if (mediaFilter !== 'all' && mapped.kind !== mediaFilter) return;
              items.push(mapped);
            });
            loaded += pageItems.length;
            page += 1;
            if (items.length >= itemLimit) break;
          }
          if (items.length >= itemLimit) break;
        }

        const ordered = items
          .sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || '')));
        return res.json({
          libraries,
          items: ordered.slice(0, itemLimit),
        });
      }

      const collectionsPayload = await fetchMaintainerrJson(baseUrl, 'api/collections');
      const collectionList = Array.isArray(collectionsPayload)
        ? collectionsPayload
        : (Array.isArray(collectionsPayload?.items) ? collectionsPayload.items : []);
      const collections = collectionList
        .map((entry) => {
          const collectionId = parseFiniteNumber(entry?.id, 0);
          const kind = normalizeMaintainerrMediaKind(entry?.type, '');
          if (!collectionId || !['movie', 'show'].includes(kind)) return null;
          return {
            id: collectionId,
            title: pickFirstNonEmpty([entry?.title, `Collection ${collectionId}`]),
            kind,
            isActive: entry?.isActive !== false,
            mediaCount: Array.isArray(entry?.media) ? entry.media.length : 0,
          };
        })
        .filter(Boolean)
        .filter((entry) => mediaFilter === 'all' || entry.kind === mediaFilter);

      const selectedRaw = String(req.query?.collectionIds || req.query?.collectionId || 'all').trim().toLowerCase();
      let selectedCollectionIds = [];
      if (!selectedRaw || selectedRaw === 'all') {
        selectedCollectionIds = collections.map((entry) => entry.id);
      } else {
        selectedCollectionIds = selectedRaw
          .split(',')
          .map((value) => parseFiniteNumber(value, 0))
          .filter((value) => value > 0)
          .filter((value, index, array) => array.indexOf(value) === index);
      }
      if (!selectedCollectionIds.length) selectedCollectionIds = collections.map((entry) => entry.id);
      selectedCollectionIds = selectedCollectionIds.filter((value) => collections.some((entry) => entry.id === value));

      const perCollectionSize = Math.max(
        20,
        Math.min(
          250,
          parseFiniteNumber(
            req.query?.collectionSize,
            Math.ceil(itemLimit / Math.max(1, selectedCollectionIds.length)) + 25
          )
        )
      );
      const combined = [];
      for (let index = 0; index < selectedCollectionIds.length; index += 1) {
        const collectionId = selectedCollectionIds[index];
        const collection = collections.find((entry) => entry.id === collectionId);
        if (!collection) continue;
        const mediaPayload = await fetchMaintainerrJson(baseUrl, `api/collections/media/${collectionId}/content/1`, {
          size: perCollectionSize,
        });
        const list = Array.isArray(mediaPayload?.items)
          ? mediaPayload.items
          : (Array.isArray(mediaPayload) ? mediaPayload : []);
        list.forEach((entry) => {
          const mapped = mapMaintainerrCollectionMediaItem(entry, {
            baseUrl,
            collectionId,
            collectionTitle: collection.title,
            type: collection.kind,
          });
          if (mediaFilter !== 'all' && mapped.kind !== mediaFilter) return;
          combined.push(mapped);
        });
      }

      const ordered = combined
        .sort((left, right) => parseFiniteNumber(right?.sortTs, 0) - parseFiniteNumber(left?.sortTs, 0));
      return res.json({
        collections,
        selectedCollectionIds,
        items: ordered.slice(0, itemLimit),
      });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Maintainerr via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to fetch Maintainerr data.' });
});

app.post('/api/maintainerr/rules/:id/execute', requireUser, async (req, res) => {
  const ruleId = parseFiniteNumber(req.params.id, 0);
  if (!ruleId) return res.status(400).json({ error: 'Invalid rule id.' });

  const config = loadConfig();
  const apps = config.apps || [];
  const maintainerrApp = apps.find((appItem) => normalizeAppId(appItem?.id) === 'maintainerr');
  if (!maintainerrApp) return res.status(404).json({ error: 'Maintainerr app is not configured.' });
  if (!canAccessDashboardApp(config, maintainerrApp, getEffectiveRole(req))) {
    return res.status(403).json({ error: 'Maintainerr dashboard access denied.' });
  }

  const candidates = resolveAppApiCandidates(maintainerrApp, req);
  if (!candidates.length) return res.status(400).json({ error: 'Missing Maintainerr URL.' });

  const apiKey = String(maintainerrApp.apiKey || '').trim();
  const authHeader = buildBasicAuthHeader(maintainerrApp.username || '', maintainerrApp.password || '');
  const headers = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    headers['X-API-KEY'] = apiKey;
    if (!authHeader) headers.Authorization = /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }
  if (authHeader) headers.Authorization = authHeader;

  let lastError = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      const url = buildAppApiUrl(baseUrl, `api/rules/${ruleId}/execute`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (err) {
        payload = {};
      }
      if (!response.ok) {
        const message = String(payload?.message || payload?.error || '').trim();
        if ([400, 404, 409].includes(response.status)) {
          return res.status(response.status).json({ error: message || `Rule execute failed (${response.status}).` });
        }
        lastError = message || `Rule execute failed (${response.status}) via ${baseUrl}.`;
        continue;
      }
      return res.json({ ok: true, id: ruleId, status: response.status });
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach Maintainerr via ${baseUrl}.`;
    }
  }

  return res.status(502).json({ error: lastError || 'Failed to execute Maintainerr rule.' });
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

  const endpointPlans = kind === 'consoles'
    ? [
      { path: 'api/platforms' },
      { path: 'api/v1/platforms' },
      { path: 'api/consoles' },
      { path: 'api/v1/consoles' },
      { path: 'api/systems' },
      { path: 'api/v1/systems' },
    ]
    : [
      { path: 'api/games/recent', query: { limit: '200' } },
      { path: 'api/v1/games/recent', query: { limit: '200' } },
      { path: 'api/games/recently-added', query: { limit: '200' } },
      { path: 'api/v1/games/recently-added', query: { limit: '200' } },
      { path: 'api/roms/recent', query: { limit: '200' } },
      { path: 'api/roms/recently-added', query: { limit: '200' } },
      { path: 'api/roms', query: { order_by: 'id', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: '200' } },
      { path: 'api/roms', query: { order_by: 'updated_at', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: '200' } },
      { path: 'api/roms', query: { order_by: 'created_at', order_dir: 'desc', with_char_index: 'false', with_filter_values: 'false', limit: '200' } },
      { path: 'api/roms', query: { sort: 'created_at', order: 'desc', limit: '200' } },
      { path: 'api/v1/roms', query: { sort: 'created_at', order: 'desc', limit: '200' } },
    ];

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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let response;
        try {
          response = await fetch(url.toString(), {
            headers,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
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
            .sort((leftEntry, rightEntry) => Number(leftEntry?.sourceIndex || 0) - Number(rightEntry?.sourceIndex || 0))
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

function buildBasicAuthHeader(username, password) {
  const user = String(username || '');
  const pass = String(password || '');
  if (!user && !pass) return '';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function buildAppApiUrl(baseUrl, suffixPath) {
  const url = new URL(baseUrl);
  const suffix = String(suffixPath || '').trim().replace(/^\/+/, '');
  const basePath = String(url.pathname || '/').replace(/\/+$/, '');
  const joined = `${basePath}/${suffix}`.replace(/\/{2,}/g, '/');
  url.pathname = joined.startsWith('/') ? joined : `/${joined}`;
  return url;
}

async function fetchTransmissionQueue(baseUrl, authHeader) {
  const rpcUrl = buildAppApiUrl(baseUrl, 'transmission/rpc');
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
  const rpcUrl = buildAppApiUrl(baseUrl, 'jsonrpc');
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

async function fetchQbittorrentQueue(baseUrl, username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  let cookieHeader = '';

  if (user || pass) {
    const loginUrl = buildAppApiUrl(baseUrl, 'api/v2/auth/login');
    const loginPayload = new URLSearchParams({
      username: user,
      password: pass,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(loginUrl.toString(), {
        method: 'POST',
        headers: {
          Accept: 'text/plain',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: loginPayload.toString(),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok || !/^ok\.?$/i.test(String(text || '').trim())) {
        return { error: `qBittorrent authentication failed (${response.status}).` };
      }
      const setCookie = String(response.headers.get('set-cookie') || '').trim();
      const firstCookie = setCookie.split(';')[0].trim();
      if (firstCookie) cookieHeader = firstCookie;
    } catch (err) {
      return { error: safeMessage(err) || 'Failed to authenticate with qBittorrent.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  const infoUrl = buildAppApiUrl(baseUrl, 'api/v2/torrents/info');
  const headers = { Accept: 'application/json' };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(infoUrl.toString(), {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { error: `qBittorrent request failed (${response.status}).` };
    }
    const parsed = text ? JSON.parse(text) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return { items: list };
  } catch (err) {
    return { error: safeMessage(err) || 'Failed to reach qBittorrent.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSabnzbdQueue(baseUrl, apiKey, authHeader) {
  const queueUrl = buildAppApiUrl(baseUrl, 'api');
  queueUrl.searchParams.set('mode', 'queue');
  queueUrl.searchParams.set('output', 'json');
  if (apiKey) queueUrl.searchParams.set('apikey', apiKey);

  const headers = { Accept: 'application/json' };
  if (authHeader) headers.Authorization = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(queueUrl.toString(), {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { error: `SABnzbd request failed (${response.status}).` };
    }
    const parsed = text ? JSON.parse(text) : {};
    const slots = parsed?.queue?.slots;
    const list = Array.isArray(slots) ? slots : [];
    return { items: list };
  } catch (err) {
    return { error: safeMessage(err) || 'Failed to reach SABnzbd.' };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/downloaders/:appId/queue', requireUser, async (req, res) => {
  const requestedAppId = normalizeAppId(req.params.appId || '');
  const baseId = getAppBaseId(requestedAppId);
  if (!requestedAppId || !DOWNLOADER_APP_IDS.includes(baseId)) {
    return res.status(400).json({ error: 'Unsupported downloader app.' });
  }

  const config = loadConfig();
  const apps = config.apps || [];
  const appItem = apps.find((item) => normalizeAppId(item?.id) === requestedAppId);
  if (!appItem) return res.status(404).json({ error: `${requestedAppId} is not configured.` });
  if (!canAccessDashboardApp(config, appItem, getEffectiveRole(req))) {
    return res.status(403).json({ error: `${appItem.name || requestedAppId} dashboard access denied.` });
  }

  const candidates = uniqueList([
    normalizeBaseUrl(appItem.remoteUrl || ''),
    normalizeBaseUrl(resolveLaunchUrl(appItem, req)),
    normalizeBaseUrl(appItem.localUrl || ''),
    normalizeBaseUrl(appItem.url || ''),
  ]);
  if (!candidates.length) return res.status(400).json({ error: `Missing ${appItem.name || requestedAppId} URL.` });

  const authHeader = buildBasicAuthHeader(appItem.username || '', appItem.password || '');
  const apiKey = String(appItem.apiKey || '').trim();
  let lastError = '';

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    if (!baseUrl) continue;
    try {
      let result;
      if (baseId === 'transmission') {
        result = await fetchTransmissionQueue(baseUrl, authHeader);
      } else if (baseId === 'nzbget') {
        result = await fetchNzbgetQueue(baseUrl, authHeader);
      } else if (baseId === 'qbittorrent') {
        result = await fetchQbittorrentQueue(baseUrl, appItem.username || '', appItem.password || '');
      } else {
        result = await fetchSabnzbdQueue(baseUrl, apiKey, authHeader);
      }
      if (result.items) {
        pushLog({
          level: 'info',
          app: requestedAppId,
          action: 'downloader.queue',
          message: `${appItem.name || requestedAppId} queue response received.`,
        });
        return res.json({ items: result.items });
      }
      lastError = result.error || `Failed to reach ${appItem.name || requestedAppId}.`;
    } catch (err) {
      lastError = safeMessage(err) || `Failed to reach ${appItem.name || requestedAppId}.`;
    }
  }

  pushLog({
    level: 'error',
    app: requestedAppId,
    action: 'downloader.queue',
    message: lastError || `Failed to reach ${appItem.name || requestedAppId}.`,
  });
  return res.status(502).json({ error: lastError || `Failed to reach ${appItem.name || requestedAppId}.` });
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
  if (!isAppInSet(appId, ARR_APP_IDS)) {
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
  if (!canAccessDashboardApp(config, arrApp, getEffectiveRole(req))) {
    return reject(403, `${arrApp.name || appId} dashboard access denied.`, {
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
    const upstreamUrl = buildAppApiUrl(baseUrl, `api/${version}/${pathSuffix}`);
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
  if (!canAccessDashboardApp(config, appItem, getEffectiveRole(req))) {
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

function buildReleaseNotesUrl(versionTag) {
  const normalized = normalizeVersionTag(versionTag);
  if (!normalized) return '';
  return `${RELEASE_NOTES_BASE_URL}${encodeURIComponent(normalized)}`;
}

function stripMarkdownInline(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

function loadReleaseHighlights(versionTag, options = {}) {
  const normalized = normalizeVersionTag(versionTag);
  if (!normalized) return [];
  const maxItemsRaw = Number(options.maxItems);
  const maxItems = Number.isFinite(maxItemsRaw) ? Math.max(1, Math.min(20, maxItemsRaw)) : RELEASE_HIGHLIGHT_LIMIT;
  const sectionSet = new Set(RELEASE_HIGHLIGHT_SECTIONS.map((section) => section.toLowerCase()));
  const releaseFilePath = path.join(RELEASE_NOTES_DIR, `${normalized}.md`);
  if (!fs.existsSync(releaseFilePath)) return [];
  try {
    const raw = fs.readFileSync(releaseFilePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    let activeSection = '';
    const highlights = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = String(lines[index] || '');
      const sectionMatch = line.match(/^###\s+(.+?)\s*$/);
      if (sectionMatch) {
        const heading = String(sectionMatch[1] || '').trim();
        const key = heading.toLowerCase();
        activeSection = sectionSet.has(key) ? heading : '';
        continue;
      }
      if (/^##\s+/.test(line)) {
        activeSection = '';
        continue;
      }
      if (!activeSection) continue;
      const bulletMatch = line.match(/^\s*-\s+(.+?)\s*$/);
      if (!bulletMatch) continue;
      const bulletText = stripMarkdownInline(bulletMatch[1]);
      if (!bulletText) continue;
      highlights.push(`${activeSection}: ${bulletText}`);
      if (highlights.length >= maxItems) break;
    }
    return highlights;
  } catch (err) {
    return [];
  }
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

function loadSettingsReleases(options = {}) {
  const limitRaw = Number(options.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(30, Math.floor(limitRaw)))
    : 12;
  const currentVersion = normalizeVersionTag(options.currentVersion || '');
  let filenames = [];
  try {
    filenames = fs.readdirSync(RELEASE_NOTES_DIR);
  } catch (err) {
    return [];
  }
  const releases = filenames
    .filter((filename) => /^v\d+\.\d+\.\d+\.md$/i.test(String(filename || '').trim()))
    .map((filename) => {
      const tag = normalizeVersionTag(String(filename || '').replace(/\.md$/i, ''));
      const semver = parseSemver(tag);
      if (!semver) return null;
      const fullPath = path.join(RELEASE_NOTES_DIR, filename);
      let publishedAt = '';
      try {
        const stats = fs.statSync(fullPath);
        publishedAt = stats?.mtime ? stats.mtime.toISOString() : '';
      } catch (err) {
        publishedAt = '';
      }
      const highlights = loadReleaseHighlights(tag, { maxItems: 3 });
      const primaryHighlight = String(highlights[0] || '').trim();
      const summary = primaryHighlight
        ? primaryHighlight.replace(/^[A-Za-z][A-Za-z\s]+:\s*/, '').trim()
        : 'Release notes are available.';
      return {
        tag,
        semver,
        publishedAt,
        releaseNotesUrl: buildReleaseNotesUrl(tag),
        summary,
        highlights,
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareSemver(right.semver, left.semver))
    .slice(0, limit)
    .map((entry, index) => ({
      tag: entry.tag,
      publishedAt: entry.publishedAt,
      releaseNotesUrl: entry.releaseNotesUrl,
      summary: entry.summary,
      highlights: entry.highlights,
      isLatest: index === 0,
      isCurrent: Boolean(currentVersion && entry.tag === currentVersion),
    }));
  return releases;
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
      if (appItem?.removed) return null;
      const baseId = getAppBaseId(appItem?.id);
      const supportsInstances = supportsAppInstances(baseId);
      const instanceName = supportsInstances ? String(appItem?.instanceName || '').trim() : '';
      const resolvedName = supportsInstances
        ? (instanceName || String(appItem?.name || '').trim() || getDefaultInstanceName(baseId, appItem?.id))
        : (String(appItem?.name || '').trim() || getBaseAppTitle(baseId));
      const resolvedIcon = resolvePersistedAppIconPath(appItem);
      const access = getMenuAccess(appItem, role);
      const sidebarOverviewAccess = canAccessSidebarOverview(appItem, role);
      const sidebarSettingsAccess = canAccessSidebarSettings(appItem, role);
      const sidebarActivityAccess = canAccessSidebarActivity(appItem, role);
      const menuAccess = {
        ...access,
        overview: sidebarOverviewAccess && access.overview,
        settings: sidebarSettingsAccess && access.settings && !generalSettings.hideSidebarAppSettingsLink,
        activity: sidebarActivityAccess
          && sidebarOverviewAccess
          && access.overview
          && role === 'admin'
          && !generalSettings.hideSidebarActivityLink,
      };
      return {
        ...appItem,
        name: resolvedName,
        icon: resolvedIcon,
        launchMode: resolveAppLaunchMode(appItem, normalizeMenu(appItem)),
        effectiveLaunchMode: resolveEffectiveLaunchMode(appItem, req),
        menuAccess,
      };
    })
    .filter((appItem) => appItem && appItem.menuAccess.sidebar && hasAnyMenuAccess(appItem.menuAccess))
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

function buildNavCategories(navApps, categoryEntries, role = 'user') {
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
    const sidebarMinRole = normalizeVisibilityRole(
      entry?.sidebarMinRole,
      entry?.sidebarMenu ? 'user' : 'disabled'
    );
    const shouldGroup = roleMeetsMinRole(role, sidebarMinRole);
    const filteredApps = shouldGroup ? apps : apps.filter((appItem) => !isFavourite(appItem));
    if (!filteredApps.length) return;
    result.push({
      name: entry.name,
      sidebarMenu: shouldGroup,
      sidebarMinRole,
      icon: entry.icon || defaultIcon,
      apps: filteredApps,
    });
  });
  grouped.forEach((apps, name) => {
    if (!apps.length) return;
    if (seen.has(name.toLowerCase())) return;
    result.push({ name, sidebarMenu: false, sidebarMinRole: 'disabled', icon: defaultIcon, apps });
  });
  const favourites = (Array.isArray(navApps) ? navApps : [])
    .filter(isFavourite)
    .map((appItem) => ({ ...appItem, navFavourite: true }));
  if (favourites.length) {
    result.unshift({
      name: 'Favourites',
      sidebarMenu: false,
      sidebarMinRole: 'disabled',
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

function parseVisibilityRole(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'coadmin' || raw === 'co_admin') return 'co-admin';
  return VISIBILITY_ROLE_ORDER.includes(raw) ? raw : '';
}

function normalizeVisibilityRole(value, fallback = 'disabled') {
  const parsed = parseVisibilityRole(value);
  if (parsed) return parsed;
  const fallbackParsed = parseVisibilityRole(fallback);
  return fallbackParsed || 'disabled';
}

function roleMeetsMinRole(role, minRole) {
  const roleKey = parseVisibilityRole(role);
  const minRoleKey = normalizeVisibilityRole(minRole, 'disabled');
  if (!roleKey || minRoleKey === 'disabled') return false;
  const roleRank = VISIBILITY_ROLE_RANK[roleKey];
  const minRoleRank = VISIBILITY_ROLE_RANK[minRoleKey];
  if (!Number.isFinite(roleRank) || !Number.isFinite(minRoleRank) || minRoleRank < 0) return false;
  return roleRank >= minRoleRank;
}

function deriveSectionMinRoleFromLegacy(sectionName, section) {
  const userAllowed = Boolean(section?.user);
  const adminAllowed = Boolean(section?.admin);
  if (userAllowed) return 'user';
  if (adminAllowed) return sectionName === 'settings' ? 'admin' : 'co-admin';
  return 'disabled';
}

function normalizeMenuSection(sectionName, rawSection, fallbackRole = 'disabled') {
  const hasSectionObject = Boolean(rawSection && typeof rawSection === 'object');
  const source = hasSectionObject ? rawSection : {};
  const explicitMinRole = parseVisibilityRole(source.minRole);
  const legacyMinRole = hasSectionObject ? deriveSectionMinRoleFromLegacy(sectionName, source) : '';
  const resolvedMinRole = explicitMinRole || legacyMinRole || normalizeVisibilityRole(fallbackRole, 'disabled');
  const minRole = normalizeVisibilityRole(resolvedMinRole, fallbackRole);
  return {
    ...source,
    minRole,
    user: roleMeetsMinRole('user', minRole),
    admin: roleMeetsMinRole('admin', minRole),
  };
}

function deriveSidebarMinRole(rawSidebar, sectionRoles) {
  const source = rawSidebar && typeof rawSidebar === 'object' ? rawSidebar : {};
  const explicit = parseVisibilityRole(source.minRole);
  if (explicit) return explicit;
  const enabledRoles = (Array.isArray(sectionRoles) ? sectionRoles : [])
    .map((value) => normalizeVisibilityRole(value, 'disabled'))
    .filter((value) => value !== 'disabled');
  if (!enabledRoles.length) return 'disabled';
  return enabledRoles.reduce((lowest, nextRole) => {
    const lowestRank = VISIBILITY_ROLE_RANK[normalizeVisibilityRole(lowest, 'disabled')];
    const nextRank = VISIBILITY_ROLE_RANK[normalizeVisibilityRole(nextRole, 'disabled')];
    return nextRank < lowestRank ? nextRole : lowest;
  }, enabledRoles[0]);
}

function buildMenuAccessConfig({
  sidebar = 'disabled',
  sidebarOverview = 'disabled',
  sidebarSettings = '',
  sidebarActivity = '',
  overview = 'disabled',
  launch = 'disabled',
  settings = 'disabled',
} = {}) {
  const overviewRole = normalizeVisibilityRole(overview, 'disabled');
  const launchRole = normalizeVisibilityRole(launch, 'disabled');
  const settingsRole = normalizeVisibilityRole(settings, 'disabled');
  const sidebarOverviewRole = normalizeVisibilityRole(sidebarOverview, overviewRole);
  const sidebarSettingsRole = normalizeVisibilityRole(sidebarSettings || settingsRole, settingsRole);
  const sidebarActivityRole = normalizeVisibilityRole(sidebarActivity || 'admin', 'admin');
  const sidebarRole = normalizeVisibilityRole(sidebar, deriveSidebarMinRole({}, [overviewRole, launchRole, settingsRole]));
  return {
    sidebar: { minRole: sidebarRole },
    sidebarOverview: { minRole: sidebarOverviewRole },
    sidebarSettings: { minRole: sidebarSettingsRole },
    sidebarActivity: { minRole: sidebarActivityRole },
    overview: {
      minRole: overviewRole,
      user: roleMeetsMinRole('user', overviewRole),
      admin: roleMeetsMinRole('admin', overviewRole),
    },
    launch: {
      minRole: launchRole,
      user: roleMeetsMinRole('user', launchRole),
      admin: roleMeetsMinRole('admin', launchRole),
    },
    settings: {
      minRole: settingsRole,
      user: roleMeetsMinRole('user', settingsRole),
      admin: roleMeetsMinRole('admin', settingsRole),
    },
  };
}

function canAccess(appItem, role, key) {
  const access = getMenuAccess(appItem, role);
  return Boolean(access && access[key]);
}

function canAccessSidebarOverview(appItem, role) {
  if (appItem?.removed) return false;
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const menu = normalizeMenu(appItem);
  return roleMeetsMinRole(roleKey, menu.sidebarOverview?.minRole);
}

function canAccessSidebarSettings(appItem, role) {
  if (appItem?.removed) return false;
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const menu = normalizeMenu(appItem);
  return roleMeetsMinRole(roleKey, menu.sidebarSettings?.minRole);
}

function canAccessSidebarActivity(appItem, role) {
  if (appItem?.removed) return false;
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const menu = normalizeMenu(appItem);
  return roleMeetsMinRole(roleKey, menu.sidebarActivity?.minRole);
}

function getMenuAccess(appItem, role) {
  if (appItem?.removed) {
    return {
      sidebar: false,
      overview: false,
      launch: false,
      settings: false,
    };
  }
  const menu = normalizeMenu(appItem);
  const launchMode = resolveAppLaunchMode(appItem, menu);
  const launchEnabled = launchMode !== 'disabled';
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) {
    return {
      sidebar: false,
      overview: false,
      launch: false,
      settings: false,
    };
  }
  return {
    sidebar: roleMeetsMinRole(roleKey, menu.sidebar?.minRole),
    overview: roleMeetsMinRole(roleKey, menu.overview?.minRole),
    launch: roleMeetsMinRole(roleKey, menu.launch?.minRole) && launchEnabled,
    settings: roleMeetsMinRole(roleKey, menu.settings?.minRole),
  };
}

function normalizeMenu(appItem) {
  if (appItem && appItem.menu) {
    const source = appItem.menu && typeof appItem.menu === 'object' ? appItem.menu : {};
    const overview = normalizeMenuSection('overview', source.overview, 'disabled');
    const launch = normalizeMenuSection('launch', source.launch, 'disabled');
    const settings = normalizeMenuSection('settings', source.settings, 'admin');
    const sidebarSource = source.sidebar && typeof source.sidebar === 'object' ? source.sidebar : {};
    const sidebarOverviewSource = source.sidebarOverview && typeof source.sidebarOverview === 'object'
      ? source.sidebarOverview
      : {};
    const sidebarSettingsSource = source.sidebarSettings && typeof source.sidebarSettings === 'object'
      ? source.sidebarSettings
      : {};
    const sidebarActivitySource = source.sidebarActivity && typeof source.sidebarActivity === 'object'
      ? source.sidebarActivity
      : {};
    const sidebar = {
      ...sidebarSource,
      minRole: normalizeVisibilityRole(
        sidebarSource.minRole,
        deriveSidebarMinRole(sidebarSource, [overview.minRole, launch.minRole, settings.minRole])
      ),
    };
    const sidebarOverview = {
      ...sidebarOverviewSource,
      minRole: normalizeVisibilityRole(sidebarOverviewSource.minRole, overview.minRole),
    };
    const sidebarSettings = {
      ...sidebarSettingsSource,
      minRole: normalizeVisibilityRole(sidebarSettingsSource.minRole, settings.minRole),
    };
    const sidebarActivity = {
      ...sidebarActivitySource,
      minRole: normalizeVisibilityRole(sidebarActivitySource.minRole, 'admin'),
    };
    if (!Boolean(appItem?.custom)) {
      const overviewRank = VISIBILITY_ROLE_RANK[normalizeVisibilityRole(overview.minRole, 'disabled')];
      const sidebarOverviewRank = VISIBILITY_ROLE_RANK[normalizeVisibilityRole(sidebarOverview.minRole, 'disabled')];
      if (sidebarOverviewRank >= 0 && (overviewRank < 0 || sidebarOverviewRank < overviewRank)) {
        overview.minRole = sidebarOverview.minRole;
        overview.user = roleMeetsMinRole('user', overview.minRole);
        overview.admin = roleMeetsMinRole('admin', overview.minRole);
      }
      // App settings route is admin-only; keep section access aligned for built-in apps.
      if (settings.minRole !== 'admin') {
        settings.minRole = 'admin';
        settings.user = false;
        settings.admin = true;
      }
    }
    return { overview, launch, settings, sidebar, sidebarOverview, sidebarSettings, sidebarActivity };
  }
  const roles = normalizeRoles(appItem);
  const allowUser = !roles.length || roles.includes('user') || roles.includes('both');
  const allowAdmin = !roles.length || roles.includes('admin') || roles.includes('both');
  const overviewRole = allowUser ? 'user' : (allowAdmin ? 'co-admin' : 'disabled');
  const launchRole = allowUser ? 'user' : (allowAdmin ? 'co-admin' : 'disabled');
  const settingsRole = allowAdmin ? 'admin' : 'disabled';
  return buildMenuAccessConfig({
    sidebar: deriveSidebarMinRole({}, [overviewRole, launchRole, settingsRole]),
    sidebarOverview: overviewRole,
    sidebarSettings: settingsRole,
    sidebarActivity: 'admin',
    overview: overviewRole,
    launch: launchRole,
    settings: settingsRole,
  });
}

function getOverviewElements(appItem) {
  if (!appItem) return [];
  return APP_OVERVIEW_ELEMENTS[getAppBaseId(appItem.id)] || [];
}

function buildDisabledMenuAccess() {
  return buildMenuAccessConfig({
    sidebar: 'disabled',
    sidebarOverview: 'disabled',
    sidebarSettings: 'disabled',
    sidebarActivity: 'disabled',
    overview: 'disabled',
    launch: 'disabled',
    settings: 'disabled',
  });
}

function buildDisabledOverviewElements(appItem) {
  const elements = getOverviewElements(appItem);
  return elements.map((element, index) => ({
    id: element.id,
    enable: false,
    dashboard: false,
    favourite: false,
    order: index + 1,
  }));
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
    let sidebarMinRole = '';
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
      sidebarMinRole = value.sidebarMinRole
        || value.sidebar_min_role
        || value.categorySidebarMinRole
        || value.visibilityRole
        || value.minRole
        || '';
      icon = value.icon || value.iconPath || value.iconUrl || value.icon_url || '';
    }
    const name = normalizeCategoryName(label);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    const normalizedSidebarMinRole = normalizeVisibilityRole(sidebarMinRole, sidebarMenu ? 'user' : 'disabled');
    entries.push({
      name,
      sidebarMenu: normalizedSidebarMinRole !== 'disabled',
      sidebarMinRole: normalizedSidebarMinRole,
      icon: String(icon || '').trim(),
    });
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
  if (key === 'requesters') return '/icons/requesters.png';
  if (key === 'manager') return '/icons/settings.svg';
  if (key === 'arr suite') return '/icons/app.svg';
  if (key === 'indexers') return '/icons/indexers.svg';
  if (key === 'downloaders') return '/icons/download.svg';
  if (key === 'tools') return '/icons/tools.svg';
  return DEFAULT_CATEGORY_ICON;
}

function resolveCategoryEntries(config, apps = [], options = {}) {
  const includeAppCategories = options.includeAppCategories !== false;
  const configured = normalizeCategoryEntries(config?.categories);
  const entries = configured.length
    ? [...configured]
    : DEFAULT_CATEGORY_ORDER.map((name) => ({ name, sidebarMenu: false, sidebarMinRole: 'disabled', icon: DEFAULT_CATEGORY_ICON }));
  if (!includeAppCategories) return entries;

  const seen = new Set(entries.map((entry) => entry.name.toLowerCase()));
  (Array.isArray(apps) ? apps : []).forEach((appItem) => {
    const category = normalizeCategoryName(appItem?.category);
    const key = category.toLowerCase();
    if (!category || seen.has(key)) return;
    seen.add(key);
    entries.push({ name: category, sidebarMenu: false, sidebarMinRole: 'disabled', icon: DEFAULT_CATEGORY_ICON });
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

function resolveOverviewElementVisibilityRole(appItem, elementSettings = {}, fallback = 'user') {
  const source = elementSettings && typeof elementSettings === 'object' ? elementSettings : {};
  const explicit = parseVisibilityRole(source.overviewVisibilityRole);
  if (explicit) return explicit;
  const legacyDashboardRole = parseVisibilityRole(source.dashboardVisibilityRole);
  const isEnabled = source.enable === undefined ? true : Boolean(source.enable);
  if (!isEnabled) return 'disabled';
  if (legacyDashboardRole) return legacyDashboardRole;
  const menu = normalizeMenu(appItem);
  return normalizeVisibilityRole(menu?.overview?.minRole || fallback, fallback);
}

function resolveDashboardElementVisibilityRole(appItem, elementSettings = {}, fallback = 'user') {
  const source = elementSettings && typeof elementSettings === 'object' ? elementSettings : {};
  const explicit = parseVisibilityRole(source.dashboardVisibilityRole);
  if (explicit) return explicit;
  const isOnDashboard = source.dashboard === undefined
    ? (source.enable === undefined ? true : Boolean(source.enable))
    : Boolean(source.dashboard);
  if (!isOnDashboard) return 'disabled';
  const menu = normalizeMenu(appItem);
  return normalizeVisibilityRole(menu?.overview?.minRole || fallback, fallback);
}

function canAccessOverviewElement(appItem, elementSettings, role) {
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const minRole = resolveOverviewElementVisibilityRole(appItem, elementSettings, 'user');
  return roleMeetsMinRole(roleKey, minRole);
}

function canAccessDashboardElement(appItem, elementSettings, role) {
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const minRole = resolveDashboardElementVisibilityRole(appItem, elementSettings, 'user');
  return roleMeetsMinRole(roleKey, minRole);
}

function canAccessAnyDashboardElement(appItem, role) {
  if (appItem?.removed) return false;
  return mergeOverviewElementSettings(appItem).some((element) =>
    canAccessDashboardElement(appItem, element, role)
  );
}

function resolveCombinedDashboardVisibilityRole(settings, fallback = 'user') {
  const source = settings && typeof settings === 'object' ? settings : {};
  const explicit = parseVisibilityRole(source.visibilityRole);
  if (explicit) return explicit;
  const isEnabled = source.enable === undefined ? true : Boolean(source.enable);
  const isOnDashboard = source.dashboard === undefined ? true : Boolean(source.dashboard);
  if (!isEnabled || !isOnDashboard) return 'disabled';
  return normalizeVisibilityRole(fallback, 'user');
}

function canAccessCombinedDashboardVisibility(settings, role, fallback = 'user') {
  const roleKey = parseVisibilityRole(role);
  if (!roleKey) return false;
  const minRole = resolveCombinedDashboardVisibilityRole(settings, fallback);
  return roleMeetsMinRole(roleKey, minRole);
}

function resolveCombinedSourceSelectionIds(appIds = [], sectionMap = {}) {
  const normalizedIds = [...new Set(
    (Array.isArray(appIds) ? appIds : [])
      .map((id) => normalizeAppId(id))
      .filter(Boolean)
  )];
  if (!normalizedIds.length) return [];
  const source = sectionMap && typeof sectionMap === 'object' ? sectionMap : {};
  const selectedIds = normalizedIds.filter((id) => Boolean(source[id]));
  return selectedIds.length ? selectedIds : normalizedIds;
}

function canAccessDashboardAppViaCombined(config, appItem, role) {
  if (appItem?.removed) return false;
  const appId = normalizeAppId(appItem?.id);
  if (!appId) return false;
  const apps = Array.isArray(config?.apps) ? config.apps : [];
  const dashboardRemovedElements = (config && typeof config.dashboardRemovedElements === 'object' && config.dashboardRemovedElements)
    ? config.dashboardRemovedElements
    : {};
  const dashboardCombinedSettings = (config && typeof config.dashboardCombinedSettings === 'object' && config.dashboardCombinedSettings)
    ? config.dashboardCombinedSettings
    : {};

  if (isAppInSet(appId, ARR_APP_IDS)) {
    const arrApps = apps.filter((entry) => !entry?.removed && isAppInSet(entry?.id, ARR_APP_IDS));
    const arrAppIds = arrApps.map((entry) => normalizeAppId(entry.id)).filter(Boolean);
    const arrCombineMap = resolveArrDashboardCombineSettings(config, apps);
    for (let index = 0; index < ARR_COMBINE_SECTIONS.length; index += 1) {
      const section = ARR_COMBINE_SECTIONS[index];
      const combinedKey = `combined:arr:${section.key}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = resolveCombinedSourceSelectionIds(arrAppIds, arrCombineMap?.[section.key]);
      if (selectedIds.includes(appId)) return true;
    }
    const arrCustomCards = resolveArrDashboardCombinedCards(config, apps);
    for (let index = 0; index < arrCustomCards.length; index += 1) {
      const card = arrCustomCards[index];
      const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
      const combinedKey = `combined:arrcustom:${customToken}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = [...new Set(
        (Array.isArray(card?.appIds) ? card.appIds : [])
          .map((id) => normalizeAppId(id))
          .filter(Boolean)
      )];
      if (selectedIds.includes(appId)) return true;
    }
  }

  if (isAppInSet(appId, DOWNLOADER_APP_IDS)) {
    const downloaderApps = apps.filter((entry) => !entry?.removed && isAppInSet(entry?.id, DOWNLOADER_APP_IDS));
    const downloaderAppIds = downloaderApps.map((entry) => normalizeAppId(entry.id)).filter(Boolean);
    const downloaderCombineMap = resolveDownloaderDashboardCombineSettings(config, apps);
    for (let index = 0; index < DOWNLOADER_COMBINE_SECTIONS.length; index += 1) {
      const section = DOWNLOADER_COMBINE_SECTIONS[index];
      const combinedKey = `combined:downloader:${section.key}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = resolveCombinedSourceSelectionIds(downloaderAppIds, downloaderCombineMap?.[section.key]);
      if (selectedIds.includes(appId)) return true;
    }
    const downloaderCustomCards = resolveDownloaderDashboardCards(config, apps);
    for (let index = 0; index < downloaderCustomCards.length; index += 1) {
      const card = downloaderCustomCards[index];
      const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
      const combinedKey = `combined:downloadercustom:${customToken}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = [...new Set(
        (Array.isArray(card?.appIds) ? card.appIds : [])
          .map((id) => normalizeAppId(id))
          .filter(Boolean)
      )];
      if (selectedIds.includes(appId)) return true;
    }
  }

  if (isAppInSet(appId, MEDIA_APP_IDS)) {
    const mediaApps = apps.filter((entry) => !entry?.removed && isAppInSet(entry?.id, MEDIA_APP_IDS));
    const mediaAppIds = mediaApps.map((entry) => normalizeAppId(entry.id)).filter(Boolean);
    const mediaCombineMap = resolveMediaDashboardCombineSettings(config, apps);
    for (let index = 0; index < MEDIA_COMBINE_SECTIONS.length; index += 1) {
      const section = MEDIA_COMBINE_SECTIONS[index];
      const combinedKey = `combined:media:${section.key}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = resolveCombinedSourceSelectionIds(mediaAppIds, mediaCombineMap?.[section.key]);
      if (selectedIds.includes(appId)) return true;
    }
    const mediaCustomCards = resolveMediaDashboardCards(config, apps);
    for (let index = 0; index < mediaCustomCards.length; index += 1) {
      const card = mediaCustomCards[index];
      const customToken = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
      const combinedKey = `combined:mediacustom:${customToken}`;
      if (dashboardRemovedElements[combinedKey]) continue;
      if (!canAccessCombinedDashboardVisibility(dashboardCombinedSettings[combinedKey], role, 'user')) continue;
      const selectedIds = [...new Set(
        (Array.isArray(card?.appIds) ? card.appIds : [])
          .map((id) => normalizeAppId(id))
          .filter(Boolean)
      )];
      if (selectedIds.includes(appId)) return true;
    }
  }

  return false;
}

function canAccessDashboardApp(config, appItem, role) {
  if (!appItem || appItem?.removed) return false;
  if (canAccess(appItem, role, 'overview')) return true;
  if (canAccessAnyDashboardElement(appItem, role)) return true;
  return canAccessDashboardAppViaCombined(config, appItem, role);
}

function resolveTableVisibleRows(elementId, rawValue, fallbackValue = undefined) {
  const id = String(elementId || '').trim().toLowerCase();
  const isIndexerSearch = id === 'search';
  const minRows = 5;
  const maxRows = isIndexerSearch ? 100 : 50;
  const defaultRows = isIndexerSearch ? 25 : 10;
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) {
    return Math.max(minRows, Math.min(maxRows, parsed));
  }
  const parsedFallback = Number(fallbackValue);
  if (Number.isFinite(parsedFallback)) {
    return Math.max(minRows, Math.min(maxRows, parsedFallback));
  }
  return defaultRows;
}

function normalizeTautulliStatsView(value, fallback = 'list') {
  const normalizedFallback = String(fallback || '').trim().toLowerCase() === 'wheel' ? 'wheel' : 'list';
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'wheel') return 'wheel';
  if (raw === 'list') return 'list';
  if (raw === 'watch-stats-wheel' || raw === 'wheel-view') return 'wheel';
  return normalizedFallback;
}

function resolveTautulliStatsView(appItem, elementSettings = {}, fallback = 'list') {
  if (normalizeAppId(appItem?.id) !== 'tautulli') return undefined;
  const elementId = String(elementSettings?.id || '').trim();
  if (elementId === 'watch-stats-wheel') return 'wheel';
  return normalizeTautulliStatsView(elementSettings?.tautulliStatsView, fallback);
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
    const overviewVisibilityRole = resolveOverviewElementVisibilityRole(appItem, savedItem, 'user');
    const dashboardVisibilityRole = resolveDashboardElementVisibilityRole(appItem, savedItem, 'user');
    const overviewVisible = overviewVisibilityRole !== 'disabled';
    const dashboardVisible = dashboardVisibilityRole !== 'disabled';
    const queueVisibleRows = resolveTableVisibleRows(element.id, savedItem.queueVisibleRows);
    const queueLabels = resolveQueueColumnLabels(appItem);
    const legacyTautulliWheel = savedMap.get('watch-stats-wheel') || {};
    const tautulliViewFallback = (() => {
      if (normalizeAppId(appItem?.id) !== 'tautulli' || element.id !== 'watch-stats') return 'list';
      const wheelOverviewRole = resolveOverviewElementVisibilityRole(appItem, legacyTautulliWheel, 'disabled');
      const wheelDashboardRole = resolveDashboardElementVisibilityRole(appItem, legacyTautulliWheel, 'disabled');
      return (wheelOverviewRole !== 'disabled' || wheelDashboardRole !== 'disabled') ? 'wheel' : 'list';
    })();
    const tautulliStatsView = resolveTautulliStatsView(appItem, savedItem, tautulliViewFallback);
    return {
      id: element.id,
      name: element.name,
      enable: resolveBoolean(savedItem.enable, overviewVisible),
      dashboard: resolveBoolean(savedItem.dashboard, dashboardVisible),
      overviewVisibilityRole,
      dashboardVisibilityRole,
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
      tautulliStatsView,
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
  const existingSettings = new Map(
    mergeOverviewElementSettings(appItem).map((item) => [item.id, item])
  );
  return elements.map((element, index) => {
    const existing = existingSettings.get(element.id) || {};
    const orderValue = body[`element_order_${element.id}`];
    const parsedOrder = Number(orderValue);
    const isQueue = element.id === 'activity-queue';
    const queueRowsRaw = body[`element_queue_visible_rows_${element.id}`];
    const queueVisibleRows = queueRowsRaw === undefined
      ? undefined
      : resolveTableVisibleRows(element.id, queueRowsRaw);
    const tautulliStatsView = resolveTautulliStatsView(appItem, existing, 'list');
    return {
      id: element.id,
      enable: Boolean(body[`element_enable_${element.id}`]),
      dashboard: Boolean(body[`element_dashboard_${element.id}`]),
      overviewVisibilityRole: resolveOverviewElementVisibilityRole(appItem, existing, 'user'),
      dashboardVisibilityRole: resolveDashboardElementVisibilityRole(appItem, existing, 'user'),
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
      tautulliStatsView,
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
        const fallbackOverviewVisibilityRole = resolveOverviewElementVisibilityRole(appItem, fallback, 'user');
        const fallbackVisibilityRole = resolveDashboardElementVisibilityRole(appItem, fallback, 'user');
        const fallbackTautulliStatsView = resolveTautulliStatsView(appItem, fallback, 'list');
        return {
          id: element.id,
          enable: Boolean(fallback.enable),
          dashboard: Boolean(fallback.dashboard),
          overviewVisibilityRole: fallbackOverviewVisibilityRole,
          dashboardVisibilityRole: fallbackVisibilityRole,
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
          tautulliStatsView: fallbackTautulliStatsView,
          queueVisibleRows: fallback.queueVisibleRows,
          order: Number.isFinite(fallback.order) ? fallback.order : index + 1,
        };
      }
    }
    const orderValue = body[`${prefix}order`];
    const parsedOrder = Number(orderValue);
    const isQueue = element.id === 'activity-queue';
    const overviewVisibilityRole = normalizeVisibilityRole(
      body[`${prefix}overview_visibility_role`],
      resolveOverviewElementVisibilityRole(appItem, existingSettings.get(element.id) || {}, 'user')
    );
    const visibilityRole = normalizeVisibilityRole(
      body[`${prefix}visibility_role`],
      resolveDashboardElementVisibilityRole(appItem, existingSettings.get(element.id) || {}, 'user')
    );
    const overviewVisible = overviewVisibilityRole !== 'disabled';
    const dashboardVisible = visibilityRole !== 'disabled';
    const queueRowsRaw = body[`${prefix}queue_visible_rows`];
    const queueVisibleRows = queueRowsRaw === undefined
      ? undefined
      : resolveTableVisibleRows(element.id, queueRowsRaw);
    const tautulliStatsView = normalizeTautulliStatsView(
      body[`${prefix}tautulli_stats_view`],
      resolveTautulliStatsView(appItem, existingSettings.get(element.id) || {}, 'list')
    );
    return {
      id: element.id,
      enable: overviewVisible,
      dashboard: dashboardVisible,
      overviewVisibilityRole,
      dashboardVisibilityRole: visibilityRole,
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
      tautulliStatsView: resolveTautulliStatsView(appItem, { id: element.id, tautulliStatsView }, 'list'),
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

function extractHostNameFromHostHeader(hostValue) {
  const raw = String(hostValue || '').trim();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const closingIndex = raw.indexOf(']');
    if (closingIndex > 1) return raw.slice(1, closingIndex);
    return raw.replace(/^\[|\]$/g, '');
  }
  const colonIndex = raw.indexOf(':');
  if (colonIndex > 0) return raw.slice(0, colonIndex);
  return raw;
}

function resolveIframeLaunchUrl(req, launchUrl) {
  const baseLaunchUrl = String(launchUrl || '').trim();
  if (!baseLaunchUrl) return '';
  try {
    const parsedLaunchUrl = new URL(baseLaunchUrl);
    const requestHostName = extractHostNameFromHostHeader(getRequestHost(req));
    const targetHostName = String(parsedLaunchUrl.hostname || '').trim();
    if (!requestHostName || !targetHostName) return baseLaunchUrl;
    if (targetHostName.toLowerCase() === requestHostName.toLowerCase()) return baseLaunchUrl;

    const isLocalPair = (isPrivateIp(targetHostName) || isLocalHost(targetHostName))
      && (isPrivateIp(requestHostName) || isLocalHost(requestHostName));
    if (!isLocalPair) return baseLaunchUrl;

    parsedLaunchUrl.hostname = requestHostName;
    return parsedLaunchUrl.toString();
  } catch (err) {
    return baseLaunchUrl;
  }
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
      const apiBase = normalizeBaseUrl(url, { stripWeb: true }) || origin;
      const ratingKey = await resolvePlexRatingKey({
        baseUrl: apiBase,
        token: plexToken,
        query: effectiveQuery,
        imdbId,
        tmdbId,
      });
      const detailsKey = ratingKey ? '/library/metadata/' + ratingKey : '';
      const machineId = detailsKey
        ? await resolvePlexMachineIdentifier({ baseUrl: apiBase, token: plexToken })
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
      const uiBase = apiBase.replace(/\/+$/, '');
      return detailsHash
        ? (uiBase + '/web/index.html' + detailsHash)
        : (uiBase + '/web/index.html#!/search?query=' + encodeURIComponent(effectiveQuery));
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
      const url = buildAppApiUrl(base, 'api/v2');
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
      const url = buildAppApiUrl(baseUrl, 'search');
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
    const url = buildAppApiUrl(baseUrl, 'identity');
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

function normalizeBasePath(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = String(new URL(raw).pathname || '').trim();
    } catch (err) {
      raw = '';
    }
  }
  if (!raw) return '';
  let pathValue = raw.replace(/[#?].*$/, '').replace(/\/{2,}/g, '/').trim();
  if (!pathValue) return '';
  if (!pathValue.startsWith('/')) pathValue = `/${pathValue}`;
  pathValue = pathValue.replace(/\/+$/, '');
  return pathValue === '/' ? '' : pathValue;
}

function normalizeBaseUrl(value, options = {}) {
  const stripWeb = Boolean(options?.stripWeb);
  let url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  try {
    const parsed = new URL(url);
    let pathname = String(parsed.pathname || '');
    if (stripWeb) {
      pathname = pathname
        .replace(/\/web\/index\.html$/i, '')
        .replace(/\/web\/?$/i, '');
    }
    pathname = pathname.replace(/\/+$/, '');
    parsed.pathname = pathname || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (err) {
    return url.replace(/\/+$/, '');
  }
}

function applyConfiguredBasePath(baseUrl, basePath) {
  const normalizedBase = normalizeBaseUrl(baseUrl || '');
  const normalizedPath = normalizeBasePath(basePath || '');
  if (!normalizedBase) return '';
  if (!normalizedPath) return normalizedBase;
  try {
    const parsed = new URL(normalizedBase);
    const currentPath = normalizeBasePath(parsed.pathname || '');
    if (currentPath && (currentPath === normalizedPath || currentPath.endsWith(normalizedPath))) {
      return normalizedBase;
    }
    const joined = currentPath ? `${currentPath}${normalizedPath}` : normalizedPath;
    parsed.pathname = joined;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (err) {
    return normalizedBase;
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
  const configuredBasePath = normalizeBasePath(generalSettings.basePath || '');
  const host = getRequestHost(req);
  if (generalSettings.localUrl && isLocalHost(host)) {
    const configuredLocal = normalizeBaseUrl(generalSettings.localUrl || '');
    if (configuredLocal) return applyConfiguredBasePath(configuredLocal, configuredBasePath);
  }
  const configured = normalizeBaseUrl(generalSettings.remoteUrl || '');
  if (configured) return applyConfiguredBasePath(configured, configuredBasePath);
  const proto = getRequestProto(req);
  if (host) return applyConfiguredBasePath(normalizeBaseUrl(`${proto}://${host}`), configuredBasePath);
  return applyConfiguredBasePath(normalizeBaseUrl(BASE_URL) || BASE_URL, configuredBasePath);
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

function getArrCombineSection(sectionKey) {
  const key = String(sectionKey || '').trim();
  if (!key) return null;
  return ARR_COMBINE_SECTIONS.find((section) => section.key === key) || null;
}

function getArrCombineSectionByElementId(elementId) {
  const id = String(elementId || '').trim();
  if (!id) return null;
  return ARR_COMBINE_SECTIONS.find((section) => section.elementId === id) || null;
}

function getArrCombineSectionLabel(sectionKey) {
  const section = getArrCombineSection(sectionKey);
  if (!section) return 'Combined';
  if (section.key === 'downloadingSoon') return 'Downloading Soon';
  if (section.key === 'recentlyDownloaded') return 'Recently Downloaded';
  if (section.key === 'activityQueue') return 'Activity Queue';
  if (section.key === 'calendar') return 'Calendar';
  return String(section.elementId || section.key || 'Combined');
}

function getArrCombineSectionIconPath(sectionKey) {
  const section = getArrCombineSection(sectionKey);
  if (!section) return '/icons/arr-suite.svg';
  if (section.key === 'downloadingSoon') return '/icons/downloading-soon.svg';
  if (section.key === 'recentlyDownloaded') return '/icons/recently-added.svg';
  if (section.key === 'activityQueue') return '/icons/activity-queue.svg';
  if (section.key === 'calendar') return '/icons/calendar-white.svg';
  return '/icons/arr-suite.svg';
}

function getDownloaderCombineSection(sectionKey) {
  const key = String(sectionKey || '').trim();
  if (!key) return null;
  return DOWNLOADER_COMBINE_SECTIONS.find((section) => section.key === key) || null;
}

function getDownloaderCombineSectionByElementId(elementId) {
  const id = String(elementId || '').trim();
  if (!id) return null;
  return DOWNLOADER_COMBINE_SECTIONS.find((section) => section.elementId === id) || null;
}

function getDownloaderCombineSectionLabel(sectionKey) {
  const section = getDownloaderCombineSection(sectionKey);
  if (!section) return 'Download Queue';
  if (section.key === 'activityQueue') return 'Download Queue';
  return String(section.elementId || section.key || 'Download Queue');
}

function getDownloaderCombineSectionIconPath(sectionKey) {
  const section = getDownloaderCombineSection(sectionKey);
  if (!section) return '/icons/download.svg';
  if (section.key === 'activityQueue') return '/icons/download.svg';
  return '/icons/download.svg';
}

function getMediaCombineSection(sectionKey) {
  const key = String(sectionKey || '').trim();
  if (!key) return null;
  return MEDIA_COMBINE_SECTIONS.find((section) => section.key === key) || null;
}

function getMediaCombineSectionByElementId(elementId) {
  const id = String(elementId || '').trim();
  if (!id) return null;
  return MEDIA_COMBINE_SECTIONS.find((section) => section.elementId === id) || null;
}

function getMediaCombineSectionLabel(sectionKey) {
  const section = getMediaCombineSection(sectionKey);
  if (!section) return 'Media';
  if (section.key === 'recent') return 'Recently Added';
  return 'Active Streams';
}

function getMediaCombineSectionIconPath(sectionKey) {
  const section = getMediaCombineSection(sectionKey);
  if (!section) return '/icons/media-play.svg';
  if (section.key === 'recent') return '/icons/recently-added.svg';
  return '/icons/media-play.svg';
}

function resolveDeprecatedDashboardCardDescriptor(key) {
  const value = String(key || '').trim();
  if (!value) return null;
  const combinedMatch = value.match(/^combined:(arr|downloader|media):(.+)$/);
  if (combinedMatch) {
    const type = String(combinedMatch[1] || '').trim();
    const sectionKey = String(combinedMatch[2] || '').trim();
    if (type === 'arr' && getArrCombineSection(sectionKey)) {
      return { kind: 'combined', type, sectionKey };
    }
    if (type === 'downloader' && getDownloaderCombineSection(sectionKey)) {
      return { kind: 'combined', type, sectionKey };
    }
    if (type === 'media' && getMediaCombineSection(sectionKey)) {
      return { kind: 'combined', type, sectionKey };
    }
    return null;
  }

  const appMatch = value.match(/^app:([^:]+):(.+)$/);
  if (!appMatch) return null;
  const appId = normalizeAppId(appMatch[1]);
  const elementId = String(appMatch[2] || '').trim();
  if (!appId || !elementId) return null;

  const arrSection = getArrCombineSectionByElementId(elementId);
  if (arrSection && isAppInSet(appId, ARR_APP_IDS)) {
    return { kind: 'app', type: 'arr', sectionKey: arrSection.key, appId, elementId };
  }
  const downloaderSection = getDownloaderCombineSectionByElementId(elementId);
  if (downloaderSection && isAppInSet(appId, DOWNLOADER_APP_IDS)) {
    return { kind: 'app', type: 'downloader', sectionKey: downloaderSection.key, appId, elementId };
  }
  const mediaSection = getMediaCombineSectionByElementId(elementId);
  if (mediaSection && isAppInSet(appId, MEDIA_APP_IDS)) {
    return { kind: 'app', type: 'media', sectionKey: mediaSection.key, appId, elementId };
  }
  return null;
}

function resolveDeprecatedDashboardElementIdsForApp(appId) {
  const normalizedAppId = normalizeAppId(appId);
  if (!normalizedAppId) return [];
  const deprecatedIds = [];
  if (isAppInSet(normalizedAppId, ARR_APP_IDS)) {
    deprecatedIds.push(...ARR_COMBINE_SECTIONS.map((section) => String(section?.elementId || '').trim()).filter(Boolean));
  }
  if (isAppInSet(normalizedAppId, DOWNLOADER_APP_IDS)) {
    deprecatedIds.push(...DOWNLOADER_COMBINE_SECTIONS.map((section) => String(section?.elementId || '').trim()).filter(Boolean));
  }
  if (isAppInSet(normalizedAppId, MEDIA_APP_IDS)) {
    deprecatedIds.push(...MEDIA_COMBINE_SECTIONS.map((section) => String(section?.elementId || '').trim()).filter(Boolean));
  }
  return [...new Set(deprecatedIds)];
}

function normalizeCombinedCardToken(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  return normalized;
}

function buildCombinedCardId() {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveArrDashboardCombinedCards(config, apps) {
  if (!ENABLE_ARR_UNIFIED_CARDS) return [];
  const configured = Array.isArray(config?.arrDashboardCombinedCards) ? config.arrDashboardCombinedCards : [];
  const allowedAppIds = [
    ...new Set(
      (Array.isArray(apps) ? apps : [])
        .filter((appItem) => !appItem?.removed)
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter((id) => isAppInSet(id, ARR_APP_IDS))
    ),
  ];
  const allowedAppIdSet = new Set(allowedAppIds);
  const cards = [];
  const seen = new Set();
  configured.forEach((entry) => {
    const baseId = normalizeCombinedCardToken(entry?.id || '');
    if (!baseId) return;
    const sectionKey = String(entry?.sectionKey || '').trim();
    if (!getArrCombineSection(sectionKey)) return;
    const rawAppIds = Array.isArray(entry?.appIds) ? entry.appIds : [entry?.appIds];
    const selectedAppIds = [...new Set(
      rawAppIds
        .map((appId) => normalizeAppId(appId))
        .filter((appId) => allowedAppIdSet.has(appId))
    )];
    const appIds = selectedAppIds.length ? selectedAppIds : [...allowedAppIds];
    if (!appIds.length) return;
    let nextId = baseId;
    if (seen.has(nextId)) {
      let suffix = 2;
      while (seen.has(`${baseId}-${suffix}`)) suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    seen.add(nextId);
    cards.push({
      id: nextId,
      sectionKey,
      appIds,
    });
  });
  return cards;
}

function resolveMediaDashboardCards(config, apps) {
  const configured = Array.isArray(config?.mediaDashboardCards) ? config.mediaDashboardCards : [];
  const allowedAppIds = [
    ...new Set(
      (Array.isArray(apps) ? apps : [])
        .filter((appItem) => !appItem?.removed)
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter((id) => isAppInSet(id, MEDIA_APP_IDS))
    ),
  ];
  const allowedAppIdSet = new Set(allowedAppIds);
  const cards = [];
  const seen = new Set();
  configured.forEach((entry) => {
    const baseId = normalizeCombinedCardToken(entry?.id || '');
    if (!baseId) return;
    const sectionKey = String(entry?.sectionKey || '').trim();
    if (!getMediaCombineSection(sectionKey)) return;
    const hasExplicitAppIds = Object.prototype.hasOwnProperty.call(entry || {}, 'appIds');
    const rawAppIds = hasExplicitAppIds
      ? (Array.isArray(entry?.appIds) ? entry.appIds : [entry?.appIds])
      : [...allowedAppIds];
    const selectedAppIds = [...new Set(
      rawAppIds
        .map((appId) => normalizeAppId(appId))
        .filter((appId) => allowedAppIdSet.has(appId))
    )];
    const appIds = hasExplicitAppIds ? selectedAppIds : [...allowedAppIds];
    if (!hasExplicitAppIds && !appIds.length) return;
    let nextId = baseId;
    if (seen.has(nextId)) {
      let suffix = 2;
      while (seen.has(`${baseId}-${suffix}`)) suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    seen.add(nextId);
    cards.push({
      id: nextId,
      sectionKey,
      appIds,
    });
  });
  return cards;
}

function resolveDownloaderDashboardCards(config, apps) {
  if (!ENABLE_DOWNLOADER_UNIFIED_CARDS) return [];
  const configured = Array.isArray(config?.downloaderDashboardCards) ? config.downloaderDashboardCards : [];
  const allowedAppIds = [
    ...new Set(
      (Array.isArray(apps) ? apps : [])
        .filter((appItem) => !appItem?.removed)
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter((id) => isAppInSet(id, DOWNLOADER_APP_IDS))
    ),
  ];
  const allowedAppIdSet = new Set(allowedAppIds);
  const cards = [];
  const seen = new Set();
  configured.forEach((entry) => {
    const baseId = normalizeCombinedCardToken(entry?.id || '');
    if (!baseId) return;
    const sectionKey = String(entry?.sectionKey || '').trim();
    if (!getDownloaderCombineSection(sectionKey)) return;
    const hasExplicitAppIds = Object.prototype.hasOwnProperty.call(entry || {}, 'appIds');
    const rawAppIds = hasExplicitAppIds
      ? (Array.isArray(entry?.appIds) ? entry.appIds : [entry?.appIds])
      : [...allowedAppIds];
    const selectedAppIds = [...new Set(
      rawAppIds
        .map((appId) => normalizeAppId(appId))
        .filter((appId) => allowedAppIdSet.has(appId))
    )];
    const appIds = hasExplicitAppIds ? selectedAppIds : [...allowedAppIds];
    if (!hasExplicitAppIds && !appIds.length) return;
    let nextId = baseId;
    if (seen.has(nextId)) {
      let suffix = 2;
      while (seen.has(`${baseId}-${suffix}`)) suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    seen.add(nextId);
    cards.push({
      id: nextId,
      sectionKey,
      appIds,
    });
  });
  return cards;
}

function migrateDeprecatedDashboardCards(config) {
  const source = config && typeof config === 'object' ? config : {};
  const sourceApps = Array.isArray(source.apps) ? source.apps : [];
  const apps = sourceApps.map((appItem) => ({
    ...(appItem || {}),
    overviewElements: Array.isArray(appItem?.overviewElements)
      ? appItem.overviewElements.map((entry) => ({ ...(entry || {}) }))
      : [],
  }));
  const dashboardRemovedElements = (source.dashboardRemovedElements && typeof source.dashboardRemovedElements === 'object')
    ? { ...source.dashboardRemovedElements }
    : {};
  const dashboardCombinedSettings = (source.dashboardCombinedSettings && typeof source.dashboardCombinedSettings === 'object')
    ? { ...source.dashboardCombinedSettings }
    : {};
  const dashboardCombinedOrder = (source.dashboardCombinedOrder && typeof source.dashboardCombinedOrder === 'object')
    ? { ...source.dashboardCombinedOrder }
    : {};
  const arrDashboardCombinedCards = resolveArrDashboardCombinedCards(source, apps).map((card) => ({ ...card, appIds: Array.isArray(card?.appIds) ? [...card.appIds] : [] }));
  const mediaDashboardCards = resolveMediaDashboardCards(source, apps).map((card) => ({ ...card, appIds: Array.isArray(card?.appIds) ? [...card.appIds] : [] }));
  const downloaderDashboardCards = resolveDownloaderDashboardCards(source, apps).map((card) => ({ ...card, appIds: Array.isArray(card?.appIds) ? [...card.appIds] : [] }));
  const arrLegacySelection = resolveArrDashboardCombineSettings(source, apps);
  const mediaLegacySelection = resolveMediaDashboardCombineSettings(source, apps);
  const downloaderLegacySelection = resolveDownloaderDashboardCombineSettings(source, apps);

  const allowedByType = {
    arr: [...new Set(
      apps
        .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, ARR_APP_IDS))
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter(Boolean)
    )],
    media: [...new Set(
      apps
        .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, MEDIA_APP_IDS))
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter(Boolean)
    )],
    downloader: [...new Set(
      apps
        .filter((appItem) => !appItem?.removed && isAppInSet(appItem?.id, DOWNLOADER_APP_IDS))
        .map((appItem) => normalizeAppId(appItem?.id))
        .filter(Boolean)
    )],
  };
  const allowedSetByType = {
    arr: new Set(allowedByType.arr),
    media: new Set(allowedByType.media),
    downloader: new Set(allowedByType.downloader),
  };
  const cardsByType = {
    arr: arrDashboardCombinedCards,
    media: mediaDashboardCards,
    downloader: downloaderDashboardCards,
  };
  const supportsType = {
    arr: ENABLE_ARR_UNIFIED_CARDS,
    media: true,
    downloader: ENABLE_DOWNLOADER_UNIFIED_CARDS,
  };
  let changed = false;
  const markChanged = () => {
    changed = true;
  };

  const makeSignature = (sectionKey, appIds) => {
    const uniqueSorted = [...new Set((Array.isArray(appIds) ? appIds : []).map((id) => normalizeAppId(id)).filter(Boolean))].sort();
    return `${String(sectionKey || '').trim()}|${uniqueSorted.join(',')}`;
  };

  const cardStateByType = {
    arr: { signatures: new Map(), ids: new Set() },
    media: { signatures: new Map(), ids: new Set() },
    downloader: { signatures: new Map(), ids: new Set() },
  };
  Object.entries(cardsByType).forEach(([type, cards]) => {
    cards.forEach((card, index) => {
      const cardId = normalizeCombinedCardToken(card?.id || '') || `card-${index + 1}`;
      cardStateByType[type].ids.add(cardId);
      cardStateByType[type].signatures.set(makeSignature(card?.sectionKey, card?.appIds), cardId);
    });
  });

  const ensureReplacement = ({ type, sectionKey, appIds, hasExplicitSelection, visibilityRole, order }) => {
    if (!supportsType[type]) return '';
    if (!sectionKey) return '';
    const allowedSet = allowedSetByType[type];
    const allowedList = allowedByType[type] || [];
    if (!allowedSet || !Array.isArray(allowedList)) return '';
    let selected = [...new Set(
      (Array.isArray(appIds) ? appIds : [])
        .map((id) => normalizeAppId(id))
        .filter((id) => allowedSet.has(id))
    )];
    if (type === 'arr' && !selected.length) selected = [...allowedList];
    if ((type === 'media' || type === 'downloader') && !hasExplicitSelection) {
      selected = [...allowedList];
    }
    if (type === 'arr' && !selected.length) return '';

    const signature = makeSignature(sectionKey, selected);
    let cardId = cardStateByType[type].signatures.get(signature) || '';
    if (!cardId) {
      cardId = normalizeCombinedCardToken(buildCombinedCardId()) || `card-${Date.now().toString(36)}`;
      while (cardStateByType[type].ids.has(cardId)) {
        cardId = `${cardId}-${Math.random().toString(36).slice(2, 6)}`;
      }
      cardStateByType[type].ids.add(cardId);
      cardStateByType[type].signatures.set(signature, cardId);
      cardsByType[type].push({
        id: cardId,
        sectionKey,
        appIds: selected,
      });
      markChanged();
    }

    const combinedKey = `combined:${type}custom:${cardId}`;
    const normalizedVisibilityRole = normalizeVisibilityRole(visibilityRole, 'user');
    const existingSettings = dashboardCombinedSettings[combinedKey] && typeof dashboardCombinedSettings[combinedKey] === 'object'
      ? dashboardCombinedSettings[combinedKey]
      : {};
    const nextSettings = {
      ...existingSettings,
      visibilityRole: normalizedVisibilityRole,
      enable: normalizedVisibilityRole !== 'disabled',
      dashboard: normalizedVisibilityRole !== 'disabled',
    };
    if (!deepEqual(existingSettings, nextSettings)) {
      dashboardCombinedSettings[combinedKey] = nextSettings;
      markChanged();
    }
    const parsedOrder = Number(order);
    if (Number.isFinite(parsedOrder) && dashboardCombinedOrder[combinedKey] !== parsedOrder) {
      dashboardCombinedOrder[combinedKey] = parsedOrder;
      markChanged();
    }
    if (dashboardRemovedElements[combinedKey]) {
      delete dashboardRemovedElements[combinedKey];
      markChanged();
    }
    return combinedKey;
  };

  apps.forEach((appItem) => {
    if (appItem?.removed) return;
    const normalizedAppId = normalizeAppId(appItem?.id);
    if (!normalizedAppId) return;
    let nextOverviewElements = Array.isArray(appItem?.overviewElements)
      ? appItem.overviewElements.map((entry) => ({ ...(entry || {}) }))
      : [];

    if (normalizedAppId === 'tautulli') {
      const watchStatsKey = `app:${appItem.id}:watch-stats`;
      const wheelKey = `app:${appItem.id}:watch-stats-wheel`;
      const watchIndex = nextOverviewElements.findIndex((element) => String(element?.id || '').trim() === 'watch-stats');
      const wheelIndex = nextOverviewElements.findIndex((element) => String(element?.id || '').trim() === 'watch-stats-wheel');
      const hadWatchStats = watchIndex >= 0;
      const wheelRemoved = Boolean(dashboardRemovedElements[wheelKey]);
      if (wheelIndex >= 0) {
        const watchStatsElement = watchIndex >= 0 ? nextOverviewElements[watchIndex] : null;
        const wheelElement = nextOverviewElements[wheelIndex] || {};
        const watchOverviewRole = resolveOverviewElementVisibilityRole(appItem, watchStatsElement || {}, 'disabled');
        const watchDashboardRole = resolveDashboardElementVisibilityRole(appItem, watchStatsElement || {}, 'disabled');
        const wheelOverviewRole = resolveOverviewElementVisibilityRole(appItem, wheelElement, 'disabled');
        const wheelDashboardRole = resolveDashboardElementVisibilityRole(appItem, wheelElement, 'disabled');
        const preferWheelView = !watchStatsElement
          || (
            !Object.prototype.hasOwnProperty.call(watchStatsElement, 'tautulliStatsView')
            && (
              (watchOverviewRole === 'disabled' && wheelOverviewRole !== 'disabled')
              || (watchDashboardRole === 'disabled' && wheelDashboardRole !== 'disabled')
            )
          );
        const mergedWatchStats = {
          ...(watchStatsElement || wheelElement || {}),
          id: 'watch-stats',
          tautulliStatsView: normalizeTautulliStatsView(
            watchStatsElement?.tautulliStatsView,
            preferWheelView ? 'wheel' : 'list'
          ),
        };
        if (watchOverviewRole === 'disabled' && wheelOverviewRole !== 'disabled') {
          mergedWatchStats.enable = true;
          mergedWatchStats.overviewVisibilityRole = wheelOverviewRole;
        }
        if (watchDashboardRole === 'disabled' && wheelDashboardRole !== 'disabled') {
          mergedWatchStats.dashboard = true;
          mergedWatchStats.dashboardVisibilityRole = wheelDashboardRole;
          const wheelOrder = Number(wheelElement?.order);
          if (Number.isFinite(wheelOrder)) mergedWatchStats.order = wheelOrder;
        }
        const displayFields = [
          'favourite',
          'showSubtitle',
          'showMeta',
          'showPill',
          'showTypeIcon',
          'showViewIcon',
          'showUsername',
          'queueShowDetail',
          'queueShowSubDetail',
          'queueShowSize',
          'queueShowProtocol',
          'queueShowTimeLeft',
          'queueShowProgress',
          'queueVisibleRows',
        ];
        displayFields.forEach((field) => {
          if (mergedWatchStats[field] === undefined && wheelElement[field] !== undefined) {
            mergedWatchStats[field] = wheelElement[field];
          }
        });
        if (watchIndex >= 0) {
          nextOverviewElements[watchIndex] = mergedWatchStats;
        } else {
          nextOverviewElements.push(mergedWatchStats);
        }
        nextOverviewElements = nextOverviewElements.filter((element, index) => (
          index !== wheelIndex
          && String(element?.id || '').trim() !== 'watch-stats-wheel'
        ));
        markChanged();
      }
      if (wheelRemoved) {
        if (!hadWatchStats && !dashboardRemovedElements[watchStatsKey]) {
          dashboardRemovedElements[watchStatsKey] = true;
          markChanged();
        }
        delete dashboardRemovedElements[wheelKey];
        markChanged();
      }
    }

    appItem.overviewElements = nextOverviewElements;
    nextOverviewElements.forEach((element) => {
      const elementId = String(element?.id || '').trim();
      if (!elementId) return;
      const legacyKey = `app:${appItem.id}:${elementId}`;
      if (dashboardRemovedElements[legacyKey]) return;
      let type = '';
      let sectionKey = '';
      if (isAppInSet(normalizedAppId, ARR_APP_IDS)) {
        const section = getArrCombineSectionByElementId(elementId);
        if (section) {
          type = 'arr';
          sectionKey = section.key;
        }
      } else if (isAppInSet(normalizedAppId, MEDIA_APP_IDS)) {
        const section = getMediaCombineSectionByElementId(elementId);
        if (section) {
          type = 'media';
          sectionKey = section.key;
        }
      } else if (isAppInSet(normalizedAppId, DOWNLOADER_APP_IDS)) {
        const section = getDownloaderCombineSectionByElementId(elementId);
        if (section) {
          type = 'downloader';
          sectionKey = section.key;
        }
      }
      if (!type || !sectionKey) return;
      const visibilityRole = resolveDashboardElementVisibilityRole(appItem, element, 'user');
      if (visibilityRole === 'disabled') return;
      const replacementKey = ensureReplacement({
        type,
        sectionKey,
        appIds: [normalizedAppId],
        hasExplicitSelection: true,
        visibilityRole,
        order: Number(element?.order),
      });
      if (!replacementKey) return;
      if (!dashboardRemovedElements[legacyKey]) {
        dashboardRemovedElements[legacyKey] = true;
        markChanged();
      }
      if (element.dashboard !== false || normalizeVisibilityRole(element.dashboardVisibilityRole, 'disabled') !== 'disabled') {
        element.dashboard = false;
        element.dashboardVisibilityRole = 'disabled';
        markChanged();
      }
    });
  });

  const migrateLegacyCombinedSection = (type, sectionKey, selectionMap) => {
    const legacyKey = `combined:${type}:${sectionKey}`;
    if (dashboardRemovedElements[legacyKey]) return;
    const legacySettings = dashboardCombinedSettings[legacyKey] && typeof dashboardCombinedSettings[legacyKey] === 'object'
      ? dashboardCombinedSettings[legacyKey]
      : {};
    const visibilityRole = resolveCombinedDashboardVisibilityRole(legacySettings, 'user');
    if (visibilityRole === 'disabled') return;
    const allowedIds = allowedByType[type] || [];
    const sourceSelection = selectionMap && typeof selectionMap === 'object'
      ? selectionMap
      : {};
    const hasExplicitSelection = Object.keys(sourceSelection).length > 0;
    const selectedIds = hasExplicitSelection
      ? allowedIds.filter((id) => Boolean(sourceSelection[id]))
      : [...allowedIds];
    const replacementKey = ensureReplacement({
      type,
      sectionKey,
      appIds: selectedIds,
      hasExplicitSelection,
      visibilityRole,
      order: Number(dashboardCombinedOrder[legacyKey]),
    });
    if (!replacementKey) return;
    if (!dashboardRemovedElements[legacyKey]) {
      dashboardRemovedElements[legacyKey] = true;
      markChanged();
    }
  };

  if (ENABLE_ARR_UNIFIED_CARDS) {
    ARR_COMBINE_SECTIONS.forEach((section) => {
      migrateLegacyCombinedSection('arr', section.key, arrLegacySelection[section.key]);
    });
  }
  if (ENABLE_DOWNLOADER_UNIFIED_CARDS) {
    DOWNLOADER_COMBINE_SECTIONS.forEach((section) => {
      migrateLegacyCombinedSection('downloader', section.key, downloaderLegacySelection[section.key]);
    });
  }
  MEDIA_COMBINE_SECTIONS.forEach((section) => {
    migrateLegacyCombinedSection('media', section.key, mediaLegacySelection[section.key]);
  });

  if (!changed) {
    return { changed: false, config: source };
  }

  return {
    changed: true,
    config: {
      ...source,
      apps,
      arrDashboardCombinedCards,
      mediaDashboardCards,
      downloaderDashboardCards,
      dashboardRemovedElements,
      dashboardCombinedSettings,
      dashboardCombinedOrder,
    },
  };
}

function buildArrCombinedDisplayMeta(appLookup, sectionKey, appIds) {
  const sectionLabel = getArrCombineSectionLabel(sectionKey);
  const combinedTitle = sectionLabel;
  const sectionIconPath = getArrCombineSectionIconPath(sectionKey);
  const selectedApps = (Array.isArray(appIds) ? appIds : [])
    .map((appId) => appLookup.get(normalizeAppId(appId)))
    .filter(Boolean);
  if (!selectedApps.length) {
    return {
      appIds: [],
      appNames: [],
      iconPath: sectionIconPath,
      displayName: combinedTitle,
    };
  }
  const selectedAppIds = selectedApps.map((appItem) => normalizeAppId(appItem.id)).filter(Boolean);
  const selectedAppNames = selectedApps.map((appItem) => String(appItem.name || '').trim()).filter(Boolean);
  const iconPath = selectedApps.length === 1
    ? resolvePersistedAppIconPath(selectedApps[0])
    : sectionIconPath;
  return {
    appIds: selectedAppIds,
    appNames: selectedAppNames,
    iconPath,
    displayName: combinedTitle,
  };
}

function buildMediaCombinedDisplayMeta(appLookup, sectionKey, appIds) {
  const sectionLabel = getMediaCombineSectionLabel(sectionKey);
  const combinedTitle = sectionLabel;
  const selectedApps = (Array.isArray(appIds) ? appIds : [])
    .map((appId) => appLookup.get(normalizeAppId(appId)))
    .filter(Boolean);
  if (!selectedApps.length) {
    return {
      appIds: [],
      appNames: [],
      iconPath: getMediaCombineSectionIconPath(sectionKey),
      displayName: combinedTitle,
    };
  }
  const selectedAppIds = selectedApps.map((appItem) => normalizeAppId(appItem.id)).filter(Boolean);
  const selectedAppNames = selectedApps.map((appItem) => String(appItem.name || '').trim()).filter(Boolean);
  const iconPath = selectedApps.length === 1
    ? resolvePersistedAppIconPath(selectedApps[0])
    : getMediaCombineSectionIconPath(sectionKey);
  return {
    appIds: selectedAppIds,
    appNames: selectedAppNames,
    iconPath,
    displayName: combinedTitle,
  };
}

function buildDownloaderCombinedDisplayMeta(appLookup, sectionKey, appIds) {
  const sectionLabel = getDownloaderCombineSectionLabel(sectionKey);
  const combinedTitle = sectionLabel;
  const selectedApps = (Array.isArray(appIds) ? appIds : [])
    .map((appId) => appLookup.get(normalizeAppId(appId)))
    .filter(Boolean);
  if (!selectedApps.length) {
    return {
      appIds: [],
      appNames: [],
      iconPath: getDownloaderCombineSectionIconPath(sectionKey),
      displayName: combinedTitle,
    };
  }
  const selectedAppIds = selectedApps.map((appItem) => normalizeAppId(appItem.id)).filter(Boolean);
  const selectedAppNames = selectedApps.map((appItem) => String(appItem.name || '').trim()).filter(Boolean);
  const iconPath = selectedApps.length === 1
    ? resolvePersistedAppIconPath(selectedApps[0])
    : getDownloaderCombineSectionIconPath(sectionKey);
  return {
    appIds: selectedAppIds,
    appNames: selectedAppNames,
    iconPath,
    displayName: combinedTitle,
  };
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
    .filter((id) => isAppInSet(id, ARR_APP_IDS));
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
    .filter((id) => isAppInSet(id, DOWNLOADER_APP_IDS));
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
    .filter((id) => isAppInSet(id, MEDIA_APP_IDS));
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

function isMultiInstanceEnabled(appItem) {
  const raw = appItem?.supportsInstances;
  return raw === true || String(raw || '').trim().toLowerCase() === 'true';
}

function getConfiguredInstanceBaseId(appItem) {
  const configured = normalizeAppId(appItem?.instanceBaseId || '');
  if (configured) return configured;
  const id = normalizeAppId(appItem?.id || '');
  if (!id) return '';
  const match = id.match(/^(.*)-(\d+)$/);
  if (match && Number(match[2]) > 1) return normalizeAppId(match[1] || '');
  return id;
}

function refreshRuntimeMultiInstanceBaseIds(apps = []) {
  const next = new Set(LEGACY_MULTI_INSTANCE_APP_IDS.map((id) => normalizeAppId(id)).filter(Boolean));
  (Array.isArray(apps) ? apps : []).forEach((appItem) => {
    if (!isMultiInstanceEnabled(appItem)) return;
    const baseId = getConfiguredInstanceBaseId(appItem);
    if (baseId) next.add(baseId);
  });
  RUNTIME_MULTI_INSTANCE_BASE_IDS = Array.from(next);
}

function getMultiInstanceBaseIds() {
  return Array.from(new Set(
    (Array.isArray(RUNTIME_MULTI_INSTANCE_BASE_IDS) ? RUNTIME_MULTI_INSTANCE_BASE_IDS : [])
      .map((id) => normalizeAppId(id))
      .filter(Boolean)
  ));
}

function supportsAppInstances(baseId) {
  const key = normalizeAppId(baseId);
  return Boolean(key) && getMultiInstanceBaseIds().includes(key);
}

function getAppBaseId(value) {
  const id = normalizeAppId(value);
  if (!id) return '';
  const matched = getMultiInstanceBaseIds()
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((baseId) => {
      if (id === baseId) return true;
      if (!id.startsWith(`${baseId}-`)) return false;
      return /^\d+$/.test(id.slice(baseId.length + 1));
    });
  return matched || id;
}

function isAppInSet(appId, baseIds) {
  const baseId = getAppBaseId(appId);
  return Array.isArray(baseIds) && baseIds.includes(baseId);
}

function getInstanceSuffix(appId, baseId = '') {
  const normalized = normalizeAppId(appId);
  const resolvedBase = normalizeAppId(baseId) || getAppBaseId(normalized);
  if (!normalized || !resolvedBase) return NaN;
  const match = normalized.match(new RegExp(`^${resolvedBase}-(\\d+)$`));
  if (!match) return normalized === resolvedBase ? 1 : NaN;
  return Number(match[1]);
}

function canManageWithDefaultAppManager(appItem) {
  if (!appItem) return false;
  if (Boolean(appItem?.custom)) return false;
  const id = normalizeAppId(appItem?.id);
  if (!id) return false;
  const baseId = getAppBaseId(id);
  return getInstanceSuffix(id, baseId) === 1;
}

function getBaseAppTitle(baseId) {
  const key = normalizeAppId(baseId);
  if (!key) return 'App';
  if (APP_BASE_NAME_MAP[key]) return APP_BASE_NAME_MAP[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function getDefaultInstanceName(baseId, appId) {
  const title = getBaseAppTitle(baseId);
  const suffix = getInstanceSuffix(appId, baseId);
  if (Number.isFinite(suffix) && suffix > 1) return `${title} ${suffix}`;
  return title;
}

function coerceMultiInstanceLimit(value, fallback = DEFAULT_MAX_MULTI_INSTANCES_PER_APP) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(20, Math.round(parsed)));
}

function getMaxMultiInstancesForBase(baseId, apps = []) {
  const key = normalizeAppId(baseId);
  if (!key) return DEFAULT_MAX_MULTI_INSTANCES_PER_APP;
  const sourceApps = Array.isArray(apps) && apps.length ? apps : loadDefaultApps();
  const match = sourceApps.find((appItem) => {
    if (!appItem) return false;
    const appId = normalizeAppId(appItem?.id);
    const configuredBase = getConfiguredInstanceBaseId(appItem);
    return configuredBase === key || appId === key;
  });
  return coerceMultiInstanceLimit(match?.maxInstances, DEFAULT_MAX_MULTI_INSTANCES_PER_APP);
}

function getInstanceNamePlaceholder(baseId, apps = []) {
  const key = normalizeAppId(baseId);
  if (!key) return DEFAULT_INSTANCE_NAME_PLACEHOLDER;
  const sourceApps = Array.isArray(apps) && apps.length ? apps : loadDefaultApps();
  const match = sourceApps.find((appItem) => {
    if (!appItem) return false;
    const appId = normalizeAppId(appItem?.id);
    const configuredBase = getConfiguredInstanceBaseId(appItem);
    return configuredBase === key || appId === key;
  });
  const configured = String(match?.instanceNamePlaceholder || '').trim();
  if (configured) return configured;
  return APP_INSTANCE_PLACEHOLDER_MAP[key] || DEFAULT_INSTANCE_NAME_PLACEHOLDER;
}

function getMultiInstanceTitleMap() {
  return getMultiInstanceBaseIds().reduce((acc, baseId) => {
    acc[baseId] = getBaseAppTitle(baseId);
    return acc;
  }, {});
}

function getMultiInstanceMaxMap(apps = []) {
  return getMultiInstanceBaseIds().reduce((acc, baseId) => {
    acc[baseId] = getMaxMultiInstancesForBase(baseId, apps);
    return acc;
  }, {});
}

function getMultiInstancePlaceholderMap(apps = []) {
  return getMultiInstanceBaseIds().reduce((acc, baseId) => {
    acc[baseId] = getInstanceNamePlaceholder(baseId, apps);
    return acc;
  }, {});
}

function buildNextInstanceId(baseId, apps = []) {
  const key = normalizeAppId(baseId);
  if (!key || !supportsAppInstances(key)) return '';
  const maxInstances = getMaxMultiInstancesForBase(key, apps);
  const used = new Set(
    (Array.isArray(apps) ? apps : [])
      .map((appItem) => normalizeAppId(appItem?.id))
      .filter((appId) => getAppBaseId(appId) === key)
  );
  for (let index = 2; index <= maxInstances; index += 1) {
    const candidate = `${key}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return '';
}

function getDefaultIconPathForAppId(appId) {
  const baseId = getAppBaseId(appId);
  const normalizedBaseId = normalizeAppId(baseId);
  if (!normalizedBaseId) return '/icons/app.svg';
  const pngPath = path.join(ICONS_DIR, `${normalizedBaseId}.png`);
  if (fs.existsSync(pngPath)) {
    return `/icons/${normalizedBaseId}.png`;
  }
  const svgPath = path.join(ICONS_DIR, `${normalizedBaseId}.svg`);
  if (fs.existsSync(svgPath)) {
    return `/icons/${normalizedBaseId}.svg`;
  }
  return '/icons/app.svg';
}

function iconPathExists(iconPath) {
  const normalized = String(iconPath || '').trim();
  if (!normalized.startsWith('/icons/')) return false;
  const relativePath = normalized.replace(/^\/+/, '');
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) return false;
  return fs.existsSync(resolvedPath);
}

function resolvePersistedAppIconPath(appItem) {
  const configuredPath = String(appItem?.icon || '').trim();
  if (configuredPath && iconPathExists(configuredPath)) return configuredPath;
  return getDefaultIconPathForAppId(appItem?.id);
}

function resolveQueueColumnLabels(appItem) {
  const appId = getAppBaseId(appItem?.id);
  if (appId === 'nzbget' || appId === 'sabnzbd') {
    return { detailLabel: 'Category', subDetailLabel: 'Status' };
  }
  if (appId === 'transmission' || appId === 'qbittorrent') {
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

function readJsonFileCandidates(candidatePaths) {
  const uniquePaths = Array.from(new Set(
    (Array.isArray(candidatePaths) ? candidatePaths : [])
      .map((candidate) => String(candidate || '').trim())
      .filter(Boolean)
  ));
  for (const candidatePath of uniquePaths) {
    try {
      const raw = fs.readFileSync(candidatePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      continue;
    }
  }
  return null;
}

function loadDefaultApps() {
  const configDefaultPath = path.join(path.dirname(CONFIG_PATH), 'default-apps.json');
  const parsed = readJsonFileCandidates([
    DEFAULT_APPS_PATH,
    BUNDLED_DEFAULT_APPS_PATH,
    configDefaultPath,
    SOURCE_DEFAULT_APPS_PATH,
  ]);
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.apps) ? parsed.apps : []);
  return dedupeApps(list);
}

function loadDefaultCategories() {
  const configDefaultPath = path.join(path.dirname(CONFIG_PATH), 'default-categories.json');
  const parsed = readJsonFileCandidates([
    DEFAULT_CATEGORIES_PATH,
    BUNDLED_DEFAULT_CATEGORIES_PATH,
    configDefaultPath,
    SOURCE_DEFAULT_CATEGORIES_PATH,
  ]);
  return normalizeCategoryEntries(parsed);
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
      if (!override) return app;
      const hasExplicitRemoved = Object.prototype.hasOwnProperty.call(override, 'removed');
      if (hasExplicitRemoved) {
        return { ...app, ...override };
      }
      return { ...app, ...override, removed: false };
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
  if (!overrides.length) return defaults;
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

  return ordered;
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
    let seededNewConfig = false;
    if (!fs.existsSync(CONFIG_PATH)) {
      if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      }
      const configExampleSource = [CONFIG_EXAMPLE_PATH, BUNDLED_CONFIG_EXAMPLE_PATH]
        .find((candidatePath) => fs.existsSync(candidatePath));
      if (configExampleSource) {
        fs.copyFileSync(configExampleSource, CONFIG_PATH);
      } else {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apps: [], categories: [] }, null, 2));
      }
      seededNewConfig = true;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const overrideApps = parsed && Array.isArray(parsed.apps) ? parsed.apps : [];
    const overrideCategories = parsed && Array.isArray(parsed.categories) ? parsed.categories : [];
    const mergedApps = mergeAppDefaults(defaults, overrideApps);
    const mergedCategories = mergeCategoryDefaults(defaultCategories, overrideCategories);
    const nextConfig = { ...parsed, apps: mergedApps, categories: mergedCategories };
    const hasActiveApps = mergedApps.some((appItem) => !appItem?.removed);
    if (seededNewConfig || !hasActiveApps) {
      refreshRuntimeMultiInstanceBaseIds(mergedApps);
      return nextConfig;
    }
    const migration = migrateDeprecatedDashboardCards(nextConfig);
    if (migration.changed) {
      saveConfig(migration.config);
      refreshRuntimeMultiInstanceBaseIds(Array.isArray(migration.config?.apps) ? migration.config.apps : mergedApps);
      return migration.config;
    }
    refreshRuntimeMultiInstanceBaseIds(mergedApps);
    return nextConfig;
  } catch (err) {
    refreshRuntimeMultiInstanceBaseIds(defaults);
    return { apps: defaults, categories: defaultCategories };
  }
}

function saveConfig(config) {
  const defaults = loadDefaultApps();
  const defaultCategories = loadDefaultCategories();
  const nextConfig = { ...config };
  const runtimeApps = mergeAppDefaults(
    defaults,
    Array.isArray(nextConfig.apps) ? nextConfig.apps : []
  );
  if (defaults.length) {
    nextConfig.apps = buildAppOverrides(defaults, nextConfig.apps);
  }
  if (defaultCategories.length) {
    nextConfig.categories = buildCategoryOverrides(defaultCategories, nextConfig.categories);
  }
  refreshRuntimeMultiInstanceBaseIds(runtimeApps);
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
    avatarFallback: '/icons/user-profile.svg',
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
  const callbackUrl = buildAppApiUrl(baseUrl, 'oauth/callback');
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
