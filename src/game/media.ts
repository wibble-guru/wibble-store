/**
 * 연출 목록: 컷씬, CCTV 장면, 휴대폰 사진·영상 화면, 매장 화면 위 연출, 효과음, 환경음.
 * 대사는 텍스트로만 나온다(목소리 녹음 없음, 스토리 바이블 v4.1).
 *
 * 대본(script.ts)의 큐는 여기 있는 id만 쓸 수 있다(타입 검사).
 * 그림·소리 파일이 생기면 해당 항목의 file 칸을 채운다.
 * 어느 장면에서 쓰이는지는 `pnpm cues`가 docs/CUES.md 로 뽑아 준다.
 *
 * 컷씬·CCTV 모달·휴대폰 화면의 디자인은 Figma에서 확정한 뒤 만든다. 지금은 자리만 잡아 둔다.
 */
import type { Spot } from "./engine";

type Entry = { desc: string; file?: string };
type Sound = Entry & {
  /** record = 직접 녹음 권장, library = 효과음 라이브러리로 충분 */
  source: "record" | "library";
  /** 볼륨 배율 (기본 1). 파일이 작게 녹음됐을 때 */
  volume?: number;
  /** 파일 앞에서 건너뛸 길이(초). 본 소리 앞에 잡음·여백이 있어 대사보다 늦게 들릴 때 */
  skip?: number;
  /**
   * 소리가 나는 쪽 (src/spatial.ts). left = 출입문·창문 쪽, right = 화장실·CCTV 쪽에 고정돼
   * 시선을 돌리면 좌우가 따라 바뀐다. 없으면 전체에서 들린다(가운데)
   */
  side?: "left" | "right";
  /** 발소리처럼 걸음이 나뉜 소리: 걸음마다 딛는 시각(초, 파일 기준). 큐의 walk로 걸음마다 위치를 옮길 때 쓴다 */
  steps?: number[];
};

// ------------------------------------------------------------------ 컷씬 (1인칭 손 동작)

/**
 * 그림은 file 칸 대신 src/assets/cuts/ 에 id 이름으로 넣으면 바로 붙는다 (view/Cutscene.tsx).
 * - `q1-pickup.gif` (또는 .webp .png .jpg) 한 장: 그대로 보여 준다. 움직이는 GIF·WebP도 된다
 * - `q1-pickup.1.webp` + `q1-pickup.2.webp` 두 장: 1번을 보여 주다가 2번으로 넘어간다
 * - 파일이 없으면 빈 화면(자리 표시)
 */
