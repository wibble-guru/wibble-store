/**
 * 효과음: media.ts SFX 중 file 칸이 채워진 것만 public/soundTrack/ 에서 불러와 튼다.
 * 파일이 없는 효과음은 조용히 넘어간다 (개발 서버의 큐 표시로만 보인다).
 * Web Audio(audio.ts)로 틀어서 결과를 보낼 때 stopAllAudio()로 함께 정리된다.
 */
import { audioContext, loadBuffer, playBuffer, soundEpoch } from "./audio";
import { SFX, type SfxId } from "./game/media";
import { busFor, type Side } from "./spatial";

const VOLUME = 1;
/** skip으로 앞을 잘라 낸 자리의 페이드인(초). 잘린 지점에서 '틱' 소리가 나지 않게 */
const SKIP_FADE_IN = 0.005;
/** 모든 효과음 끝의 페이드아웃(초). 꼬리가 툭 끊기지 않게 */
const END_FADE_OUT = 0.03;

type SfxEntry = { file?: string; volume?: number; skip?: number; side?: Side };
const entry = (id: SfxId) => SFX[id] as SfxEntry;

/** 파일이 있는 효과음을 미리 받아 둔다 (첫 재생이 늦지 않게) */
export function preloadSfx() {
  for (const id of Object.keys(SFX) as SfxId[]) {
    const { file } = entry(id);
    if (file) loadBuffer(file).catch((err) => console.warn(`[sfx] ${file}을(를) 불러오지 못했습니다`, err));
  }
}

/** 효과음을 한 번 튼다. 같은 소리가 겹쳐도 된다 */
export function playSfx(id: SfxId) {
  const { file, volume = 1, skip = 0, side } = entry(id);
  if (!file) return;
  const epoch = soundEpoch();
  loadBuffer(file)
    .then((buffer) => {
      // 받는 사이에 소리가 정리됐으면(결과 전송) 틀지 않는다
      if (epoch !== soundEpoch()) return;
      const ctx = audioContext();
      const gain = ctx.createGain();
      gain.gain.value = VOLUME * volume;
      // 소리가 나는 쪽(좌·우·전체)으로 보낸다
      gain.connect(busFor(side));
      const length = buffer.duration - skip;
      const fade = {
        in: skip > 0 ? Math.min(SKIP_FADE_IN, length / 4) : undefined,
        out: Math.min(END_FADE_OUT, length / 4),
      };
      const src = playBuffer(buffer, gain, ctx.currentTime, fade, skip);
      src.addEventListener("ended", () => gain.disconnect());
    })
    .catch((err) => console.warn(`[sfx] ${id}을(를) 틀지 못했습니다`, err));
}
