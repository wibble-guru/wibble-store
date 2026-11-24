/**
 * 연출 목록: 컷씬, CCTV 장면, 매장 화면 위 연출, 효과음, 환경음, 목소리 배역.
 *
 * 대본(script.ts)의 큐는 여기 있는 id만 쓸 수 있다(타입 검사).
 * 그림·소리 파일이 생기면 해당 항목의 file 칸을 채운다.
 * 어느 장면에서 쓰이는지는 `pnpm cues`가 docs/CUES.md 로 뽑아 준다.
 *
 * 컷씬·CCTV 모달·휴대폰 화면의 디자인은 Figma에서 확정한 뒤 만든다. 지금은 자리만 잡아 둔다.
 */

type Entry = { desc: string; file?: string };
type Sound = Entry & {
  /** record = 직접 녹음 권장, library = 효과음 라이브러리로 충분 */
  source: "record" | "library";
};

// ------------------------------------------------------------------ 컷씬 (1인칭 손 동작)

/**
 * 그림은 file 칸 대신 src/assets/cuts/ 에 id 이름으로 넣으면 바로 붙는다 (view/Cutscene.tsx).
 * - `q1-pickup.gif` (또는 .webp .png .jpg) 한 장: 그대로 보여 준다. 움직이는 GIF·WebP도 된다
 * - `q1-pickup.1.webp` + `q1-pickup.2.webp` 두 장: 1번을 보여 주다가 2번으로 넘어간다
 * - 파일이 없으면 빈 화면(자리 표시)
 */
export const CUTS = {
  "q1-pickup": { desc: "떨어진 과자봉지를 주워 선반에 올린다. 돌아서려는 순간 옆 봉지가 또 떨어진다" },
  "q1a-box": { desc: "과자 두 봉지를 계산대 아래 상품 보관함에 넣고 뚜껑을 닫는다" },
  "q2a-under": { desc: "계산대 아래로 몸을 숙인다. 전선·박스 사이 바닥의 물방울 세 개를 손끝으로 만진다" },
  "q3c-wipe": { desc: "냉장고 문을 열어 터진 캔을 꺼내고 닦는다. 유리 손자국 위로 새 손가락 자국이 생긴다" },
  "q4-phone": { desc: "계산대 아래 검은 휴대폰을 집어 든다. 화면이 켜지고 잠금화면에 지금의 내가 찍혀 있다" },
  "q4a-lock": { desc: "휴대폰을 분실물 보관함에 넣고 잠근다" },
  "q5d-door": { desc: "화장실 문 아래를 들여다본다. 고인 물 위로 발자국이 하나씩 찍힌다" },
  "go-out": { desc: "계산대에서 나와 자동문을 지나 매장 밖으로 나간다 (실외 배경으로 넘어감)" },
  "exit-door": { desc: "퇴근하며 자동문을 통과한다. 등 뒤에서 젖은 신발 끄는 소리" },
} satisfies Record<string, Entry>;
export type CutId = keyof typeof CUTS;

// ------------------------------------------------------------------ CCTV 모달

/** 모니터 분할 칸. 시안(2×2) 순서: CAM1 CAM2 / CAM5 CAM4 */
export const CAMS = {
  CAM1: "계산대 위 — 계산대 앞 손님 자리를 내려다봄. 계산대 아래는 사각지대",
  CAM2: "과자 진열대 통로",
  CAM5: "음료 냉장고·화장실 통로. 시안에서 CAM3 자리에 CAM5가 있음 — 의도인지 미정",
  CAM4: "출입문",
} as const;
export type CamId = keyof typeof CAMS;

type Shot = Entry & {
  cam: CamId;
  /** live = 실시간, replay = 조금 전 영상, rewind = 오래 되감기, saved = 저장된 영상 */
  mode: "live" | "replay" | "rewind" | "saved";
};

