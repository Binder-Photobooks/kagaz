#!/usr/bin/env bash
# Builds the deployable site into ./dist — exactly what belongs in public_html on the host.
#   1. node scripts/prerender.mjs  → per-page HTML, FAQ, sitemap.xml and store-pages/ from the live CMS
#   2. copy only the public files into dist/ (no docs, SQL, build scripts, Supabase functions)
# Used by .github/workflows/deploy.yml; can also be run locally: bash scripts/build-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/prerender.mjs
rm -rf dist && mkdir -p dist
for f in *.html; do
  case "$f" in Index.html|binder-standalone.html) ;;   # old duplicate homepages, redirected by .htaccess
    *) cp "$f" dist/ ;;
  esac
done
cp .htaccess robots.txt sitemap.xml script.js styles.css dist/
cp -r images accounts-assets store-pages dist/
echo "dist/ ready: $(find dist -type f | wc -l) files"
