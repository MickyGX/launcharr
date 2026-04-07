# Troubleshooting

## Plex login fails or shows "No active login session"

This error (and CSRF validation failures on local account login) means the session cookie was not sent back to the server.

The production Docker image defaults to secure (HTTPS-only) cookies. If you access Launcharr over plain HTTP, the browser silently drops the cookie and the login flow fails.

Fix: set `COOKIE_SECURE` in your compose environment to match how you access Launcharr:

```yaml
# Plain HTTP (direct local IP, Tailscale without HTTPS, no TLS proxy):
- COOKIE_SECURE=false

# HTTPS only (reverse proxy with a valid cert):
- COOKIE_SECURE=true
```

If you use both a HTTPS domain and a direct local IP, always go through the HTTPS URL — secure cookies will not be sent over plain HTTP.

## Login loop or session loss

Check:

- `SESSION_SECRET` is set to a non-default value. Sessions reset on container restart if this is not configured.
- `COOKIE_SECURE` matches your access method (see above).
- Reverse proxy forwards `X-Forwarded-Proto` and `X-Forwarded-Host` headers.
- `TRUST_PROXY=true` is set if you terminate TLS at a proxy.

## Config file corrupted or broken

Rename or delete `config/config.json` and restart. Launcharr regenerates a clean default on startup. Your database and uploaded icons in `data/` are unaffected.

```bash
mv ./config/config.json ./config/config.json.bak
docker compose restart launcharr
```

## App overview or widget stats are missing

Check:

- The app is enabled and not set to `disabled` launch mode.
- Credentials and URLs are saved in the app's settings page.
- The user role has overview/launch access enabled for that app in `Settings -> Display`.

## App not loading in iframe

Common causes:

- The target app blocks framing via `X-Frame-Options` or CSP headers.
- Mixed content (HTTP app embedded in HTTPS Launcharr).

Fix: switch the app's launch mode to `new-tab`.

## Settings access denied

Only `admin` can access settings routes. `co-admin` has overview and launch access but not settings access. This is expected behavior.

## Logs are not persisting

Check:

- `DATA_DIR` is writable by the container.
- `LOG_PATH` points to a writable path.
- Container `PUID`/`PGID` matches host volume ownership.

## Reset Plex device identity

If Plex auth material is corrupted, stop Launcharr and remove:

- `data/plex_private.pem`
- `data/plex_public.json`
- `data/plex_client_id.txt`

Then restart and re-authenticate.

## Logs

Use `Settings -> Logs` and filter by component to diagnose issues:

- `plex` — Plex SSO and webhook events
- `webhook` — incoming webhook processing
- `settings` — settings save/load activity
- `auth` — login and session events

This is usually the fastest way to confirm whether a login flow, app credential check, or webhook completed successfully.
