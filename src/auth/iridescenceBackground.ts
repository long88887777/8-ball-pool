import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';

export const AUTH_IRIDESCENCE_MOUNT_ID = 'auth-iridescence';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
  gl_FragColor = vec4(col, 1.0);
}
`;

export type IridescenceBackgroundOptions = {
  color?: [number, number, number];
  speed?: number;
  amplitude?: number;
  mouseReact?: boolean;
};

export function createIridescenceBackground(
  container: HTMLElement,
  options: IridescenceBackgroundOptions = {},
  win: Window = window,
): () => void {
  const {
    color = [0.5333333333333333, 0.8352941176470589, 0.8],
    speed = 0.9,
    amplitude = 0.1,
    mouseReact = false,
  } = options;
  const renderer = new Renderer({
    alpha: false,
    antialias: false,
    depth: false,
    dpr: Math.min(win.devicePixelRatio || 1, 1.5),
    stencil: false,
  });
  const gl = renderer.gl;
  gl.clearColor(0.04, 0.08, 0.1, 1);

  const mousePos = { x: 0.5, y: 0.5 };
  let program: Program | null = null;

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    if (program) {
      program.uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / Math.max(1, gl.canvas.height),
      );
    }
  }

  const geometry = new Triangle(gl);
  program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(...color) },
      uResolution: {
        value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / Math.max(1, gl.canvas.height)),
      },
      uMouse: { value: new Float32Array([mousePos.x, mousePos.y]) },
      uAmplitude: { value: amplitude },
      uSpeed: { value: speed },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  gl.canvas.className = 'auth-iridescence-canvas';
  container.appendChild(gl.canvas);
  resize();

  let animationFrameId: number | null = null;
  function update(time: number): void {
    if (!program) return;
    animationFrameId = win.requestAnimationFrame(update);
    program.uniforms.uTime.value = time * 0.001;
    renderer.render({ scene: mesh });
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!program) return;
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = 1.0 - (event.clientY - rect.top) / Math.max(1, rect.height);
    mousePos.x = x;
    mousePos.y = y;
    program.uniforms.uMouse.value[0] = x;
    program.uniforms.uMouse.value[1] = y;
  }

  win.addEventListener('resize', resize);
  if (mouseReact) {
    container.addEventListener('mousemove', handleMouseMove);
  }
  animationFrameId = win.requestAnimationFrame(update);

  return () => {
    if (animationFrameId !== null) {
      win.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    win.removeEventListener('resize', resize);
    if (mouseReact) {
      container.removeEventListener('mousemove', handleMouseMove);
    }
    gl.canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    program = null;
  };
}
