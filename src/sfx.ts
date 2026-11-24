/**
 * 효과음: media.ts SFX 중 file 칸이 채워진 것만 public/soundTrack/ 에서 불러와 튼다.
 * 파일이 없는 효과음은 조용히 넘어간다 (개발 서버의 큐 표시로만 보인다).
 * Web Audio(audio.ts)로 틀어서 결과를 보낼 때 stopAllAudio()로 함께 정리된다.
 */
import { audioContext, loadBuffer, playBuffer, soundEpoch } from "./audio";
import { SFX, type SfxId } from "./game/media";
import { busFor, movingSource, type Side } from "./spatial";

const VOLUME = 1;
/** skip으로 앞을 잘라 낸 자리의 페이드인(초). 잘린 지점에서 '틱' 소리가 나지 않게 */
const SKIP_FADE_IN = 0.005;
/** 모든 효과음 끝의 페이드아웃(초). 꼬리가 툭 끊기지 않게 */
const END_FADE_OUT = 0.03;
/** 소리가 끝났다는 알림이 오지 않아도(오디오가 멈춰 있는 등) 진행이 멈춰 있지 않게 더 기다려 주는 시간(초) */
const END_GRACE = 1;

type SfxEntry = { file?: string; volume?: number; skip?: number; side?: Side; steps?: number[] };
const entry = (id: SfxId) => SFX[id] as SfxEntry;

/** 걸어가는 소리: from → to(도)로 걸음마다 위치를 옮기고, 걸음마다 onStep(그 걸음의 방향)을 부른다 */
export type Walk = { from: number; to: number; onStep?: (deg: number) => void };

/** 파일이 있는 효과음을 미리 받아 둔다 (첫 재생이 늦지 않게) */
export function preloadSfx() {
  for (const id of Object.keys(SFX) as SfxId[]) {
    const { file } = entry(id);
    if (file) loadBuffer(file).catch((err) => console.warn(`[sfx] ${file}을(를) 불러오지 못했습니다`, err));
  }
}

/**
 * 효과음을 한 번 튼다. 같은 소리가 겹쳐도 된다.
 * 소리가 끝나면 풀리는 Promise를 돌려준다 (파일이 없거나 못 틀면 바로 풀린다)
 */
export function playSfx(id: SfxId, walk?: Walk): Promise<void> {
  const { file, volume = 1, skip = 0, side, steps } = entry(id);
  if (!file) return Promise.resolve();
  const epoch = soundEpoch();
  return loadBuffer(file)
    .then((buffer) => {
      // 받는 사이에 소리가 정리됐으면(결과 전송) 틀지 않는다
      if (epoch !== soundEpoch()) return;
      const ctx = audioContext();
      const gain = ctx.createGain();
      gain.gain.value = VOLUME * volume;
      // 소리가 나는 쪽(좌·우·전체)으로 보낸다. 걸어가는 소리는 걸음마다 옮겨 가는 자리로
      const moving = walk && steps?.length ? movingSource(walk.from) : null;
      gain.connect(moving ? moving.node : busFor(side));
      const length = buffer.duration - skip;
      const fade = {
        in: skip > 0 ? Math.min(SKIP_FADE_IN, length / 4) : undefined,
        out: Math.min(END_FADE_OUT, length / 4),
      };
      const src = playBuffer(buffer, gain, ctx.currentTime, fade, skip);
      const timers: number[] = [];
      if (moving && walk && steps) {
        const n = steps.length;
        steps.forEach((at, i) => {
          const deg = walk.from + ((walk.to - walk.from) * i) / Math.max(1, n - 1);
          timers.push(
            window.setTimeout(
              () => {
                if (epoch !== soundEpoch()) return;
                moving.move(deg);
                walk.onStep?.(deg);
              },
              Math.max(0, at - skip) * 1000,
            ),
          );
        });
      }
      return new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, (length + END_GRACE) * 1000));
        src.addEventListener("ended", () => {
          timers.forEach((t) => window.clearTimeout(t));
          gain.disconnect();
          moving?.dispose();
          resolve();
        });
      });
    })
    .catch((err) => console.warn(`[sfx] ${id}을(를) 틀지 못했습니다`, err));
}
