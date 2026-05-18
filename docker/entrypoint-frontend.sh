#!/bin/sh
set -e
# Regenerate runtime config from container env (from demo.env via compose env_file + overrides).
node /opt/demo-config/sync-frontend-config.js /usr/share/nginx/html/config.js
exec nginx -g 'daemon off;'