export const CUTS = {
  "q1-pickup": { desc: "떨어진 과자봉지를 주워 선반 한참 안쪽에 밀어 넣는다. 돌아서려는 순간 같은 봉지가 옆 봉지와 함께 발치에 떨어진다" },
  "q1a-box": { desc: "과자 두 봉지를 계산대 아래 검수함에 넣고 뚜껑을 닫는다" },
  "q2a-under": { desc: "직원 쪽에서 계산대 아래를 살핀다. 전선·박스 사이, 통로 가까운 바닥에 물방울 세 개" },
  "q4-phone": { desc: "계산대 아래 검은 휴대폰을 집어 든다. 사진 앱에 열린 사진 속에 지금의 내가 찍혀 있다" },
  "q4a-lock": { desc: "휴대폰을 분실물 보관함에 넣고 잠근다" },
  "q5d-door": { desc: "통로 쪽에서 화장실 문 아래를 살핀다. 물기 있는 타일 위로 통로 쪽을 향한 발자국 흔적이 나타난다" },
  "go-out": { desc: "계산대에서 나와 자동문을 지나 매장 밖으로 나간다 (실외 배경으로 넘어감)" },
  "exit-door": { desc: "밝은 도로 쪽으로 가려고 자동문을 통과한다. 등 뒤에서 젖은 신발이 타일에 닿는 소리" },
  "exit-reflection": { desc: "(END-EXIT 마지막) 손에 든 휴대폰 화면이 저절로 꺼지고, 검은 화면에 내 얼굴과 어깨 바로 뒤 젖은 소매 끝이 비친다. 소매 끝에서 물이 한 방울 떨어진다" },
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
  "q2c-replay": { cam: "CAM1", mode: "replay", desc: "손님이 계산대 앞에서 한 발 물러난다. 카운터 아래는 가려져 안 보이고, 카운터 바깥 바닥을 길쭉한 그림자가 잠깐 스친다" },
  "q4d-replay": { cam: "CAM1", mode: "replay", desc: "직원이 음료 진열대로 자리를 비운 사이, 카운터 바깥 바닥에 검은 물체가 나타나 카운터 아래 가려진 공간으로 미끄러지듯 들어가 사라진다" },
  "q7c-door": { cam: "CAM4", mode: "replay", desc: "05:48:12 마지막 손님이 자동문을 나선다. 문이 열린 채 아무도 없는 출입구" },
  "q7c-print": { cam: "CAM4", mode: "replay", desc: "05:48:15 같은 구도. 아무도 지나가지 않았는데 문턱 안쪽 타일에 젖은 발자국 하나가 생겨 있다 (발끝은 매장 안쪽)" },
  "q6a-capture": { cam: "CAM1", mode: "live", desc: "점장이 보낸 캡처. 계산대 앞에 고개 숙인 사람, 소매가 짙게 젖고 신발 주위 바닥이 어둡다 (실제 계산대 앞엔 영수증 한 장뿐)" },
  "q8-live": { cam: "CAM1", mode: "live", desc: "계산대 앞에 젖은 옷을 입은 사람이 고개를 숙이고 서 있다 (실제 계산대 앞은 비어 있음)" },
  "q8-live-up": { cam: "CAM1", mode: "live", desc: "그 사람이 고개를 들어 카메라를 본다" },
  "q8a-live": { cam: "CAM1", mode: "live", desc: "그 사람이 고개를 숙이고 손을 카운터 위에 올리는 듯한 자세" },
  "q8b-save": { cam: "CAM1", mode: "live", desc: "고개를 든 장면에서 화면 저장 (저장 표시)" },
  "q8c-rewind": { cam: "CAM2", mode: "rewind", desc: "02:11 진열대 앞에 사람이 서 있다. 젖은 소매 끝이 선반 가까이 보이고, 손을 거두는 순간 봉지가 떨어진다" },
  "q8c-0200": { cam: "CAM1", mode: "rewind", desc: "02:00 직원이 출근하는 순간. 화면 가장자리, 계산대 앞에 이미 누군가 서 있다" },
  "rec-0150": { cam: "CAM1", mode: "saved", desc: "01:50 점장이 계산대 뒤에서 일지를 쓴다. 카운터 앞에 젖은 옷을 입은 사람. 점장은 그쪽을 한 번도 보지 않는다" },
  "rec-snack": { cam: "CAM2", mode: "saved", desc: "02:11 과자봉지가 떨어진 곳 옆에 젖은 소매" },
  "rec-fridge": { cam: "CAM5", mode: "saved", desc: "02:46 냉장고 사고 직전, 통로 반대편에 같은 옷차림의 사람. 냉장고 유리 앞을 지나간 기록은 없다" },
  "rec-restroom": { cam: "CAM5", mode: "saved", desc: "03:37 닫힌 화장실 문 앞에 사람이 잠시 서 있다 (화장실 내부는 안 찍힘)" },
  "rec-0200": { cam: "CAM1", mode: "saved", desc: "02:00 자동문이 열리고 직원이 들어온다. 카운터 앞의 사람이 점장에게서 몸을 돌려 출입문 쪽을 보고, 직원이 걷는 동안 고개가 따라 움직인다" },
  "x-witness": { cam: "CAM1", mode: "saved", desc: "(추가 장면 EXTRA-02) 영상 속 손님의 소매 끝이 젖어 있고 손등이 잠깐 보인다" },
  "x-angle": { cam: "CAM1", mode: "saved", desc: "(추가 장면 EXTRA-03) 03:14 카운터 옆쪽으로 젖은 소매가 들어갔다가 사라진다. 하단은 사각지대" },
  "truth-door": { cam: "CAM4", mode: "saved", desc: "(END-EXIT, TRUTH-EXIT) 05:58:04 문이 닫히기 직전, 젖은 옷자락이 프레임을 지나간다" },
  "exit-0558": { cam: "CAM4", mode: "saved", desc: "(END-EXIT-IN, TRUTH-EXIT) 05:58:02 직원이 혼자 자동문을 나선다" },
  "exit-0558-empty": { cam: "CAM4", mode: "saved", desc: "(END-EXIT-OUT) 05:58:04 아무도 없는 출입구에서 자동문이 열렸다가 닫힌다" },
  "exit-0549": { cam: "CAM4", mode: "saved", desc: "(END-EXIT-OUT, TRUTH-EXIT) 05:49:02 직원이 처마 아래로 나간다" },
  "call-twin-in": { cam: "CAM1", mode: "live", desc: "(END-CALL-IN 마지막) 카운터 옆에 휴대폰을 귀에 댄 직원, 바로 등 뒤에 젖은 소매의 사람이 같은 자세로 빈손을 귀에 대고 서 있다" },
  "call-twin-out": { cam: "CAM4", mode: "live", desc: "(END-CALL-OUT 마지막) 처마 아래 휴대폰을 귀에 댄 직원, 유리문 바로 안쪽에 젖은 소매의 사람이 같은 자세로 유리 한 장을 사이에 두고 등 뒤에 서 있다" },
  "truth-call": { cam: "CAM1", mode: "saved", desc: "(TRUTH-CALL) 한 달 전. 휴대폰을 귀에 댄 이전 근무자 옆에 젖은 옷의 사람이 같은 자세로 서 있고, 고개 끄덕임도 한 박자 늦게 따라 한다" },
} satisfies Record<string, Shot>;
export type ShotId = keyof typeof SHOTS;

