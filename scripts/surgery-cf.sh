#!/bin/bash
# Cloudflare bundle surgery - keeps the worker under 3 MB free plan limit
# 
# This is destructive! It modifies node_modules and public/
# Always re-run npm ci after this to restore the original state

set -e

echo "→ Applying CF bundle surgery..."

# 1. Stub sharp (libvips native lib = 18MB raw)
if [ ! -f "node_modules/sharp/index.js" ] || ! grep -q "Stub for sharp" node_modules/sharp/index.js 2>/dev/null; then
  echo "  - Stubbing sharp"
  cat > node_modules/sharp/index.js <<'STUB'
// Stub for sharp - just returns the input as-is
module.exports = function(input) {
  return {
    metadata: async () => ({ width: 100, height: 100, format: 'png' }),
    resize: function() { return this; },
    jpeg: function() { return this; },
    png: function() { return this; },
    webp: function() { return this; },
    toBuffer: async () => Buffer.from(input || ''),
    toFile: async () => ({ width: 100, height: 100 }),
  };
};
module.exports.default = module.exports;
STUB
fi

# 2. Stub next/og
if [ -d "node_modules/next/og-stub" ]; then
  echo "  - Stubbing next/og"
  # Move stub into place
  rm -rf node_modules/next/og
  cp -r node_modules/next/og-stub node_modules/next/og
fi

# 3. Delete WASM files
echo "  - Deleting WASM files (og + squoosh)"
rm -f node_modules/next/dist/compiled/@vercel/og/resvg.wasm
rm -f node_modules/next/dist/compiled/@vercel/og/yoga.wasm
rm -f node_modules/next/dist/compiled/@vercel/og/*.ttf.bin 2>/dev/null
rm -f node_modules/next/dist/compiled/source-map08/mappings.wasm
rm -f node_modules/next/dist/server/lib/squoosh/avif/avif_node_*.wasm
rm -f node_modules/next/dist/server/lib/squoosh/mozjpeg/mozjpeg_node_*.wasm
rm -f node_modules/next/dist/server/lib/squoosh/png/squoosh_oxipng_bg.wasm
rm -f node_modules/next/dist/server/lib/squoosh/png/squoosh_png_bg.wasm
rm -f node_modules/next/dist/server/lib/squoosh/resize/squoosh_resize_bg.wasm
# Stub the avif/png encoders to noop (to prevent runtime errors)
rm -rf node_modules/next/dist/server/lib/squoosh 2>/dev/null
mkdir -p node_modules/next/dist/server/lib/squoosh
cat > node_modules/next/dist/server/lib/squoosh/main.js <<'STUB'
// Stub for squoosh/main - image optimization disabled for CF POC
module.exports = {
  processBuffer: async () => {
    throw new Error('Image optimization disabled in CF Workers');
  }
};
STUB
cat > node_modules/next/dist/server/lib/squoosh/index.js <<'STUB'
module.exports = require('./main');
STUB

# 4. Move dev assets out of public/
if [ -d "public" ] && [ ! -d "public-dev-assets-backup" ]; then
  echo "  - Moving dev assets out of public/"
  mkdir -p public-dev-assets-backup
  # Move all __test* and logo-options* folders
  for d in public/__* public/logo-options public/pdf-assets; do
    if [ -d "$d" ]; then
      mv "$d" public-dev-assets-backup/
    fi
  done
fi

# 5. Create stub WASM files (wrangler-module-collector needs them to exist)
# handler.mjs references yoga.wasm and resvg.wasm even after we delete them
# Creating empty stubs is enough for the build to succeed
echo "  - Creating stub WASM files"
mkdir -p node_modules/next/dist/compiled/@vercel/og
# Minimal valid WASM header (8 bytes): magic + version
printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > node_modules/next/dist/compiled/@vercel/og/yoga.wasm
printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > node_modules/next/dist/compiled/@vercel/og/resvg.wasm

echo "✅ CF bundle surgery applied"
echo "Run: ./scripts/deploy-cf.sh revert to restore before Vercel deploys"
