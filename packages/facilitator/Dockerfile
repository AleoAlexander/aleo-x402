FROM node:20-slim AS base
RUN corepack enable pnpm

# Build stage
FROM base AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/aleo/package.json packages/aleo/
COPY packages/facilitator/package.json packages/facilitator/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
COPY tsconfig.base.json ./
COPY packages/aleo/ packages/aleo/
COPY packages/facilitator/ packages/facilitator/
RUN pnpm --filter @x402/aleo build && pnpm --filter @x402/aleo-facilitator build

# Production stage
FROM base AS production
WORKDIR /app
COPY --from=build /app/packages/facilitator/dist ./dist
COPY --from=build /app/packages/facilitator/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/aleo/dist ./node_modules/@x402/aleo/dist
COPY --from=build /app/packages/aleo/package.json ./node_modules/@x402/aleo/

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
