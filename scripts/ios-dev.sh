#!/bin/bash
set -e

# Read IOS_DEV_HOST from .env
IOS_DEV_HOST=$(grep "^IOS_DEV_HOST=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '\r')

if [ -z "$IOS_DEV_HOST" ]; then
  echo "Error: IOS_DEV_HOST not set in .env"
  echo "Add: IOS_DEV_HOST=<mac-usb-ip>  (check: ifconfig en11 | grep inet)"
  exit 1
fi

echo "iOS dev host: $IOS_DEV_HOST"
echo "Make sure 'npm run dev' is already running on port 5173"

exec npx tauri ios dev \
  --no-dev-server-wait \
  --config "{\"build\":{\"devUrl\":\"http://$IOS_DEV_HOST:5173\",\"beforeDevCommand\":\"\"}}"
