/**
 * 스토리 진행 엔진. 데이터(script.ts)와 화면(App.tsx) 사이의 순수 함수만 둔다.
 *
 * - 저장 변수(Vars): 선택 결과가 남기는 상태. 이후 장면의 조건부 대사를 고른다.
 * - 성향 점수(Scores): 선택지마다 주요 +2 / 보조 +1.
 * - 스토리 엔딩과 성향 유형은 서로 따로 계산한다 (기획서 9절).
 */

import type { Cue, Place } from "./media";

export type Trait = "P" | "T" | "A" | "S";
export const TRAITS: Trait[] = ["P", "T", "A", "S"];

export type Vars = {
  shelf?: "BOX" | "TEST" | "RESET" | "REPORT";
  counter?: "DIRECT" | "WITNESS" | "CAMERA" | "RECORD";
  fridge?: "BLOCK" | "PHOTO" | "CLEAN" | "CAMERA";
  phone?: "STORED" | "ANGLE" | "SHARED" | "CAMERA";
  bathroom?: "ANSWER" | "WAIT" | "REPORT" | "LOOK";
  call?: "IMAGE" | "DESCRIBE" | "COMPARE" | "REQUEST";
  route?: "IN" | "OUT";
  door?: "FOLLOW" | "OUTSIDE" | "LOG" | "CONFIRM";
};
export type VarKey = keyof Vars;

/** 모든 키가 맞아야 참. 값이 배열이면 그중 하나 */
export type Cond = { [K in VarKey]?: NonNullable<Vars[K]> | NonNullable<Vars[K]>[] };

/**
 * 한 줄 = 대사 한 덩어리. 조건부 묶음은 조건이 맞을 때만 펼쳐진다.
 * 큐(Cue, media.ts)는 바로 뒤 대사가 나올 때 실행되는 연출 지시다.
 */
export type Line = string | Cue | { if: Cond; lines: Line[] };

/** 화면에 한 번에 나오는 대사 한 줄 + 그때 실행할 큐. take = 녹음 파일 이름(목소리 큐가 있을 때) */
export type Beat = { text: string; cues: Cue[]; take?: string };

/** 시선 방향 (도). 0 = 정면 통로, + 오른쪽. 파노라마 범위를 넘으면 갈 수 있는 끝까지 */
export const SPOTS = {
  aisle: 0,
  counter: 0,
  fridge: 0,
  door: -48,
  window: -95,
  restroom: 62,
  cctv: 87,
} as const;
export type Spot = keyof typeof SPOTS;

export type Choice = {
  key: "A" | "B" | "C" | "D";
  label: string;
  /** 주요 +2, 보조 +1. 진실 공개처럼 점수가 없는 선택은 생략 */
  score?: { main: Trait; sub: Trait };
  next: string;
};

export type SceneNode = {
  id: string;
  /** 화면 위에 띄우는 시각 (예: 02:11) */
  time?: string;
  /** 장 제목. 이 장면에서 새로 시작할 때만 */
  chapter?: string;
  title?: string;
  look?: Spot;
  /** 이 장면부터 장소가 바뀌면. 다음 장면들도 이어서 그 장소 (배경·환경음) */
  place?: Place;
  lines: Line[];
  /** 장면이 끝난 뒤 저장할 상태 */
  set?: Vars;
  question?: { prompt: string; choices: Choice[] };
  /** 질문이 없는 장면의 다음 장면. "RESULT"면 결과로 */
  next?: string;
  /** 스토리 엔딩이면 그 id */
  ending?: EndingId;
};

export type EndingId = "END-WAIT" | "END-RECORD" | "END-EXIT" | "END-CALL";

/** 엔딩 뒤에 붙는 추가 장면 (기획서 6절) */
export type Extra = { id: string; if: Cond; endings: EndingId[] | "all"; lines: Line[] };

export type Pick = { node: string; key: Choice["key"]; main?: Trait };

export type GameState = {
  node: string;
  vars: Vars;
  scores: Record<Trait, number>;
  picks: Pick[];
  ending?: EndingId;
};

