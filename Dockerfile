# ── Build the site ───────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc -b && npx vite build

# ── Runtime: tiny Hono server (static site + API) ───────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=80 \
    STORAGE_DIR=/storage
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY data/catalog.json ./data/catalog.json
COPY --from=build /app/dist ./dist
# ONCE mounts its persistent volume at /storage (used for the price cache).
VOLUME /storage
EXPOSE 80
CMD ["node", "server/index.ts"]
