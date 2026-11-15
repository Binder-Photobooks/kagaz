# SEO changes (September 2026)

## What changed

- **One HTML file per public page.** `photobooks.html`, `pricing.html`, `isbn.html` and the other
  pages are generated from `index.html` by `scripts/prerender.mjs`. Each has its own title,
  description, canonical URL, Open Graph/Twitter tags, breadcrumb (and Service) structured data,
  and the right section visible. Before, every URL served the homepage's HTML with a canonical
  pointing at the homepage, so Google folded every page into `/`.
- **`app.html`** is served for dynamic URLs (`/store/<slug>`, `/journal/<slug>`, `/admin`,
  `/editor/…`). It has no canonical tag; `script.js` adds the correct one for each product/post.
- **Private UI removed from public pages.** Dashboard, admin, checkout, sign-in, the editors and
  their modals now live inside `<template id="tpl-private">` in `index.html`. `script.js`
  (`mountPrivate()`) inserts it the first time anything needs it, so everything works as before,
  but search engines no longer index admin/checkout text on every page.
  This is about indexing, not security: the markup is still in the page source and `script.js`.
  Real protection remains Supabase row-level security.
- **`.htaccess`** (for the Linux host the domain actually points to): HTTPS + www redirect,
  `/pricing` served from `pricing.html`, `/pricing.html` and `/pricing/` redirected to `/pricing`,
  dynamic URLs served from `app.html`, `X-Robots-Tag: noindex` on `/admin`, `/dashboard`,
  `/editor/*`, and the build script, docs and SQL files blocked from public access.
  `vercel.json` has the same rules in case the site ever moves to Vercel; the live host ignores it.
- **`sitemap.xml`** now lists the fixed pages *and* every store product and journal post
  (`scripts/prerender.mjs` reads them from Supabase), so it works on any host.
- Unknown URLs are marked `noindex` instead of passing as a copy of the homepage.
- Clearer H1s on the three start pages; removed the empty `product:price` and `keywords` meta tags
  (product price tags are now added only on product pages); removed empty `src=""` attributes and
  the "upload via Admin" placeholder text; `rel="nofollow"` on the Admin nav link.

## Your workflow from now on

After editing `index.html`, or `SEO_META` / `START_SEO` / `CONTENT_DEFAULTS` in `script.js`:

```bash
node scripts/prerender.mjs     # regenerates the page files, app.html and sitemap.xml
```

then upload the changed files to the host. Also re-run it after publishing a new journal post or
store product, so `sitemap.xml` includes it.

Forgetting this step means the per-page files keep serving the previous version of the markup.
Add new public pages to `PAGES` in `scripts/prerender.mjs` (and `VIEW_LABELS` in `script.js`).

## After deploying

See **UPLOAD-TO-HOST.md** for the upload steps and the checks to run afterwards.

Google Search Console: submit `sitemap.xml` (remove `sitemap-content.xml` if it was submitted); use URL Inspection on
   `/photobooks`, `/pricing` and `/isbn`, confirm "Google-selected canonical" matches each page,
   and request indexing.

## Page speed (v8)

- The Scanning page's 1.5 MB hero video was downloading on **every** page (it sits in a hidden
  section with `preload="auto"`). It now loads only when the Scanning page is shown.
- Every image outside the visible section is `loading="lazy"`, so hidden sections cost nothing; the
  homepage hero image loads with high priority on `/` only.
- Images recompressed (hero 436 KB → 187 KB, 1600 px wide; others 10–40% smaller).
- Supabase library pinned to 2.117.1 and loaded with `defer` (it was render-blocking in `<head>`);
  the Google Font loads without blocking first paint.
- `.htaccess` turns on gzip/Brotli: HTML ~133 KB → ~25 KB, script.js ~475 KB → ~145 KB,
  styles.css ~56 KB → ~13 KB over the wire. (Vercel compresses automatically.)

Result: homepage goes from about 3.2 MB to about 0.6 MB transferred; other pages to about 0.25 MB.

## Homepage headline (v9)

"It's your moment, save it." stays on one line on every screen size: the font scales with the
screen width (20–65 px, `styles.css`), and `fitHeroHeading()` in `script.js` shrinks it further if
a longer headline is ever set in Admin → Content Manager. The built-in default headline now matches
the live one ("save it.").

## Photobooks page (v10)

The three "Choose a size" options on /photobooks (8.5″×8.5″, 12″×12″, 12″×18″) no longer have
border frames; they now sit flush with the rest of the page. The Art Prints size cards are unchanged.

## Ready-to-go Templates page (v11)

Template cards on /templates no longer have border frames or shadows: the thumbnail keeps its
rounded corners, and the title, description and button line up with its left edge. (Styled only
for the public page, `#tplGridV2`; the admin template list is unchanged.)

## Editors dark by default (v12)

