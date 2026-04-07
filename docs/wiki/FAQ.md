# FAQ

---

**Does Launcharr require Plex?**

Plex SSO is the main authentication path, but Launcharr also supports a local fallback admin account for initial setup and recovery. All settings and configuration are accessible via the local account.

---

**What roles are available?**

- `admin` — full access including settings
- `co-admin` — overview and launch access, no settings
- `user` — standard access with user-level visibility
- `guest` — dashboard/module visibility role for view-mode and access control tuning

---

**Where are my settings saved?**

- App and category overrides: `config/config.json`
- Admin and co-admin lists: `data/admins.json`, `data/coadmins.json`
- Logs: `data/logs.json`

---

**Can I hide apps from regular users?**

Yes. Use `Settings -> Display` to control overview and launch visibility per role.

---

**Can I add custom apps?**

Yes. Launcharr supports custom apps, categories, and custom icon uploads.

---

**Why do some apps work better in new tab mode?**

Some apps block iframe embedding via security headers (`X-Frame-Options`, CSP). Switch to `new-tab` launch mode for those apps.

---

**How do I make guest users read-only?**

Use role permissions and `restrictGuests` in general settings to constrain access behavior.

---

**Plex login fails or shows "No active login session"**

This is almost always a session cookie issue. The production image defaults to secure (HTTPS-only) cookies. If you access Launcharr over plain HTTP, set `COOKIE_SECURE=false` in your compose environment.

See [Troubleshooting](Troubleshooting.md) for the full diagnosis.

---

**Is there a health endpoint for monitoring?**

Yes: `GET /healthz`

---

**How do I reset my config if something goes wrong?**

Rename or delete `config/config.json` and restart the container. Launcharr will regenerate a clean default config on startup. Your app data in `data/` is unaffected.

```bash
mv ./config/config.json ./config/config.json.bak
docker compose restart launcharr
```
