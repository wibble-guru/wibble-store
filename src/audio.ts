/**
 * Web Audio 공용 도구: 하나의 AudioContext, 소리 파일 불러오기, 페이드를 건 재생, 크로스페이드 반복.
 * 배경음(bgm.ts)과 출입문 소리(door.ts)가 같이 쓴다.
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
  src.onended = () => env.disconnect();
  src.start(start);
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
  return {
    /** at초에 멈춘다 (이미 예약된 바퀴도). 페이드아웃은 out 쪽에서 건다 */
    stop(at = ctx.currentTime) {
      window.clearInterval(timer);
      playing.forEach((s) => s.stop(Math.max(at, ctx.currentTime)));
    },
  };
}
