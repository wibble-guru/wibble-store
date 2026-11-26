import { WibbleDevBadge, WibbleGate, useWibbleHost } from "@wibble-guru/boilerplate";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  SPOTS,
  applyChoice,
  decideType,
  enterNode,
  newGame,
  nextOf,
  resolveLines,
  type Beat,
  type Choice,
  type GameState,
  type PersonalityType,
} from "./game/engine";
import {
  BACKDROPS,
  CUTS,
  PHOTOS,
  SHOTS,
  SPEAKERS,
  type BackdropId,
  type Cue,
  type CutId,
  type Place,
  type ShotId,
  type Speaker,
} from "./game/media";
import { NODES, START, TYPES } from "./game/script";
import { CctvMonitor } from "./view/CctvMonitor";
import { Cutscene, preloadCuts } from "./view/Cutscene";
import { PanoramaView, preloadBackdrops } from "./view/PanoramaView";
import { stopAllAudio } from "./audio";
import { setListenerYaw, setSpatialCentered } from "./spatial";
import { startBgm } from "./bgm";
import { closeDoor, openDoor, preloadDoor, resetDoor } from "./door";
import { playSfx, preloadSfx } from "./sfx";
import { game } from "./wibble";

type Phase =
  | { kind: "title" }
  | { kind: "play" }
  | { kind: "result"; type: PersonalityType; state: GameState; sent: boolean };

/**
 * 화면 흐름: 연결 → 타이틀 → 장면 → 결과.
 * 연결 중에도 매장 배경을 보여 주려고 WibbleFrame 대신 useWibbleHost를 쓴다.
 * (8초 안에 init이 없으면 막힌 화면, 그 뒤에 init이 와도 이어서 시작 · <html data-theme> 반영은 boilerplate가 맡는다)
 */
