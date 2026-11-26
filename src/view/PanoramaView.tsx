import type { TargetedPointerEvent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import panoUrl from "../assets/store/pano.webp";
import { BACKDROPS, type BackdropId } from "../game/media";
import { FRAG, PANO, STOPS, VERT, geometry } from "./projection";

type Props = {
  /** 바꿔 끼울 매장 배경 (media.ts BACKDROPS). 없으면 기본 배경. 바뀌면 새 그림을 다 받은 뒤 DISSOLVE_MS 동안 겹쳐 넘어간다 */
  backdrop?: BackdropId | null;
  /** 장면이 바라보게 할 방향(도). 바뀌면 그쪽으로 부드럽게 돌아간다 */
  lookDeg: number;
  /** 파니니 정도. 0 = 일반 원근(기본) */
  panini?: number;
  /** 지금 보고 있는 방향(도)이 바뀔 때마다. 드래그·버튼·장면 전환 애니메이션 모두 */
  onYaw?: (deg: number) => void;
};

type GL = {
  gl: WebGLRenderingContext;
  /** 그림 두 장: tex[cur] = 지금 그림, tex[1 - cur] = 디졸브로 넘어갈 그림 */
  tex: [WebGLTexture | null, WebGLTexture | null];
  cur: 0 | 1;
  /** 디졸브 진행 (0 = 지금 그림만) */
  mix: number;
  u: Record<"res" | "f" | "cy" | "yaw" | "d" | "pano" | "mixv", WebGLUniformLocation | null>;
  ready: boolean;
};

/** 배경이 바뀔 때 겹쳐 넘어가는 시간 */
export const DISSOLVE_MS = 150;

const backdrops = import.meta.glob<string>("../assets/store/pano_*.webp", { eager: true, query: "?url", import: "default" });
const backdropUrl = (id: BackdropId) => backdrops[`../assets/store/pano_${id}.webp`];
if (import.meta.env.DEV)
  for (const id of Object.keys(BACKDROPS) as BackdropId[])
    if (!backdropUrl(id)) console.warn(`[매장 배경] src/assets/store/pano_${id}.webp 가 없습니다`);

/** 배경이 바뀔 때 늦게 뜨지 않도록 미리 받아 둔다 */
export function preloadBackdrops() {
  for (const url of Object.values(backdrops)) new Image().src = url;
}

const DEG = Math.PI / 180;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 계산대 뒤에서 본 매장. 원통형 파노라마를 원근 보정해서 그린다 */
export function PanoramaView({ backdrop, lookDeg, panini = 0, onYaw }: Props) {
  const src = (backdrop && backdropUrl(backdrop)) || panoUrl;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const yawRef = useRef(lookDeg * DEG);
  const animRef = useRef(0);
  const dragRef = useRef<{ x: number; yaw: number } | null>(null);
  const onYawRef = useRef(onYaw);
  onYawRef.current = onYaw;
  const [edges, setEdges] = useState({ start: false, end: false });
  const [fallback, setFallback] = useState(false);

  const geom = useCallback(() => {
    const c = canvasRef.current!;
    return geometry(c.width, c.height, panini);
  }, [panini]);

  const clampYaw = useCallback(
    (yaw: number) => {
      const { yawMax } = geom();
      return Math.max(-yawMax, Math.min(yawMax, yaw));
    },
    [geom],
  );

  const stops = useCallback(() => {
    const c = canvasRef.current!;
    const list = c.width < c.height ? STOPS.portrait : STOPS.landscape;
    const values = list.map((s) => clampYaw(s.deg * DEG));
    return values.filter((v, i) => i === 0 || Math.abs(v - values[i - 1]) > 0.01);
  }, [clampYaw]);

  const updateEdges = useCallback(() => {
    const s = stops();
    const yaw = yawRef.current;
    setEdges({ start: yaw <= s[0] + 0.01, end: yaw >= s[s.length - 1] - 0.01 });
  }, [stops]);

  const draw = useCallback(() => {
    const g = glRef.current;
    const c = canvasRef.current;
    if (!g?.ready || !c) return;
    const { gl, u } = g;
    const { f, cy } = geom();
    yawRef.current = clampYaw(yawRef.current);
    gl.viewport(0, 0, c.width, c.height);
    gl.uniform2f(u.res, c.width, c.height);
    gl.uniform1f(u.f, f);
    gl.uniform1f(u.cy, cy);
    gl.uniform1f(u.yaw, yawRef.current);
    onYawRef.current?.(yawRef.current / DEG);
    gl.uniform1f(u.d, panini);
    gl.uniform4f(u.pano, PANO.uMin, PANO.uMax, PANO.vTop, PANO.vBot);
    gl.uniform1f(u.mixv, g.mix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.tex[g.cur]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, g.tex[1 - g.cur]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [clampYaw, geom, panini]);

  const animateTo = useCallback(
    (target: number) => {
      cancelAnimationFrame(animRef.current);
      const to = clampYaw(target);
      const from = yawRef.current;
      const dur = reducedMotion() ? 0 : 450 + Math.abs(to - from) * 250;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = dur ? Math.min(1, (now - t0) / dur) : 1;
        const e = 1 - Math.pow(1 - t, 3);
        yawRef.current = from + (to - from) * e;
        draw();
        if (t < 1) animRef.current = requestAnimationFrame(step);
        else updateEdges();
      };
      animRef.current = requestAnimationFrame(step);
    },
    [clampYaw, draw, updateEdges],
  );

  // WebGL 준비 + 파노라마 불러오기
  useEffect(() => {
    const c = canvasRef.current!;
    const gl = c.getContext("webgl", { antialias: false });
    if (!gl) {
      setFallback(true);
      return;
    }
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const texture = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
        [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      ])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
      // 아직 그림이 없는 쪽도 그릴 수 있게 1픽셀로 채워 둔다
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 20, 23, 255]));
      return t;
    };
    const U = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(U("tex"), 0);
    gl.uniform1i(U("tex2"), 1);
    glRef.current = {
      gl,
      tex: [texture(), texture()],
      cur: 0,
      mix: 0,
      ready: false,
      u: { res: U("res"), f: U("f"), cy: U("cy"), yaw: U("yaw"), d: U("d"), pano: U("pano"), mixv: U("mixv") },
    };
    return () => cancelAnimationFrame(animRef.current);
    // 처음 한 번만
  }, []);

  // 파노라마 불러오기. 새 그림을 다 받을 때까지는 앞 그림을 그대로 두고, 받으면 DISSOLVE_MS 동안 겹쳐 넘어간다.
  // 처음 그림은 바로 그린다
  useEffect(() => {
    const g = glRef.current;
    if (!g) return;
    let alive = true;
    let raf = 0;
    let fading = false;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const { gl } = g;
      const first = !g.ready;
      const next = first ? g.cur : ((1 - g.cur) as 0 | 1);
      gl.activeTexture(gl.TEXTURE0 + next);
      gl.bindTexture(gl.TEXTURE_2D, g.tex[next]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      g.ready = true;
      if (first || reducedMotion()) {
        g.cur = next;
        g.mix = 0;
        draw();
        updateEdges();
        return;
      }
      fading = true;
      const t0 = performance.now();
      const step = (now: number) => {
        g.mix = Math.min(1, (now - t0) / DISSOLVE_MS);
        if (g.mix >= 1) {
          g.cur = next;
          g.mix = 0;
          fading = false;
        }
        draw();
        if (fading) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    img.src = src;
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      // 넘어가는 중에 또 바뀌면 지금 넘어가던 그림으로 바로 마치고 다음 그림을 받는다
      if (fading) {
        g.cur = (1 - g.cur) as 0 | 1;
        g.mix = 0;
        draw();
      }
    };
    // draw·updateEdges 는 panini 가 바뀌지 않는 한 같은 함수다
  }, [src]);

  // 크기 맞추기
  useEffect(() => {
    const c = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      draw();
      updateEdges();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [draw, updateEdges]);

  // 장면이 바뀌면 그 방향으로
  useEffect(() => {
    if (glRef.current) animateTo(lookDeg * DEG);
  }, [lookDeg, animateTo]);

  function step(dir: -1 | 1) {
    const s = stops();
    const yaw = yawRef.current;
    const target = dir > 0 ? s.find((v) => v > yaw + 0.01) : [...s].reverse().find((v) => v < yaw - 0.01);
    if (target !== undefined) animateTo(target);
  }

  function onPointerDown(e: TargetedPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    cancelAnimationFrame(animRef.current);
    dragRef.current = { x: e.clientX, yaw: yawRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: TargetedPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const c = canvasRef.current;
    if (!drag || !c) return;
    const dpr = c.width / c.getBoundingClientRect().width;
    yawRef.current = drag.yaw - ((e.clientX - drag.x) * dpr) / geom().f;
    draw();
  }
  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    updateEdges();
  }

  return (
    <div
      className="pano"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={fallback ? { backgroundImage: `url(${src})` } : undefined}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <button className="look look-prev" aria-label="왼쪽 보기" disabled={edges.start} onClick={() => step(-1)}>
        ‹
      </button>
      <button className="look look-next" aria-label="오른쪽 보기" disabled={edges.end} onClick={() => step(1)}>
        ›
      </button>
    </div>
  );
}
