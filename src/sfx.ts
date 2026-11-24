/**
 * 효과음: media.ts SFX 중 file 칸이 채워진 것만 public/soundTrack/ 에서 불러와 튼다.
 * 파일이 없는 효과음은 조용히 넘어간다 (개발 서버의 큐 표시로만 보인다).
 */
import { SFX, type SfxId } from "./game/media";

const VOLUME = 1;
const loaded = new Map<SfxId, HTMLAudioElement>();

function fileOf(id: SfxId): string | undefined {
  return (SFX[id] as { file?: string }).file;
}

function load(id: SfxId): HTMLAudioElement | null {
  const file = fileOf(id);
  if (!file) return null;
  let audio = loaded.get(id);
  if (!audio) {
    audio = new Audio(`${import.meta.env.BASE_URL}soundTrack/${file}`);
    audio.preload = "auto";
    loaded.set(id, audio);
  }
  return audio;
}

/** 파일이 있는 효과음을 미리 받아 둔다 (첫 재생이 늦지 않게) */
export function preloadSfx() {
  for (const id of Object.keys(SFX) as SfxId[]) load(id);
}

/** 효과음을 한 번 튼다. 같은 소리가 겹쳐도 되도록 매번 복제해서 튼다 */
export function playSfx(id: SfxId) {
  const base = load(id);
  if (!base) return;
  const audio = base.cloneNode() as HTMLAudioElement;
  audio.volume = VOLUME;
  audio.play().catch((err) => console.warn(`[sfx] ${id}을(를) 틀지 못했습니다`, err));
}
