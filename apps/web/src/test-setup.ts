// `toBeInTheDocument`, `toHaveAttribute` gibi DOM iddiaları.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * Her testten sonra DOM temizleniyor.
 *
 * Testing Library bunu `globals: true` ile kendiliğinden yapıyor; bu projede
 * global'ler kapalı olduğu için elle bağlanması gerekiyor. Bağlanmadığında
 * önceki testin ekranı belgede kalıyor ve `getByLabelText` yanlış — eski —
 * alanı buluyor. Hata da kodda değil testte olduğu için insanı yanlış yere
 * bakmaya götürüyor.
 */
afterEach(cleanup);