export function App() {
  const { status, host } = useWibbleHost(game);
  const [phase, setPhase] = useState<Phase>({ kind: "title" });
  const [look, setLook] = useState<number>(SPOTS.counter);
  // 장면이 바꿔 끼운 매장 배경 (pano 큐). null = 기본 배경
  const [backdrop, setBackdrop] = useState<BackdropId | null>(null);
  // 배경음은 결과 전까지만. 다시 하기로 타이틀에 돌아오면 다시 켠다
  const over = phase.kind === "result";
  useEffect(() => (over ? undefined : startBgm()), [over]);

  function finish(state: GameState) {
    const type = decideType(state.scores, state.picks, TYPES);
    const sent = game.sendResult(type.id);
    // 결과를 보내는 순간 배경음·효과음·출입문 빗소리를 모두 정리한다
    resetDoor();
    stopAllAudio();
    setPhase({ kind: "result", type, state, sent });
  }

  if (status === "blocked") return <WibbleGate game={game} />;

  return (
    <main className="game">
      <PanoramaView backdrop={backdrop} lookDeg={look} onYaw={setListenerYaw} />

      {status === "connecting" && (
        <div className="overlay">
          <p className="hint">사이트와 연결하는 중…</p>
        </div>
      )}

      {status === "ready" && phase.kind === "title" && (
        <div className="overlay">
          <section className="title">
            <p className="eyebrow">WIBBLE NIGHT SHIFT</p>
            <h1>심야 편의점</h1>
            <p className="hint">마지막 손님</p>
            <button className="primary" onClick={() => setPhase({ kind: "play" })}>
              근무 시작
            </button>
          </section>
        </div>
      )}

      {phase.kind === "play" && <Play onLook={setLook} onBackdrop={setBackdrop} onFinish={finish} />}

      {phase.kind === "result" && (
        <div className="overlay">
          <section className="title">
            <p className="eyebrow">근무 종료</p>
            {phase.sent ? (
              <p className="hint">결과 페이지로 이동하는 중…</p>
            ) : (
              <>
                <h1>{phase.type.name}</h1>
                <p className="hint">
                  {phase.type.combo} · {phase.type.desc}
                </p>
                <p className="dev-note">
                  결과 id {phase.type.id} · 엔딩 {phase.state.ending} · P{phase.state.scores.P} T{phase.state.scores.T} A
                  {phase.state.scores.A} S{phase.state.scores.S}
                  <br />
                  단독 실행 모드 — 사이트 안에서는 이 결과 id가 사이트로 전달됩니다.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setLook(SPOTS.counter);
                    setPhase({ kind: "title" });
                  }}
                >
                  다시 하기
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {host && !host.embedded && <WibbleDevBadge host={host} />}
    </main>
  );
}

/** pano 큐의 afterSfx: 효과음이 끝나고 배경을 바꾸기까지 */
const BACKDROP_AFTER_SFX_MS = 100;

/** 장면 진행: 대사를 한 줄씩 넘기고, 끝나면 선택지 또는 다음 장면 */
function Play({
  onLook,
  onBackdrop,
  onFinish,
}: {
  onLook: (deg: number) => void;
  onBackdrop: (id: BackdropId | null) => void;
  onFinish: (s: GameState) => void;
}) {
  const [game, setGame] = useState(() => newGame(START));
  const [lineIdx, setLineIdx] = useState(0);
  const [clock, setClock] = useState("02:00");
  const [chapter, setChapter] = useState("");
  const [place, setPlace] = useState<Place>("inside");
  // 매장 밖 장면에서는 매장 안 각도가 맞지 않으므로 좌우 위치 없이 가운데로
  useEffect(() => {
    setSpatialCentered(place === "outside");
    return () => setSpatialCentered(false);
  }, [place]);

  const node = NODES[game.node];
  const beats = useMemo(() => resolveLines(node.lines, game.vars), [node, game.vars]);
  const lines = beats.map((b) => b.text);
  const done = lineIdx >= lines.length - 1;
  // CCTV 모달: 이 장면에서 지금 줄까지 마지막으로 연 화면. 장면이 바뀌면 닫힌다
  const cctv = useMemo(() => {
    let shot: ShotId | null = null;
    for (const b of beats.slice(0, lineIdx + 1)) for (const c of b.cues) if ("cctv" in c) shot = c.cctv;
    return shot;
  }, [beats, lineIdx]);
  // 컷씬: 지금 줄까지 마지막으로 나온 컷씬이 hold 줄 안이면 보인다. 장면이 바뀌면 닫힌다
  const cut = useMemo(() => {
    for (let i = Math.min(lineIdx, beats.length - 1); i >= 0; i--) {
      for (const c of beats[i].cues) {
        if ("cut" in c) return lineIdx < i + (c.hold ?? 1) ? { id: c.cut, at: i } : null;
      }
    }
    return null;
  }, [beats, lineIdx]);
  // 매장 배경: 이 장면에서 지금 줄까지 마지막 pano 큐. 장면이 바뀌거나 진행이 끝나면 기본 배경으로.
  // afterSfx 큐는 지금 줄의 효과음이 끝난 뒤(soundDone)부터 친다. 줄을 넘기면 바로 친다
  const [soundDone, setSoundDone] = useState<string | null>(null);
  const backdrop = useMemo(() => {
    let id: BackdropId | null = null;
    beats.slice(0, lineIdx + 1).forEach((b, i) => {
      for (const c of b.cues) {
        if (!("pano" in c)) continue;
        if (c.afterSfx && i === lineIdx && soundDone !== `${node.id}:${lineIdx}`) continue;
        id = c.pano;
      }
    });
    return id;
  }, [beats, lineIdx, soundDone, node.id]);
  useEffect(() => onBackdrop(backdrop), [backdrop]);
  useEffect(() => () => onBackdrop(null), []);
  useEffect(preloadCuts, []);
  useEffect(preloadBackdrops, []);
  useEffect(preloadSfx, []);
  // 출입문 소리를 미리 받고, 진행이 끝나면(결과·다시 하기) 남은 바깥 빗소리를 끈다
  useEffect(() => {
    preloadDoor();
    return resetDoor;
  }, []);
  // 장면 앞 소리(intro): 소리를 틀고 wait초 동안 대사창을 비워 둔 뒤 첫 대사를 보여 준다
  const [introDone, setIntroDone] = useState<string | null>(null);
  const entering = !!node.intro && introDone !== node.id;
  useEffect(() => {
    if (!node.intro) return;
    node.intro.cues.forEach((c) => runSound(c, onLook));
    const t = window.setTimeout(() => setIntroDone(node.id), node.intro.wait * 1000);
    return () => window.clearTimeout(t);
  }, [node]);
  // 대사 줄에 걸린 소리 큐. 줄이 바뀔 때만 튼다 (beats는 저장 변수가 바뀌어도 새로 만들어진다)
  // { sfx, wait: true } 가 있으면 그 소리가 끝날 때까지 이 줄을 숨기고 진행을 멈춘다 (장면 앞 문 열림처럼)
  const beatKey = `${node.id}:${lineIdx}`;
  const [heard, setHeard] = useState<string | null>(null);
  const listening = !entering && heard !== beatKey && !!beats[lineIdx]?.cues.some((c) => "sfx" in c && c.wait);
  useEffect(() => {
    if (entering) return;
    let alive = true;
    let timer = 0;
    const waits: Promise<void>[] = [];
    const sounds: Promise<void>[] = [];
    const cues = beats[lineIdx]?.cues ?? [];
    for (const c of cues) {
      // 장면 중간에 시각이 바뀌는 줄 (시간 경과 몽타주 등)
      if ("clock" in c) setClock(c.clock);
      const played = runSound(c, onLook);
      if (played && "sfx" in c) {
        sounds.push(played);
        if (c.wait) waits.push(played);
      }
    }
    if (waits.length) {
      setHeard(null);
      void Promise.all(waits).then(() => alive && setHeard(beatKey));
    }
    // 효과음이 끝나고 0.1초 뒤에 배경을 바꾼다 (pano 큐의 afterSfx)
    if (cues.some((c) => "pano" in c && c.afterSfx))
      void Promise.all(sounds).then(() => {
        if (alive) timer = window.setTimeout(() => setSoundDone(beatKey), BACKDROP_AFTER_SFX_MS);
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [node.id, lineIdx, entering]);
  const waiting = entering || listening;
  const asking = done && !waiting && !!node.question;
  // 대사창 버튼에 포커스 (Preact는 React와 달리 마운트 때 autoFocus를 대신 처리해 주지 않는다)
  const linesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asking) linesRef.current?.focus();
  }, [asking]);
  // CCTV 모니터가 대사창에 가리지 않도록 대사창 높이를 잰다
  const panelRef = useRef<HTMLElement>(null);
  const [panelH, setPanelH] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (node.look) onLook(SPOTS[node.look]);
    if (node.time) setClock(node.time);
    if (node.chapter) setChapter(node.chapter);
    if (node.place) setPlace(node.place);
  }, [node, onLook]);

  function goTo(state: GameState, next: string) {
    if (next === "RESULT") return onFinish(state);
    setGame({ ...state, node: next });
    setLineIdx(0);
  }

  function advance() {
    if (waiting) return;
    if (!done) return setLineIdx((i) => i + 1);
    if (node.question) return;
    const state = enterNode(game, node);
    goTo(state, nextOf(node, state));
  }

  function choose(choice: Choice) {
    goTo(enterNode(applyChoice(game, node, choice), node), choice.next);
  }

  // 장면 앞 소리 중에는 비워 두고, 줄 소리를 기다리는 중에는 앞 줄들만 보여 준다
  const shownFrom = listening ? Math.max(0, lineIdx - 3) : Math.max(0, lineIdx - 2);
  const shown = entering ? [] : beats.slice(shownFrom, listening ? lineIdx : lineIdx + 1);

  return (
    <>
      {cut && <Cutscene key={`${node.id}:${cut.at}`} id={cut.id} />}
      {cctv && <div className="cctv-dim" />}
      {cctv && (
        <div className="cctv-layer" style={{ bottom: `${panelH + 24}px` }}>
          <CctvMonitor shot={cctv} clock={clock} />
        </div>
      )}

      <header className="hud">
        <span className="clock">{clock}</span>
        <span className="where">
          {chapter && <span className="chapter">{chapter}</span>}
          {node.title}
        </span>
      </header>

      {import.meta.env.DEV && <CueDebug beat={entering ? undefined : beats[lineIdx]} cctv={cctv} cut={cut?.id ?? null} place={place} />}

      <section ref={panelRef} className={`panel${asking ? " asking" : ""}`}>
        {!asking ? (
          <button ref={linesRef} className="lines" onClick={advance} aria-label="다음">
            {shown.map((b, i) => (
              <Line key={`${node.id}-${shownFrom + i}`} text={b.text} who={speakerOf(b)} current={i === shown.length - 1} />
            ))}
            {!waiting && (
              <span className="more" aria-hidden="true">
                ▼
              </span>
            )}
          </button>
        ) : (
          <div className="question">
            <div className="lines static">
              <Line text={lines[lines.length - 1]} who={speakerOf(beats[beats.length - 1])} current={false} />
            </div>
            {node.question!.prompt && <p className="prompt">{node.question!.prompt}</p>}
            <div className="choices">
              {node.question!.choices.map((c) => (
                <button key={c.key} onClick={() => choose(c)}>
                  <span className="key">{c.key}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * 개발용: 지금 줄에 걸린 연출 큐를 글자로 보여 준다. 컷씬·CCTV 모달·소리가 실제로 붙기 전까지의 자리 표시.
 * 운영 빌드에는 나오지 않는다.
 */
function CueDebug({ beat, cctv, cut, place }: { beat?: Beat; cctv: ShotId | null; cut: CutId | null; place: Place }) {
  const items: string[] = [];
  if (place === "outside") items.push("장소: 매장 밖 (실외 배경 없음)");
  if (cctv) items.push(`CCTV ${SHOTS[cctv].cam} ${SHOTS[cctv].mode} · ${cctv} — ${SHOTS[cctv].desc}`);
  if (cut) items.push(`컷씬 ${cut} — ${CUTS[cut].desc}`);
  for (const c of beat?.cues ?? []) {
    if ("cut" in c) continue;
    else if ("fx" in c) items.push(`연출 ${c.fx}`);
    else if ("sfx" in c)
      items.push(`효과음 ${c.sfx}${c.walk ? ` (${c.walk[0]} → ${c.walk[1]} 걸음)` : ""}${c.wait ? " (끝날 때까지 대기)" : ""}`);
    else if ("amb" in c) items.push(`환경음 ${c.amb}`);
    else if ("photo" in c) items.push(`휴대폰 화면 ${c.photo} — ${PHOTOS[c.photo].desc}`);
    else if ("door" in c) items.push(`출입문 ${c.door} (문 소리 + 바깥 빗소리)`);
    else if ("clock" in c) items.push(`시각 ${c.clock}`);
    else if ("pano" in c)
      items.push(`매장 배경 ${c.pano ? `${c.pano} — ${BACKDROPS[c.pano].desc}` : "기본"}${c.afterSfx ? " (효과음 끝나고 0.1초 뒤)" : ""}`);
  }
  if (!items.length) return null;
  return (
    <ul className="cue-debug" aria-hidden="true">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * 소리 큐 실행: 효과음, 출입문(문 소리 + 바깥 빗소리). 다른 큐는 화면 쪽에서 처리한다.
 * 걸어가는 효과음(walk)은 걸음마다 onLook으로 시선을 걷는 사람 쪽으로 돌린다
 */
function runSound(c: Cue, onLook: (deg: number) => void): Promise<void> | undefined {
  if ("sfx" in c) {
    const walk = c.walk && { from: SPOTS[c.walk[0]], to: SPOTS[c.walk[1]], onStep: onLook };
    return playSfx(c.sfx, walk);
  }
  if ("door" in c) (c.door === "open" ? openDoor : closeDoor)();
}

/** 이 대사를 말하는 사람 (who 큐) */
function speakerOf(beat: Beat | undefined): Speaker | undefined {
  for (const c of beat?.cues ?? []) if ("who" in c) return c.who;
  return undefined;
}

/** "[점장님]\n..." 처럼 대괄호로 시작하는 줄은 메시지 카드로. who 가 있으면 이름표를 붙인다 */
function Line({ text, who, current }: { text: string; who?: Speaker; current: boolean }) {
  const m = /^\[([^\]]+)\]\n?([\s\S]*)$/.exec(text);
  if (m) {
    return (
      <span className={`line card${current ? " current" : ""}`}>
        <span className="card-label">{m[1]}</span>
        {m[2] && <span className="card-body">{m[2]}</span>}
      </span>
    );
  }
  return (
    <span className={`line${current ? " current" : ""}`}>
      {who && <span className="speaker">{SPEAKERS[who]}</span>}
      {text}
    </span>
  );
}
