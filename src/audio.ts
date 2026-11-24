/**
 * Web Audio 공용 도구: 하나의 AudioContext, 소리 파일 불러오기, 페이드를 건 재생, 크로스페이드 반복.
 * 배경음(bgm.ts), 효과음(sfx.ts), 출입문 소리(door.ts)가 같이 쓴다. 모든 소리는 output()을 지나므로
 * stopAllAudio() 한 번으로 전부 정리된다 (결과를 보낼 때).
 *
 * - 브라우저는 사용자 입력 전에는 소리를 막는다. 첫 클릭·터치·키 입력 때 재생을 시작한다.
 * - 탭이 가려지면 멈추고, 다시 보이면 이어서 튼다.
 */

const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

let shared: AudioContext | null = null;

/** 페이지 전체가 같이 쓰는 AudioContext */
export function audioContext(): AudioContext {
  if (shared) return shared;
  const ctx = (shared = new AudioContext());
  const unlock = () => {
    if (!document.hidden) void ctx.resume();
  };
  const removeUnlock = () => UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, true));
  ctx.addEventListener("statechange", () => {
    if (ctx.state === "running") removeUnlock();
  });
  document.addEventListener("visibilitychange", () => void (document.hidden ? ctx.suspend() : ctx.resume()));
  return ctx;
}

const buffers = new Map<string, Promise<AudioBuffer>>();

/** public/soundTrack/ 안의 파일을 불러와 디코딩한다. 같은 파일은 한 번만 받는다 */
export function loadBuffer(file: string): Promise<AudioBuffer> {
  let p = buffers.get(file);
  if (!p) {
    const url = `${import.meta.env.BASE_URL}soundTrack/${encodeURIComponent(file)}`;
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url} ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => audioContext().decodeAudioData(data));
    p.catch(() => buffers.delete(file));
    buffers.set(file, p);
  }
  return p;
}

/** equal-power 곡선: 겹치는 동안 두 소리의 합이 꺼지거나 튀지 않는다 */
function curve(kind: "in" | "out"): Float32Array {
  const n = 128;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (Math.PI / 2);
    c[i] = kind === "in" ? Math.sin(x) : Math.cos(x);
  }
  return c;
}
export const FADE_IN = curve("in");
export const FADE_OUT = curve("out");

// ------------------------------------------------------------------ 전체 출력과 정리

let master: GainNode | null = null;
/** 지금 재생 중이거나 예약된 소리 */
const active = new Set<AudioBufferSourceNode>();
/** 돌고 있는 반복 */
const loops = new Set<{ stop: (at?: number) => void }>();
/** stopAllAudio가 불릴 때마다 늘어난다. 파일을 받는 중이던 소리가 정리 뒤에 뒤늦게 나지 않게 비교한다 */
let epoch = 0;
export const soundEpoch = () => epoch;

/** 모든 소리가 지나가는 마지막 출력. ctx.destination 대신 여기에 연결한다 */
export function output(): GainNode {
  if (!master) {
    const ctx = audioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  return master;
}

/**
 * 모든 소리를 fade초 동안 줄이며 멈춘다: 반복은 예약을 끊고, 재생 중이거나 예약된 소리는 모두 멈춘다.
 * 출력은 unmuteAudio()가 불릴 때까지(다시 하기로 배경음이 다시 켜질 때) 꺼진 채로 둔다.
 */
export function stopAllAudio(fade = 0.3) {
  epoch++;
  if (!shared) return;
  const t = shared.currentTime;
  const end = t + fade;
  loops.forEach((l) => l.stop(end));
  loops.clear();
  active.forEach((s) => s.stop(end));
  active.clear();
  const g = output().gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, end);
}

/** stopAllAudio로 꺼 둔 출력을 다시 켠다 */
export function unmuteAudio() {
  const g = output().gain;
  const t = audioContext().currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(1, t);
}

// ------------------------------------------------------------------ 재생

/** start초에 한 번 튼다. fadeIn·fadeOut초만큼 앞뒤에 페이드를 건다 */
export function playBuffer(
  buffer: AudioBuffer,
  out: AudioNode,
  start: number,
  fade: { in?: number; out?: number } = {},
): AudioBufferSourceNode {
  const ctx = audioContext();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const env = ctx.createGain();
  if (fade.in) env.gain.setValueCurveAtTime(FADE_IN, start, fade.in);
  if (fade.out) env.gain.setValueCurveAtTime(FADE_OUT, start + buffer.duration - fade.out, fade.out);
  src.connect(env).connect(out);
  src.onended = () => {
    active.delete(src);
    env.disconnect();
  };
  src.start(start);
  active.add(src);
  return src;
}

/** 다음 바퀴를 몇 초 앞에서 미리 예약할지 */
const LOOKAHEAD = 1.5;

/**
 * start초부터 무한 반복한다. 한 바퀴가 끝나기 crossfade초 전에 다음 바퀴를 겹쳐 시작하고
 * 앞 바퀴는 줄이고 다음 바퀴는 키운다. 첫 바퀴도 crossfade초 동안 페이드인한다.
 * 반복 주기는 (곡 길이 − crossfade)초. crossfade는 곡 길이의 45%까지로 줄여 쓴다
 * (페이드 인·아웃 곡선이 한 바퀴 안에서 겹치면 setValueCurveAtTime이 예외를 던진다).
 */
export function crossfadeLoop(buffer: AudioBuffer, out: AudioNode, crossfade: number, start: number) {
  const ctx = audioContext();
  const fade = Math.min(crossfade, buffer.duration * 0.45);
  const period = buffer.duration - fade;
  const playing = new Set<AudioBufferSourceNode>();
  let next = start;
  // ctx가 멈춰 있으면 currentTime도 멈추므로 예약이 쌓이지 않는다
  const schedule = () => {
    while (next < ctx.currentTime + LOOKAHEAD) {
      const src = playBuffer(buffer, out, Math.max(next, ctx.currentTime), { in: fade, out: fade });
      playing.add(src);
      src.addEventListener("ended", () => playing.delete(src));
      next += period;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 250);
  const loop = {
    /** at초에 멈춘다 (이미 예약된 바퀴도). 페이드아웃은 out 쪽에서 건다 */
    stop(at = ctx.currentTime) {
      window.clearInterval(timer);
      loops.delete(loop);
      playing.forEach((s) => s.stop(Math.max(at, ctx.currentTime)));
    },
  };
  loops.add(loop);
  return loop;
}
