#!/bin/bash
set -e

# Auto-detect USB tethering IP, fall back to .env
IOS_DEV_HOST=$(ifconfig en11 2>/dev/null | awk '/inet /{print $2}')

if [ -z "$IOS_DEV_HOST" ]; then
  # Fallback: read from .env
  IOS_DEV_HOST=$(grep "^IOS_DEV_HOST=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '\r')
fi

if [ -z "$IOS_DEV_HOST" ]; then
  echo "Error: Could not detect USB tethering IP on en11 and IOS_DEV_HOST not set in .env"
  echo "Check: ifconfig -l  (look for enXX with a 169.254.x.x address)"
  exit 1
fi

echo "iOS dev host: $IOS_DEV_HOST"
echo "Make sure 'npm run dev' is already running on port 5173"

exec npx tauri ios dev \
  --no-dev-server-wait \
  --config "{\"build\":{\"devUrl\":\"http://$IOS_DEV_HOST:5173\",\"beforeDevCommand\":\"\"}}"
