#!/bin/bash
# Stub the Prisma native binary with a tiny file
# This is needed because:
# 1. The binary is loaded by Prisma even when using driver adapters
# 2. The load fails on Cloudflare Workers (fs.readdir not implemented)
# 3. Replacing the binary with a stub reduces bundle size by 16MB
# 
# This is a hack - the real fix is to use the WASM engine
# (prisma generate with --engine-type=client or set engineWasm)
# 
# For now, we accept that Prisma queries will fail on CF

set -e

BINARY_PATH=".open-next/server-functions/default/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
BINARY_NODE_PATH="node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"

if [ -f "$BINARY_PATH" ]; then
  echo "  - Stubbing Prisma binary in bundle"
  # Replace with an empty file
  > "$BINARY_PATH"
  echo "    Bundle size reduced by $(du -h "$BINARY_PATH" | cut -f1)"
fi

if [ -f "$BINARY_NODE_PATH" ]; then
  echo "  - Stubbing Prisma binary in node_modules"
  > "$BINARY_NODE_PATH"
fi
