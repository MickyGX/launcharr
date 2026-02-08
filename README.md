# Launcharr

A Plex-authenticated homepage for the Arr suite and download clients.

## Quick start

```bash
cd /share/Development/launcharr
docker compose up --build
```

Then open `http://localhost:3333`.

## Configuration

- Default apps live in `config/default-apps.json`.
- Copy `config/config.example.json` to `config/config.json` for your overrides (URLs, API keys, visibility, etc.).
- `config/config.json` stores only customizations and custom apps.
- `data/` stores the Plex device keypair used for SSO.

### Environment variables

Launcharr runs with sensible defaults and does not require environment variables for standard usage. If you want the container to run as a specific user/group and avoid permission issues on mounted volumes, set:

- `PUID` and `PGID` to your host user and group IDs (e.g., `1000` / `100`).
- `TZ` to your timezone (e.g., `Europe/London`).

These are supported by `docker-compose.yml` when provided in your `.env`.

## Notes on Plex SSO

Launcharr uses the Plex PIN + JWT flow in the browser. Ensure your public domain is set in Settings → General → Remote URL so the callback uses your domain.

On first launch, the first Plex user to sign in is promoted to admin automatically and stored in `data/admins.json`. All other Plex users default to `user` unless you grant them admin access in Settings.

If you ever need to rotate the Plex device keys, delete the contents of `data/` and restart the container.

## Docker Compose with Traefik

If you're using Traefik, start from `docker-compose.traefik.example.yml` and replace `launcharr.example.com` with your domain.
