# Kagaz — standalone site

A single self-contained `index.html` — the whole platform (landing page, photobook
editor, store with cart, blog with a CMS, and an admin order panel) with **zero
build step**. Styling matches Printbox's navy-and-orange brand.

## What's inside
- **Landing page** — hero, features, pricing.
- **Editor** (`Create a book`) — full-screen dark studio: drag-and-drop photo upload
  (HEIC/TIFF decode in-browser), Smart Layout auto-fill, colour/brightness/contrast/
  saturation correction, text with 3 typefaces + AI caption suggestions, 20→48 pages
  in steps of 4, undo/redo, spread preview, demo payment checkout.
- **Store** (`Store` in the nav) — calendars, cards, canvas, prints, mini-books,
  magnets; a cart drawer with quantity controls and its own checkout.
- **Journal / blog** — public post grid + reader view.
- **Studio admin** — orders table with a status pipeline, and a rich-text (contenteditable)
  post composer that publishes straight to the Journal.

Everything runs in memory in the browser (no backend, no database) — refreshing
resets state. This is the complete front-of-house experience; wiring it to a real
database, auth, and payment provider is described in `kagaz-architecture.md` and the
`kagaz-monorepo.zip` companion project, both shipped alongside this file.

## Deploy — pick any one, no build step required

### GitHub Pages
1. Push this folder to a GitHub repo (`index.html` at the repo root).
2. Repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. The included `.github/workflows/pages.yml` deploys on every push to `main`.
   (Or skip Actions entirely: Settings → Pages → Source: **Deploy from a branch** → `main` / `/root`.)

### Vercel
1. `vercel` (CLI) or import the repo at vercel.com/new.
2. Framework preset: **Other**. No build command, no install command, output directory `.`.
3. `vercel.json` is included so every route falls back to `index.html`.

### Netlify
1. `netlify deploy` (CLI) or "Add new site → Import an existing project" in the dashboard.
2. Build command: *(none)*. Publish directory: `.`.
3. `netlify.toml` is included with the SPA redirect already configured.

## Local preview
Any static server works, e.g. `npx serve .` or `python3 -m http.server`, then open the printed URL.
