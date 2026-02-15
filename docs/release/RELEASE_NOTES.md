# Release Notes (v0.1.0 -> v0.2.5)

This document summarizes project releases from the initial `v0.1.0` baseline to current `v0.2.5`.

## v0.2.5 (2026-02-15)

- Added 3D starfield background support across dashboard, overview, startup, login, and setup pages.
- Set starfield defaults (density `165`, speed `45`, size `1.2`) and removed star sliders from settings.
- Kept animated space background + free carousel toggles and simplified theme option logic.
- Fixed horizontal page drift affecting dashboard/overview top bar alignment.
- Bumped package version to `0.2.5`.

## v0.2.4 (2026-02-15)

- Added custom theme toggles (sidebar invert, square corners, animated background, free carousel scroll).
- Added ARR Calendar as a configurable overview section, including combined ARR calendar support.
- Expanded default app/overview config (including Bazarr defaults).
- Improved free-scrolling carousel behavior across ARR/Plex/Pulsarr/Tautulli overviews.
- Improved mobile UX for sidebar/nav behavior, launch-page frame sizing/spacing, and calendar continuity.
- Hardened ARR proxy/fallback paths with timeout handling and structured client/server error logging.
- Updated service worker cache strategy to reduce stale assets.

## v0.2.3 (2026-02-13)

- Fixed Pulsarr regression and restored dedicated API flow stability.
- Added/fixed Seerr API integration (stats + TMDB details).
- Improved request-app fallback behavior and diagnostics.
- Included latest UI/settings refinements from prior v0.2.x work.

Note: this release is published as `v0.2.3` (version naming has been normalized in later release workflow/docs).

## v0.2.2 (2026-02-13)

- Broad frontend and UX pass across overview/activity/settings pages.
- Updated ARR/download queue and app overview client scripts.
- Updated PWA/service-worker assets and styles for consistency/performance.

## v0.2.1 (2026-02-13)

- Introduced theme system with brand presets and custom color wheel/contrast handling.
- Applied theme variables across major UI surfaces for consistent light/dark and brand rendering.
- Refreshed settings UI (tab/subtab icons, active states, readability/accessibility polish).
- Added inline per-app settings panels in `Settings -> Apps` with icon+name switcher.
- Updated app settings save flow to return to `/settings?tab=app&app=<id>`.
- Delivered major mobile UX fixes across settings grids/forms/tables and controls.
- Updated version badge behavior (hidden in user view, compact labels on mobile).

## v0.2.0 (2026-02-13)

- UI tidying pass.
- Added light/dark mode support.

## v0.1.9 (2026-02-11)

- Major settings UI overhaul to improve intuitiveness.
- Adjusted settings tab styling and layering.

## v0.1.8 (2026-02-10)

- Follow-up update to guest access control and user settings placement.

## v0.1.7 (2026-02-10)

- Added guest access control with setting placement in user settings tab.
- Included hardening for non-owner Plex token overwrite path.

## v0.1.6 (2026-02-10)

- Fixed non-owner Plex token overwrite.
- Included Plex watchlist flag + Plex SSO reliability updates from in-between commits.
- Updated README quick start/compose guidance.

## v0.1.5 (2026-02-09)

- Fixed Plex SSO flow.
- Cleaned debug logs.

## v0.1.4 (2026-02-09)

- Added watchlist flag to Plex “Most Watchlisted This Week” overview cards.
- Fixed Plex SSO login behavior.

## v0.1.3 (2026-02-09)

- Added version badge.
- Added Docker build argument support.

## v0.1.2 (2026-02-09)

- Fixed duplicate favourites in sidebar.

## v0.1.1 (2026-02-09)

- Fixed Plex token retrieval for server access.

## v0.1.0 (2026-02-08)

- Initial clean import / baseline project state.
- Initial public-release scaffolding (dashboard app, Docker/Compose setup, Plex SSO + Arr hub foundation).