All seven editors — Photobook 8.5″, 12″×12″, 12″×18″, Trade Book, Art Prints (set of 4),
Art Print 12×18 and 16×20 — now open in dark mode. The sun/moon button still switches to light
mode, and a customer's choice is remembered on their device.

## Editors dark by default — follow-up (v13)

The saved theme preference moved to a new key (`binder_ed_theme_v2`), so anyone who had
switched an editor to light mode before now also starts in dark mode. Switching to light still
works and is remembered from here on. The BINDER logo in the editor top bar is now shown in white
in dark mode (it was black on black).

## Editor dark mode fixes (v14)

- Back / Spine / Front (Trade Book cover) and Cover / Back cover (Photobook) buttons were
  unreadable in dark mode — dark text on a dark button, white text on a light selected button.
  They now use the same dark style as the other editor buttons, with the selected one in green.
- The "Exact ink colour — CMYK" box is now dark in dark mode, with readable values and brighter
  C/M/Y/K labels.
- Checked every panel of all seven editors for unreadable text in dark mode; none left.

## Editors: Cover panel only on the cover (v15)

Selecting an inside page (Page 1, Pages 2–3 …) while the Cover tool was open left the "Cover,
spine & back cover" panel showing, so every page looked like it was the cover. Now the panel
switches automatically — to Text in the Trade Book editor, to Photos in the photobook editors —
and the Cover tool always takes you back to the cover. Applies to all book editors.

## Making the SEO pages actually live (v16, 25 Oct 2026)

**Why the September changes never took effect:** the per-page files were uploaded, but `.htaccess`
was not — it is a hidden file, and GitHub's "Add files via upload" and many FTP apps silently skip
hidden files. Without it the host kept routing every URL to the homepage, so Google still saw one
page with one canonical. The `.htaccess` is now back in this folder; **upload it** (see UPLOAD-TO-HOST.md).

- **`.htaccess` rewritten and tested on Apache**: https + www in one hop; `/pricing.html` and
  `/pricing/` → `/pricing`; `/index.html`, `/Index.html`, `/binder-standalone.html` and `/app.html`
  → `/` (old duplicate homepages); `/store/<slug>`, `/journal/<slug>`, `/admin`, `/dashboard`,
  `/editor/…` served from `app.html`; **unknown URLs now return a real 404** (the page still shows
  the site); `X-Robots-Tag: noindex` on admin, dashboard, editors and accounts; build scripts,
  docs, SQL, `.bundle` and `.bak` files blocked; gzip and browser caching switched on.
- **FAQ is now in the page HTML** (it was filled in by JavaScript only, so search engines saw an
  empty FAQ). `prerender.mjs` reads the live FAQ from Supabase, writes it into `index.html`, and
  adds FAQPage structured data on the homepage. `renderFaq()` still re-renders it on load.
- **Scanning page structured data**: a Service entry with Delhi NCR cities and ₹15/MB pricing.
- **Admin link hidden from visitors** (it showed in the nav to everyone). It appears only on a
  device where an admin has signed in at /admin. Real protection is unchanged (Supabase is_admin).
- `prerender.mjs` can use an offline snapshot of the CMS: `CMS_SNAPSHOT=rows.json node scripts/prerender.mjs`.

**New rule, because CSS/JS are now cached for a month:** whenever you change `styles.css` or
`script.js`, bump the `?v=` stamp on both links in `index.html` (e.g. `?v=20261025a` → `?v=20261102a`),
then run `node scripts/prerender.mjs`. Otherwise visitors keep the old file for up to a month.

`htaccess-backup.txt` is an exact copy of `.htaccess`, kept so the rules survive a GitHub web
upload (which drops hidden files). If `.htaccess` ever goes missing, copy it and rename to `.htaccess`.

## New landing page and guides (v17, 25 Oct 2026)

Five new pages, each served as its own HTML file with its own title, description, canonical and
structured data, and linked from the footer (every page) and the /sitemap page:

| URL | What it is | Structured data |
|---|---|---|
| `/wedding-photobooks` | Landing page for wedding albums: sizes, 40-page costs, family copies, FAQ | Service (3 offers) + FAQPage + breadcrumb |
| `/guides` | Index of all guides | breadcrumb |
| `/wedding-photobook-pages` | Guide: how many pages a wedding photobook needs, with costs | Article + breadcrumb |
| `/layflat-vs-regular-photobooks` | Guide: layflat vs regular binding | Article + breadcrumb |
| `/how-to-digitise-old-photos` | Guide: phone apps vs scanners vs professional scanning | Article + breadcrumb |

All prices and specs on these pages come from /pricing and the live FAQ. **If prices change, update
these pages too** (search `index.html` for `seo-page`). The wedding page uses `/images/img-4.jpg`;
replace it with a photo of a real Binder wedding book when you have one.

