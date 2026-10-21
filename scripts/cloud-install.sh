#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node -e "if (![22,24].includes(Number(process.versions.node.split('.')[0]))) process.exit(1)"
npm ci --cache "${NPM_CONFIG_CACHE:-/workspace/.npm-cache}"
npm run env:init
npm run infra:up
npm run db:migrate
npm run build
