import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveRequestedPlexApp, resolvePlexSettingsToken } from '../routes/api-plex.js';

describe('resolveRequestedPlexApp', () => {
  const getAppBaseId = (value) => {
    const id = String(value || '').trim().toLowerCase();
    if (!id) return '';
    if (id === 'plex' || /^plex-\d+$/.test(id)) return 'plex';
    return id;
  };

  const apps = [
    { id: 'plex', name: 'Plex' },
    { id: 'plex-2', name: 'Plex 2' },
    { id: 'radarr', name: 'Radarr' },
  ];

  it('returns the requested Plex instance when provided', () => {
    const result = resolveRequestedPlexApp(apps, getAppBaseId, 'plex-2');
    assert.equal(result?.id, 'plex-2');
  });

  it('falls back to the primary Plex app when no app id is provided', () => {
    const result = resolveRequestedPlexApp(apps, getAppBaseId, '');
    assert.equal(result?.id, 'plex');
  });

  it('returns null for an unknown Plex app id', () => {
    const result = resolveRequestedPlexApp(apps, getAppBaseId, 'plex-99');
    assert.equal(result, null);
  });
});

describe('resolvePlexSettingsToken', () => {
  it('resolves the selected Plex instance token from account resources', async () => {
    const fetchPlexResources = async () => [{ id: 'resource-list' }];
    const resolvePlexServerToken = (_resources, options) => {
      assert.equal(options.machineId, 'machine-2');
      return 'server-token-2';
    };

    const token = await resolvePlexSettingsToken({
      plexApp: {
        id: 'plex-2',
        plexMachine: 'machine-2',
        localUrl: 'http://10.0.0.2:32400/web',
        remoteUrl: '',
        plexHost: '',
      },
      sessionToken: 'account-token',
      sessionServerToken: 'primary-server-token',
      fetchPlexResources,
      resolvePlexServerToken,
    });

    assert.equal(token, 'server-token-2');
  });

  it('does not reuse the primary session server token for a secondary Plex instance', async () => {
    const token = await resolvePlexSettingsToken({
      plexApp: {
        id: 'plex-2',
        plexMachine: '',
        localUrl: '',
        remoteUrl: '',
        plexHost: '',
        plexToken: '',
      },
      sessionToken: '',
      sessionServerToken: 'primary-server-token',
      fetchPlexResources: async () => [],
      resolvePlexServerToken: () => '',
    });

    assert.equal(token, '');
  });

  it('keeps using the session server token for the primary Plex app when needed', async () => {
    const token = await resolvePlexSettingsToken({
      plexApp: {
        id: 'plex',
        plexMachine: '',
        localUrl: '',
        remoteUrl: '',
        plexHost: '',
        plexToken: '',
      },
      sessionToken: '',
      sessionServerToken: 'primary-server-token',
      fetchPlexResources: async () => [],
      resolvePlexServerToken: () => '',
    });

    assert.equal(token, 'primary-server-token');
  });
});
