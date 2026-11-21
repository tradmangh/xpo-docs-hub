#!/bin/sh
set -eu
TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || echo "${GH_TOKEN:-}")
[ -n "$TOKEN" ] && printf 'https://%s:%s@github.com\n' "x-access-token" "$TOKEN" > .git-credentials || true
