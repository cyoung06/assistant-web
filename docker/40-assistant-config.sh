#!/bin/sh
# Writes the browser's runtime settings. Runs from the nginx image's /docker-entrypoint.d.
set -eu
printf 'window.__ASSISTANT_CONFIG__ = {"googleClientId": "%s"};\n' "${GOOGLE_CLIENT_ID:-}" > /tmp/config.js
