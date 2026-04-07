# Integrations

Launcharr ships with a built-in app catalog from `config/default-apps.json`.

Current catalog status:

- `48` built-in app definitions.
- Built-ins are opt-in (`removed: true`) until enabled from settings.
- App support levels vary: full overview modules, widget stats, or launch/settings only.

For the full catalog with support levels, overview modules, and default URLs see [Supported Apps](Supported-Apps.md).

## Setup Pattern

For each enabled app:

1. Open `Settings -> [App]`.
2. Set local/remote URL values.
3. Add credentials or API keys if needed.
4. Save and validate from dashboard, overview, or widget cards.

## Credential Notes by Integration

- Plex: use `Get Plex Token` and `Get Plex Machine` in app settings.
- Immich: requires API key (`x-api-key`) for recent assets and thumbnail proxy.
- Audiobookshelf: requires bearer API key for recent items and cover proxy.
- Tdarr: supports `x-api-key`; stats can work without key depending on server config.
- Wizarr: supports optional `X-API-Key`.
- Uptime Kuma: set `uptimeKumaSlug` for status-page API reads.

## Overview Modules

Overview modules are currently implemented for:

- Media: Plex, Jellyfin, Emby, Audiobookshelf, Tdarr.
- Arr Suite: Radarr, Sonarr, Lidarr, Readarr, Bazarr, Autobrr, Maintainerr.
- Requesters: Pulsarr, Seerr.
- Indexers: Prowlarr, Jackett.
- Downloaders: Transmission, qBittorrent, SABnzbd, NZBGet, slskd, MeTube.
- Specialty: Romm, Immich, Wizarr, Uptime Kuma, Guacamole.
- Manager: Tautulli.

## Widget Stats

Widget stat cards are available for a broader set than overview modules, including:

- Core media/arr/downloader stack.
- Immich, Uptime Kuma, MeTube, Audiobookshelf, Tdarr, Wizarr.
- System services like Portainer, Glances, Speedtest Tracker, Gluetun, Paperless-ngx, Guardian.
- Additional tools and Arr utilities: Apprise, Termix, ErsatzTV, Sortarr, Profilarr, Agregarr.

## Custom Apps

Custom apps support:

- Name, URL, category, and icon upload.
- Launch mode (`iframe`, `new-tab`, `disabled`).
- Role-aware overview/launch/settings/sidebar visibility.

Customizations are persisted in `config/config.json`.
