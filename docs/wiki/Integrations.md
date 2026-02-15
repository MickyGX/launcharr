# Integrations

## Built-in App Catalog

| App | ID | Category | Default URL | Overview Modules Available |
| --- | --- | --- | --- | --- |
| Plex | `plex` | `Media` | `http://localhost:32400/web` | Yes |
| Tautulli | `tautulli` | `Manager` | `http://localhost:8181` | Yes |
| Radarr | `radarr` | `Arr Suite` | `http://localhost:7878` | Yes |
| Sonarr | `sonarr` | `Arr Suite` | `http://localhost:8989` | Yes |
| Lidarr | `lidarr` | `Arr Suite` | `http://localhost:8686` | Yes |
| Readarr | `readarr` | `Arr Suite` | `http://localhost:8787` | Yes |
| Bazarr | `bazarr` | `Arr Suite` | `http://localhost:6767` | No (launch/settings only by default) |
| Prowlarr | `prowlarr` | `Arr Suite` | `http://localhost:9696` | Yes |
| Pulsarr | `pulsarr` | `Arr Suite` | `http://localhost:3030` | Yes |
| Seerr | `seerr` | `Arr Suite` | `http://localhost:5055` | Yes |
| Cleanuparr | `cleanuparr` | `Arr Suite` | `http://localhost:11011` | No (launch/settings only by default) |
| Huntarr | `huntarr` | `Arr Suite` | `http://localhost:9705` | No (launch/settings only by default) |
| Transmission | `transmission` | `Downloaders` | `http://localhost:9091` | Yes |
| NZBGet | `nzbget` | `Downloaders` | `http://localhost:6789` | Yes |

## Integration Setup Pattern

For each app:

1. Open `Settings -> [App]`.
2. Set local/remote URL values.
3. Add API key or auth values if required.
4. Save and verify from app overview/activity screens.

## Plex-Specific Notes

- Plex widgets and discovery features rely on valid token + machine matching.
- Use:
  - `GET /api/plex/token`
  - `GET /api/plex/machine`
  from app settings UI actions (`Get Plex Token`, `Get Plex Machine`).

## Arr and Downloader Notes

- Arr requests are proxied through Launcharr API routes.
- Downloader queue modules are available for Transmission/NZBGet.
- Combined Arr/downloader sections can be toggled in display settings.

## Custom Apps

Custom app support includes:

- Name, URL, and category.
- Custom icon upload.
- Launch mode and visibility controls.

Custom app changes are persisted to `config/config.json`.
