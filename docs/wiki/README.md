# Launcharr Wiki (In-Repo Source)

This folder contains launch-ready wiki pages for Launcharr.

You can:

- Keep these pages in-repo as product documentation.
- Copy them into a GitHub Wiki repository as-is.
- Edit them as your release process matures.

Recommended publish order:

1. `Home.md`
2. `Quick-Start.md`
3. `Configuration.md`
4. `Authentication-and-Roles.md`
5. `Integrations.md`
6. `Troubleshooting.md`
7. `FAQ.md`
8. `Release-Checklist.md`

## Publish To GitHub Wiki

From repository root:

```bash
chmod +x scripts/publish-wiki.sh
scripts/publish-wiki.sh
```

If your `origin` remote is not the target repo:

```bash
scripts/publish-wiki.sh --repo owner/repo
```

Preview without pushing:

```bash
scripts/publish-wiki.sh --dry-run
```

The publish script also syncs screenshot assets from `docs/media/` into the wiki repo under `media/`, and rewrites wiki page image links to use `media/...` paths.