export const SHOTS = {
  "q2c-replay": { cam: "CAM1", mode: "replay", desc: "손님이 계산대 앞에서 물러난다. 직전에 계산대 아래 사각지대에서 그림자가 움직인다" },
  "q3d-replay": { cam: "CAM5", mode: "replay", desc: "아무도 없는 냉장고가 흔들리고 캔이 터진다. 유리에 손자국은 보이지 않는다" },
  "q4d-replay": { cam: "CAM1", mode: "replay", desc: "직원이 자리를 비운 사이 계산대 아래로 검은 물건이 천천히 밀려 들어온다. 가져다 놓은 사람은 없다" },
  "q8-live": { cam: "CAM1", mode: "live", desc: "계산대 앞에 젖은 옷을 입은 사람이 고개를 숙이고 서 있다 (실제 계산대 앞은 비어 있음)" },
  "q8-live-up": { cam: "CAM1", mode: "live", desc: "그 사람이 고개를 들어 카메라를 본다" },
  "q8a-live": { cam: "CAM1", mode: "live", desc: "그 사람이 다시 고개를 숙여 계산대 위를 내려다본다" },
  "q8b-save": { cam: "CAM1", mode: "live", desc: "고개를 든 장면에서 화면 저장 (저장 표시)" },
  "q8c-rewind": { cam: "CAM2", mode: "rewind", desc: "02:11 진열대 앞에 사람이 서서 과자봉지를 집어 들었다가 떨어뜨린다" },
  "rec-snack": { cam: "CAM2", mode: "saved", desc: "과자가 떨어진 순간. 진열대 옆에 젖은 옷 손님" },
  "rec-fridge": { cam: "CAM5", mode: "saved", desc: "캔이 터진 순간. 냉장고 앞에 같은 손님, 조금 더 계산대 쪽" },
  "rec-restroom": { cam: "CAM5", mode: "saved", desc: "물 내리는 소리가 난 순간. 화장실 통로에 같은 손님, 더 가까이" },
  "rec-last": { cam: "CAM1", mode: "saved", desc: "휴대폰을 보는 직원 바로 뒤에 손님이 서 있다. 카메라를 보며 입을 움직인다" },
  "x-witness": { cam: "CAM1", mode: "saved", desc: "(추가 장면) 영상 속 손님의 손. 손등과 소매가 젖어 있다" },
  "x-angle": { cam: "CAM1", mode: "saved", desc: "(추가 장면) 그 시각 계산대 아래에 누군가 웅크리고 직원을 올려다본다" },
  "truth-door": { cam: "CAM4", mode: "saved", desc: "자동문 앞의 직원과 바로 뒤의 젖은 옷 손님. 화면 아래 출입 기록 '퇴장 인원 : 2명'" },
} satisfies Record<string, Shot>;
export type ShotId = keyof typeof SHOTS;

// ------------------------------------------------------------------ 매장 화면 위 연출 (배경은 그대로, 위에 얹는 그림·움직임)

export const FX = {
  "snack-floor": { desc: "과자 진열대 앞 바닥에 떨어진 과자봉지" },
  "can-burst": { desc: "음료 냉장고 유리 안쪽에 터진 탄산 거품이 흘러내림" },
  handprint: { desc: "거품 사이, 냉장고 안쪽에서 찍힌 손바닥 자국" },
  "finger-slide": { desc: "손가락 자국 하나가 아래로 길게 미끄러짐" },
  "sign-fridge": { desc: "냉장고 앞 청소 중 안내판" },
  "sign-moved": { desc: "안내판이 옆으로 조금 옮겨져 있음" },
  "sign-fallen": { desc: "안내판이 바닥에 쓰러져 있음" },
  "water-door": { desc: "화장실 문 아래로 물이 조금씩 흘러나옴" },
  footprint: { desc: "화장실 앞, 바깥쪽을 향한 젖은 발자국 하나" },
  "footprint-door": { desc: "출입문 근처의 같은 젖은 발자국" },
  "sign-restroom": { desc: "화장실 통로 청소 중 안내판" },
  "wet-floor-door": { desc: "자동문 앞 바닥이 젖어 있음" },
  "door-stuck": { desc: "자동문이 닫히지 않고 열려 있음" },
  "sensor-on": { desc: "자동문 위 센서 불이 켜짐" },
} satisfies Record<string, Entry>;
export type FxId = keyof typeof FX;

