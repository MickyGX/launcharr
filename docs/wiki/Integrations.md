# Integrations

## Built-in App Catalog

| App | Icon | ID | Category | Default URL | Overview Modules Available |
| --- | --- | --- | --- | --- | --- |
| Plex | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/plex.png" alt="Plex" width="20" /> | `plex` | `Media` | `http://localhost:32400/web` | Yes |
| Jellyfin | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/jellyfin.png" alt="Jellyfin" width="20" /> | `jellyfin` | `Media` | `http://localhost:8096/web/index.html` | Yes |
| Emby | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/emby.png" alt="Emby" width="20" /> | `emby` | `Media` | `http://localhost:8096/web/index.html` | Yes |
| Tautulli | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/tautulli.png" alt="Tautulli" width="20" /> | `tautulli` | `Manager` | `http://localhost:8181` | Yes |
| Radarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/radarr.png" alt="Radarr" width="20" /> | `radarr` | `Arr Suite` | `http://localhost:7878` | Yes |
| Sonarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/sonarr.png" alt="Sonarr" width="20" /> | `sonarr` | `Arr Suite` | `http://localhost:8989` | Yes |
| Lidarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/lidarr.png" alt="Lidarr" width="20" /> | `lidarr` | `Arr Suite` | `http://localhost:8686` | Yes |
| Readarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/readarr.png" alt="Readarr" width="20" /> | `readarr` | `Arr Suite` | `http://localhost:8787` | Yes |
| Bazarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/bazarr.png" alt="Bazarr" width="20" /> | `bazarr` | `Arr Suite` | `http://localhost:6767` | Yes |
| Prowlarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/prowlarr.png" alt="Prowlarr" width="20" /> | `prowlarr` | `Indexers` | `http://localhost:9696` | Yes |
| Jackett | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/jackett.png" alt="Jackett" width="20" /> | `jackett` | `Indexers` | `http://localhost:9117` | Yes |
| Pulsarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/pulsarr.png" alt="Pulsarr" width="20" /> | `pulsarr` | `Arr Suite` | `http://localhost:3030` | Yes |
| Seerr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/seerr.png" alt="Seerr" width="20" /> | `seerr` | `Arr Suite` | `http://localhost:5055` | Yes |
| Autobrr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/autobrr.png" alt="Autobrr" width="20" /> | `autobrr` | `Arr Suite` | `http://localhost:7474` | Yes |
| Cleanuparr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/cleanuparr.png" alt="Cleanuparr" width="20" /> | `cleanuparr` | `Arr Suite` | `http://localhost:11011` | No (launch/settings only by default) |
| Huntarr | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/huntarr.png" alt="Huntarr" width="20" /> | `huntarr` | `Arr Suite` | `http://localhost:9705` | No (launch/settings only by default) |
| Transmission | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/transmission.png" alt="Transmission" width="20" /> | `transmission` | `Downloaders` | `http://localhost:9091` | Yes |
| qBittorrent | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/qbittorrent.png" alt="qBittorrent" width="20" /> | `qbittorrent` | `Downloaders` | `http://localhost:8080` | Yes |
| SABnzbd | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/sabnzbd.png" alt="SABnzbd" width="20" /> | `sabnzbd` | `Downloaders` | `http://localhost:8085` | Yes |
| NZBGet | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/nzbget.svg" alt="NZBGet" width="20" /> | `nzbget` | `Downloaders` | `http://localhost:6789` | Yes |
| Romm | <img src="https://raw.githubusercontent.com/MickyGX/launcharr/main/public/icons/romm.svg" alt="Romm" width="20" /> | `romm` | `Games` | `http://localhost:8080` | Yes |

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

## Arr, Downloader, and Games Notes

- Arr requests are proxied through Launcharr API routes.
- Downloader queue modules are available for Transmission/qBittorrent/SABnzbd/NZBGet.
- Indexer search modules are available for Prowlarr/Jackett.
- Romm has integrated overview cards for `Recently Added` and `Consoles`.
- Combined Arr/downloader sections can be toggled in display settings.

## Custom Apps

Custom app support includes:

- Name, URL, and category.
- Custom icon upload.
- Launch mode and visibility controls.

Custom app changes are persisted to `config/config.json`.
