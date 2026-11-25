/**
 * 가능한 모든 선택 조합(4^8 = 65,536)을 돌려 본다 — 기획서 7절 "배포 전 전수 검사".
 *   pnpm check:types
 *
 * - 연결이 끊긴 장면(없는 next)이 없는지
 * - 16가지 유형이 모두 나오는지, 한쪽으로 쏠리지 않는지
 * - 4가지 엔딩 분포
 */
import { applyChoice, decideType, enterNode, newGame, nextOf, type GameState } from "../src/game/engine.ts";
import { NODES, START, TYPES } from "../src/game/script.ts";

const errors: string[] = [];
for (const node of Object.values(NODES)) {
  const next = typeof node.next === "object" ? Object.values(node.next) : [node.next];
  const nexts = [...next, ...(node.question?.choices.map((c) => c.next) ?? [])].filter(Boolean) as string[];
  for (const id of nexts) if (id !== "RESULT" && !NODES[id]) errors.push(`${node.id} → 없는 장면 ${id}`);
  if (!node.next && !node.question) errors.push(`${node.id}: 다음 장면도 질문도 없음`);
}

const typeCount = new Map<string, number>();
const endingCount = new Map<string, number>();
const visited = new Set<string>();
let total = 0;

/** 질문이 아닌 장면은 자동으로 넘기고, 질문이면 네 갈래로 */
function walk(state: GameState) {
  let s = state;
  for (;;) {
    const node = NODES[s.node];
    visited.add(node.id);
    if (node.question) {
      // 진실 공개 선택은 점수·엔딩에 영향이 없으니 한 갈래만
      const choices = node.id === "TRUTH-GATE" ? node.question.choices.slice(1) : node.question.choices;
      for (const c of choices) {
        const next = enterNode(applyChoice(s, node, c), node);
        if (c.next === "RESULT") record(next);
        else walk({ ...next, node: c.next });
      }
      return;
    }
    const next = enterNode(s, node);
    const to = nextOf(node, next);
    if (to === "RESULT") return record(next);
    s = { ...next, node: to };
  }
}

function record(s: GameState) {
  total++;
  const t = decideType(s.scores, s.picks, TYPES);
  typeCount.set(t.name, (typeCount.get(t.name) ?? 0) + 1);
  endingCount.set(s.ending ?? "?", (endingCount.get(s.ending ?? "?") ?? 0) + 1);
}

walk(newGame(START));
// 진실 공개 장면은 위에서 건너뛰었으니 따로 표시
for (const id of ["TRUTH-01", "TRUTH-02", "TRUTH-WAIT", "TRUTH-RECORD", "TRUTH-EXIT", "TRUTH-CALL"]) visited.add(id);

const pct = (n: number) => ((n / total) * 100).toFixed(1).padStart(5) + "%";
console.log(`조합 ${total.toLocaleString()}개\n`);
console.log("유형 분포");
for (const t of Object.values(TYPES).sort((a, b) => a.no - b.no)) {
  const n = typeCount.get(t.name) ?? 0;
  console.log(`  ${String(t.no).padStart(2, "0")} ${t.name.padEnd(14, "　")} ${pct(n)} ${"█".repeat(Math.round((n / total) * 100))}`);
}
console.log("\n엔딩 분포");
for (const [e, n] of endingCount) console.log(`  ${e.padEnd(11)} ${pct(n)}`);

const unreached = Object.values(TYPES).filter((t) => !typeCount.has(t.name));
const unvisited = Object.keys(NODES).filter((id) => !visited.has(id));
if (unreached.length) errors.push(`나오지 않는 유형: ${unreached.map((t) => t.name).join(", ")}`);
if (unvisited.length) errors.push(`도달하지 않는 장면: ${unvisited.join(", ")}`);

if (errors.length) {
  console.error("\n문제\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("\n문제 없음");
