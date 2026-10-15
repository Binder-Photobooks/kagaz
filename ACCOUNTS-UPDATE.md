# Update: Accounts & Projects in the admin (15 Oct 2026)

This folder is the live binder.co.in site, unchanged except for the Accounts addition.

## What changed
| File | Change |
|---|---|
| `accounts.html` (new) | The Accounts app, served at `/accounts` (opens only from inside the admin) |
| `accounts-assets/` (new) | The Accounts app's script and styles |
| `index.html`, `app.html` and the 15 page files | Two admin sidebar buttons (**Accounts**, **Projects**) after Coupons, and the panel that shows them |
| `script.js` | `adminTab()` shows/hides the Accounts panel (8 lines added at the end of the function) |
| `.htaccess` | `/accounts` added to the "noindex" list |
| `robots.txt` | `Disallow: /accounts` |

Nothing else is touched. The page files match what `node scripts/prerender.mjs` produces from the new `index.html`, so future rebuilds keep the buttons.

## Upload
Same as always (see UPLOAD-TO-HOST.md): back up the current site, then upload everything in this folder,
including the hidden `.htaccess` and the new `accounts-assets` folder, replacing existing files.

## Check
1. `https://www.binder.co.in/` and a few pages look exactly as before.
2. `https://www.binder.co.in/admin` → sign in → **Accounts** and **Projects** appear after Coupons.
3. Click **Accounts** → the first time it says "Shared books are ready" → *Start fresh* → then Settings → Company & GST.

The Accounts data lives in the same Supabase project (tables `acc_docs`, `acc_audit`, `acc_counters`), admins only.
