# Quick Start

## Prerequisites

- Docker and Docker Compose.
- Running Plex server and target Arr apps.
- Writable host directories for `config/` and `data/`.

## Option A: Docker Run

Generate a persistent session secret once (pick one):

- `openssl rand -hex 32`
- `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

```bash
# Example:
# SESSION_SECRET="$(openssl rand -hex 32)"

docker run -d \
  --name=launcharr \
  --restart unless-stopped \
  -p 3333:3333 \
  -e CONFIG_PATH=/app/config/config.json \
  -e DATA_DIR=/app/data \
  -e BASE_URL=http://localhost:3333 \
  -e TRUST_PROXY=true \
  -e TRUST_PROXY_HOPS=1 \
  -e SESSION_SECRET=replace-this-with-your-generated-secret \
  -e COOKIE_SECURE=false \
  -v ./config:/app/config \
  -v ./data:/app/data \
  -v ./data/icons/custom:/app/public/icons/custom \
  mickygx/launcharr:latest
```

## Option B: Docker Compose

```yaml
services:
  launcharr:
    image: mickygx/launcharr:latest
    container_name: launcharr
    ports:
      - "3333:3333"
    environment:
      - CONFIG_PATH=/app/config/config.json
      - DATA_DIR=/app/data
      - BASE_URL=http://localhost:3333
      - TRUST_PROXY=true
      - TRUST_PROXY_HOPS=1
      # Generate once: openssl rand -hex 32
      - SESSION_SECRET=replace-this-with-your-generated-secret
      # IMPORTANT: The production image defaults to secure (HTTPS-only) session cookies.
      # Set COOKIE_SECURE=false if you access Launcharr over plain HTTP
      # (direct local IP, Tailscale without HTTPS, or no reverse proxy with TLS).
      # Set COOKIE_SECURE=true if you always access via HTTPS (e.g. behind a reverse proxy with a cert).
      # If this is not set correctly, Plex login and local account login will fail silently.
      # - COOKIE_SECURE=false   # use this for plain HTTP access
      # - COOKIE_SECURE=true    # use this for HTTPS-only access
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
- Set `BASE_URL` in the Traefik compose file to your public URL (`https://...`).
- Start with:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.example.yml up -d
```

## Local Development

```bash
npm install
npm start
```

Default local URL: `http://localhost:3333`
