FROM node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM runtime AS manifests
COPY --chown=node:node package*.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
COPY --chown=node:node packages/database/package.json packages/database/package.json
COPY --chown=node:node packages/ui/package.json packages/ui/package.json

FROM manifests AS build
# The npm download cache belongs to BuildKit, not to an exported image layer.
RUN --mount=type=cache,id=sales-copilot-npm,target=/root/.npm,sharing=locked --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci; else npm ci; fi
COPY --chown=node:node . .
RUN npm run db:generate && npm run build:packages

FROM build AS api-build
RUN npm run build -w @sales/api \
    && mkdir -p /runtime/apps/api /runtime/packages/shared /runtime/packages/database/prisma /runtime/node_modules /runtime/scripts \
    && cp package.json /runtime/ \
    && cp -R apps/api/dist apps/api/package.json /runtime/apps/api/ \
    && cp -R packages/shared/dist packages/shared/package.json /runtime/packages/shared/ \
    && cp -R packages/database/dist packages/database/package.json /runtime/packages/database/ \
    && cp -R node_modules/.prisma /runtime/node_modules/ \
    && cp scripts/migrate.mjs /runtime/scripts/ \
    && cp -R packages/database/prisma/migrations /runtime/packages/database/prisma/

FROM build AS web-build
ARG INTERNAL_API_URL=http://api:4000
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV SALES_DOCKER_STANDALONE=true
RUN mkdir -p apps/web/public && npm run build -w @sales/web

FROM manifests AS api-dependencies
# Required runtime peers are explicit dependencies. Prisma's CLI/TypeScript
# peers are marked devOptional in the lockfile and need both omissions.
RUN --mount=type=cache,id=sales-copilot-npm,target=/root/.npm,sharing=locked --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev --omit=peer --omit=optional --workspace=@sales/api --workspace=@sales/database --workspace=@sales/shared --include-workspace-root

FROM runtime AS api
ENV NODE_ENV=production
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /runtime/ ./
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/apps/api/src/main.js"]

FROM runtime AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
