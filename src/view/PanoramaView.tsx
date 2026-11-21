import { useCallback, useEffect, useRef, useState } from "react";
import panoUrl from "../assets/store/pano.webp";
import { FRAG, PANO, STOPS, VERT, geometry } from "./projection";

type Props = {
  /** 장면이 바라보게 할 방향(도). 바뀌면 그쪽으로 부드럽게 돌아간다 */
  lookDeg: number;
  /** 파니니 정도. 0 = 일반 원근(기본) */
  panini?: number;
};

type GL = {
  gl: WebGLRenderingContext;
  u: Record<"res" | "f" | "cy" | "yaw" | "d" | "pano", WebGLUniformLocation | null>;
  ready: boolean;
};

const DEG = Math.PI / 180;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 계산대 뒤에서 본 매장. 원통형 파노라마를 원근 보정해서 그린다 */
export function PanoramaView({ lookDeg, panini = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const yawRef = useRef(lookDeg * DEG);
  const animRef = useRef(0);
  const dragRef = useRef<{ x: number; yaw: number } | null>(null);
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
    gl.uniform1f(u.d, panini);
    gl.uniform4f(u.pano, PANO.uMin, PANO.uMax, PANO.vTop, PANO.vBot);
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
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    glRef.current = { gl, ready: false, u: { res: U("res"), f: U("f"), cy: U("cy"), yaw: U("yaw"), d: U("d"), pano: U("pano") } };

    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      glRef.current!.ready = true;
      draw();
      updateEdges();
    };
    img.src = panoUrl;
    return () => cancelAnimationFrame(animRef.current);
    // 처음 한 번만. draw·updateEdges 는 panini 가 바뀌지 않는 한 같은 함수다
  }, []);

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

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    cancelAnimationFrame(animRef.current);
    dragRef.current = { x: e.clientX, yaw: yawRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
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
      style={fallback ? { backgroundImage: `url(${panoUrl})` } : undefined}
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
