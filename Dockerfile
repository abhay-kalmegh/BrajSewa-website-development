FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# This layer is cached unless package.json or pnpm-lock.yaml change
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Security-header settings are resolved at BUILD time (Next.js bakes headers() into the routes manifest).
ARG CSP_ENFORCE=false
ARG CSP_REPORT_URI=
ARG HSTS_MAX_AGE_SECONDS=3600
ARG HSTS_INCLUDE_SUBDOMAINS=false
ENV CSP_ENFORCE=$CSP_ENFORCE CSP_REPORT_URI=$CSP_REPORT_URI HSTS_MAX_AGE_SECONDS=$HSTS_MAX_AGE_SECONDS HSTS_INCLUDE_SUBDOMAINS=$HSTS_INCLUDE_SUBDOMAINS
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENV PORT=3000
CMD ["node", "server.js"]
