#!/bin/sh
# Replace runtime config placeholders in index.html with environment variables.
# This allows configuring the frontend at container startup without rebuilding.

INDEX_FILE=/usr/share/nginx/html/index.html
CONFIG_FILE=/usr/share/nginx/html/runtime-config.js

# Replace __VITE_API_URL__ with the actual value (empty string if not set) in the external config file
if [ -f "$CONFIG_FILE" ]; then
  sed -i "s|__VITE_API_URL__|${VITE_API_URL:-}|g" "$CONFIG_FILE"
fi

# Inject Umami script if VITE_UMAMI_WEBSITE_ID is set
if [ -n "$VITE_UMAMI_WEBSITE_ID" ]; then
  UMAMI_SRC="${VITE_UMAMI_SRC:-https://analytics.umami.is/script.js}"
  sed -i "s|</head>|<script defer src=\"${UMAMI_SRC}\" data-website-id=\"${VITE_UMAMI_WEBSITE_ID}\"></script></head>|g" "$INDEX_FILE"
fi

# Start nginx
exec nginx -g 'daemon off;'
