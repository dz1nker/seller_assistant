FROM node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package*.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/shared/package.json packages/shared/package.json
COPY --chown=node:node packages/database/package.json packages/database/package.json
COPY --chown=node:node packages/ui/package.json packages/ui/package.json
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci; else npm ci; fi
COPY --chown=node:node . .
RUN npm run db:generate && npm run build:packages

FROM base AS api
RUN npm run build -w @sales/api
USER node
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@sales/api"]

FROM base AS web
ARG INTERNAL_API_URL=http://api:4000
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @sales/web && chown -R node:node apps/web/.next
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@sales/web"]
