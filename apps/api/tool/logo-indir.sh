#!/usr/bin/env bash
#
# Sağlayıcı logolarını indirir.
#
#   apps/api/tool/logo-indir.sh
#
# ## Neden indiriyoruz, çalışma anında çekmiyoruz
#
# Arayüzün içerik güvenlik politikası dış görsel kaynağına izin vermiyor
# (`img-src 'self' data:`) ve vermesi de istenmez: her ekran üçüncü bir
# tarafın ayakta olmasına bağlı kalır, o taraf da kullanıcının hangi
# aboneliklere sahip olduğunu görürdü. Logolar bir kez indirilip depoya
# giriyor, uygulama kendi origin'inden sunuyor.
#
# ## Kaynak sırası
#
# 1. Sitenin kendi `apple-touch-icon.png`'si — en yüksek kalite.
# 2. Google'ın favicon servisi (128 px) — hemen hemen her alan adı için
#    çalışıyor.
#
# Her indirilen dosya **doğrulanıyor**: bazı siteler olmayan yol için 200 ile
# HTML döndürüyor (netflix.com bunu yapıyor) ve kontrol edilmezse depoya
# görsel yerine hata sayfası girer.
#
# Logolar markaların kendi malı. Burada kullanıcının kendi aboneliklerini
# tanıması için kullanılıyorlar; ticari bir iddia ya da ortaklık ifade
# etmiyorlar.

set -uo pipefail

KOK="$(cd "$(dirname "$0")/../../.." && pwd)"
HEDEF="$KOK/apps/web/public/logolar"
KUNYE="$KOK/apps/api/prisma/logolar.json"
mkdir -p "$HEDEF"

# slug|alan adı
SAGLAYICILAR="
netflix|netflix.com
disney-plus|disneyplus.com
amazon-prime-video|primevideo.com
blutv|blutv.com
exxen|exxen.com
youtube-premium|youtube.com
mubi|mubi.com
spotify|spotify.com
apple-music|music.apple.com
fizy|fizy.com
deezer|deezer.com
xbox-game-pass|xbox.com
playstation-plus|playstation.com
nintendo-switch-online|nintendo.com
adobe-creative-cloud|adobe.com
microsoft-365|microsoft.com
canva|canva.com
notion|notion.so
github|github.com
chatgpt-plus|openai.com
claude-pro|claude.ai
icloud-plus|icloud.com
google-one|one.google.com
dropbox|dropbox.com
strava|strava.com
duolingo-super|duolingo.com
udemy|udemy.com
turk-telekom|turktelekom.com.tr
turkcell|turkcell.com.tr
vodafone|vodafone.com.tr
"

# Elle çizilen logolar.
#
# Her markanın indirilebilir logosu yok. Play Store bunun örneği:
# play.google.com'un `apple-touch-icon.png`'si 404 dönüyor ve Google'ın
# favicon servisi yalnızca 32 piksel veriyor — aşağıdaki `gorsel_mu` onu
# haklı olarak reddediyor, çünkü 128'e büyütmek bulanık bir leke üretir.
#
# Bu slug'ların PNG'si depoda elle tutuluyor. Betik onları indirmeye
# çalışmıyor, yalnızca dosya duruyorsa künyeye ekliyor; yoksa künye her
# çalıştırmada onları düşürür ve logolar sessizce kaybolurdu.
ELLE="
google-play
"

# Kullanılabilir bir logo mu?
#
# İki kontrol var ve ikisi de gerekli:
#
# 1. Gerçekten görsel mi — bazı siteler olmayan yol için 200 ile HTML
#    döndürüyor (netflix.com bunu yapıyor).
# 2. Yeterince büyük mü — Google'ın servisi elinde büyük sürüm yoksa 16×16
#    veriyor. Onu 128'e büyütmek bulanık bir leke üretir; harf karosunda
#    kalmak daha dürüst bir sonuç. Türk Telekom ve Turkcell tam olarak bu
#    durumda.
gorsel_mu() {
  local dosya="$1"
  local tur genislik
  tur=$(file -b --mime-type "$dosya" 2>/dev/null)
  [ "${tur#image/}" = "$tur" ] && return 1

  genislik=$(sips -g pixelWidth "$dosya" 2>/dev/null | awk '/pixelWidth/{print $2}')
  [ -n "$genislik" ] && [ "$genislik" -ge 48 ]
}

