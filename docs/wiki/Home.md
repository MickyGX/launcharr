# Launcharr Wiki

Launcharr is a Plex-authenticated homepage for the Arr ecosystem and download tools.

Use this wiki as the operational source of truth for setup, roles, and rollout.

## Preview

![Launcharr logo](../media/launcharr-logo.png)

### Login

![Login preview](../media/login-preview.png)

### Dashboard

![Dashboard preview](../media/dashboard-preview.png)

### App Overview

![App overview preview](../media/app-overview-preview.png)

### Settings

![Settings preview](../media/settings-preview.png)

### Mobile

![Mobile preview](../media/mobile-preview.png)

### Launch Flow (GIF)

![Launch flow demo](../media/launch-flow.gif)

## Start Here

1. [Quick Start](Quick-Start)
2. [Configuration](Configuration)
3. [Authentication and Roles](Authentication-and-Roles)
4. [Integrations](Integrations)
5. [Supported Apps](Supported-Apps)
6. [Troubleshooting](Troubleshooting)
7. [FAQ](FAQ)
8. [Release Checklist](Release-Checklist)

## What Launcharr Solves

- One entry point for Plex + Arr + downloader stack.
- Role-aware visibility for admins and non-admin users.
- Configurable dashboard modules and app launch behavior.
- Unified UX for settings, activity, and quick app access.

## Key Product Capabilities

- Plex SSO flow with local fallback admin account.
- Admin, co-admin, and user role model.
- Per-app menu permissions and launch modes (`iframe`, `new-tab`, `disabled`).
- Built-in app catalog with custom app/category support.
- Optional Apprise notifications and built-in logs.

## Operational Endpoints

- `GET /healthz`
- `GET /api/version`
- `GET /api/logs` (authenticated)
