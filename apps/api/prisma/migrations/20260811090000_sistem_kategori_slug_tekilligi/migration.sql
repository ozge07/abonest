-- Sistem kategorilerinde slug tekilliği.
--
-- `categories_userId_slug_key` sistem kategorilerini korumuyor: userId onlarda
-- NULL ve Postgres NULL'ları birbirinden farklı sayıyor, dolayısıyla aynı
-- slug'a sahip iki sistem kategorisi eklenebiliyor. Ölçtük, ekleniyor da.
--
-- Kısmi indeks yalnızca sistem satırlarını kapsıyor; kullanıcı kategorileri
-- mevcut bileşik kısıt tarafından zaten korunuyor.
--
-- Bunu Prisma şemasıyla ifade edemiyoruz (kısmi indeks desteklenmiyor), bu
-- yüzden migration elle yazıldı ve şemaya bilgi amaçlı not düşüldü.
CREATE UNIQUE INDEX "categories_system_slug_key"
  ON "categories" ("slug")
  WHERE "userId" IS NULL;