// ------------------------------------------------------------------ 효과음

/** file 칸 = public/soundTrack/ 안의 파일 이름. 채워진 효과음만 실제로 난다 (src/sfx.ts) */
export const SFX = {
  // 직접 녹음 권장: 반복해서 나오고 게임의 정체성이 되는 소리
  bell: { source: "record", desc: "계산대 호출벨 '띵'" },
  "bell-far": { source: "record", desc: "유리문 너머로 먹먹하게 들리는 호출벨" },
  "bell-phone": { source: "record", desc: "전화기 너머로 들리는 호출벨" },
  "door-chime": { source: "record", desc: "자동문 차임 '띵동' (실제 체인점 차임과 겹치지 않게)" },
  "door-open": { source: "record", desc: "자동문 열림 모터", file: "door-open.wav" },
  "door-open-dry": { source: "record", desc: "자동문 열림, 빗소리 없음. 마지막 손님 장처럼 바깥 빗소리가 따로 깔려 있을 때", file: "door-open(without-rain).wav" },
  "door-close": { source: "record", desc: "자동문 닫힘" },
  "wet-step": { source: "record", desc: "매장 타일 위 젖은 신발 '철벅'" },
  "wet-step-out": { source: "record", desc: "젖은 바깥 길 위 '철벅'" },
  "drag-wet": { source: "record", desc: "젖은 신발이 바닥을 끄는 소리" },
  "snack-drop": { source: "record", desc: "과자봉지가 바닥에 떨어지는 '툭'" },
  "snack-rustle": { source: "record", desc: "과자봉지 구겨지는 '바스락'" },
  // 라이브러리로 충분
  "counter-drop": { source: "library", desc: "계산대 쪽에서 물건이 떨어지는 소리" },
  "box-lid": { source: "library", desc: "보관함 뚜껑 여닫기" },
  "box-shutter": { source: "library", desc: "잠긴 보관함 안에서 먹먹하게 들리는 카메라 '찰칵'" },
  "phone-shutter": { source: "library", desc: "내 휴대폰 카메라 셔터" },
  msg: { source: "library", desc: "메시지 알림" },
  "phone-vibe": { source: "library", desc: "휴대폰 진동 (전화 옴)" },
  scan: { source: "library", desc: "바코드 스캔·POS" },
  "plastic-bag": { source: "library", desc: "비닐봉지" },
  paper: { source: "library", desc: "종이 메모 펴기·접기" },
  drip: { source: "library", desc: "물방울 '톡'" },
  glitch: { source: "library", desc: "휴대폰 영상 글리치 '탁'" },
  "can-burst": { source: "library", desc: "캔 터짐 '펑!' + 탄산 거품" },
  "fridge-door": { source: "library", desc: "냉장고 문 열기" },
  wipe: { source: "library", desc: "바닥·유리 닦기" },
  "finger-squeak": { source: "library", desc: "젖은 유리 위 손가락 미끄러지는 소리" },
  "sign-set": { source: "library", desc: "안내판 세우기" },
  "sign-drag": { source: "library", desc: "안내판이 끌리는 소리" },
  flush: { source: "library", desc: "물 내림 '쏴아아'" },
  knock: { source: "library", desc: "문 안쪽 노크 '똑. 똑. 똑.'" },
  "water-seep": { source: "library", desc: "문 아래로 물 흐르는 소리" },
  "steps-behind": { source: "library", desc: "문 바로 뒤 발소리" },
  drag: { source: "library", desc: "문 안쪽에서 바닥 끄는 '스윽. 스윽.'" },
  "sensor-beep": { source: "library", desc: "출입 센서 감지음" },
  // CCTV 모달: 열기·닫기 소리(cctv-on, cctv-off)는 모달이 알아서 낸다
  "cctv-on": { source: "library", desc: "CCTV 모니터 켜짐 (모달 열림)" },
  "cctv-rewind": { source: "library", desc: "녹화 영상 되감기" },
  "cctv-save": { source: "library", desc: "화면 저장 비프음" },
  "cctv-off": { source: "library", desc: "CCTV 화면 꺼짐" },
} satisfies Record<string, Sound>;
export type SfxId = keyof typeof SFX;

