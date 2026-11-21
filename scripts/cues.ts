/**
 * 대본의 연출 큐를 모아 제작용 큐 시트(docs/CUES.md)를 만든다.
 *   pnpm cues
 *
 * - 컷씬·CCTV·화면 연출·효과음·환경음: 어느 장면 어느 대사에서 쓰이는지
 * - 목소리: 배역별 녹음 대본 (파일 이름 = 장면id.순번)
 * - 목록(media.ts)에 있는데 대본에서 안 쓰이는 항목
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveLines, type Beat } from "../src/game/engine.ts";
import { AMB, CAMS, CUTS, FX, PLACE_AMB, ROLES, SFX, SHOTS, VIA, type Cue } from "../src/game/media.ts";
import { EXTRAS, NODES } from "../src/game/script.ts";

type Use = { scene: string; text: string; beat: Beat; cue: Cue };

/** 조건부 대사까지 모두 펼친 장면별 대사 */
const scenes: { id: string; title: string; beats: Beat[] }[] = [
  ...Object.values(NODES).map((n) => ({ id: n.id, title: n.title ?? "", beats: resolveLines(n.lines, "all", n.id) })),
  ...EXTRAS.map((x) => ({
    id: x.id,
    title: `추가 장면 (${x.endings === "all" ? "모든 엔딩" : x.endings.join(", ")})`,
    beats: resolveLines(x.lines, "all", x.id),
  })),
];

const uses: Use[] = scenes.flatMap((s) => s.beats.flatMap((beat) => beat.cues.map((cue) => ({ scene: s.id, text: beat.text, beat, cue }))));
const short = (t: string) => t.replace(/\n/g, " ").slice(0, 40);
const where = (pick: (c: Cue) => string | null | undefined, id: string) =>
  uses.filter((u) => pick(u.cue) === id).map((u) => `${u.scene} 「${short(u.text)}」`);

const out: string[] = [];
const unused: string[] = [];
const section = <T extends Record<string, { desc: string; source?: string }>>(
  title: string,
  list: T,
  pick: (c: Cue) => string | null | undefined,
  extra: (id: keyof T & string) => string = () => "",
) => {
  out.push(`## ${title}\n`, "| id | 설명 | 쓰이는 곳 |", "|---|---|---|");
  for (const id of Object.keys(list) as (keyof T & string)[]) {
    const at = where(pick, id);
    if (!at.length) unused.push(`${title} ${id}`);
    const src = list[id].source ? ` _(${list[id].source === "record" ? "직접 녹음" : "라이브러리"})_` : "";
    out.push(`| \`${id}\` | ${list[id].desc}${src}${extra(id)} | ${at.join("<br>") || "—"} |`);
  }
  out.push("");
};

out.push(
  "# 심야 편의점 큐 시트",
  "",
  "`pnpm cues`로 만든 파일이다. 직접 고치지 말고 `src/game/script.ts`(큐 위치)와 `src/game/media.ts`(목록)를 고친다.",
  "",
);

section("컷씬", CUTS, (c) => ("cut" in c ? c.cut : null));

out.push("## CCTV 모달\n", "| 칸 | 비추는 곳 |", "|---|---|");
for (const [cam, desc] of Object.entries(CAMS)) out.push(`| ${cam} | ${desc} |`);
out.push("");
section("CCTV 장면", SHOTS, (c) => ("cctv" in c ? c.cctv : null), (id) => ` · **${SHOTS[id].cam} ${SHOTS[id].mode}**`);
section("매장 화면 위 연출", FX, (c) => ("fx" in c ? c.fx : null));
section("효과음", SFX, (c) => ("sfx" in c ? c.sfx : null));
section("환경음", AMB, (c) => ("amb" in c ? c.amb : null), (id) => {
  const places = Object.entries(PLACE_AMB).filter(([, ids]) => ids.includes(id)).map(([p]) => (p === "inside" ? "매장 안" : "매장 밖"));
  return places.length ? ` · 기본: ${places.join(", ")}` : "";
});
// 모달·장소가 알아서 트는 소리는 대본에 큐가 없어도 된다
const auto = new Set(["효과음 cctv-on", "효과음 cctv-off", "환경음 store", "환경음 rain-in", "환경음 rain-out", "환경음 street", "환경음 cctv-noise"]);

out.push("## 목소리 녹음 대본\n");
out.push("| 후처리 | 설명 |", "|---|---|");
for (const [via, desc] of Object.entries(VIA)) out.push(`| \`${via}\` | ${desc} |`);
out.push("");
for (const [role, desc] of Object.entries(ROLES)) {
  const takes = uses.filter((u) => "voice" in u.cue && u.cue.voice === role);
  out.push(`### ${role} — ${takes.length}줄\n`, desc, "", "| 파일 | 장면 | 대사 | 후처리 |", "|---|---|---|---|");
  for (const u of takes) {
    const via = "voice" in u.cue ? u.cue.via : undefined;
    out.push(`| \`${u.beat.take}\` | ${u.scene} | ${u.text.replace(/\n/g, " ")} | ${via ?? "—"} |`);
  }
  out.push("");
}

const warn = unused.filter((u) => !auto.has(u));
if (warn.length) out.push("## 대본에서 안 쓰이는 항목\n", ...warn.map((w) => `- ${w}`), "");

mkdirSync("docs", { recursive: true });
writeFileSync("docs/CUES.md", out.join("\n"));

const count = (k: string) => uses.filter((u) => k in u.cue).length;
console.log(
  `docs/CUES.md · 컷씬 ${count("cut")} · CCTV ${count("cctv")} · 연출 ${count("fx")} · 효과음 ${count("sfx")} · 환경음 ${count("amb")} · 목소리 ${count("voice")}`,
);
if (warn.length) console.log(`안 쓰이는 항목: ${warn.join(", ")}`);
