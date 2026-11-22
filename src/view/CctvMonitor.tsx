import { useEffect, useState } from "preact/hooks";
import { CAMS, SHOTS, type CamId, type ShotId } from "../game/media";
import pano from "../assets/store/pano.webp";
import { PANO } from "./projection";

/**
 * CCTV 모달: 모니터 하나에 4분할(시안 순서 CAM1 CAM2 / CAM5 CAM4).
 * 지금 장면이 비추는 칸을 강조하고 영상 상태(실시간·되돌려 보기·되감기·저장)를 표시한다.
 *
 * ※ 기능 확인용. 칸 안의 그림은 CCTV 영상이 생기기 전까지 매장 파노라마를 잘라 흑백으로 쓴다.
 *   영상이 생기면 SHOTS[id].file을 칸에 깐다.
 */

/** 파노라마에서 각 카메라가 비추는 곳: 가운데 각도(도), 세로 위치(0=위 1=아래), 화각(도) */
const VIEW: Record<CamId, { deg: number; v: number; span: number }> = {
  CAM1: { deg: -5, v: 0.8, span: 80 },
  CAM2: { deg: 22, v: 0.52, span: 46 },
  CAM5: { deg: 44, v: 0.5, span: 56 },
  CAM4: { deg: -62, v: 0.5, span: 56 },
};

/** pano.webp 세로/가로 (2016×780) */
const PANO_ASPECT = 780 / 2016;

const ORDER: CamId[] = ["CAM1", "CAM2", "CAM5", "CAM4"];

const MODE: Record<(typeof SHOTS)[ShotId]["mode"], string> = {
  live: "● REC",
  replay: "◀◀ 재생",
  rewind: "◀◀◀ 되감기",
  saved: "■ 저장 영상",
};

/** 16:9 칸에 파노라마의 해당 부분이 오도록 background-size·position 계산 */
function crop(cam: CamId) {
  const { deg, v, span } = VIEW[cam];
  const min = (PANO.uMin * 180) / Math.PI;
  const range = ((PANO.uMax - PANO.uMin) * 180) / Math.PI;
  const scale = range / span; // 칸 너비 대비 그림 너비
  const imgH = scale * PANO_ASPECT; // 칸 너비 대비 그림 높이
  const tileH = 9 / 16;
  const fx = (deg - min) / range;
  const px = scale === 1 ? 0 : (scale * fx - 0.5) / (scale - 1);
  const py = (v * imgH - tileH / 2) / (imgH - tileH);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    backgroundImage: `url(${pano})`,
    backgroundSize: `${scale * 100}% auto`,
    backgroundPosition: `${clamp(px) * 100}% ${clamp(py) * 100}%`,
  };
}

export function CctvMonitor({ shot, clock }: { shot: ShotId; clock: string }) {
  const { cam, mode } = SHOTS[shot];
  const secs = useTicker(mode === "live" || mode === "replay" ? 1 : mode === "rewind" ? -7 : 0);

  return (
    <div className="cctv" role="img" aria-label={`CCTV ${cam} ${MODE[mode]} — ${CAMS[cam]}`}>
      <div className="monitor" key={shot}>
        <div className="screen">
          {ORDER.map((id) => {
            const on = id === cam;
            return (
              <div key={id} className={`cam${on ? " on" : ""}${on ? ` ${mode}` : ""}`}>
                <div className="feed" style={crop(id)} />
                <span className="cam-time">
                  {clock}:{String(((on ? secs : 0) % 60 + 60) % 60).padStart(2, "0")}
                </span>
                {on && <span className="cam-mode">{MODE[mode]}</span>}
                <span className="cam-label">{id}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 초 단위 시계. step 만큼 1초마다 더한다(되감기는 음수) */
function useTicker(step: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!step) return;
    const t = window.setInterval(() => setN((x) => x + step), step < 0 ? 140 : 1000);
    return () => window.clearInterval(t);
  }, [step]);
  return n;
}
