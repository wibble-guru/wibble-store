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
/** 시선을 돌릴 때 좌우가 따라가는 시간 상수(초). 드래그 중 튀지 않게 */
const SMOOTH = 0.05;

const DEG = Math.PI / 180;
let lookDeg = 0;
let centered = false;
const buses: Partial<Record<Side, StereoPannerNode>> = {};

function panOf(side: Side): number {
  if (centered || isMonoOutput()) return 0;
  return Math.max(-1, Math.min(1, Math.sin((SIDE_DEG[side] - lookDeg) * DEG)));
}

function update(smooth = true) {
  const ctx = audioContext();
  for (const side of Object.keys(buses) as Side[]) {
    const p = buses[side]!.pan;
    if (smooth) p.setTargetAtTime(panOf(side), ctx.currentTime, SMOOTH);
    else {
      p.cancelScheduledValues(ctx.currentTime);
      p.setValueAtTime(panOf(side), ctx.currentTime);
    }
  }
}
onChannelModeChange(() => update(false));

/** 소리를 연결할 곳. side가 없으면 전체(가운데) */
export function busFor(side?: Side): AudioNode {
  if (!side) return output();
  let bus = buses[side];
  if (!bus) {
    bus = buses[side] = audioContext().createStereoPanner();
    bus.pan.value = panOf(side);
    bus.connect(output());
  }
  return bus;
}

/** 지금 시선 방향(도). 파노라마가 그릴 때마다 알려 준다 */
export function setListenerYaw(deg: number) {
  if (Math.abs(deg - lookDeg) < 0.05) return;
  lookDeg = deg;
  if (Object.keys(buses).length) update();
}

/** 매장 밖 장면이면 true: 좌우 없이 가운데로 */
export function setSpatialCentered(on: boolean) {
  if (on === centered) return;
  centered = on;
  if (Object.keys(buses).length) update();
}
