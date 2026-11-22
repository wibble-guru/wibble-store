/**
 * 원통형 파노라마 → 화면 투영.
 *
 * 파노라마는 3D 블록아웃(annotation 저장소 `design/Game gate/night-store-scene/3d`)을
 * Blender 원통형 카메라로 렌더한 구도를 따른다(배경 그림은 그 렌더를 가이드로 생성). 화면의 픽셀마다 실제로 보는 방향을 계산해
 * 파노라마에서 색을 가져오므로, 휘어 있던 직선이 다시 곧게 펴진다.
 *
 * - d = 0 : 일반 원근(직선이 곧다. 가장자리는 위아래로 늘어남) ← 기본값
 * - d > 0 : 파니니(가장자리가 덜 늘어나고 세로선은 수직 유지)
 */

/** 파노라마 규격. 3d/build_store.py 의 PANO_DEG, V_TOP, V_BOT 과 같아야 한다 */
export const PANO = {
  uMin: (-120 * Math.PI) / 180,
  uMax: (120 * Math.PI) / 180,
  vTop: 441 / 580,
  vBot: 500 / 580,
};

export const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

export const FRAG = `
precision highp float;
uniform sampler2D tex;
uniform vec2 res;
uniform float f, cy, yaw, d;
uniform vec4 pano; // uMin, uMax, vTop, vBot
void main(){
  float x = (gl_FragCoord.x - res.x * 0.5) / f;
  float y = (cy - (res.y - gl_FragCoord.y)) / f;
  float k = x * x / ((d + 1.) * (d + 1.));
  float dscr = k * k * d * d - (k + 1.) * (k * d * d - 1.);
  float clon = (-k * d + sqrt(max(dscr, 0.))) / (k + 1.);
  float S = (d + 1.) / (d + clon);
  float lon = atan(x, S * clon) + yaw;
  float v = y / S;
  float u = (lon - pano.x) / (pano.y - pano.x);
  float t = (pano.z - v) / (pano.z + pano.w);
  if (u < 0. || u > 1. || t < 0. || t > 1.) { gl_FragColor = vec4(.04, .08, .09, 1.); return; }
  gl_FragColor = texture2D(tex, vec2(u, t));
}`;

/** 화면 가로 위치 x(초점거리 단위)에 해당하는 경도 */
export function lonAt(x: number, d: number): number {
  const k = (x * x) / (d + 1) ** 2;
  const dscr = k * k * d * d - (k + 1) * (k * d * d - 1);
  const clon = (-k * d + Math.sqrt(Math.max(dscr, 0))) / (k + 1);
  const S = (d + 1) / (d + clon);
  return Math.atan2(x, S * clon);
}

export type Geometry = { f: number; cy: number; halfFov: number; yawMax: number };

/** 캔버스 크기에서 초점거리·수평선 위치·돌릴 수 있는 범위를 구한다 */
export function geometry(w: number, h: number, d: number, zoom = 1): Geometry {
  const f = (h / (PANO.vTop + PANO.vBot)) * zoom;
  const cy = h / 2 + ((PANO.vTop - PANO.vBot) / 2) * f;
  const halfFov = lonAt(w / 2 / f, d);
  const yawMax = Math.max(0, Math.min(PANO.uMax - halfFov, -PANO.uMin - halfFov));
  return { f, cy, halfFov, yawMax };
}

/** 버튼으로 멈추는 시선(도). 가로 화면은 3칸, 세로 화면은 화각이 좁아 5칸 */
export const STOPS = {
  landscape: [
    { name: "좌", deg: -180 },
    { name: "정면", deg: 0 },
    { name: "우", deg: 180 },
  ],
  portrait: [
    { name: "창가", deg: -95 },
    { name: "출입문", deg: -48 },
    { name: "정면", deg: 0 },
    { name: "화장실", deg: 62 },
    { name: "CCTV", deg: 87 },
  ],
};
