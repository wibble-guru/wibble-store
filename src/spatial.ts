/**
 * 좌우 위치: 소리를 세 묶음으로 나눈다.
 *
 * - left  : 매장 왼쪽(출입문·창문 쪽)에 고정된 소리
 * - right : 매장 오른쪽(화장실·CCTV 쪽)에 고정된 소리
 * - 없음  : 전체에서 들리는 소리 (가운데). 배경음, 계산대·진열대·휴대폰 소리 등
 *
 * left/right는 매장 안 위치에 고정돼 있어서, 시선(머리 각도)을 돌리면 좌우가 따라 바뀐다.
 * 출입문 쪽을 보면 문 소리가 가운데로, 화장실 쪽을 보면 문 소리가 더 왼쪽으로 간다.
 * 좌우 값 = sin(소리 방향 − 시선 방향). 뒤쪽은 다시 가운데로 모인다.
 *
 * 걸어오는 발소리처럼 매장 안에서 위치가 바뀌는 소리는 movingSource()로 만든다.
 *
 * 매장 밖 장면에서는 매장 안 각도가 맞지 않으므로 모두 가운데로 둔다.
 * 출력이 모노면(audio.ts) 좌우 없이 모두 가운데로 둔다.
 */
import { audioContext, isMonoOutput, onChannelModeChange, output } from "./audio";
import { SPOTS } from "./game/engine";

export type Side = "left" | "right";

/** 묶음별 소리 방향(도). 0 = 정면 통로, + 오른쪽 */
const SIDE_DEG: Record<Side, number> = {
  left: SPOTS.door,
  right: SPOTS.restroom,
};
/** 시선을 돌리거나 소리가 옮겨 갈 때 좌우가 따라가는 시간 상수(초). 드래그 중 튀지 않게 */
const SMOOTH = 0.05;

const DEG = Math.PI / 180;
let lookDeg = 0;
let centered = false;

/** 매장 안 deg 방향에 놓인 소리 하나 */
type Source = { panner: StereoPannerNode; deg: number };
const sources = new Set<Source>();
const buses: Partial<Record<Side, Source>> = {};

function panOf(deg: number): number {
  if (centered || isMonoOutput()) return 0;
  return Math.max(-1, Math.min(1, Math.sin((deg - lookDeg) * DEG)));
}

function apply(s: Source, smooth: boolean) {
  const p = s.panner.pan;
  const t = audioContext().currentTime;
  if (smooth) p.setTargetAtTime(panOf(s.deg), t, SMOOTH);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(panOf(s.deg), t);
  }
}

const update = (smooth = true) => sources.forEach((s) => apply(s, smooth));
onChannelModeChange(() => update(false));

function createSource(deg: number): Source {
  const panner = audioContext().createStereoPanner();
  const s = { panner, deg };
  panner.pan.value = panOf(deg);
  panner.connect(output());
  sources.add(s);
  return s;
}

/** 소리를 연결할 곳. side가 없으면 전체(가운데) */
export function busFor(side?: Side): AudioNode {
  if (!side) return output();
  return (buses[side] ??= createSource(SIDE_DEG[side])).panner;
}

/** 위치를 옮길 수 있는 소리 자리. node에 연결하고, move로 옮기고, 다 쓰면 dispose */
export function movingSource(deg: number) {
  const s = createSource(deg);
  return {
    node: s.panner as AudioNode,
    move(to: number) {
      s.deg = to;
      apply(s, true);
    },
    dispose() {
      sources.delete(s);
      s.panner.disconnect();
    },
  };
}

/** 지금 시선 방향(도). 파노라마가 그릴 때마다 알려 준다 */
export function setListenerYaw(deg: number) {
  if (Math.abs(deg - lookDeg) < 0.05) return;
  lookDeg = deg;
  update();
}

/** 매장 밖 장면이면 true: 좌우 없이 가운데로 */
export function setSpatialCentered(on: boolean) {
  if (on === centered) return;
  centered = on;
  update();
}
