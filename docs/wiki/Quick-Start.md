# Quick Start

## 1. Create your compose file

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
      # Set based on how you access Launcharr — if wrong, Plex and local login will fail.
      # Plain HTTP (direct local IP, no TLS reverse proxy, Tailscale without HTTPS):
      - COOKIE_SECURE=false
      # HTTPS only (reverse proxy with a valid cert):
      # - COOKIE_SECURE=true
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ./data/icons/custom:/app/public/icons/custom
    restart: unless-stopped
```

Generate `SESSION_SECRET` with:

```bash
openssl rand -hex 32
```

## 2. Start the container

```bash
docker compose up -d
```

## 3. Complete initial setup

Open `http://localhost:3333`.

If no local admin exists yet, Launcharr redirects to `/setup`. Create the local fallback admin account — this is your recovery account, keep the credentials safe.

## 4. Configure Plex

In `Settings -> Plex`:

1. Set `Local URL` and `Remote URL`
2. Use `Get Plex Token` and `Get Plex Machine`
3. Save settings

## 5. Recommended first checks

- `Settings -> General` — confirm `Remote URL` matches your public URL
- `Settings -> Display` — configure app and module visibility by role
- Dashboard — enable the apps you use and configure credentials per app

## 6. Test login

Log out and test Plex SSO login from your configured URL to confirm the full auth flow works end to end.

## Reverse Proxy Setup

For Traefik, start from `docker-compose.traefik.example.yml`:

- Replace `launcharr.example.com` with your domain
- Set `BASE_URL` to your public HTTPS URL
- Set `COOKIE_SECURE=true`

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.example.yml up -d
```

## Next Steps

- [Configuration](Configuration.md)
- [Authentication and Roles](Authentication-and-Roles.md)
- [Integrations](Integrations.md)
- [Supported Apps](Supported-Apps.md)
- [Troubleshooting](Troubleshooting.md)
