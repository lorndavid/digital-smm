# syntax=docker/dockerfile:1
# DigitalSMM backend — Express 5 + TypeScript.
# Build context: repo ROOT (see docker-compose.yml), so the single root
# package-lock.json drives one deterministic `npm ci` for all workspaces.
#
# Deployment identity (version / commit / build time) is baked in via build
# args by the CI/CD pipeline and exposed as APP_VERSION / APP_COMMIT /
# APP_BUILD_TIME — safe metadata, never secrets. The runtime runs as the
# unprivileged `node` user (defense in depth).

FROM node:20-alpine AS build
WORKDIR /app

# Install every workspace's dependencies from the root lockfile.
# (npm requires all workspace package.json manifests to be present.)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY admin/package.json ./admin/package.json
RUN npm ci

# Compile the backend to dist/.
COPY backend ./backend
RUN npm run build -w backend

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Deployment identity — baked in by CI/CD (safe to expose; no secrets).
ARG VERSION=1.0.0
ARG COMMIT=""
ARG BUILD_TIME=""
ENV APP_VERSION=$VERSION \
    APP_COMMIT=$COMMIT \
    APP_BUILD_TIME=$BUILD_TIME

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY admin/package.json ./admin/package.json
RUN npm ci --omit=dev

COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend

# Run as an unprivileged user: a container escape from the API process must
# not yield root on the host. The `node` user exists in the node:alpine base.
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
