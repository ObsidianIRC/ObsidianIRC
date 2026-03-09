#!/usr/bin/env bash
set -euo pipefail

# One-time per machine: installs mkcert CA into the OS trust store and writes
# MKCERT_CAROOT to .env so compose can mount it for cert generation.
# Requires mkcert: brew install mkcert  |  choco install mkcert

command -v mkcert >/dev/null || { echo "mkcert not found"; exit 1; }

mkcert -install
echo "MKCERT_CAROOT=$(mkcert -CAROOT)" > "$(dirname "$0")/../.env"
echo "Done. Run: docker compose --profile testing up -d"
