/**
 * 대본의 연출 큐를 모아 제작용 큐 시트(docs/CUES.md)를 만든다.
 *   pnpm cues
 *
 * - 컷씬·CCTV·휴대폰 화면·화면 연출·효과음·환경음: 어느 장면 어느 대사에서 쓰이는지
 * - 목록(media.ts)에 있는데 대본에서 안 쓰이는 항목
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveLines, type Beat } from "../src/game/engine.ts";
import { AMB, BACKDROPS, CAMS, CUTS, FX, PHOTOS, PLACE_AMB, SFX, SHOTS, type Cue } from "../src/game/media.ts";
import { NODES } from "../src/game/script.ts";

type Use = { scene: string; text: string; beat: Beat; cue: Cue };

/** 조건부 대사까지 모두 펼친 장면별 대사 */
const scenes: { id: string; title: string; beats: Beat[] }[] = Object.values(NODES).map((n) => ({
  id: n.id,
  title: n.title ?? "",
  beats: resolveLines(n.lines, "all"),
}));

const uses: Use[] = [
  // 장면 앞 효과음(intro): 첫 대사 전에 나는 소리
  ...Object.values(NODES).flatMap((n) => {
    if (!n.intro) return [];
    const text = `(장면 시작 전, ${n.intro.wait}초 뒤 첫 대사)`;
    return n.intro.cues.map((cue) => ({ scene: n.id, text, beat: { text, cues: [] }, cue }));
  }),
  ...scenes.flatMap((s) => s.beats.flatMap((beat) => beat.cues.map((cue) => ({ scene: s.id, text: beat.text, beat, cue })))),
];
const short = (t: string) => t.replace(/\n/g, " ").slice(0, 40);
const where = (pick: (c: Cue) => string | null | undefined, id: string) =>
  uses
    .filter((u) => pick(u.cue) === id)
    .map((u) => `${u.scene} 「${short(u.text)}」${"cut" in u.cue && (u.cue.hold ?? 1) > 1 ? ` (${u.cue.hold}줄)` : ""}`);

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

out.push(
  "## 컷씬 그림 파일\n",
  "`src/assets/cuts/`에 id 이름으로 넣으면 바로 붙는다. `<id>.gif`(한 장, 움직이는 그림 가능) 또는 `<id>.1.webp` + `<id>.2.webp`(두 장 → 넘김). 쓰이는 곳의 (N줄)은 컷씬이 떠 있는 대사 수.",
  "",
);
section("컷씬", CUTS, (c) => ("cut" in c ? c.cut : null));

out.push("## CCTV 모달\n", "| 칸 | 비추는 곳 |", "|---|---|");
for (const [cam, desc] of Object.entries(CAMS)) out.push(`| ${cam} | ${desc} |`);
out.push("");
section("CCTV 장면", SHOTS, (c) => ("cctv" in c ? c.cctv : null), (id) => ` · **${SHOTS[id].cam} ${SHOTS[id].mode}**`);
section("휴대폰 사진·영상 화면", PHOTOS, (c) => ("photo" in c ? c.photo : null));
section("매장 화면 위 연출", FX, (c) => ("fx" in c ? c.fx : null));
out.push("## 매장 배경 그림 파일\n", "`src/assets/store/pano_<id>.webp`. `pano.webp`와 같은 구도·크기(2016×780). 큐 `pano: null`은 기본 배경으로 되돌린다.", "");
section("매장 배경", BACKDROPS, (c) => ("pano" in c ? c.pano : null));
section("효과음", SFX, (c) => ("sfx" in c ? c.sfx : null));

out.push(
  "## 출입문 (문 소리 + 바깥 빗소리)\n",
  "`src/door.ts`. 열 때 door-open(without-rain) + rain-start(outside) → rain(outside) 반복, 닫을 때 rain-end(outside) (문 닫히는 소리는 효과음 door-close로 따로). 사이는 모두 크로스페이드. 열려 있는 동안은 장면이 바뀌어도 빗소리가 이어지고, close가 없으면 진행이 끝날 때 잦아든다.",
  "",
  "| 큐 | 쓰이는 곳 |",
  "|---|---|",
);
for (const d of ["open", "close"]) out.push(`| \`door: ${d}\` | ${where((c) => ("door" in c ? c.door : null), d).join("<br>") || "—"} |`);
out.push("");
section("환경음", AMB, (c) => ("amb" in c ? c.amb : null), (id) => {
  const places = Object.entries(PLACE_AMB).filter(([, ids]) => ids.includes(id)).map(([p]) => (p === "inside" ? "매장 안" : "매장 밖"));
  return places.length ? ` · 기본: ${places.join(", ")}` : "";
});
// 모달·장소가 알아서 트는 소리는 대본에 큐가 없어도 된다
const auto = new Set(["효과음 cctv-on", "효과음 cctv-off", "환경음 store", "환경음 rain-in", "환경음 rain-out", "환경음 street", "환경음 cctv-noise"]);

const warn = unused.filter((u) => !auto.has(u));
if (warn.length) out.push("## 대본에서 안 쓰이는 항목\n", ...warn.map((w) => `- ${w}`), "");

mkdirSync("docs", { recursive: true });
writeFileSync("docs/CUES.md", out.join("\n"));

const count = (k: string) => uses.filter((u) => k in u.cue).length;
console.log(
  `docs/CUES.md · 컷씬 ${count("cut")} · CCTV ${count("cctv")} · 연출 ${count("fx")} · 효과음 ${count("sfx")} · 환경음 ${count("amb")} · 휴대폰 화면 ${count("photo")}`,
);
if (warn.length) console.log(`안 쓰이는 항목: ${warn.join(", ")}`);
