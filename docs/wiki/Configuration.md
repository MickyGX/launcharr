# Configuration

## Config Model

Launcharr merges shipped defaults with user overrides:

- `config/default-apps.json`: built-in app definitions.
- `config/default-categories.json`: built-in category definitions.
- `config/config.json`: only your overrides/customizations are saved.

This keeps upgrades cleaner because defaults can evolve while your override file stays compact.

## General Settings

`Settings -> General` writes to `config.general`.

Important fields:

- `serverName`
- `localUrl`
- `remoteUrl`
- `restrictGuests`
- `autoOpenSingleAppMenuItem`
- `hideSidebarAppSettingsLink`
- `hideSidebarActivityLink`

## App Display and Launch

`Settings -> Display` controls:

- App visibility by role.
- Overview and launch permission toggles.
- Launch mode per app:
  - `iframe`
  - `new-tab`
  - `disabled`
- Category assignment and ordering.
- Combined Arr/downloader dashboard sections.
- Queue column visibility and row limits.

## App Credentials and Integrations

Per-app `Settings` pages store credentials and connection info (for example API keys, tokens, local/remote URLs).

Plex-specific:

- `Get Plex Token`
- `Get Plex Machine`

These are used by Plex widgets and user management flows.

## Roles and User Access

Role mappings and ownership files:

- `data/admins.json`
- `data/coadmins.json`

Plex-based role assignment is managed in `Settings -> Users`.

## Notifications

`Settings -> Notifications` supports Apprise:

- `appriseEnabled`
- `appriseApiUrl`
- `appriseMode` (`targets` or `config-key`)
- `appriseTargets`
- `appriseConfigKey`
- `appriseTag`

Use `Test Notification` to validate routing before rollout.

## Logs

`Settings -> Logs` controls retention:

- `maxEntries`
- `maxDays`
- `visibleRows`

Persisted file:

- `data/logs.json` (or `LOG_PATH` if overridden)

## Example Override (`config/config.json`)

```json
{
  "general": {
    "serverName": "Launcharr",
    "remoteUrl": "https://launcharr.example.com",
    "localUrl": "http://192.168.1.20:3333",
    "restrictGuests": false,
    "autoOpenSingleAppMenuItem": false,
    "hideSidebarAppSettingsLink": false,
    "hideSidebarActivityLink": false
  },
  "logs": {
    "maxEntries": 500,
    "maxDays": 14,
    "visibleRows": 15
  },
  "notifications": {
    "appriseEnabled": false,
    "appriseApiUrl": "",
    "appriseMode": "targets",
    "appriseTargets": "",
    "appriseConfigKey": "",
    "appriseTag": ""
  }
}
```
