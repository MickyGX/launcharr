# Launcharr

A Plex-authenticated homepage for the Arr suite and download clients.

## Quick start

Docker

Using docker run -

Create and run the container with the following command:

```bash
docker run -d \
  --name=launcharr \
  --restart unless-stopped \
  -p 3333:3333 \
  -e PUID=<uid> \
  -e PGID=<gid> \
  -e TZ=<timezone> \  
  -e CONFIG_PATH=/app/config/config.json \
  -e DATA_DIR=/app/data \
  -v ./config:/app/config \
  -v ./data:/app/data \
  -v ./data/icons/custom:/app/public/icons/custom \
  mickygx/launcharr:development
```

Using docker compose file:

```bash
services:
  launcharr:
    container_name: launcharr
    image: mickygx/launcharr:development
    ports:
      - "3333:3333"
    environment:
      - CONFIG_PATH=/app/config/config.json
      - DATA_DIR=/app/data
      # - PUID=${PUID}
      # - PGID=${PGID}
      # - TZ=${TZ}
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ./data/icons/custom:/app/public/icons/custom
    restart: unless-stopped
```

```bash
docker compose pull launcharr
docker compose up launcharr -d
```

Then open `http://localhost:3333`.

### Environment variables

Launcharr runs with sensible defaults and does not require environment variables for standard usage. If you want the container to run as a specific user/group and avoid permission issues on mounted volumes, set:

- `PUID` and `PGID` to your host user and group IDs (e.g., `1000` / `100`).
- `TZ` to your timezone (e.g., `Europe/London`).

These are supported by `docker-compose.yml` when provided in your `.env`.

## First Run

- On first run an admin account can be created as a fallback in case Plex SSO ever fails. Once completed and logged in, on the side menu click on Plex > Settings and fill in Local and Remote Url's and hit save. 

- Activate Plex admin account by logging out of fallback account and logging back in with SSO.

## Notes on Plex SSO

- Launcharr uses the Plex PIN + JWT flow in the browser. Ensure your public domain is set in Settings → General → Remote URL so the callback uses your domain.

- On first launch, the first Plex user to sign in is promoted to admin automatically and stored in `data/admins.json`. All other Plex users default to `user` unless you grant them admin access in Settings.

- If you ever need to rotate the Plex device keys, delete the contents of `data/` and restart the container.

## Configuration

- Return to Plex > Settings and if not auto-populated click on Get Plex Token and Get Plex Machine and hit save. Click on Plex > Overview and if everything is working as it should the Plex Carousels will be populated.

- Default apps can be found in Settings > Display and can be Enabled and user visibilty set for Overview and Launch (New Tab or iFrame).

- Saved settings live in `config/default-apps.json`.

- `config/config.json` stores only customizations and custom apps.

- `data/` stores the Plex device keypair used for SSO.

## Docker Compose with Traefik

If you're using Traefik, start from `docker-compose.traefik.example.yml` and replace `launcharr.example.com` with your domain.
