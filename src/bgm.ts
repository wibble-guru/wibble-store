/**
 * 배경음: TRACKS의 소리들을 동시에 무한 반복한다. 반복 구간마다 크로스페이드로 이어 붙인다.
 *
 * - 한 바퀴가 끝나기 crossfade초 전에 다음 바퀴를 겹쳐 시작하고, 앞 바퀴는 줄이고 다음 바퀴는 키운다(equal-power).
 *   그래서 반복 주기는 (곡 길이 − crossfade)초가 된다.
 * - 브라우저는 사용자 입력 전에는 소리를 막는다. 첫 클릭·터치·키 입력 때 재생을 시작한다.
 * - 탭이 가려지면 멈추고, 다시 보이면 이어서 튼다.
 */

type Track = {
  /** public/soundTrack/ 안의 파일 이름 */
  file: string;
  volume: number;
  /** 반복 구간 사이 크로스페이드 길이(초). 곡이 짧으면 곡 길이의 45%까지로 줄여 쓴다 */
  crossfade: number;
};

const TRACKS: Track[] = [
  { file: "idle.wav", volume: 1, crossfade: 1.5 },
  { file: "rain.wav", volume: 1, crossfade: 1.5 },
];

/** 다음 바퀴를 몇 초 앞에서 미리 예약할지 */
const LOOKAHEAD = 1.5;
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

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
const FADE_IN = curve("in");
const FADE_OUT = curve("out");

/** 배경음을 켠다. 돌려준 함수를 부르면 끈다 */
export function startBgm(): () => void {
  const ctx = new AudioContext();
  const playing = new Set<AudioBufferSourceNode>();
  const timers: number[] = [];
  let disposed = false;

  /** start초에 한 바퀴를 틀고, 앞뒤로 fade초 페이드를 건다 */
  function playOnce(buffer: AudioBuffer, out: AudioNode, start: number, fade: number) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueCurveAtTime(FADE_IN, start, fade);
    env.gain.setValueCurveAtTime(FADE_OUT, start + buffer.duration - fade, fade);
    src.connect(env).connect(out);
    src.onended = () => {
      playing.delete(src);
      env.disconnect();
    };
    src.start(start);
    playing.add(src);
  }

  function loop(track: Track, buffer: AudioBuffer) {
    const out = ctx.createGain();
    out.gain.value = track.volume;
    out.connect(ctx.destination);
    // 페이드 인·아웃 곡선이 한 바퀴 안에서 겹치면 setValueCurveAtTime이 예외를 던진다
    const fade = Math.min(track.crossfade, buffer.duration * 0.45);
    const period = buffer.duration - fade;
    let next = ctx.currentTime;
    // ctx가 멈춰 있으면 currentTime도 멈추므로 예약이 쌓이지 않는다
    const schedule = () => {
      while (next < ctx.currentTime + LOOKAHEAD) {
        playOnce(buffer, out, Math.max(next, ctx.currentTime), fade);
        next += period;
      }
    };
    schedule();
    timers.push(window.setInterval(schedule, 250));
  }

  for (const track of TRACKS) {
    const url = `${import.meta.env.BASE_URL}soundTrack/${track.file}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url} ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        if (!disposed) loop(track, buffer);
      })
      .catch((err) => console.warn(`[bgm] ${track.file}을(를) 불러오지 못했습니다`, err));
  }

  const unlock = () => {
    if (!document.hidden) void ctx.resume();
  };
  const removeUnlock = () => UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, true));
  ctx.addEventListener("statechange", () => {
    if (ctx.state === "running") removeUnlock();
  });

  const onVisibility = () => void (document.hidden ? ctx.suspend() : ctx.resume());
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    disposed = true;
    removeUnlock();
    document.removeEventListener("visibilitychange", onVisibility);
    timers.forEach((t) => window.clearInterval(t));
    playing.forEach((s) => s.stop());
    void ctx.close();
  };
}