export const newGame = (start: string): GameState => ({
  node: start,
  vars: {},
  scores: { P: 0, T: 0, A: 0, S: 0 },
  picks: [],
});

export function matches(cond: Cond, vars: Vars): boolean {
  return (Object.entries(cond) as [VarKey, string | string[]][]).every(([k, want]) => {
    const have = vars[k];
    return have !== undefined && (Array.isArray(want) ? want.includes(have) : want === have);
  });
}

/**
 * 대사와 큐를 화면 순서대로 펼친다. vars 가 "all"이면 조건을 모두 참으로 본다(큐 시트용).
 * 목소리 순번은 조건과 상관없이 대본에 적힌 순서라서, 어떤 갈래로 와도 파일 이름이 같다.
 */
export function resolveLines(lines: Line[], vars: Vars | "all", scene: string): Beat[] {
  const beats: Beat[] = [];
  let pending: Cue[] = [];
  let take: string | undefined;
  let voices = 0;
  const walk = (ls: Line[], on: boolean) => {
    for (const l of ls) {
      if (typeof l === "string") {
        if (!on) continue;
        beats.push(take ? { text: l, cues: pending, take } : { text: l, cues: pending });
        pending = [];
        take = undefined;
      } else if ("if" in l) {
        walk(l.lines, on && (vars === "all" || matches(l.if, vars)));
      } else {
        if ("voice" in l) {
          voices++;
          if (on) take = `${scene}.${voices}`;
        }
        if (on) pending.push(l);
      }
    }
  };
  walk(lines, true);
  // 마지막 대사 뒤에 남은 큐는 마지막 대사와 함께
  if (pending.length && beats.length) beats[beats.length - 1].cues.push(...pending);
  return beats;
}

export function extraLines(extras: Extra[], ending: EndingId, vars: Vars): Beat[] {
  return extras
    .filter((x) => (x.endings === "all" || x.endings.includes(ending)) && matches(x.if, vars))
    .flatMap((x) => resolveLines(x.lines, vars, x.id));
}

/** 장면을 다 읽은 뒤: 저장 변수 반영 */
export function enterNode(state: GameState, node: SceneNode): GameState {
  return {
    ...state,
    node: node.id,
    vars: node.set ? { ...state.vars, ...node.set } : state.vars,
    ending: node.ending ?? state.ending,
  };
}

export function applyChoice(state: GameState, node: SceneNode, choice: Choice): GameState {
  const scores = { ...state.scores };
  if (choice.score) {
    scores[choice.score.main] += 2;
    scores[choice.score.sub] += 1;
  }
  return {
    ...state,
    scores,
    picks: [...state.picks, { node: node.id, key: choice.key, main: choice.score?.main }],
  };
}

// ------------------------------------------------------------------ 성향 유형 (기획서 7·8절)

export type PersonalityType = { no: number; id: string; name: string; combo: string; desc: string };

/**
 * 유형 결정
 * 1. 점수가 가장 높은 성향 = 주요, 두 번째 = 보조
 * 2. 주요가 보조보다 4점 이상 높으면 단독 우세형, 3점 이하면 조합형
 * 3. 동점이면 주요 성향으로 고른 횟수가 많은 쪽, 그래도 같으면 최근에 주요로 고른 쪽
 */
export function rankTraits(scores: Record<Trait, number>, picks: Pick[]): Trait[] {
  const count = (t: Trait) => picks.filter((p) => p.main === t).length;
  const last = (t: Trait) => picks.map((p) => p.main).lastIndexOf(t);
  return [...TRAITS].sort((a, b) => scores[b] - scores[a] || count(b) - count(a) || last(b) - last(a));
}

export function decideType(
  scores: Record<Trait, number>,
  picks: Pick[],
  types: Record<string, PersonalityType>,
): PersonalityType {
  const [main, sub] = rankTraits(scores, picks);
  const key = scores[main] - scores[sub] >= 4 ? main : `${main}${sub}`;
  return types[key];
}
