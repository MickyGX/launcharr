# Supported Apps

This page lists Launcharr supported integrations, grouped by type, starting with Plex.

## Media and Plex Ecosystem

| Icon | App | ID | Major Integration Features |
| --- | --- | --- | --- |
| <img src="../../public/icons/plex.png" alt="Plex" width="20" /> | Plex | `plex` | Plex SSO login flow<br>Active streams / Recently added / Watchlisted cards<br>Plex user sync + role assignment |
| <img src="../../public/icons/jellyfin.png" alt="Jellyfin" width="20" /> | Jellyfin | `jellyfin` | Active streams + Recently added cards<br>Combined media card support<br>Artwork proxy/fallback handling |
| <img src="../../public/icons/emby.png" alt="Emby" width="20" /> | Emby | `emby` | Active streams + Recently added cards<br>Combined media card support |
| <img src="../../public/icons/tautulli.png" alt="Tautulli" width="20" /> | Tautulli | `tautulli` | Watch statistics cards<br>Watch statistics wheel card |

## ARR Suite (Core Library Management)

| Icon | App | ID | Major Integration Features |
| --- | --- | --- | --- |
| <img src="../../public/icons/radarr.png" alt="Radarr" width="20" /> | Radarr | `radarr` | Downloading soon / Recently downloaded cards<br>Activity queue table + sorting + pagination<br>Calendar card |
| <img src="../../public/icons/sonarr.png" alt="Sonarr" width="20" /> | Sonarr | `sonarr` | Downloading soon / Recently downloaded cards<br>Calendar card |
| <img src="../../public/icons/lidarr.png" alt="Lidarr" width="20" /> | Lidarr | `lidarr` | Downloading soon / Recently downloaded cards<br>Calendar card |
| <img src="../../public/icons/readarr.png" alt="Readarr" width="20" /> | Readarr | `readarr` | Downloading soon / Recently downloaded cards<br>Activity queue table + sorting + pagination<br>Calendar card |
| <img src="../../public/icons/bazarr.png" alt="Bazarr" width="20" /> | Bazarr | `bazarr` | Subtitle queue table card<br>Type/status filters + paging controls |

## Indexers and Search

| Icon | App | ID | Major Integration Features |
| --- | --- | --- | --- |
| <img src="../../public/icons/prowlarr.png" alt="Prowlarr" width="20" /> | Prowlarr | `prowlarr` | Indexer search table card<br>Indexer/category filter popover<br>Numeric paging + result actions |
| <img src="../../public/icons/jackett.png" alt="Jackett" width="20" /> | Jackett | `jackett` | Major default integration (v0.2.14)<br>Indexer search card parity with Prowlarr<br>Numeric paging + filter support |

## Requests and Automation

| Icon | App | ID | Major Integration Features |
| --- | --- | --- | --- |
| <img src="../../public/icons/pulsarr.png" alt="Pulsarr" width="20" /> | Pulsarr | `pulsarr` | Recent requests card<br>Most watchlisted card |
| <img src="../../public/icons/seerr.png" alt="Seerr" width="20" /> | Seerr | `seerr` | Recent requests card<br>Most watchlisted card |
| <img src="../../public/icons/autobrr.png" alt="Autobrr" width="20" /> | Autobrr | `autobrr` | Major default integration (v0.2.14)<br>Recent matches + Delivery queue table cards<br>Status filtering support |
| <img src="../../public/icons/maintainerr.svg" alt="Maintainerr" width="20" /> | Maintainerr | `maintainerr` | Library media carousel card (Movie/TV + A-Z filters)<br>Rules card with execute action<br>Collections media carousel card with in-card collection filter |
| <img src="../../public/icons/cleanuparr.png" alt="Cleanuparr" width="20" /> | Cleanuparr | `cleanuparr` | App launch + settings integration |
| <img src="../../public/icons/huntarr.png" alt="Huntarr" width="20" /> | Huntarr | `huntarr` | App launch + settings integration |

## Download Clients

| Icon | App | ID | Major Integration Features |
| --- | --- | --- | --- |
| <img src="../../public/icons/transmission.png" alt="Transmission" width="20" /> | Transmission | `transmission` | Activity queue table card<br>Status/type filtering<br>Combined downloader queue support |
| <img src="../../public/icons/qbittorrent.png" alt="qBittorrent" width="20" /> | qBittorrent | `qbittorrent` | Activity queue table card<br>Status/type filtering<br>Combined downloader queue support |
| <img src="../../public/icons/sabnzbd.png" alt="SABnzbd" width="20" /> | SABnzbd | `sabnzbd` | Activity queue table card<br>Status filtering<br>Combined downloader queue support |
| <img src="../../public/icons/nzbget.svg" alt="NZBGet" width="20" /> | NZBGet | `nzbget` | Activity queue table card<br>Status filtering<br>Combined downloader queue support |

## Notes

- Launcharr also supports custom apps with custom categories/icons.
- Card visibility and per-role access can be controlled in `Settings -> Custom -> Dashboard` and `Settings -> Custom -> Sidebar`.
