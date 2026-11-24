/**
 * 출입문 소리 + 문 너머 바깥 빗소리 (대본의 { door: "open" | "close" } 큐).
 *
 * 열 때:  door-open(without-rain) ─ 한 번
 *         rain-start(outside) ──╲
 *                               ╳ CROSSFADE초 크로스페이드
 *         rain(outside) 반복 ───╱ (반복 구간도 크로스페이드)
 * 닫을 때: rain(outside) 반복 ───╲
 *                               ╳ CROSSFADE초 크로스페이드
 *         rain-end(outside) ────╱
 *
 * 열 때 문 소리와 빗소리는 같은 순간에 시작한다 (레이어). 닫을 때는 문 소리 없이 빗소리만 잦아든다
 * (닫히는 문 소리가 필요하면 대본에 { sfx: "door-close" }를 따로 둔다).
 * 문이 열려 있는 동안(open ~ close) 빗소리는 장면이 바뀌어도 계속 반복된다.
 * close가 없으면 장면 진행이 끝날 때(결과 화면)까지 이어지다가 잦아든다.
 */
import { FADE_OUT, audioContext, crossfadeLoop, loadBuffer, playBuffer, soundEpoch } from "./audio";
import { busFor } from "./spatial";

const FILES = {
  open: "door-open(without-rain).wav",
  rainStart: "rain-start(outside).wav",
  rain: "rain(outside).wav",
  rainEnd: "rain-end(outside).wav",
} as const;
type Buffers = Record<keyof typeof FILES, AudioBuffer>;

/** 문 소리 볼륨 / 바깥 빗소리 볼륨 */
const DOOR_VOLUME = 1;
const RAIN_VOLUME = 1;
/** rain-start → 반복, 반복 구간 사이, 반복 → rain-end 크로스페이드 길이(초) */
const CROSSFADE = 1;

function loadAll(): Promise<Buffers> {
  const keys = Object.keys(FILES) as (keyof typeof FILES)[];
  return Promise.all(keys.map((k) => loadBuffer(FILES[k]))).then(
    (list) => Object.fromEntries(keys.map((k, i) => [k, list[i]])) as Buffers,
  );
}

/** 문이 열려 있는 동안 나는 바깥 빗소리 */
let rain: { out: GainNode; stop: (at: number) => void } | null = null;
/** 큐를 순서대로 처리한다 (파일을 받는 중에 닫기가 먼저 실행되지 않게) */
let queue: Promise<unknown> = Promise.resolve();
/** resetDoor가 불리면 늘어난다. 그 전에 예약된 큐는 버린다 */
let generation = 0;

function enqueue(run: (b: Buffers) => void) {
  const gen = generation;
  const epoch = soundEpoch();
  queue = queue
    .then(loadAll)
    .then((b) => {
      // resetDoor나 stopAllAudio(결과 전송) 뒤에는 남은 큐를 버린다
      if (gen === generation && epoch === soundEpoch()) run(b);
    })
    .catch((err) => console.warn("[door] 출입문 소리를 불러오지 못했습니다", err));
}

function gain(value: number): GainNode {
  const ctx = audioContext();
  const g = ctx.createGain();
  g.gain.value = value;
  // 문 소리와 문 너머 빗소리는 출입문 쪽(왼쪽)에 고정
  g.connect(busFor("left"));
  return g;
}

/** 파일을 미리 받아 둔다 */
export function preloadDoor() {
  loadAll().catch((err) => console.warn("[door] 출입문 소리를 불러오지 못했습니다", err));
}

/** 문이 열린다: 문 소리 + rain-start 뒤로 rain 반복 */
export function openDoor() {
  enqueue((b) => {
    if (rain) return; // 이미 열려 있다
    const t = audioContext().currentTime;
    playBuffer(b.open, gain(DOOR_VOLUME), t);
    const out = gain(RAIN_VOLUME);
    const xf = Math.min(CROSSFADE, b.rainStart.duration * 0.45);
    const head = playBuffer(b.rainStart, out, t, { out: xf });
    const loop = crossfadeLoop(b.rain, out, xf, t + b.rainStart.duration - xf);
    rain = {
      out,
      stop: (at) => {
        head.stop(at);
        loop.stop(at);
      },
    };
  });
}

/** 문이 닫힌다: 빗소리 반복을 rain-end로 넘기며 끝낸다 */
export function closeDoor() {
  enqueue((b) => {
    if (!rain) return;
    const t = audioContext().currentTime;
    const { out, stop } = rain;
    rain = null;
    const xf = Math.min(CROSSFADE, b.rainEnd.duration * 0.45);
    out.gain.setValueCurveAtTime(FADE_OUT, t, xf);
    stop(t + xf);
    window.setTimeout(() => out.disconnect(), (xf + 0.2) * 1000);
    playBuffer(b.rainEnd, gain(RAIN_VOLUME), t, { in: xf });
  });
}

/** 문이 닫히지 않은 채 장면 진행이 끝나면(결과 화면) 빗소리를 CROSSFADE초 동안 줄이며 끈다 */
export function resetDoor() {
  generation++;
  if (!rain) return;
  const { out, stop } = rain;
  rain = null;
  const t = audioContext().currentTime;
  out.gain.setValueCurveAtTime(FADE_OUT, t, CROSSFADE);
  stop(t + CROSSFADE);
  window.setTimeout(() => out.disconnect(), (CROSSFADE + 0.2) * 1000);
}
