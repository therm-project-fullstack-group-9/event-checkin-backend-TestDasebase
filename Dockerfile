# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm exec tsc --outDir dist --noEmit false

# ---------- runtime ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# เก็บ devDependencies ไว้ด้วย เพื่อให้รัน `pnpm db:push` / seed ใน container ได้ (ใช้ drizzle-kit, tsx)
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts tsconfig.json ./
COPY src ./src
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://localhost:${PORT:-4000}/api/health || exit 1
CMD ["node", "dist/src/index.js"]
