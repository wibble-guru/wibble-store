/**
 * 효과음: media.ts SFX 중 file 칸이 채워진 것만 public/soundTrack/ 에서 불러와 튼다.
 * 파일이 없는 효과음은 조용히 넘어간다 (개발 서버의 큐 표시로만 보인다).
 * Web Audio(audio.ts)로 틀어서 결과를 보낼 때 stopAllAudio()로 함께 정리된다.
 */
import { audioContext, loadBuffer, output, playBuffer, soundEpoch } from "./audio";
import { SFX, type SfxId } from "./game/media";

const VOLUME = 1;

function fileOf(id: SfxId): string | undefined {
  return (SFX[id] as { file?: string }).file;
}

let bus: GainNode | null = null;
function sfxOut(): GainNode {
  if (!bus) {
    bus = audioContext().createGain();
    bus.gain.value = VOLUME;
    bus.connect(output());
  }
  return bus;
}

/** 파일이 있는 효과음을 미리 받아 둔다 (첫 재생이 늦지 않게) */
export function preloadSfx() {
  for (const id of Object.keys(SFX) as SfxId[]) {
    const file = fileOf(id);
    if (file) loadBuffer(file).catch((err) => console.warn(`[sfx] ${file}을(를) 불러오지 못했습니다`, err));
  }
}

/** 효과음을 한 번 튼다. 같은 소리가 겹쳐도 된다 */
export function playSfx(id: SfxId) {
  const file = fileOf(id);
  if (!file) return;
  const epoch = soundEpoch();
  loadBuffer(file)
    .then((buffer) => {
      // 받는 사이에 소리가 정리됐으면(결과 전송) 틀지 않는다
      if (epoch === soundEpoch()) playBuffer(buffer, sfxOut(), audioContext().currentTime);
    })
    .catch((err) => console.warn(`[sfx] ${id}을(를) 틀지 못했습니다`, err));
}
