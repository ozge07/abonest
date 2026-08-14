/**
 * Sinematik giriş sahnesinin bütün içeriği.
 *
 * Metin, renk ve varlıklar burada; bileşenler yalnızca bunları çiziyor.
 * Bölüm yazısını değiştirmek için React dosyalarına dokunmak gerekmiyor.
 *
 * ## İçerik neden demodaki gibi değil
 *
 * Kaynak deneyim bir heykel sergisiydi ("Bronze and Time", Laocoön
 * fotoğrafı). Buradaki konu Abonest: merkezde yumurta, çevresinde
 * kullanıcının abonelikleri. Bronz→safir renk yolculuğu ise olduğu gibi
 * korundu — uygulamanın kendi paleti (amber-turuncu) ile marka mavisi
 * arasında zaten aynı yolculuk var.
 */

import { UYGULAMA_ADI } from '../lib/marka';

export interface Bolum {
  /** Gezinme bağlantısının hedefi. */
  kimlik: string;
  /** Gezinmede görünen kısa ad. */
  kisaAd: string;
  /** Başlık iki satır: her satır ayrı ayrı, harf harf canlandırılıyor. */
  baslik: [string, string];
  /** Bölümün altındaki metin sütunları. */
  paragraflar: string[];
  /** Ekrandaki yerleşim; her bölüm farklı bir sütundan başlıyor. */
  yerlesim: 'sol-alt' | 'ikinci-sutun' | 'sag-yari';
  /** Bölüm 2'deki kare görsel: gerçek servis logolarından bir duvar. */
  logoDuvari?: string[];
}

export const SAHNE = {
  marka: UYGULAMA_ADI,

  /**
   * Toplam kaydırma yüksekliği (vh).
   *
   * Kamera bu mesafe boyunca yumurtanın çevresinde tam bir tur atıyor.
   */
  kaydirmaYuksekligi: 800,

  /** Sıvı metal arka planının iki ucu; kaydırma boyunca aralarında geçiyor. */
  renkler: {
    bronz: {
      golge: [0.05, 0.03, 0.02],
      dalga: [0.35, 0.14, 0.04],
      isik: [0.72, 0.42, 0.18],
      yansima: [1.0, 0.79, 0.45],
    },
    safir: {
      golge: [0.02, 0.03, 0.07],
      dalga: [0.06, 0.14, 0.38],
      isik: [0.25, 0.5, 0.82],
      yansima: [0.78, 0.86, 0.98],
    },
  },

  /** Yumurtanın çevresinde dönen servisler. `public/logolar` altındakiler. */
  yorungeLogolari: [
    'netflix',
    'spotify',
    'youtube-premium',
    'claude-pro',
    'icloud-plus',
    'disney-plus',
    'notion',
    'duolingo-super',
    'amazon-prime-video',
    'canva',
  ],

  bolumler: [
    {
      kimlik: 'bolum-1',
      kisaAd: 'Başlangıç',
      baslik: ['Her ay', 'sessizce'],
      paragraflar: [
        'Netflix, Spotify, telefon faturası, spor salonu. Hiçbiri tek başına büyük bir rakam değil; hepsi birlikte ayın en sessiz gideri.',
        'Abonest onları tek bir yerde toplar. Ne ödediğini görmek için hesap makinesi açman gerekmez.',
      ],
      yerlesim: 'sol-alt',
    },
    {
      kimlik: 'bolum-2',
      kisaAd: 'Tutar',
      baslik: ['Ne kadar', 'gidiyor'],
      paragraflar: [
        'Aylık ve yıllık toplam, kategori kategori dağılım, kullanmadığın servisler. Rakam tahmin değil, hesap.',
      ],
      yerlesim: 'ikinci-sutun',
      logoDuvari: [
        'netflix',
        'spotify',
        'youtube-premium',
        'disney-plus',
        'claude-pro',
        'notion',
        'icloud-plus',
        'canva',
        'duolingo-super',
      ],
    },
    {
      kimlik: 'bolum-3',
      kisaAd: 'Hatırlatma',
      baslik: ['Sırada', 'ne var'],
      paragraflar: [
        'Ödeme günü gelmeden e-posta ile haber veriyoruz. Deneme süresi biterken de. Fark etmeden yenilenen bir abonelik kalmıyor.',
      ],
      yerlesim: 'sag-yari',
    },
    {
      kimlik: 'bolum-4',
      kisaAd: 'Kontrol',
      baslik: ['Kontrol', 'sende'],
      paragraflar: [
        'İptal et, duraklat, fiyatı güncelle. Verilerin senin; hesabını sildiğinde on gün içinde geri alabilir, sonra kalıcı olarak silinir.',
      ],
      yerlesim: 'ikinci-sutun',
    },
  ] satisfies Bolum[],
} as const;

