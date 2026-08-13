/**
 * API istemcisi.
 *
 * Tarayıcıda oturum **cookie** ile taşınıyor; token JavaScript'te hiç
 * tutulmuyor. Oturum cookie'si `httpOnly`, yani XSS ile çalınamıyor —
 * `localStorage`'a token yazan bir istemcide bu koruma olmazdı.
 *
 * Yazma isteklerinde `x-csrf-token` başlığı gerekiyor. Değeri, sunucunun
 * girişte bıraktığı okunabilir `csrf` cookie'sinden geliyor.
 */

const KOK = '/api/v1';

/** Sunucudan gelen RFC 9457 hata gövdesi. */
export interface ProblemDetails {
  /**
   * Sunucu her zaman gönderiyor, ama bu tip **ağdan gelen** veriyi tarif
   * ediyor: eksik olabileceğini varsaymak zorundayız. Zorunlu sayıldığında
   * alanı olmayan tek bir yanıt uygulamanın tamamını çökertiyordu.
   */
  type?: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiError';
  }

  /** Alan bazlı doğrulama hataları; form bunları girdilerin altına yazıyor. */
  get alanHatalari(): Record<string, string> {
    const sonuc: Record<string, string> = {};
    for (const hata of this.problem.errors ?? []) {
      sonuc[hata.field] = hata.message;
    }
    return sonuc;
  }

  get yetkisiz(): boolean {
    return this.problem.status === 401;
  }
}

function csrfToken(): string | undefined {
  const eslesme = document.cookie.match(/(?:^|;\s*)csrf=([^;]*)/);
  return eslesme?.[1];
}

async function istek<T>(
  method: string,
  yol: string,
  govde?: unknown,
): Promise<T> {
  const yazma = method !== 'GET';
  const token = csrfToken();

  const yanit = await fetch(`${KOK}${yol}`, {
    method,
    // Cookie'nin gitmesi için şart.
    credentials: 'same-origin',
    headers: {
      ...(govde !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(yazma && token !== undefined ? { 'x-csrf-token': token } : {}),
    },
    ...(govde !== undefined ? { body: JSON.stringify(govde) } : {}),
  });

  if (yanit.status === 204) {
    return undefined as T;
  }

  const metin = await yanit.text();
  const veri: unknown = metin === '' ? null : JSON.parse(metin);

  if (!yanit.ok) {
    throw new ApiError(
      (veri as ProblemDetails | null) ?? {
        type: 'about:blank',
        title: 'Beklenmeyen hata',
        status: yanit.status,
      },
    );
  }

  return veri as T;
}

export const api = {
  get: <T>(yol: string) => istek<T>('GET', yol),
  post: <T>(yol: string, govde?: unknown) => istek<T>('POST', yol, govde),
  patch: <T>(yol: string, govde?: unknown) => istek<T>('PATCH', yol, govde),
  delete: <T>(yol: string) => istek<T>('DELETE', yol),
};