// ------------------------------------------------------------------ 휴대폰 사진·영상 화면

/** 메신저·사진 앱 안에 들어가는 그림. 휴대폰 화면 디자인은 Figma에서 확정한 뒤 만든다 */
export const PHOTOS = {
  "q1d-photo": { desc: "(Q1-D) 점장에게 보낸 과자 진열대 사진. 통로 끝 냉장고 유리 앞에 사람 어깨 같은 흐릿한 얼룩" },
  "q2d-video": { desc: "(Q2-D) 카운터 아래를 찍은 영상. 전선과 박스뿐, 아무도 없다" },
  "q4-photo": { desc: "(Q4) 주운 휴대폰 속 사진. 계산대 아래 바닥에서 올려다본 각도로 찍힌 지금의 나. 앞쪽 카운터 모서리에 물방울 하나" },
  "q4b-zoom": { desc: "(Q4-B) 사진 확대. 카운터 모서리에 맺힌 물방울" },
  "q6c-frame": { desc: "(Q6-C) 영상 통화가 멈춘 한 프레임. 빈 카운터 앞, 화면 가장자리에 젖은 소매 끝" },
  "out-video": { desc: "(Q8-OUT-A) 유리문 밖에서 찍은 영상. 유리 반사 너머 카운터 앞에 누군가 서 있다" },
  "x-fridge": { desc: "(EXTRA-05) 냉장고 손자국 사진. 바깥 유리 반사 속에 짙은 옷자락 같은 것" },
  "truth-01-video": { desc: "(TRUTH-01) 이전 근무자가 찍은 영상. 텅 빈 카운터와 호출벨" },
} satisfies Record<string, Entry>;
export type PhotoId = keyof typeof PHOTOS;

// ------------------------------------------------------------------ 매장 화면 위 연출 (배경은 그대로, 위에 얹는 그림·움직임)

export const FX = {
  "snack-floor": { desc: "과자 진열대 앞 바닥에 떨어진 과자봉지" },
  "can-burst": { desc: "음료 냉장고 유리 안쪽에 터진 탄산 거품이 흘러내림" },
  handprint: { desc: "거품 사이 유리 안쪽에 남은 다섯 갈래 손가락 자국 (손바닥 부분은 거의 없음)" },
  "finger-slide": { desc: "가장 긴 손가락 자국이 아래로 늘어나 있고 그 자국만 위쪽이 깨끗이 지워져 있음 (사진 비교 컷. 움직이는 모습은 보여주지 않음)" },
  "sign-fridge": { desc: "냉장고 앞 사용 중지 안내판" },
  "sign-moved": { desc: "안내판이 옆으로 조금 옮겨져 있음" },
  "sign-fallen": { desc: "안내판이 바닥에 쓰러져 있음" },
  "water-door": { desc: "화장실 문 아래로 물이 조금씩 흘러나옴" },
  footprint: { desc: "화장실 앞, 바깥쪽을 향한 젖은 발자국 하나" },
  "footprint-door": { desc: "출입문 근처의 같은 젖은 발자국" },
  "sign-restroom": { desc: "화장실 통로 사용 중지 안내판" },
  "wet-floor-door": { desc: "매트에는 손님들이 묻혀 온 빗물 얼룩. 그와 이어지지 않고 매트에서 한 걸음 떨어진 마른 타일에서 시작해 매장 안쪽으로 난 젖은 자국" },
  "door-stuck": { desc: "자동문이 닫히지 않고 열려 있음" },
  "sensor-on": { desc: "자동문 위 센서 불이 켜짐" },
} satisfies Record<string, Entry>;
export type FxId = keyof typeof FX;

