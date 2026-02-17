# Release Notes (v0.1.0 -> v0.2.10)

## v0.2.10 (2026-02-17)

- Added dedicated Launcharr `Base URL Path` setting in `Settings -> General`.
- Added config-level `general.basePath` handling with path normalization.
- Updated Launcharr callback/public URL generation to apply configured base path.
- Updated app integration URL joins to preserve configured path prefixes (for example `/radarr`, `/prowlarr`).
- Fixed path-stripping behavior that could break integrations when services were hosted under subpaths.
- Moved base URL feature documentation from `v0.2.9` to `v0.2.10` to reflect actual release ownership.


## v0.2.9 (2026-02-17)

- Added `v0.2.9` release artifact files and timeline entry.
- Updated package metadata/version release bookkeeping for `0.2.9`.
- Clarified that base URL/subpath support changes belong to `v0.2.10`.


## v0.2.8 (2026-02-17)

- Added role-based visibility filters in `Settings -> Custom -> Sidebar` so each app can set access for:
  - Sidebar
  - Overview
  - Launch
  - App settings
  - Activity
- Added role-based visibility filters in `Settings -> Custom -> Dashboard` for per-card access control.
- Added category visibility roles in `Settings -> Custom -> Categories`, plus default-category remove/re-add flow with icon dropdown selection.
- Added a sidebar header quick menu with starfield toggle and maximize/minimize-in-browser controls.
- Changed manager/filter UX to use consistent filter-button popovers across cards and settings tables.
- Changed maximize behavior to remain in browser viewport and persist cleanly during navigation.
- Fixed settings-page script regression that blocked manager actions after category updates.
- Fixed dashboard manager filter dropdown click-through where selecting an option could trigger underlying controls.
- Fixed combined downloader re-add labeling (`Combined Download Queue`) and missing `NZBGet` icon rendering.


## v0.2.7 (2026-02-16)

- Added `qBittorrent` and `SABnzbd` as default apps (with uploaded icons) in sidebar/default app management.
- Added downloader queue support for `qBittorrent` and `SABnzbd`, including combined download queue card compatibility.
- Added `qBittorrent` and `SABnzbd` to downloader combined-source selection and queue-card rendering across dashboard/app overview.
- Changed Combined Download Queue source settings UI to use the same source-pill formatting as other combined cards.
- Fixed Prowlarr API key field visibility in both settings locations (`Settings -> Apps` and per-app settings page).

## v0.2.6 (2026-02-16)

- Added Jellyfin and Emby dashboard/app-overview parity for media cards (active streams, recently added, and combined media support).
- Added multi-instance support for Radarr, Sonarr, and Bazarr with instance tabs and instance-specific naming/selection.
- Added dashboard manager improvements for add/remove card workflows, including combined card management and clearer source selection.
- Added default app add/remove controls in sidebar manager, with re-add flow for removed default apps.
- Improved downloader/media icon consistency across sidebar, dashboard manager, and combined card selectors.
- Fixed empty-state behavior for active stream modules to align card output across Plex/Jellyfin/Emby and combined views.


This document summarizes project releases from the initial `v0.1.0` baseline to current `v0.2.10`.

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
