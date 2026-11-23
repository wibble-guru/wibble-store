import { useEffect, useState } from "preact/hooks";
import { CUTS, type CutId } from "../game/media";

/**
 * 컷씬: 매장 화면을 덮는 1인칭 동작 그림. 대사창·시각은 그 위에 그대로 남는다.
 *
 * 그림은 src/assets/cuts/ 에 컷씬 id 이름으로 넣으면 바로 붙는다 (코드 수정 없음).
 * - `<id>.gif` 한 장 (.webp .png .jpg .avif도 됨): 그대로 보여 준다. 움직이는 GIF·WebP면 그 움직임대로
 * - `<id>.1.webp` + `<id>.2.webp` 두 장: 1번을 SWAP_MS 동안 보여 준 뒤 2번으로 FADE_MS 동안 겹쳐 넘어간다
 * - 파일이 없으면 빈 화면 두 장으로 같은 넘김을 흉내 낸다 (개발 서버에서는 id·설명이 글자로 뜬다)
 *
 * 화면 비율이 모바일 세로 / PC 16:9로 달라서 그림은 화면을 꽉 채우도록 잘린다(cover).
 * 그림을 만들 때 중요한 동작은 가운데 세로 띠 안에 두면 양쪽에서 다 보인다.
 *
 * ※ 기능 확인용. 컷씬 틀(전환 방식·여백·연출)의 최종 디자인은 Figma에서 확정한 뒤 바꾼다.
 */

/** 두 장짜리 컷씬에서 1번을 보여 주는 시간 */
export const SWAP_MS = 1400;
/** 1번 → 2번 겹쳐 넘어가는 시간 (styles.css의 .cut-frame transition과 같게) */
export const FADE_MS = 600;

const files = import.meta.glob<string>("../assets/cuts/*.{gif,webp,png,jpg,jpeg,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});

/** 컷씬 id → 그림 주소 (1장 또는 2장) */
const ART: Partial<Record<CutId, string[]>> = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/([^/]+?)(?:\.([12]))?\.[a-z0-9]+$/i.exec(path);
  if (!m || !(m[1] in CUTS)) {
    if (import.meta.env.DEV) console.warn(`[컷씬] ${path}: media.ts CUTS에 없는 id라서 쓰지 않습니다`);
    continue;
  }
  const id = m[1] as CutId;
  (ART[id] ??= [])[m[2] ? Number(m[2]) - 1 : 0] = url;
}

const framesOf = (id: CutId) => (ART[id] ?? []).filter(Boolean);

/** 컷씬이 처음 뜰 때 그림이 늦게 뜨지 않도록 미리 받아 둔다 */
export function preloadCuts() {
  for (const urls of Object.values(ART)) for (const url of urls ?? []) if (url) new Image().src = url;
}

export function Cutscene({ id }: { id: CutId }) {
  const frames = framesOf(id);
  const empty = frames.length === 0;
  const count = empty ? 2 : frames.length;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (count < 2) return;
    const t = window.setTimeout(() => setStep(1), SWAP_MS);
    return () => window.clearTimeout(t);
  }, [count]);

  return (
    <div className="cut" role="img" aria-label={CUTS[id].desc}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`cut-frame${i <= step ? " on" : ""}${empty ? " empty" : ""}`}>
          {empty ? (
            import.meta.env.DEV && (
              <p className="cut-placeholder">
                <span className="cut-id">
                  컷씬 {id} · {i + 1}/{count}
                </span>
                {CUTS[id].desc}
              </p>
            )
          ) : (
            <img src={frames[i]} alt="" decoding="async" draggable={false} />
          )}
        </div>
      ))}
    </div>
  );
}