// ------------------------------------------------------------------ 효과음

/** file 칸 = public/soundTrack/ 안의 파일 이름. 채워진 효과음만 실제로 난다 (src/sfx.ts) */
export const SFX = {
  // 직접 녹음 권장: 반복해서 나오고 게임의 정체성이 되는 소리
  bell: { source: "record", desc: "계산대 호출벨 '띵'", file: "bell.mp3" },
  "bell-far": { source: "record", desc: "유리문 너머로 먹먹하게 들리는 호출벨" },
  "bell-phone": { source: "record", desc: "전화기 너머로 들리는 호출벨" },
  "door-chime": { source: "record", side: "left", desc: "자동문 차임 '띵동' (실제 체인점 차임과 겹치지 않게)" },
  "door-open": { source: "record", side: "left", desc: "자동문 열림 모터", file: "door-open.wav" },
  "door-open-dry": { source: "record", side: "left", desc: "자동문 열림, 빗소리 없음. 마지막 손님 장처럼 바깥 빗소리가 따로 깔려 있을 때", file: "door-open(without-rain).wav" },
  "door-close": { source: "record", side: "left", desc: "자동문 닫힘" },
  "door-close-dry": { source: "record", side: "left", desc: "자동문 닫힘, 빗소리 없음. 바깥 빗소리가 따로 깔려 있을 때 (닫히려다 다시 열리는 대목)", file: "door-close(without-rain).wav" },
  "wet-step": { source: "record", desc: "매장 타일 위 젖은 신발 '철벅'" },
  "wet-step-out": { source: "record", desc: "젖은 바깥 길 위 '철벅'" },
  "snack-drop": { source: "record", desc: "과자봉지가 바닥에 떨어지는 '툭'", file: "drop.wav", skip: 0.18 },
  "snack-rustle": { source: "record", desc: "과자봉지 구겨지는 '바스락'", file: "crisp.wav" },
  // 라이브러리로 충분
  "counter-drop": { source: "library", desc: "계산대 쪽에서 물건이 떨어지는 소리", file: "drop2.wav", skip: 0.45 },
  "box-lid": { source: "library", desc: "보관함 뚜껑 여닫기" },
  "box-shutter": {
    source: "library",
    desc: "잠긴 보관함 안에서 먹먹하게 들리는 카메라 '찰칵'",
    // 먹먹하게, 작게 만든 파일이라 볼륨은 그대로
    file: "box_shutter.wav",
  },
  "phone-on": { source: "library", desc: "휴대폰 화면이 켜지는 소리", file: "mobile_phone.mp3" },
  // 들릴 듯 말 듯 작게
  "phone-shutter": { source: "library", desc: "내 휴대폰 카메라 셔터", file: "camera.mp3", volume: 0.25 },
  msg: { source: "library", desc: "메시지 알림" },
  "msg-sent": { source: "library", desc: "메시지 '전송됨' 소리. msg와 짝을 이루되 더 가볍게 (END-WAIT: 내가 보내지 않은 메시지)" },
  "video-call": { source: "library", desc: "영상 통화 연결 신호음" },
  "phone-sleep": { source: "library", desc: "휴대폰 화면 꺼지는 작은 '딸깍' (선택. 무음이 더 무서우면 안 씀)" },
  "phone-vibe": { source: "library", desc: "휴대폰 진동 (전화 옴)" },
  scan: { source: "library", desc: "바코드 스캔·POS" },
  "plastic-bag": { source: "library", desc: "비닐봉지" },
  paper: { source: "library", desc: "종이 메모 펴기·접기" },
  drip: { source: "library", desc: "물방울 '톡'" },
  glitch: { source: "library", desc: "휴대폰 영상 글리치 '탁'" },
  "can-burst": { source: "library", desc: "캔 터짐 '펑!' + 탄산 거품", file: "short_bomb.mp3" },
  "sign-set": { source: "library", desc: "안내판 세우기" },
  flush: { source: "library", side: "right", desc: "물 내림 '쏴아아'", file: "toilet-flush.wav" },
  knock: { source: "library", side: "right", desc: "문 안쪽 노크 '똑. 똑. 똑.'", file: "knock.mp3" },
  "knock-glass": { source: "record", desc: "등 뒤 진열장 유리를 손가락 마디로 '똑. 똑. 똑.' knock과 같은 간격, 더 딱딱하고 맑게 (Q5-A)" },
  "water-seep": { source: "library", side: "right", desc: "문 아래로 물 흐르는 소리" },
  "steps-behind": { source: "library", side: "right", desc: "문 바로 뒤 발소리", file: "footstep.wav" },
  footstep: {
    source: "library",
    desc: "다가오는 발소리 6걸음",
    file: "footstep.wav",
    steps: [0.215, 1.135, 1.955, 2.885, 3.705, 4.64],
  },
  "sensor-beep": { source: "library", side: "left", desc: "출입 센서 감지음" },
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
  "fridge-only": { source: "library", desc: "다른 소리가 빠지고 냉장고 작동음만 (TRANSITION-01)" },
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

// ------------------------------------------------------------------ 말하는 사람

/** 대사창 위에 붙는 이름표. 바이블의 '점장: / 나: / 손님:' 표기와 같다. 메시지 카드([점장님] …)와 회상 대사에는 안 붙인다 */
export const SPEAKERS = {
  manager: "점장",
  player: "나",
  guest: "손님",
} as const;
export type Speaker = keyof typeof SPEAKERS;

// ------------------------------------------------------------------ 큐: 대본 줄 사이에 끼워 넣는 연출 지시

/**
 * 대본 lines 안에서 대사 바로 앞에 둔다. 그 대사가 화면에 나올 때 실행된다.
 * - cut: 매장 화면을 덮고 컷씬을 띄운다. hold = 이 대사부터 몇 줄 동안 보일지 (기본 1). 장면이 바뀌면 닫힌다
 * - cctv: 모달을 열거나 장면을 바꾼다. null 이면 닫는다. 장면(노드)이 바뀌면 자동으로 닫힌다
 * - amb: 장소 기본 환경음 위에 덧씌운다. 장면이 바뀌면 풀린다
 * - photo: 휴대폰 화면(메신저·사진 앱) 안에 사진·영상을 띄운다. 지금은 자리만 잡혀 있다
 * - who: 바로 다음 대사를 말하는 사람. 대사창에 이름표로 붙는다
 * - door: 출입문이 열리고 닫힌다. 문 소리와 문 너머 바깥 빗소리를 크로스페이드로 묶어 낸다 (src/door.ts).
 *   open 하면 빗소리가 장면이 바뀌어도 계속 이어지다가 close 때 잦아든다. close가 없으면 진행이 끝날 때까지.
 *   문 소리는 열 때만 낸다. 닫힐 때 문 소리가 필요하면 { sfx: "door-close" }를 따로 둔다
 * - sfx에 wait: true를 주면 그 효과음이 끝날 때까지 대사를 숨기고 진행을 멈춘다 (장면 앞 문 열림처럼).
 *   소리가 끝나면 대사가 나온다
 * - sfx에 walk: [출발, 도착]을 주면 걸음(SFX의 steps)마다 소리 위치를 출발 → 도착으로 옮기고
 *   시선도 걷는 사람을 따라 돌린다. 매장 안 장면에서만 쓴다
 * - clock: 장면 중간에 화면 위 시각을 바꾼다 (시간 경과 몽타주, END-WAIT의 05:59)
 */
export type Cue =
  | { cut: CutId; hold?: number }
  | { cctv: ShotId | null }
  | { fx: FxId }
  | { sfx: SfxId; wait?: boolean; walk?: [Spot, Spot] }
  | { amb: AmbId }
  | { photo: PhotoId }
  | { who: Speaker }
  | { door: "open" | "close" }
  | { clock: string };
