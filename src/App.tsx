import { useEffect, useMemo, useRef, useState } from "react";
import { Gate } from "./Gate";
import { INIT_TIMEOUT_MS, connectToHost, sendResult, type HostContext } from "./bridge";
import {
  SPOTS,
  applyChoice,
  decideType,
  enterNode,
  extraLines,
  newGame,
  resolveLines,
  type Beat,
  type Choice,
  type GameState,
  type PersonalityType,
} from "./game/engine";
import { CUTS, SHOTS, type Place, type ShotId } from "./game/media";
import { EXTRAS, NODES, START, TYPES } from "./game/script";
import { CctvMonitor } from "./view/CctvMonitor";
import { PanoramaView } from "./view/PanoramaView";

type Phase =
  | { kind: "connecting" }
  | { kind: "blocked" }
  | { kind: "title" }
  | { kind: "play" }
  | { kind: "result"; type: PersonalityType; state: GameState; sent: boolean };

export function App() {
  const [host, setHost] = useState<HostContext | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [look, setLook] = useState<number>(SPOTS.counter);

  useEffect(() => {
    const connection = connectToHost();
    if (!connection) {
      setPhase({ kind: "blocked" });
      return;
    }
    let alive = true;
    // 사이트가 늦게 뜨는 경우를 위해, 막힌 화면을 띄운 뒤에도 init이 오면 이어서 시작한다.
    const timer = window.setTimeout(() => {
      setPhase((p) => (p.kind === "connecting" ? { kind: "blocked" } : p));
    }, INIT_TIMEOUT_MS);
    connection.then((ctx) => {
      if (!alive) return;
      window.clearTimeout(timer);
      setHost(ctx);
      setPhase({ kind: "title" });
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = host?.theme ?? "horror";
  }, [host?.theme]);

  function finish(state: GameState) {
    const type = decideType(state.scores, state.picks, TYPES);
    setPhase({ kind: "result", type, state, sent: sendResult(type.id) });
  }

  if (phase.kind === "blocked") return <Gate />;

  return (
    <main className="game">
      <PanoramaView lookDeg={look} />

      {phase.kind === "connecting" && (
        <div className="overlay">
          <p className="hint">사이트와 연결하는 중…</p>
        </div>
      )}

      {phase.kind === "title" && (
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

      {phase.kind === "play" && <Play onLook={setLook} onFinish={finish} />}

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

      {host && !host.embedded && (
        <p className="dev-badge">
          standalone · slug={host.slug} · theme={host.theme}
        </p>
      )}
    </main>
  );
}

/** 장면 진행: 대사를 한 줄씩 넘기고, 끝나면 선택지 또는 다음 장면 */
function Play({ onLook, onFinish }: { onLook: (deg: number) => void; onFinish: (s: GameState) => void }) {
  const [game, setGame] = useState(() => newGame(START));
  const [lineIdx, setLineIdx] = useState(0);
  const [clock, setClock] = useState("02:00");
  const [chapter, setChapter] = useState("");
  const [place, setPlace] = useState<Place>("inside");

  const node = NODES[game.node];
  const beats = useMemo(() => {
    const own = resolveLines(node.lines, game.vars, node.id);
    const extra = node.ending ? extraLines(EXTRAS, node.ending, game.vars) : [];
    return [...own, ...extra];
  }, [node, game.vars]);
  const lines = beats.map((b) => b.text);
  const done = lineIdx >= lines.length - 1;
  // CCTV 모달: 이 장면에서 지금 줄까지 마지막으로 연 화면. 장면이 바뀌면 닫힌다
  const cctv = useMemo(() => {
    let shot: ShotId | null = null;
    for (const b of beats.slice(0, lineIdx + 1)) for (const c of b.cues) if ("cctv" in c) shot = c.cctv;
    return shot;
  }, [beats, lineIdx]);
  const asking = done && !!node.question;
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
    if (!done) return setLineIdx((i) => i + 1);
    if (node.question) return;
    goTo(enterNode(game, node), node.next ?? "RESULT");
  }

  function choose(choice: Choice) {
    goTo(enterNode(applyChoice(game, node, choice), node), choice.next);
  }

  const shown = lines.slice(Math.max(0, lineIdx - 2), lineIdx + 1);

  return (
    <>
      {cctv && <div className="cctv-dim" />}
      {cctv && (
        <div className="cctv-layer" style={{ bottom: panelH + 24 }}>
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

      {import.meta.env.DEV && <CueDebug beat={beats[lineIdx]} cctv={cctv} place={place} />}

      <section ref={panelRef} className={`panel${asking ? " asking" : ""}`}>
        {!asking ? (
          <button className="lines" onClick={advance} autoFocus aria-label="다음">
            {shown.map((l, i) => (
              <Line key={`${node.id}-${lineIdx - shown.length + 1 + i}`} text={l} current={i === shown.length - 1} />
            ))}
            <span className="more" aria-hidden="true">
              ▼
            </span>
          </button>
        ) : (
          <div className="question">
            <div className="lines static">
              <Line text={lines[lines.length - 1]} current={false} />
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
function CueDebug({ beat, cctv, place }: { beat?: Beat; cctv: ShotId | null; place: Place }) {
  const items: string[] = [];
  if (place === "outside") items.push("장소: 매장 밖 (실외 배경 없음)");
  if (cctv) items.push(`CCTV ${SHOTS[cctv].cam} ${SHOTS[cctv].mode} · ${cctv} — ${SHOTS[cctv].desc}`);
  for (const c of beat?.cues ?? []) {
    if ("cut" in c) items.push(`컷씬 ${c.cut} — ${CUTS[c.cut].desc}`);
    else if ("fx" in c) items.push(`연출 ${c.fx}`);
    else if ("sfx" in c) items.push(`효과음 ${c.sfx}`);
    else if ("amb" in c) items.push(`환경음 ${c.amb}`);
    else if ("voice" in c) items.push(`목소리 ${c.voice}${c.via ? `(${c.via})` : ""} · ${beat?.take}`);
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

/** "[점장님]\n..." 처럼 대괄호로 시작하는 줄은 메시지 카드로 */
function Line({ text, current }: { text: string; current: boolean }) {
  const m = /^\[([^\]]+)\]\n?([\s\S]*)$/.exec(text);
  if (m) {
    return (
      <span className={`line card${current ? " current" : ""}`}>
        <span className="card-label">{m[1]}</span>
        {m[2] && <span className="card-body">{m[2]}</span>}
      </span>
    );
  }
  return <span className={`line${current ? " current" : ""}`}>{text}</span>;
}
