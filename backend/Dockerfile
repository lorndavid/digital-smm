# syntax=docker/dockerfile:1
# VidSMM backend — Express 5 + TypeScript.
# Build context: repo ROOT (see docker-compose.yml), so the single root
# package-lock.json drives one deterministic `npm ci` for all workspaces.

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

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY admin/package.json ./admin/package.json
RUN npm ci --omit=dev

COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
