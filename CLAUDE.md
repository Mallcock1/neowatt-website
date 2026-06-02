# NEOWATT splash page

Single-page marketing/splash site built with **Vite** (vanilla JS, no framework).
Deployed to **GitHub Pages** at the custom domain **neowatt.co.uk**.

## Branch model & deployment — read this first

- **`master` is the only branch you edit.** It holds the source (the Vite
  project). Editing source on `master` is all you do.
- **Deployment is fully automated.** Pushing to `master` triggers
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which runs
  `npm ci && npm run build` and publishes the `dist/` output directly to
  GitHub Pages (Pages "source" = **GitHub Actions**, not a branch).
- **There is no `gh-pages` branch to maintain.** Do **not** hand-build `dist/`,
  do **not** copy files into a worktree, and do **not** push to any `gh-pages`
  branch. If you find yourself doing git surgery to deploy, stop — the
  workflow does it.
- **Custom domain** lives in [`public/CNAME`](public/CNAME) (`neowatt.co.uk`),
  so Vite copies it into `dist/` on every build. It is in source — never
  re-add it by hand to a build output.

To ship a content change: edit source, commit to `master`, push. Watch the
run in the GitHub **Actions** tab. That's the whole deploy.

## Local development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the built dist/ locally
```

## Project layout

- `index.html` — the page entry (Vite root). Contains the SEO/Open Graph meta tags.
- `src/` — JavaScript and styles.
- `assets/` — images/models referenced as plain strings in JSON; a Vite plugin
  in [`vite.config.js`](vite.config.js) copies the whole dir into `dist/` verbatim.
- `public/` — static files copied to `dist/` as-is, including:
  - `CNAME` — the custom domain.
  - `HAPS/`, `VLEO/`, `scan/` — standalone static sub-pages served at
    `/HAPS`, `/VLEO`, `/scan` (dev-server middleware in `vite.config.js`
    mirrors this locally).
- `preview-dist/` — committed preview builds (`npm run build:previews`) used for
  sharing design variants. Generated output; regenerate rather than hand-edit.

## Gotchas

- `dist/` is build output — never commit it or edit it by hand.
- Default Vite base path (`/`) is correct for the apex custom domain; do not set
  a subpath `base`.
