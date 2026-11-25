# 심야 편의점 (wibble-store)

「심야 편의점」: 마지막 손님 — 나폴리탄 괴담 × 선택형 성향 테스트.
위블 사이트에 iframe으로 들어가는 게임. Vite + Preact + TypeScript, pnpm.
사이트 연동·막힌 화면·공통 스타일·호스트 시뮬레이터는 위블 법정(wibble-court)과 같이 [`@wibble-guru/boilerplate`](https://www.npmjs.com/package/@wibble-guru/boilerplate)를 쓴다.

## 시작하기

```bash
pnpm install
pnpm dev          # http://localhost:5181
```

| 주소 | 용도 |
|---|---|
| `http://localhost:5181/` | 게임 단독 실행 (개발 서버에서만 가능). `?theme=horror&slug=store`로 사이트 값을 흉내 낼 수 있음 |
| `http://localhost:5181/host.html` | 위블 사이트 흉내: 모바일·PC 16:9 iframe 두 개로 postMessage 규약을 시험 (개발 서버 전용, 빌드에 안 들어감) |

같은 와이파이의 휴대폰에서는 `http://<맥 IP>:5181`으로 열면 됩니다.

```bash
pnpm build        # 타입 검사 + dist/ 생성 (정적 파일, 어디든 올리면 됨)
pnpm preview      # 운영 빌드라 단독으로 열면 막힌 화면이 나옵니다
pnpm check:types  # 모든 선택 조합(65,536개)으로 유형·엔딩 분포와 끊긴 장면을 검사
pnpm cues         # 연출 큐 시트 docs/CUES.md 생성 (컷씬·CCTV·휴대폰 화면·효과음)
```

## 사이트 연동

`@wibble-guru/boilerplate`가 위블 사이트와의 규약을 구현한다. 이 게임의 설정은 `src/wibble.ts`(`defineWibbleGame`, slug `store`, 단독 실행 기본 테마 `horror`)와 `vite.config.ts`(`wibble({ slug, port, theme })`)에 있다.

1. 게임이 `ready`를 300ms마다 보냄 → 사이트가 `init { slug, theme }` 응답
2. 게임이 끝나면 `game.sendResult(resultId)` → 사이트가 `/t/{slug}/result/{resultId}`로 이동

- 운영 빌드는 사이트 안에서만 실행된다. 8초 안에 `init`이 오지 않으면 "위블에서 플레이하기" 안내(boilerplate의 `WibbleGate`). 연결 중에도 매장 배경을 보여 주려고 `WibbleFrame` 대신 `useWibbleHost`를 쓴다.
- **결과 id(`src/game/script.ts`의 `TYPES[].id`)는 지금 임시값 `store-01`~`store-16`이다.** 콘텐츠 서버에 등록된 id로 바꿔야 한다.
- 운영 빌드에는 `VITE_ALLOWED_HOST_ORIGINS=https://<사이트 도메인>`, 배포 서버에는 `Content-Security-Policy: frame-ancestors https://<사이트 도메인>`.

## 매장 화면 (원근 보정)

배경은 늘 계산대 뒤에서 본 매장이다(`src/view/PanoramaView.tsx`).

- 240° 원통형 파노라마(`src/assets/store/pano.webp`)를 화면 픽셀마다 다시 투영해 **직선이 곧게 보이는 원근 화면**으로 그린다(WebGL). 이게 기본값이고, `panini` 값을 주면 가장자리 늘어남을 줄일 수 있다.
- 화면 비율을 따라간다: 모바일 세로(가로 화각 약 49°) / PC 16:9(약 111°).
- 장면마다 `look`(정면·출입문·화장실·CCTV …)으로 시선을 돌리고, 플레이어는 ‹ › 버튼이나 드래그로 둘러볼 수 있다. 버튼이 멈추는 칸은 세로 5칸, 가로 3칸(`src/view/projection.ts`의 `STOPS`).
- 지금 파노라마는 annotation 저장소의 `panorama-v6.webp`(2016×780)다. 3D 블록아웃 렌더를 가이드로 생성해 구도가 같다. 배경을 바꿀 때도 **같은 240° 원통형 구도**(3D 렌더와 겹치는 그림)여야 맞게 보정된다.
  - 3D 모델과 렌더: annotation 저장소 `design/Game gate/night-store-scene/3d/`
  - 분위기·팔레트: 같은 폴더의 `mood/MOOD.md`

## 스토리 데이터

`src/game/script.ts`에 스토리 바이블 v4.1(방문객 집계 장치·목소리 연출 삭제판)을 옮겼다. 대사를 고칠 때는 이 파일만 바꾸면 된다.
모든 대사는 텍스트로만 나온다. 목소리 녹음은 쓰지 않는다.

| 항목 | 위치 |
|---|---|
| 장면(INTRO, Q1~Q8, 결과 장면, 전환 장면, 엔딩, 진실 공개) | `NODES` |
| 조건부 대사 `[조건: counter=WITNESS]` | 장면 `lines` 안의 `{ if, lines }` |
| 저장 변수 `저장: shelf=BOX` | 장면의 `set` |
| 엔딩 뒤 추가 장면(기획서 6절) | `EXTRAS` |
| 문항별 점수표(주요 +2 / 보조 +1) | 선택지의 `score` |
| 16가지 유형 | `TYPES` |

## 연출 큐 (컷씬·CCTV·휴대폰 화면·소리)

대본 `lines` 안에서 대사 **바로 앞**에 큐를 두면, 그 대사가 화면에 나올 때 실행된다. 쓸 수 있는 id는 `src/game/media.ts`의 목록뿐이다(타입 검사).

```ts
{ sfx: "snack-drop" }, "툭.",
{ cut: "q1-pickup", hold: 4 }, "과자를 주워 제자리에 올려놓는다.",
{ cctv: "q2c-replay" }, { sfx: "cctv-rewind" }, "조금 전 영상으로 되돌린다.",
{ who: "manager" }, "\"몇 시쯤이요?\"",
{ sfx: "msg" }, { photo: "q6c-frame" }, "점장이 멈췄던 한 프레임을 캡처해 보낸다.",
```

| 큐 | 뜻 |
|---|---|
| `cut` | 1인칭 동작 컷씬. 매장 화면을 덮고 `hold`줄(기본 1) 동안 보인다. 장면이 바뀌면 닫힌다 |
| `cctv` | CCTV 모달을 열거나 화면을 바꾼다. `null`이면 닫는다. 장면이 바뀌면 자동으로 닫힌다 |
| `fx` | 매장 화면 위에 얹는 연출 (터진 거품, 안내판, 발자국 …) |
| `photo` | 휴대폰 화면(메신저·사진 앱) 안의 사진·영상 |
| `who` | 다음 대사를 말하는 사람. 대사창에 이름표(점장·나·손님)로 붙는다. 메시지 카드와 회상 대사에는 안 붙인다 |
| `sfx` / `amb` | 효과음 / 덧씌우는 환경음. 기본 환경음은 장소(`place`)가 정한다 |

- 장면의 `place: "outside"`부터는 매장 밖이다(Q7-A, Q7-B, Q8-OUT, END-EXIT). **실외 배경은 아직 없다.**
- CCTV 모달은 기능 확인용으로 붙어 있다(`src/view/CctvMonitor.tsx`): 4분할 모니터(CAM1 CAM2 / CAM5 CAM4)에서 장면의 카메라 칸을 강조하고 영상 상태를 표시한다. 칸 안 그림은 CCTV 영상이 생기기 전까지 파노라마를 잘라 쓴다.
- 컷씬은 붙어 있다(`src/view/Cutscene.tsx`). 그림은 `src/assets/cuts/`에 id 이름으로 넣으면 코드 수정 없이 붙는다.
  - `q1-pickup.gif` 한 장(.webp .png .jpg .avif도 됨, 움직이는 그림 가능) → 그대로 보여 준다
  - `q1-pickup.1.webp` + `q1-pickup.2.webp` 두 장 → 1번을 1.4초 보여 준 뒤 0.6초 동안 2번으로 겹쳐 넘어간다(`SWAP_MS`·`FADE_MS`)
  - 파일이 없으면 빈 화면 두 장으로 같은 넘김을 흉내 낸다. 개발 서버에서는 id·설명이 글자로 뜬다
  - 그림은 화면을 꽉 채우도록 잘린다(모바일 세로 / PC 16:9). 중요한 동작은 가운데 세로 띠 안에 둔다
- 나머지 큐는 자리만 잡혀 있다. 개발 서버에서만 화면 왼쪽 위에 현재 큐가 글자로 뜬다. 컷씬·휴대폰 화면과 CCTV 모달의 최종 디자인은 Figma에서 확정한 뒤 만들고, 그림·소리 파일이 생기면 `media.ts`의 `file`을 채운다.
- 제작용 목록은 `pnpm cues`로 만드는 `docs/CUES.md`를 본다. 그림 프롬프트와 효과음 느낌은 노션의 「에셋·연출 제작 목록 — v4.1」에 있다.

유형 판정(`src/game/engine.ts`의 `decideType`): 1위 성향이 2위보다 4점 이상 높으면 단독형, 아니면 1위→2위 조합형. 동점이면 주요 성향으로 고른 횟수, 그래도 같으면 최근 선택 순.

> 진실 공개(TRUTH-GATE~03)는 결과를 사이트로 보내기 **전에** 보여 준다. 사이트로 결과를 보내면 결과 페이지로 이동해 버리기 때문이다. 기획서는 "결과 공개 후"라서, 결과 페이지 쪽에서 보여 줄지 정해야 한다.

## 구조

```
src/
  main.tsx              진입점 + 공통 base.css
  wibble.ts             사이트 연동 설정 (slug, 단독 실행 기본 테마)
  App.tsx               화면 흐름: 연결 → 타이틀 → 장면 → 결과
  game/engine.ts        상태·조건·점수·유형 판정 (순수 함수)
  game/script.ts        스토리 데이터 + 연출 큐 위치
  game/media.ts         연출 목록 (컷씬, CCTV 칸·장면, 휴대폰 화면, 화면 연출, 효과음, 환경음)
  view/PanoramaView.tsx 원근 보정 매장 화면
  view/CctvMonitor.tsx  CCTV 모달 (4분할 모니터)
  view/Cutscene.tsx     컷씬 (한 장 / 두 장 넘김 / 빈 화면)
  view/projection.ts    투영 수식, 파노라마 규격, 시선 칸
  styles.css            팔레트(MOOD.md), 세로·가로 레이아웃
scripts/coverage.ts     선택 조합 전수 검사
scripts/cues.ts         큐 시트(docs/CUES.md) 생성
```

훅은 `preact/hooks`에서 가져온다. Preact 코어에는 `StrictMode`가 없고, 마운트 때 `autoFocus`를 대신 처리해 주지 않으므로 필요하면 ref로 직접 `focus()`한다.

화면 디자인(대사창, 선택지, 타이틀)은 기능 확인용이다. 실제 UI는 Figma에서 확정한 뒤 바꾼다.
