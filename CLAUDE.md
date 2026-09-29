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

- `index.html` — the page entry (Vite root). Holds all the copy, one `<section
  class="panel">` per stop, and the SEO/Open Graph meta tags.
- `src/main.js` — maps scroll position to the camera (a pause at each panel, then
  a ride to the next), plus the menu, altitude readout and newsletter form.
- `src/scene.js` — the three.js scene: Earth, satellites, power beams, and one
  camera keyframe per panel in `KEYS`. Adding or removing a panel in `index.html`
  needs a matching keyframe here.
- `src/styles/` — `tokens.css` (colours, type), `base.css`, `sections.css`.
- `assets/` — images referenced by absolute path (`/assets/...`); a Vite plugin
  in [`vite.config.js`](vite.config.js) copies the whole dir into `dist/` verbatim.
  `assets/images/land-mask.png` is the 360 x 180 land map the Earth is drawn from.
- `public/` — static files copied to `dist/` as-is, including:
  - `CNAME` — the custom domain.
  - `HAPS/`, `VLEO/`, `linktree/`, `privacy/`, `scan/` — standalone static
    sub-pages (dev-server middleware in `vite.config.js` mirrors this locally).
    They use the logo and favicon from `assets/`.

## Gotchas

- The co-founder is in stealth: the headshot and two of the "experience from"
  logos are blurred in the image files themselves. Do not add the originals, his
  name or his LinkedIn to the page until told he is out of stealth.
- `dist/` is build output — never commit it or edit it by hand.
- Default Vite base path (`/`) is correct for the apex custom domain; do not set
  a subpath `base`.
