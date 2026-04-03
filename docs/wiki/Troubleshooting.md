# Troubleshooting

## Login Loop or Session Loss

Checks:

- Set a non-default `SESSION_SECRET`.
- In production, leave `COOKIE_SECURE` unset unless you need an explicit override.
- Use `COOKIE_SECURE=false` only for local HTTP development.
- Confirm reverse proxy forwards host/protocol headers.
- If you terminate TLS at a proxy, enable `TRUST_PROXY=true` and verify the proxy sends `X-Forwarded-Proto=https`.

## Plex Login Fails or Callback Errors

Checks:

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