Page-specific structured data now sits in its own `#ldStatic` block, which script.js never touches,
so it survives in the rendered page Google reads. The homepage FAQ schema is no longer duplicated.

To add another guide: copy one of the `<section class="view seo-page">` blocks in `index.html`,
add a `SEO_META` and `VIEW_LABELS` entry in `script.js`, add a `PAGES` line (with `guide: 'YYYY-MM-DD'`)
in `scripts/prerender.mjs`, link it from `/guides`, then run `node scripts/prerender.mjs`.

## .htaccess made host-proof (v18, 4 Nov 2026)

On the live host the inner pages returned an error with the v16 rules (the REDIRECT_STATUS checks
are not set the same way on every host, which caused a redirect loop). The rules now use
THE_REQUEST and list every public page by name. **When you add a new page, add its name to the
`RewriteRule ^(photobooks|trade-books|…)$` line in `.htaccess`** (a fallback rule usually covers it,
but the list always works).

## Safety net (v19, 4 Nov 2026)

Any address that isn't a real file now falls back to index.html (the site's script then shows the
right page), so the site never shows "not found", even if page files are missing on the server.
When the page files *are* there, each address still gets its own HTML for Google.

## Zines (v20, 14 Nov 2026)

- **New editor `zine`**: A5 portrait (148 × 210 mm), 20 pages minimum, pages added/removed 4 at a time,
  5 mm bleed, 10 mm safe margin. Same engine as the photobooks, so it has every photobook tool
  (photos, Smart Layout / AI arrange, shapes, text, layers, cover, grid, page numbers, CMYK, undo/redo).
- **Export**: the print PDFs (cover + interior) are 158 × 220 mm per page with trim marks at every
  corner, outside the trim. Bleed is now read per product (`cfg.bleedIn`), so other products keep 0.2in.
- **New page `/zines`** (start page) — in the top bar, footer, /sitemap page, sitemap.xml, pricing,
  Admin → Pages (text, cards, SEO) and Admin → Content (page image: "Zine — page image").
- Admin can build zine templates (Templates → editor "Zine A5").
- **Price: ₹200 for 20 pages, ₹8 per extra page** (pages added 4 at a time, so +₹32), same price at any
  quantity. To change it, edit `PRICING_RULES.zine` and `START_SERVICE_PRICE` in script.js, `START_PRICE`
  in scripts/prerender.mjs, and the Zine card on the Pricing page in index.html. Then run the prerender.

## Print files are back-end only (v21, 14 Nov 2026)

Print PDFs (bleed + trim marks) are made only in Admin → PDF Manager. Previously the customer's
browser also rendered them right after payment and showed "Rendering PDFs…" / "…Admin → PDF Manager"
messages; their My Orders cards listed the print files ("trim marks", "Queued/Ready"), and the trade
book editor mentioned trim marks. All removed from the customer side. The editor's on-screen bleed
and safe-margin guides stay, since customers need them to design.

## Homepage lower image; Zines page image left empty (v22, 14 Nov 2026)

- New image on the homepage between the product cards and the FAQ (`/images/img-2.jpg` by default).
  Replace it in Admin → Content → "Homepage — lower image (above the FAQ)".
- The Zines page now has no image until one is uploaded in Admin → Content → "Zine — page image".
  (A start page with no image simply skips the image block; the other start pages are unchanged.)

## Store product SEO (v23, 14 Nov 2026)

- **Every product has an SEO title and description**, editable in Admin → Store → Edit product →
  "Search engines (SEO)", with character counts (60 / 155) and a live Google preview. Leave a field
  empty to use the automatic suggestion (shown in grey). Stored on each product as `seoTitle` / `seoDesc`.
- All 10 current products were given hand-written titles/descriptions (only facts from their own
  listings: size, paper, pages, price).
- **Pre-built product pages**: `scripts/prerender.mjs` writes `store-pages/<slug>.html` for every product
  (title, description, canonical, product image for link previews, Product + Breadcrumb schema, and the
  product panel filled in). `.htaccess` serves them at `/store/<slug>`; direct `/store-pages/…` addresses
  redirect there. A product added later still works through `app.html` until the next rebuild.
- After adding or editing products: re-run `node scripts/prerender.mjs` and upload `store-pages/`.
  If a product is deleted, also delete its file from `store-pages/` on the server.

## Admin link for signed-in admins; CMS writes locked (v24, 15 Nov 2026)

- Signing in anywhere on the site (top-bar Sign in or /admin) now checks `profiles.is_admin`; admins see
  the **Admin** link in the nav and **Admin & CMS** under their name. Customers see neither.
- Supabase: the `cms` table's write policy allowed anyone (no sign-in) to insert/update/delete. Replaced
  with admin-only policies (`public.is_admin()`); public read is unchanged. Migration: `cms_admin_only_writes`.
