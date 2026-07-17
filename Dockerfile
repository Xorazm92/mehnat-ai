# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# ASRO — multi-stage image. Serves BOTH the Next.js web app (`npm start`) and
# the Telegram bot worker (`npm run bot:start`); docker-compose overrides the
# command per service. Dev dependencies (tsx, tailwind, typescript) are kept in
# the runtime layer because the bot runs via `tsx`.
#
# ⚠️  Scaffolding — run `docker build .` to verify in your environment before
#     relying on it in production. Optimisation (Next `output: "standalone"`,
#     dev-dep pruning) is a documented follow-up.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS base
WORKDIR /app
# OpenSSL is required by Prisma at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ── deps: install with a warm layer cache; postinstall runs `prisma generate` ──
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ── build: compile the Next.js production bundle ──
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runner: minimal-ish runtime (full deps retained for the bot's tsx) ──
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build /app ./
EXPOSE 3000
USER node
# Default command = web. Compose overrides to `npm run bot:start` for the bot.
CMD ["npm", "start"]