// ------------------------------------------------------------------ 환경음 (반복)

export const AMB = {
  store: { source: "library", desc: "형광등 웅웅 + 냉장고 컴프레서. 매장 안 기본" },
  "rain-in": { source: "library", desc: "유리 너머 빗소리. 매장 안 기본" },
  "fridge-only": { source: "library", desc: "다른 소리가 빠지고 냉장고 작동음만 (T-QUIET)" },
  "rain-out": { source: "library", desc: "바깥 빗소리, 젖은 길. 매장 밖 기본" },
  street: { source: "record", desc: "새벽 거리 (가능하면 실제 편의점 앞 현장 녹음)" },
  "cctv-noise": { source: "library", desc: "녹화 영상 잡음. CCTV 모달이 열려 있는 동안, 매장 소리는 낮춘다" },
} satisfies Record<string, Sound>;
export type AmbId = keyof typeof AMB;

/** 장소별 기본 환경음 */
export const PLACE_AMB: Record<Place, AmbId[]> = {
  inside: ["store", "rain-in"],
  outside: ["rain-out", "street"],
};
export type Place = "inside" | "outside";

// ------------------------------------------------------------------ 목소리

export const ROLES = {
  manager: "점장. 통화 대사가 가장 많다. 문자 메시지는 목소리 없음",
  guest: "Q2의 살아 있는 손님. 계산대 아래 손을 처음 본 사람",
  woman: "화장실 목소리 = 젖은 옷 손님. 같은 배우가 맡으면 끝에서 연결된다",
  player: "플레이어(직원). 성별 미정 — 중성적 목소리로 녹음하거나 목소리 없이 자막만 둘지 결정 필요. Q6 되풀이와 END-CALL '다른 목소리'도 이 배역",
} as const;
export type Role = keyof typeof ROLES;

/** 목소리가 어떻게 들리는지 (후처리 지시) */
export const VIA = {
  phone: "통화음 필터",
  door: "문 너머로 먹먹하게",
  whisper: "아주 작게, 속삭임",
  mic: "휴대폰 마이크 녹음본. 잡음 섞임",
  video: "영상 속. 입 모양만 보이고 무음이어도 됨",
  behind: "바로 뒤, 귀에 가깝게",
  echo: "멀리서 되풀이되는 내 목소리 (Q5-A 녹음 재사용 가능)",
} as const;
export type Via = keyof typeof VIA;

// ------------------------------------------------------------------ 큐: 대본 줄 사이에 끼워 넣는 연출 지시

/**
 * 대본 lines 안에서 대사 바로 앞에 둔다. 그 대사가 화면에 나올 때 실행된다.
 * - cut: 매장 화면을 덮고 컷씬을 띄운다. hold = 이 대사부터 몇 줄 동안 보일지 (기본 1). 장면이 바뀌면 닫힌다
 * - cctv: 모달을 열거나 장면을 바꾼다. null 이면 닫는다. 장면(노드)이 바뀌면 자동으로 닫힌다
 * - amb: 장소 기본 환경음 위에 덧씌운다. 장면이 바뀌면 풀린다
 * - voice: 바로 다음 대사를 녹음한 목소리로 튼다. 파일 이름은 `장면id.순번`
 * - door: 출입문이 열리고 닫힌다. 문 소리와 문 너머 바깥 빗소리를 크로스페이드로 묶어 낸다 (src/door.ts).
 *   open 하면 빗소리가 장면이 바뀌어도 계속 이어지다가 close 때 잦아든다. close가 없으면 진행이 끝날 때까지.
 *   문 소리는 열 때만 낸다. 닫힐 때 문 소리가 필요하면 { sfx: "door-close" }를 따로 둔다
 */
export type Cue =
  | { cut: CutId; hold?: number }
  | { cctv: ShotId | null }
  | { fx: FxId }
  | { sfx: SfxId }
  | { amb: AmbId }
  | { voice: Role; via?: Via }
  | { door: "open" | "close" };
