export const SIVI_PARCA_GOLGELEYICI = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uZaman;
  uniform float uIlerleme;
  uniform vec2 uImlec;
  uniform vec2 uOlcu;

  uniform vec3 uGolgeA; uniform vec3 uDalgaA;
  uniform vec3 uIsikA;  uniform vec3 uYansimaA;
  uniform vec3 uGolgeB; uniform vec3 uDalgaB;
  uniform vec3 uIsikB;  uniform vec3 uYansimaB;

  float sivi(vec2 p, float t) {
    float d = 0.0;
    d += sin(p.x * 1.6 + t * 0.35) * 0.5;
    d += sin(p.y * 2.1 - t * 0.28) * 0.4;
    p += vec2(d * 0.35, d * 0.28);
    d += sin((p.x + p.y) * 2.4 + t * 0.22) * 0.3;
    d += sin(length(p * 1.3) * 3.1 - t * 0.4) * 0.25;
    return d;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uOlcu.x / uOlcu.y, 1.0) * 3.2;
    p += uImlec * 0.22;
    p.y += uIlerleme * 1.1;
    p *= 1.0 + uIlerleme * 0.12;

    float d = sivi(p, uZaman);
    float parlaklik = smoothstep(-1.0, 1.4, d);

    // Sert tepeler: metal yüzeyin keskin yansımaları.
    float tepe = pow(smoothstep(0.55, 1.05, d), 3.0);

    vec3 golge = mix(uGolgeA, uGolgeB, uIlerleme);
    vec3 dalga = mix(uDalgaA, uDalgaB, uIlerleme);
    vec3 isik = mix(uIsikA, uIsikB, uIlerleme);
    vec3 yansima = mix(uYansimaA, uYansimaB, uIlerleme);

    vec3 renk = mix(golge, dalga, parlaklik);
    renk = mix(renk, isik, pow(parlaklik, 2.2) * 0.75);
    renk += yansima * tepe * 0.45;

    // Kenarlara doğru sönen karartma; gözü ortada tutuyor.
    float kenar = 1.0 - smoothstep(0.35, 1.05, length(vUv - 0.5) * 1.6);
    renk *= 0.35 + kenar * 0.75;

    gl_FragColor = vec4(renk, 1.0);
  }
`;

/**
 * Köşe gölgelendiricisi.
 *
 * `gl_Position` doğrudan konumdan geliyor: tam ekran bir dikdörtgen
 * çiziliyor, kamera ya da izdüşüm matrisi yok.
 */
export const SIVI_KOSE_GOLGELEYICI = /* glsl */ `
  attribute vec2 konum;
  varying vec2 vUv;
  void main() {
    vUv = konum * 0.5 + 0.5;
    gl_Position = vec4(konum, 0.0, 1.0);
  }
`;
