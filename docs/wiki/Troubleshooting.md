# Troubleshooting

## Login Loop or Session Loss

Checks:

- Set a non-default `SESSION_SECRET`. Sessions reset on container restart if this is not set.
- Set `COOKIE_SECURE` explicitly — the production image defaults to secure cookies, which will break login over plain HTTP. See [Plex Login Fails or Callback Errors](#plex-login-fails-or-callback-errors) below.
- Confirm reverse proxy forwards `X-Forwarded-Proto` and `X-Forwarded-Host` headers.
- If you terminate TLS at a proxy, enable `TRUST_PROXY=true` and verify the proxy sends `X-Forwarded-Proto=https`.

## Plex Login Fails or Callback Errors

**"No active login session. Please start the login again."** or CSRF validation errors on local account login are almost always caused by the session cookie not being sent back to the server. This happens because the production Docker image defaults to `secure` (HTTPS-only) cookies.

Fix: set `COOKIE_SECURE` explicitly in your compose environment to match how you access Launcharr:

```yaml
# If accessing over plain HTTP (direct IP, Tailscale without HTTPS, no TLS proxy):
- COOKIE_SECURE=false

# If always accessed via HTTPS (reverse proxy with a valid cert):
- COOKIE_SECURE=true
```

If you use a mix of both (e.g. HTTPS domain + direct local IP fallback), always go through the HTTPS URL — the secure cookie will not be sent over plain HTTP.

Other checks:

- `Settings -> General -> Remote URL` is set to your public URL.
- Plex app has correct local/remote URL values.
- Re-run `Get Plex Token` and `Get Plex Machine`.

## Missing Widgets or Empty Dashboard Cards

Checks:

- User role can access app overview menu.
- Overview elements are enabled for that app.
- App credentials/API keys are configured.

## Access Denied for Settings

Expected behavior:

- Only `admin` can access settings routes.
- `co-admin` has overview/launch access but not settings access.

## App Not Loading in Iframe

Common causes:

- Target app denies framing (`X-Frame-Options` / CSP).
- Incorrect remote URL or mixed content issue.

Fix:

- Switch app launch mode to `new-tab`.

## Logs Are Not Persisting

Checks:

- Ensure `DATA_DIR` is writable.
- Confirm `LOG_PATH` points to a writable file path.
- Verify container UID/GID (`PUID`/`PGID`) matches host volume ownership.

## Reset Plex Device Identity

If Plex auth material is corrupted, stop Launcharr and remove:

- `data/plex_private.pem`
- `data/plex_public.json`
- `data/plex_client_id.txt`

Then restart and re-authenticate.
