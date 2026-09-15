import { useEffect, useRef } from "react";

const BALLS = 7;
const PALETTE_SLOTS = 5;
const RENDER_SCALE = 0.6;
const PALETTE_EASE = 0.055;

const VERTEX_SOURCE = `#version 300 es
in vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform vec3 ground;
uniform vec3 palette[${PALETTE_SLOTS}];

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 centreOf(int index, float t) {
  float i = float(index);
  float slow = 0.11 + 0.035 * mod(i, 4.0);
  float fast = 0.19 + 0.045 * mod(i + 2.0, 3.0);
  float phase = i * 2.399;
  return vec2(
    0.5 + 0.30 * sin(t * slow + phase) + 0.11 * cos(t * fast * 1.31 + phase * 1.7),
    0.5 + 0.33 * cos(t * fast + phase * 1.3) + 0.09 * sin(t * slow * 1.47 + phase)
  );
}

float radiusOf(int index) {
  return 0.23 + 0.17 * hash(vec2(float(index) * 3.71, 7.13));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float drift = time * 0.05;
  vec2 warp = vec2(
    noise(p * 2.4 + vec2(drift, drift * 0.7)),
    noise(p * 2.4 + vec2(drift * 0.6 + 4.7, drift * 0.9 + 2.1))
  ) - 0.5;
  p += warp * 0.07;

  float field = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < ${BALLS}; i++) {
    vec2 centre = centreOf(i, time);
    centre.x *= aspect;
    float r = radiusOf(i);
    vec2 delta = p - centre;
    float weight = (r * r) / (dot(delta, delta) + r * r * 0.62);
    field += weight;
    tint += palette[i % ${PALETTE_SLOTS}] * weight;
  }
  tint /= max(field, 0.0001);

  float groundLuma = dot(ground, vec3(0.2126, 0.7152, 0.0722));
  float onLight = step(0.5, groundLuma);

  float luma = dot(tint, vec3(0.2126, 0.7152, 0.0722));
  tint = clamp(mix(vec3(luma), tint, mix(1.35, 1.95, onLight)), 0.0, 1.0);

  float peak = max(tint.r, max(tint.g, tint.b));
  vec3 vivid = tint / max(peak, 0.04);

  float density = 1.0 - exp(-field * 0.82);
  density = pow(density, mix(1.4, 2.15, onLight));

  vec3 glow = ground + tint * density * 1.38;
  vec3 wash = mix(ground, vivid, density * 0.6);
  vec3 colour = mix(glow, wash, onLight);

  float edge = clamp(length(uv - vec2(0.5, 0.56)) * 1.55, 0.0, 1.0);
  colour *= 1.0 - pow(edge, 2.2) * mix(0.34, 0.06, onLight);

  float lum = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  float ceiling = mix(0.46, 1.0, onLight);
  colour *= lum > ceiling ? ceiling / lum : 1.0;

  colour += (hash(gl_FragCoord.xy + fract(time) * 137.0) - 0.5) / 255.0;

  fragColor = vec4(colour, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

let swatch: CanvasRenderingContext2D | null | undefined;

function swatchContext() {
  if (swatch !== undefined) return swatch;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  swatch = probe.getContext("2d", { willReadFrequently: true });
  return swatch;
}

function readRgb(probe: HTMLElement, value: string): [number, number, number] {
  probe.style.color = "";
  probe.style.color = value;
  const resolved = getComputedStyle(probe).color;
  const ctx = swatchContext();
  if (!ctx) return [0.38, 0.38, 0.38];
  ctx.fillStyle = "#000000";
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function AuroraField({ palette }: { palette: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef(palette);

  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      canvas.hidden = true;
      return;
    }

    const program = link(gl);
    if (!program) {
      canvas.hidden = true;
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    const uResolution = gl.getUniformLocation(program, "resolution");
    const uTime = gl.getUniformLocation(program, "time");
    const uGround = gl.getUniformLocation(program, "ground");
    const uPalette = gl.getUniformLocation(program, "palette");

    const shown = new Float32Array(PALETTE_SLOTS * 3);
    const target = new Float32Array(PALETTE_SLOTS * 3);
    let seeded = false;

    const syncPalette = () => {
      const source = paletteRef.current;
      for (let slot = 0; slot < PALETTE_SLOTS; slot++) {
        const value = source.length ? source[slot % source.length] : "#606060";
        const [r, g, b] = readRgb(canvas, value);
        target[slot * 3] = r;
        target[slot * 3 + 1] = g;
        target[slot * 3 + 2] = b;
      }
      if (!seeded) {
        shown.set(target);
        seeded = true;
      }
    };

    let ground: [number, number, number] = [0.06, 0.07, 0.08];
    const syncGround = () => {
      ground = readRgb(
        canvas,
        getComputedStyle(canvas).getPropertyValue("--bg").trim() || "#101214",
      );
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
      const width = Math.max(1, Math.round(rect.width * density));
      const height = Math.max(1, Math.round(rect.height * density));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    syncPalette();
    syncGround();
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const started = performance.now();
    let frame = 0;
    let paletteTick = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden) return;

      if (now - paletteTick > 400) {
        paletteTick = now;
        syncPalette();
        syncGround();
      }
      for (let i = 0; i < shown.length; i++) {
        shown[i] += (target[i] - shown[i]) * PALETTE_EASE;
      }

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - started) / 1000);
      gl.uniform3f(uGround, ground[0], ground[1], ground[2]);
      gl.uniform3fv(uPalette, shown);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="now-playing-bg-field" aria-hidden="true" />;
}
