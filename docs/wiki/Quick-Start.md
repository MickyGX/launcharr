# Quick Start

## Prerequisites

- Docker and Docker Compose.
- Running Plex server and target Arr apps.
- Writable host directories for `config/` and `data/`.

## Option A: Docker Run

```bash
docker run -d \
  --name=launcharr \
  --restart unless-stopped \
  -p 3333:3333 \
  -e CONFIG_PATH=/app/config/config.json \
  -e DATA_DIR=/app/data \
  -e SESSION_SECRET=replace-this \
  -v ./config:/app/config \
  -v ./data:/app/data \
  -v ./data/icons/custom:/app/public/icons/custom \
  mickygx/launcharr:development
```

## Option B: Docker Compose

```yaml
services:
  launcharr:
    image: mickygx/launcharr:development
    container_name: launcharr
    ports:
      - "3333:3333"
    environment:
      - CONFIG_PATH=/app/config/config.json
      - DATA_DIR=/app/data
      - SESSION_SECRET=replace-this
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ./data/icons/custom:/app/public/icons/custom
    restart: unless-stopped
```

```bash
docker compose up -d
```

## First Login and Plex Setup

1. Open `http://localhost:3333`.
2. If no local admin exists yet, Launcharr redirects to `/setup`.
3. Create the local fallback admin account.
4. Open `Plex -> Settings` and set `Local URL` and `Remote URL`.
5. Use `Get Plex Token` and `Get Plex Machine`.
6. Save settings and confirm Plex widgets on the dashboard.
7. Log out and test Plex SSO login.

## Reverse Proxy Setup

- Start from `docker-compose.traefik.example.yml`.
- Replace `launcharr.example.com` with your domain.
- Set `Settings -> General -> Remote URL` to your public URL.
- If behind HTTPS, set `COOKIE_SECURE=true`.

## Local Development

```bash
npm install
npm start
```

Default local URL: `http://localhost:3333`
