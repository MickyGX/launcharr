import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractCuratorrAdminSummaryMetrics } from '../routes/api-specialty.js';

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
