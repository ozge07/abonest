# Çok aşamalı derleme: son imajda derleyici, test aracı ve kaynak kod yok.
#
# Yerel geliştirmede bu imaj kullanılmıyor — PostgreSQL zaten makinede kurulu
# ve Docker gereksiz bir katman olurdu. Bu dosya yayına çıkarken gerekli.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# `npm ci` kilit dosyasına birebir uyar; `npm install` sürüm kaydırabilir.
RUN npm ci --ignore-scripts && npx prisma generate --schema apps/api/prisma/schema.prisma || true

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @abonelik/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @abonelik/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Root olarak çalıştırmıyoruz: konteyner kaçışı durumunda saldırganın
# elindeki yetkiyi sınırlıyor.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules node_modules
COPY --from=build --chown=app:app /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=app:app /app/packages/shared/package.json packages/shared/
COPY --from=build --chown=app:app /app/apps/api/dist apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/package.json apps/api/
COPY --from=build --chown=app:app /app/apps/api/prisma apps/api/prisma

USER app
EXPOSE 3000

# Yük dengeleyici bunu okuyor; süreç ayakta ama cevap veremiyorsa yeniden
# başlatılması gerekiyor.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
