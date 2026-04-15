#!/bin/sh
# Replace runtime config placeholders in index.html with environment variables.
# This allows configuring the frontend at container startup without rebuilding.

INDEX_FILE=/usr/share/nginx/html/index.html

# Replace __VITE_API_URL__ with the actual value (empty string if not set)
sed -i "s|__VITE_API_URL__|${VITE_API_URL:-}|g" "$INDEX_FILE"

# Start nginx
exec nginx -g 'daemon off;'
