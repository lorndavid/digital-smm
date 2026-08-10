# syntax=docker/dockerfile:1
# DigitalSMM customer app — Vue 3 + Vite, built then served by nginx.
# Build context: repo ROOT (see docker-compose.yml).
# The nginx config is mounted read-only from docker/nginx.conf at runtime.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY admin/package.json ./admin/package.json
RUN npm ci

COPY frontend ./frontend
RUN npm run build -w frontend

# --- runtime ---
# NOTE: nginx must be >= 1.27.3 — docker/nginx.conf uses `server … resolve;`
# (dynamic upstreams) which open-source nginx only supports from 1.27.3.
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
