/**
 * Fatura tarihi hesabı.
 *
 * Fatura tarihleri **takvim günü**, anlık değil: bir ödeme "12 Ağustos"tur,
 * saat dilimine göre kayan bir zaman noktası değil. Bu yüzden bütün işlemler
 * UTC gün başlangıcı üzerinden yapılıyor ve yerel saat hiç işin içine
 * girmiyor.
 *
 * Bu dosya saf: veritabanı yok, "şimdi" yok, IO yok.
 */

import type { BillingCycle } from './billing-cycle.js';

/** Takvim günü; saat bileşeni her zaman UTC 00:00. */
export type CalendarDate = Date;

export function toCalendarDate(value: Date): CalendarDate {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function calendarDate(
  year: number,
  month1: number,
  day: number,
): CalendarDate {
  return new Date(Date.UTC(year, month1 - 1, day));
}

export function toISODate(date: CalendarDate): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Ay ekleme — **ay sonu kırpmalı**.
 *
 * 31 Ocak + 1 ay = 28 Şubat (o yıl artık yıl değilse). JavaScript'in yerleşik
 * davranışı burada yanlış: `setUTCMonth` taşan günü sonraki aya sarkıtıyor ve
 * 31 Ocak + 1 ay = 3 Mart çıkıyor.
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const year = date.getUTCFullYear();
  const month0 = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  const hedefYil = year + Math.floor(month0 / 12);
  const hedefAy = ((month0 % 12) + 12) % 12;

  return new Date(
    Date.UTC(hedefYil, hedefAy, Math.min(day, daysInMonth(hedefYil, hedefAy))),
  );
}

export interface CycleSpec {
  cycle: BillingCycle;
  customIntervalDays?: number | undefined;
}

/** Döngünün kaç ay olduğu; gün tabanlı döngülerde `null`. */
function monthsPerCycle(cycle: BillingCycle): number | null {
  switch (cycle) {
    case 'MONTHLY':
      return 1;
    case 'QUARTERLY':
      return 3;
    case 'HALF_YEARLY':
      return 6;
    case 'YEARLY':
      return 12;
    case 'WEEKLY':
    case 'CUSTOM':
      return null;
  }
}

/**
 * Başlangıçtan itibaren `n`. ödeme tarihi.
 *
 * **Zincirleme değil, çapadan hesaplanıyor.** Bir önceki tarihe ekleyerek
 * ilerlersek ay sonu kırpması kalıcı hâle geliyor:
 *
 *   31 Oca → +1ay → 28 Şub → +1ay → 28 Mar   ✗ (31 Mart olmalıydı)
 *   31 Oca → +2ay → 31 Mar                    ✓
 *
 * Kullanıcı ayın 31'inde abone olduysa, 31 çeken her ayda yine 31'inde
 * ödemesi gerekiyor. Şubat'ın kısalığı sonraki ayları etkilememeli.
 */
export function occurrenceDate(
  startDate: CalendarDate,
  spec: CycleSpec,
  n: number,
): CalendarDate {
  if (n < 0 || !Number.isInteger(n)) {
    throw new RangeError(`Ödeme sırası 0 veya pozitif tamsayı olmalı: ${n}`);
  }

  const anchor = toCalendarDate(startDate);
  if (n === 0) {
    return anchor;
  }

  const months = monthsPerCycle(spec.cycle);
  if (months !== null) {
    return addMonths(anchor, months * n);
  }

  if (spec.cycle === 'WEEKLY') {
    return addDays(anchor, 7 * n);
  }

  const interval = spec.customIntervalDays;
  if (interval === undefined || !Number.isInteger(interval) || interval <= 0) {
    throw new RangeError(
      'CUSTOM döngüde customIntervalDays pozitif tamsayı olmalı.',
    );
  }
  return addDays(anchor, interval * n);
}

/**
 * `today` tarihinde ya da sonrasında düşen ilk ödeme.
 *
 * Bugün ödeme günüyse **bugünü** döndürüyor: ödeme henüz geçmedi.
 * `endDate` verilmişse ve ilk uygun tarih onu aşıyorsa `null` — abonelik
 * bitmiş demektir.
 */
export function nextOccurrence(
  startDate: CalendarDate,
  spec: CycleSpec,
  today: CalendarDate,
  endDate?: CalendarDate | null,
): CalendarDate | null {
  const anchor = toCalendarDate(startDate);
  const gun = toCalendarDate(today);

  if (gun.getTime() <= anchor.getTime()) {
    return withinEnd(anchor, endDate);
  }

  // Kaba tahminle başlayıp yürüyoruz. Doğrudan formülle bulmak ay
  // uzunluklarının değişkenliği yüzünden kenar durumlarda yanılıyor;
  // tahminden sonra en fazla birkaç adım atılıyor.
  const gecenGun = daysBetween(anchor, gun);
  let n = Math.max(0, Math.floor(gecenGun / ortalamaGunAraligi(spec)) - 1);

  // İleri sar.
  while (occurrenceDate(anchor, spec, n).getTime() < gun.getTime()) {
    n += 1;
  }
  // Fazla ileri gittiysek geri al.
  while (n > 0 && occurrenceDate(anchor, spec, n - 1).getTime() >= gun.getTime()) {
    n -= 1;
  }

  return withinEnd(occurrenceDate(anchor, spec, n), endDate);
}

/**
 * `from` ile `until` arasındaki bütün ödeme tarihleri.
 *
 * Hatırlatma işi bunu kullanıyor: her aktif abonelik için ufuk boyunca
 * beklenen ödemeler üretiliyor. Üst sınır bir güvenlik ağı — bozuk bir
 * `customIntervalDays` sonsuz döngüye sokmasın.
 */
export function occurrencesBetween(
  startDate: CalendarDate,
  spec: CycleSpec,
  from: CalendarDate,
  until: CalendarDate,
  endDate?: CalendarDate | null,
  maxCount = 400,
): CalendarDate[] {
  const sonuc: CalendarDate[] = [];
  let tarih = nextOccurrence(startDate, spec, from, endDate);

  while (tarih !== null && tarih.getTime() <= until.getTime()) {
    sonuc.push(tarih);
    if (sonuc.length >= maxCount) {
      break;
    }
    tarih = nextOccurrence(startDate, spec, addDays(tarih, 1), endDate);
  }

  return sonuc;
}

function withinEnd(
  date: CalendarDate,
  endDate?: CalendarDate | null,
): CalendarDate | null {
  if (endDate === undefined || endDate === null) {
    return date;
  }
  return date.getTime() <= toCalendarDate(endDate).getTime() ? date : null;
}

/** Tahmin için kaba ortalama; kesinlik gerekmiyor, yalnızca başlangıç noktası. */
function ortalamaGunAraligi(spec: CycleSpec): number {
  switch (spec.cycle) {
    case 'WEEKLY':
      return 7;
    case 'MONTHLY':
      return 30;
    case 'QUARTERLY':
      return 91;
    case 'HALF_YEARLY':
      return 182;
    case 'YEARLY':
      return 365;
    case 'CUSTOM':
      return spec.customIntervalDays ?? 30;
  }
}
