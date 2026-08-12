# Çok aşamalı derleme: son imajda derleyici, test aracı ve kaynak kod yok.
#
# Yerel geliştirmede bu imaj kullanılmıyor — PostgreSQL zaten makinede kurulu
# ve Docker gereksiz bir katman olurdu. Bu dosya yayına çıkarken gerekli.
#
# İmaj **arayüzü de** içeriyor: oturum cookie'si `SameSite=Lax` ve arayüz ayrı
# bir alan adında dursaydı yazma isteklerinde gönderilmezdi. Tek origin, tek
# imaj, tek dağıtım hedefi (bkz. ADR-0022).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# `npm ci` kilit dosyasına birebir uyar; `npm install` sürüm kaydırabilir.
# `--ignore-scripts`: paketlerin kurulum script'leri derleme makinesinde
# çalışmasın. Prisma istemcisi bir sonraki aşamada açıkça üretiliyor.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# Sıra önemli: shared önce derleniyor, api ve web ona bağlı.
# Prisma istemcisi olmadan api derlenmiyor, o yüzden ondan önce.
RUN npm run build -w @abonelik/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @abonelik/api \
 && npm run build -w @abonelik/web

# Üretimde geliştirme bağımlılıkları imajda durmasın.
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Root olarak çalıştırmıyoruz: konteyner kaçışı durumunda saldırganın
# elindeki yetkiyi sınırlıyor.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules node_modules
COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=app:app /app/packages/shared/package.json packages/shared/
COPY --from=build --chown=app:app /app/apps/api/dist apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/package.json apps/api/
COPY --from=build --chown=app:app /app/apps/api/prisma apps/api/prisma
# Arayüz: `apps/api/dist`ten `../../web/dist` olarak bulunuyor.
COPY --from=build --chown=app:app /app/apps/web/dist apps/web/dist

USER app
EXPOSE 3000

# Yük dengeleyici bunu okuyor; süreç ayakta ama cevap veremiyorsa yeniden
# başlatılması gerekiyor. `/health` kimlik doğrulama istemiyor.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