basarili=0; basarisiz=0
echo "{" > "$KUNYE.tmp"
ilk=1

while IFS='|' read -r slug alan; do
  [ -z "$slug" ] && continue
  gecici=$(mktemp)
  kaynak=""

  # 1) Sitenin kendi ikonu
  curl -sL -o "$gecici" --max-time 15 "https://${alan}/apple-touch-icon.png" 2>/dev/null
  if gorsel_mu "$gecici"; then
    kaynak="apple-touch-icon"
  else
    # 2) Google favicon servisi
    curl -sL -o "$gecici" --max-time 15 \
      "https://www.google.com/s2/favicons?domain=${alan}&sz=128" 2>/dev/null
    gorsel_mu "$gecici" && kaynak="google-favicon"
  fi

  if [ -z "$kaynak" ]; then
    rm -f "$gecici"
    # İndirme başarısızsa ama dosya depoda duruyorsa künye girdisi korunuyor.
    #
    # Önce koşulsuz `continue` vardı ve künye her çalıştırmada sıfırdan
    # yazıldığı için tek bir geçici ağ hatası çalışan bir logoyu sessizce
    # düşürüyordu: vodafone bir çalıştırmada indi, sonrakinde inmedi ve
    # künyeden çıktı — dosya yerinde dururken uygulama harf karosuna
    # düşüyordu.
    if [ -f "$HEDEF/${slug}.png" ]; then
      [ $ilk -eq 0 ] && echo "," >> "$KUNYE.tmp"
      printf '  "%s": "/logolar/%s.png"' "$slug" "$slug" >> "$KUNYE.tmp"
      ilk=0
      printf "  ~ %-24s indirilemedi, depodaki korunuyor\n" "$slug"
    else
      printf "  ✗ %-24s logo bulunamadı\n" "$slug"
      basarisiz=$((basarisiz + 1))
    fi
    continue
  fi

  # 128 pikselde normalize: 60 kB'lık ikonlar 30 sağlayıcıda 2 MB'a çıkıyordu.
  hedefDosya="$HEDEF/${slug}.png"
  if sips -s format png -Z 128 "$gecici" --out "$hedefDosya" >/dev/null 2>&1; then
    boyut=$(stat -f%z "$hedefDosya")
    printf "  ✓ %-24s %-16s %s kB\n" "$slug" "$kaynak" "$((boyut / 1024))"
    [ $ilk -eq 0 ] && echo "," >> "$KUNYE.tmp"
    printf '  "%s": "/logolar/%s.png"' "$slug" "$slug" >> "$KUNYE.tmp"
    ilk=0
    basarili=$((basarili + 1))
  else
    printf "  ✗ %-24s dönüştürülemedi\n" "$slug"
    basarisiz=$((basarisiz + 1))
  fi
  rm -f "$gecici"
done <<< "$SAGLAYICILAR"

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  dosya="$HEDEF/${slug}.png"
  if [ -f "$dosya" ]; then
    [ $ilk -eq 0 ] && echo "," >> "$KUNYE.tmp"
    printf '  "%s": "/logolar/%s.png"' "$slug" "$slug" >> "$KUNYE.tmp"
    ilk=0
    printf "  ✎ %-24s %-16s %s kB\n" "$slug" "elle" "$(( $(stat -f%z "$dosya") / 1024 ))"
    basarili=$((basarili + 1))
  else
    printf "  ✗ %-24s elle tutulması gereken dosya yok\n" "$slug"
    basarisiz=$((basarisiz + 1))
  fi
done <<< "$ELLE"

printf "\n}\n" >> "$KUNYE.tmp"
mv "$KUNYE.tmp" "$KUNYE"

echo ""
echo "── indirilen: $basarili · bulunamayan: $basarisiz"
echo "   dosyalar: apps/web/public/logolar/"
echo "   künye   : apps/api/prisma/logolar.json"
