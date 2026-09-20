
FROM node:20-alpine AS deps

WORKDIR /app

# Копируем только манифесты — так слой кэшируется,
# пока не изменятся package.json / package-lock.json
COPY package.json package-lock.json* ./

# Чистая установка только production-зависимостей
RUN npm ci --omit=dev



FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Копируем установленные зависимости из стадии deps
COPY --from=deps /app/node_modules ./node_modules

# Копируем исходники
COPY package.json ./
COPY src ./src

# Непривилегированный пользователь (в образе node:alpine уже есть user "node")
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Healthcheck — Docker сам будет проверять /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]