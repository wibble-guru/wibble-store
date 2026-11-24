/**
 * 배경음: TRACKS의 소리들을 동시에 무한 반복한다. 반복 구간마다 크로스페이드로 이어 붙인다 (audio.ts crossfadeLoop).
 * 반복 주기는 (곡 길이 − crossfade)초가 된다.
 */
import { audioContext, crossfadeLoop, loadBuffer } from "./audio";

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

/** 배경음을 켠다. 돌려준 함수를 부르면 끈다 */
export function startBgm(): () => void {
  const ctx = audioContext();
  const stops: (() => void)[] = [];
  let disposed = false;

  for (const track of TRACKS) {
    loadBuffer(track.file)
      .then((buffer) => {
        if (disposed) return;
        const out = ctx.createGain();
        out.gain.value = track.volume;
        out.connect(ctx.destination);
        const loop = crossfadeLoop(buffer, out, track.crossfade, ctx.currentTime);
        stops.push(() => {
          loop.stop();
          out.disconnect();
        });
      })
      .catch((err) => console.warn(`[bgm] ${track.file}을(를) 불러오지 못했습니다`, err));
  }

  return () => {
    disposed = true;
    stops.forEach((stop) => stop());
  };
}
