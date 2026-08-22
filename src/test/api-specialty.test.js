import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCuratorrAdminSummaryMetrics,
  extractDockhandArray,
  extractDockhandWidgetMetrics,
  getDockhandEnvironmentId,
} from '../routes/api-specialty.js';

describe('extractCuratorrAdminSummaryMetrics', () => {
  it('extracts all-time Curatorr admin summary counts from the admin users page', () => {
    const html = `
      <div class="cur-stat-card">
        <div class="cur-stat-body">
          <div class="cur-stat-label">Plex users</div>
          <div class="cur-stat-value">44</div>
        </div>
      </div>
      <div class="cur-stat-card">
        <div class="cur-stat-body">
          <div class="cur-stat-label">Active users</div>
          <div class="cur-stat-value cur-stat-value--sm">3 / 3 / 13</div>
        </div>
      </div>
      <div class="cur-stat-card">
        <div class="cur-stat-body">
          <div class="cur-stat-label">Plays</div>
          <div class="cur-stat-value cur-stat-value--sm">313 / 667 / 1,175</div>
        </div>
      </div>
    `;

    const result = extractCuratorrAdminSummaryMetrics(html);

    assert.deepEqual(result, {
      plexUsers: 44,
      activeUsers: 13,
      plays: 1175,
    });
  });

  it('returns null values when the expected Curatorr cards are missing', () => {
    const result = extractCuratorrAdminSummaryMetrics('<div>No summary cards here.</div>');
    assert.deepEqual(result, {
      plexUsers: null,
      activeUsers: null,
      plays: null,
    });
  });
});

describe('Dockhand widget helpers', () => {
  it('extracts environment ids from Dockhand environment payloads', () => {
    assert.equal(getDockhandEnvironmentId({ id: 12, name: 'local' }), 12);
    assert.equal(getDockhandEnvironmentId({ Id: '34', name: 'remote' }), 34);
    assert.equal(getDockhandEnvironmentId({ name: 'missing' }), null);
  });

  it('extracts list payloads from common Dockhand response shapes', () => {
    const direct = [{ name: 'one' }];
    const wrapped = { data: [{ name: 'two' }] };

    assert.equal(extractDockhandArray(direct), direct);
    assert.deepEqual(extractDockhandArray(wrapped, ['items', 'data']), [{ name: 'two' }]);
    assert.deepEqual(extractDockhandArray({ value: [] }, ['items']), []);
  });

  it('aggregates Dockhand containers, stacks, and environments', () => {
    const result = extractDockhandWidgetMetrics({
      containers: [
        { State: 'running' },
        { state: 'exited' },
        { status: 'Up 2 hours (running)' },
      ],
      stacks: [
        { name: 'media' },
        { name: 'monitoring' },
      ],
      environments: [
        { id: 1 },
        { id: 2 },
      ],
    });

    assert.deepEqual(result, [
      { key: 'running', label: 'Running', value: 2 },
      { key: 'stopped', label: 'Stopped', value: 1 },
      { key: 'containers', label: 'Containers', value: 3 },
      { key: 'stacks', label: 'Stacks', value: 2 },
      { key: 'environments', label: 'Environments', value: 2 },
    ]);
  });

  it('falls back to Dockhand dashboard stats when list endpoints are empty', () => {
    const result = extractDockhandWidgetMetrics({
      dashboard: {
        containerStats: {
          runningContainers: 4,
          totalContainers: 7,
        },
        stackStats: {
          totalStacks: 3,
        },
        environmentStats: {
          totalEnvironments: 2,
        },
      },
    });

    assert.deepEqual(result, [
      { key: 'running', label: 'Running', value: 4 },
      { key: 'stopped', label: 'Stopped', value: 3 },
      { key: 'containers', label: 'Containers', value: 7 },
      { key: 'stacks', label: 'Stacks', value: 3 },
      { key: 'environments', label: 'Environments', value: 2 },
    ]);
  });
});
