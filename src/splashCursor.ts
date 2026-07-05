export const SPLASH_CURSOR_HOST_ID = 'splash-cursor';

type MinimalElement = {
  id: string;
  style: Partial<CSSStyleDeclaration> & Record<string, string>;
  appendChild(child: MinimalElement): unknown;
  setAttribute(name: string, value: string): void;
};

type SplashCursorDocument<TElement extends MinimalElement = MinimalElement> = {
  createElement(tagName: string): TElement;
};

export type SplashCursorOptions = {
  SIM_RESOLUTION?: number;
  DYE_RESOLUTION?: number;
  CAPTURE_RESOLUTION?: number;
  DENSITY_DISSIPATION?: number;
  VELOCITY_DISSIPATION?: number;
  PRESSURE?: number;
  PRESSURE_ITERATIONS?: number;
  CURL?: number;
  SPLAT_RADIUS?: number;
  SPLAT_FORCE?: number;
  SHADING?: boolean;
  COLOR_UPDATE_SPEED?: number;
  BACK_COLOR?: FluidColor;
  TRANSPARENT?: boolean;
  RAINBOW_MODE?: boolean;
  COLOR?: string;
};

type FluidColor = {
  r: number;
  g: number;
  b: number;
};

type SplashCursorConfig = Required<SplashCursorOptions> & {
  PAUSED: boolean;
};

type PointerState = {
  id: number;
  texcoordX: number;
  texcoordY: number;
  prevTexcoordX: number;
  prevTexcoordY: number;
  deltaX: number;
  deltaY: number;
  down: boolean;
  moved: boolean;
  color: FluidColor;
};

type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

type SupportedFormat = {
  internalFormat: number;
  format: number;
};

type WebGLExtensions = {
  formatRGBA: SupportedFormat | null;
  formatRG: SupportedFormat | null;
  formatR: SupportedFormat | null;
  halfFloatTexType: number | null;
  supportLinearFiltering: boolean;
};

type FramebufferObject = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
};

type DoubleFramebufferObject = {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FramebufferObject;
  write: FramebufferObject;
  swap(): void;
};

export function createSplashCursorHost<TElement extends MinimalElement = MinimalElement>(
  doc: SplashCursorDocument<TElement> = document as unknown as SplashCursorDocument<TElement>,
): { container: TElement; canvas: TElement } {
  const container = doc.createElement('div');
  const canvas = doc.createElement('canvas');

  container.id = SPLASH_CURSOR_HOST_ID;
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    pointerEvents: 'none',
    width: '100%',
    height: '100%',
  });

  canvas.id = 'fluid';
  Object.assign(canvas.style, {
    width: '100vw',
    height: '100vh',
    display: 'block',
  });

  container.appendChild(canvas);
  return { container, canvas };
}

export function installSplashCursor(
  options: SplashCursorOptions = {},
  win: Window = window,
  doc: Document = document,
): () => void {
  doc.getElementById(SPLASH_CURSOR_HOST_ID)?.remove();

  const { container, canvas } = createSplashCursorHost(doc as unknown as SplashCursorDocument);
  doc.body.appendChild(container as unknown as HTMLElement);

  let disposeSimulation: () => void = () => undefined;
  try {
    disposeSimulation = startSplashCursorSimulation(
      canvas as unknown as HTMLCanvasElement,
      options,
      win,
    );
  } catch (error) {
    console.warn('Splash cursor disabled because WebGL initialization failed.', error);
  }

  return () => {
    disposeSimulation();
    (container as unknown as HTMLElement).remove();
  };
}

function createPointer(): PointerState {
  return {
    id: -1,
    texcoordX: 0,
    texcoordY: 0,
    prevTexcoordX: 0,
    prevTexcoordY: 0,
    deltaX: 0,
    deltaY: 0,
    down: false,
    moved: false,
    color: { r: 0, g: 0, b: 0 },
  };
}

function startSplashCursorSimulation(
  canvas: HTMLCanvasElement,
  options: SplashCursorOptions,
  win: Window,
): () => void {
  let config: SplashCursorConfig = {
    SIM_RESOLUTION: options.SIM_RESOLUTION ?? 128,
    DYE_RESOLUTION: options.DYE_RESOLUTION ?? 1440,
    CAPTURE_RESOLUTION: options.CAPTURE_RESOLUTION ?? 512,
    DENSITY_DISSIPATION: options.DENSITY_DISSIPATION ?? 3.5,
    VELOCITY_DISSIPATION: options.VELOCITY_DISSIPATION ?? 2,
    PRESSURE: options.PRESSURE ?? 0.1,
    PRESSURE_ITERATIONS: options.PRESSURE_ITERATIONS ?? 20,
    CURL: options.CURL ?? 3,
    SPLAT_RADIUS: options.SPLAT_RADIUS ?? 0.2,
    SPLAT_FORCE: options.SPLAT_FORCE ?? 6000,
    SHADING: options.SHADING ?? true,
    COLOR_UPDATE_SPEED: options.COLOR_UPDATE_SPEED ?? 10,
    BACK_COLOR: options.BACK_COLOR ?? { r: 0.5, g: 0, b: 0 },
    TRANSPARENT: options.TRANSPARENT ?? true,
    RAINBOW_MODE: options.RAINBOW_MODE ?? true,
    COLOR: options.COLOR ?? '#ff0000',
    PAUSED: false,
  };

  const context = getWebGLContext(canvas);
  if (!context) {
    return () => undefined;
  }

  const { gl, ext } = context;
  if (!ext.formatRGBA || !ext.formatRG || !ext.formatR || ext.halfFloatTexType === null) {
    return () => undefined;
  }

  if (!ext.supportLinearFiltering) {
    config = {
      ...config,
      DYE_RESOLUTION: 256,
      SHADING: false,
    };
  }

  let isActive = true;
  let animationFrameId: number | null = null;
  const pointers = [createPointer()];

  class Material {
    private readonly vertexShader: WebGLShader;
    private readonly fragmentShaderSource: string;
    private readonly programs: Array<WebGLProgram | undefined> = [];
    private activeProgram: WebGLProgram | null = null;
    uniforms: Record<string, WebGLUniformLocation | null> = {};

    constructor(vertexShader: WebGLShader, fragmentShaderSource: string) {
      this.vertexShader = vertexShader;
      this.fragmentShaderSource = fragmentShaderSource;
    }

    setKeywords(keywords: string[]): void {
      let hash = 0;
      for (let i = 0; i < keywords.length; i += 1) hash += hashCode(keywords[i]);

      let program = this.programs[hash];
      if (program === undefined) {
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
        program = createProgram(gl, this.vertexShader, fragmentShader);
        this.programs[hash] = program;
      }

      if (program === this.activeProgram) return;
      this.uniforms = getUniforms(gl, program);
      this.activeProgram = program;
    }

    bind(): void {
      if (this.activeProgram) gl.useProgram(this.activeProgram);
    }
  }

  class Program {
    readonly program: WebGLProgram;
    readonly uniforms: Record<string, WebGLUniformLocation | null>;

    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
      this.program = createProgram(gl, vertexShader, fragmentShader);
      this.uniforms = getUniforms(gl, this.program);
    }

    bind(): void {
      gl.useProgram(this.program);
    }
  }

  const baseVertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;

      void main () {
          vUv = aPosition * 0.5 + 0.5;
          vL = vUv - vec2(texelSize.x, 0.0);
          vR = vUv + vec2(texelSize.x, 0.0);
          vT = vUv + vec2(0.0, texelSize.y);
          vB = vUv - vec2(0.0, texelSize.y);
          gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `,
  );

  const copyShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
          gl_FragColor = texture2D(uTexture, vUv);
      }
    `,
  );

  const clearShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;

      void main () {
          gl_FragColor = value * texture2D(uTexture, vUv);
      }
    `,
  );

  const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        #ifdef SHADING
            vec3 lc = texture2D(uTexture, vL).rgb;
            vec3 rc = texture2D(uTexture, vR).rgb;
            vec3 tc = texture2D(uTexture, vT).rgb;
            vec3 bc = texture2D(uTexture, vB).rgb;

            float dx = length(rc) - length(lc);
            float dy = length(tc) - length(bc);

            vec3 n = normalize(vec3(dx, dy, length(texelSize)));
            vec3 l = vec3(0.0, 0.0, 1.0);

            float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
            c *= diffuse;
        #endif

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
  `;

  const splatShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;

      void main () {
          vec2 p = vUv - point.xy;
          p.x *= aspectRatio;
          vec3 splat = exp(-dot(p, p) / radius) * color;
          vec3 base = texture2D(uTarget, vUv).xyz;
          gl_FragColor = vec4(base + splat, 1.0);
      }
    `,
  );

  const advectionShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform vec2 dyeTexelSize;
      uniform float dt;
      uniform float dissipation;

      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
          vec2 st = uv / tsize - 0.5;
          vec2 iuv = floor(st);
          vec2 fuv = fract(st);

          vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
          vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
          vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
          vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

          return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }

      void main () {
          #ifdef MANUAL_FILTERING
              vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
              vec4 result = bilerp(uSource, coord, dyeTexelSize);
          #else
              vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
              vec4 result = texture2D(uSource, coord);
          #endif
          float decay = 1.0 + dissipation * dt;
          gl_FragColor = result / decay;
      }
    `,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'],
  );

  const divergenceShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uVelocity, vL).x;
          float R = texture2D(uVelocity, vR).x;
          float T = texture2D(uVelocity, vT).y;
          float B = texture2D(uVelocity, vB).y;

          vec2 C = texture2D(uVelocity, vUv).xy;
          if (vL.x < 0.0) { L = -C.x; }
          if (vR.x > 1.0) { R = -C.x; }
          if (vT.y > 1.0) { T = -C.y; }
          if (vB.y < 0.0) { B = -C.y; }

          float div = 0.5 * (R - L + T - B);
          gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `,
  );

  const curlShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uVelocity, vL).y;
          float R = texture2D(uVelocity, vR).y;
          float T = texture2D(uVelocity, vT).x;
          float B = texture2D(uVelocity, vB).x;
          float vorticity = R - L - T + B;
          gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
      }
    `,
  );

  const vorticityShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;

      void main () {
          float L = texture2D(uCurl, vL).x;
          float R = texture2D(uCurl, vR).x;
          float T = texture2D(uCurl, vT).x;
          float B = texture2D(uCurl, vB).x;
          float C = texture2D(uCurl, vUv).x;

          vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
          force /= length(force) + 0.0001;
          force *= curl * C;
          force.y *= -1.0;

          vec2 velocity = texture2D(uVelocity, vUv).xy;
          velocity += force * dt;
          velocity = min(max(velocity, -1000.0), 1000.0);
          gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `,
  );

  const pressureShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;

      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          float divergence = texture2D(uDivergence, vUv).x;
          float pressure = (L + R + B + T - divergence) * 0.25;
          gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
    `,
  );

  const gradientSubtractShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          vec2 velocity = texture2D(uVelocity, vUv).xy;
          velocity.xy -= vec2(R - L, T - B);
          gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `,
  );

  const blit = createBlit(gl);
  let dye: DoubleFramebufferObject | null = null;
  let velocity: DoubleFramebufferObject | null = null;
  let divergence: FramebufferObject | null = null;
  let curl: FramebufferObject | null = null;
  let pressure: DoubleFramebufferObject | null = null;

  const copyProgram = new Program(baseVertexShader, copyShader);
  const clearProgram = new Program(baseVertexShader, clearShader);
  const splatProgram = new Program(baseVertexShader, splatShader);
  const advectionProgram = new Program(baseVertexShader, advectionShader);
  const divergenceProgram = new Program(baseVertexShader, divergenceShader);
  const curlProgram = new Program(baseVertexShader, curlShader);
  const vorticityProgram = new Program(baseVertexShader, vorticityShader);
  const pressureProgram = new Program(baseVertexShader, pressureShader);
  const gradientSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
  const displayMaterial = new Material(baseVertexShader, displayShaderSource);

  function initFramebuffers(): void {
    const simRes = getResolution(gl, config.SIM_RESOLUTION);
    const dyeRes = getResolution(gl, config.DYE_RESOLUTION);
    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    if (texType === null || rgba === null || rg === null || r === null) return;

    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    if (!dye) {
      dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    } else {
      dye = resizeDoubleFBO(gl, copyProgram, blit, dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    }

    if (!velocity) {
      velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    } else {
      velocity = resizeDoubleFBO(gl, copyProgram, blit, velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    }

    divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }

  function updateKeywords(): void {
    const displayKeywords: string[] = [];
    if (config.SHADING) displayKeywords.push('SHADING');
    displayMaterial.setKeywords(displayKeywords);
  }

  let lastUpdateTime = Date.now();
  let colorUpdateTimer = 0;

  function updateFrame(): void {
    if (!isActive) return;
    const dt = calcDeltaTime();
    if (resizeCanvas(canvas, win)) initFramebuffers();
    updateColors(dt);
    applyInputs();
    step(dt);
    render(null);
    animationFrameId = win.requestAnimationFrame(updateFrame);
  }

  function calcDeltaTime(): number {
    const now = Date.now();
    const dt = Math.min((now - lastUpdateTime) / 1000, 0.016666);
    lastUpdateTime = now;
    return dt;
  }

  function updateColors(dt: number): void {
    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
      colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
      pointers.forEach((pointer) => {
        pointer.color = generateColor(config);
      });
    }
  }

  function applyInputs(): void {
    pointers.forEach((pointer) => {
      if (!pointer.moved) return;
      pointer.moved = false;
      splatPointer(pointer);
    });
  }

  function step(dt: number): void {
    if (!velocity || !divergence || !curl || !pressure || !dye) return;

    gl.disable(gl.BLEND);
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i += 1) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    }
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render(target: FramebufferObject | null): void {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    drawDisplay(target);
  }

  function drawDisplay(target: FramebufferObject | null): void {
    if (!dye) return;
    const width = target === null ? gl.drawingBufferWidth : target.width;
    const height = target === null ? gl.drawingBufferHeight : target.height;
    displayMaterial.bind();
    if (config.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1 / width, 1 / height);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    blit(target);
  }

  function splatPointer(pointer: PointerState): void {
    const dx = pointer.deltaX * config.SPLAT_FORCE;
    const dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
  }

  function clickSplat(pointer: PointerState): void {
    const color = generateColor(config);
    color.r *= 10;
    color.g *= 10;
    color.b *= 10;
    const dx = 10 * (Math.random() - 0.5);
    const dy = 30 * (Math.random() - 0.5);
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, color);
  }

  function splat(x: number, y: number, dx: number, dy: number, color: FluidColor): void {
    if (!velocity || !dye) return;

    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(canvas, config.SPLAT_RADIUS / 100));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function updatePointerDownData(pointer: PointerState, id: number, posX: number, posY: number): void {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor(config);
  }

  function updatePointerMoveData(pointer: PointerState, posX: number, posY: number, color: FluidColor): void {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(canvas, pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(canvas, pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    pointer.color = color;
  }

  function updatePointerUpData(pointer: PointerState): void {
    pointer.down = false;
  }

  function handleMouseDown(event: MouseEvent): void {
    const pointer = pointers[0];
    const posX = scaleByPixelRatio(event.clientX, win);
    const posY = scaleByPixelRatio(event.clientY, win);
    updatePointerDownData(pointer, -1, posX, posY);
    clickSplat(pointer);
  }

  let firstMouseMoveHandled = false;
  function handleMouseMove(event: MouseEvent): void {
    const pointer = pointers[0];
    const posX = scaleByPixelRatio(event.clientX, win);
    const posY = scaleByPixelRatio(event.clientY, win);
    if (!firstMouseMoveHandled) {
      const color = generateColor(config);
      updatePointerMoveData(pointer, posX, posY, color);
      firstMouseMoveHandled = true;
    } else {
      updatePointerMoveData(pointer, posX, posY, pointer.color);
    }
  }

  function handleTouchStart(event: TouchEvent): void {
    const pointer = pointers[0];
    for (let i = 0; i < event.targetTouches.length; i += 1) {
      const touch = event.targetTouches[i];
      const posX = scaleByPixelRatio(touch.clientX, win);
      const posY = scaleByPixelRatio(touch.clientY, win);
      updatePointerDownData(pointer, touch.identifier, posX, posY);
    }
  }

  function handleTouchMove(event: TouchEvent): void {
    const pointer = pointers[0];
    for (let i = 0; i < event.targetTouches.length; i += 1) {
      const touch = event.targetTouches[i];
      const posX = scaleByPixelRatio(touch.clientX, win);
      const posY = scaleByPixelRatio(touch.clientY, win);
      updatePointerMoveData(pointer, posX, posY, pointer.color);
    }
  }

  function handleTouchEnd(event: TouchEvent): void {
    const pointer = pointers[0];
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      updatePointerUpData(pointer);
    }
  }

  updateKeywords();
  resizeCanvas(canvas, win);
  initFramebuffers();

  win.addEventListener('mousedown', handleMouseDown);
  win.addEventListener('mousemove', handleMouseMove);
  win.addEventListener('touchstart', handleTouchStart);
  win.addEventListener('touchmove', handleTouchMove);
  win.addEventListener('touchend', handleTouchEnd);
  updateFrame();

  return () => {
    isActive = false;
    if (animationFrameId !== null) {
      win.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    win.removeEventListener('mousedown', handleMouseDown);
    win.removeEventListener('mousemove', handleMouseMove);
    win.removeEventListener('touchstart', handleTouchStart);
    win.removeEventListener('touchmove', handleTouchMove);
    win.removeEventListener('touchend', handleTouchEnd);
  };
}

function getWebGLContext(canvas: HTMLCanvasElement): { gl: GLContext; ext: WebGLExtensions } | null {
  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };
  const webgl2 = canvas.getContext('webgl2', params) as WebGL2RenderingContext | null;
  const webgl = canvas.getContext('webgl', params) as WebGLRenderingContext | null;
  const experimentalWebgl = canvas.getContext('experimental-webgl', params) as WebGLRenderingContext | null;
  const gl: GLContext | null = webgl2 ?? webgl ?? experimentalWebgl;
  if (!gl) return null;

  const isWebGL2 = !!webgl2;
  let halfFloat: OES_texture_half_float | null = null;
  let supportLinearFiltering: boolean;
  if (isWebGL2) {
    (gl as WebGL2RenderingContext).getExtension('EXT_color_buffer_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
  }
  gl.clearColor(0, 0, 0, 1);

  const gl2 = gl as WebGL2RenderingContext;
  const halfFloatTexType = isWebGL2 ? gl2.HALF_FLOAT : halfFloat?.HALF_FLOAT_OES ?? null;
  if (halfFloatTexType === null) return null;

  const formatRGBA = isWebGL2
    ? getSupportedFormat(gl, gl2.RGBA16F, gl.RGBA, halfFloatTexType)
    : getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatRG = isWebGL2
    ? getSupportedFormat(gl, gl2.RG16F, gl2.RG, halfFloatTexType)
    : getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatR = isWebGL2
    ? getSupportedFormat(gl, gl2.R16F, gl2.RED, halfFloatTexType)
    : getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering,
    },
  };
}

function getSupportedFormat(
  gl: GLContext,
  internalFormat: number,
  format: number,
  type: number,
): SupportedFormat | null {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    const gl2 = gl as WebGL2RenderingContext;
    switch (internalFormat) {
      case gl2.R16F:
        return getSupportedFormat(gl, gl2.RG16F, gl2.RG, type);
      case gl2.RG16F:
        return getSupportedFormat(gl, gl2.RGBA16F, gl.RGBA, type);
      default:
        return null;
    }
  }
  return { internalFormat, format };
}

function supportRenderTextureFormat(gl: GLContext, internalFormat: number, format: number, type: number): boolean {
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!texture || !fbo) return false;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

function createProgram(gl: GLContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program.');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Unable to link WebGL program.');
  }
  return program;
}

function getUniforms(gl: GLContext, program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < uniformCount; i += 1) {
    const uniform = gl.getActiveUniform(program, i);
    if (uniform) uniforms[uniform.name] = gl.getUniformLocation(program, uniform.name);
  }
  return uniforms;
}

function compileShader(
  gl: GLContext,
  type: number,
  source: string,
  keywords: string[] | null = null,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader.');
  gl.shaderSource(shader, addKeywords(source, keywords));
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Unable to compile WebGL shader.');
  }
  return shader;
}

function addKeywords(source: string, keywords: string[] | null): string {
  if (!keywords) return source;
  return `${keywords.map((keyword) => `#define ${keyword}\n`).join('')}${source}`;
}

function createBlit(gl: GLContext): (target: FramebufferObject | null, clear?: boolean) => void {
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vertexBuffer || !indexBuffer) throw new Error('Unable to create WebGL buffers.');

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  return (target: FramebufferObject | null, clear = false) => {
    if (target === null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (clear) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
}

function createFBO(
  gl: GLContext,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number,
): FramebufferObject {
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!texture || !fbo) throw new Error('Unable to create WebGL framebuffer.');

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, width, height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    texture,
    fbo,
    width,
    height,
    texelSizeX: 1 / width,
    texelSizeY: 1 / height,
    attach(id: number): number {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };
}

function createDoubleFBO(
  gl: GLContext,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number,
): DoubleFramebufferObject {
  let fbo1 = createFBO(gl, width, height, internalFormat, format, type, param);
  let fbo2 = createFBO(gl, width, height, internalFormat, format, type, param);

  return {
    width,
    height,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    get read() {
      return fbo1;
    },
    set read(value: FramebufferObject) {
      fbo1 = value;
    },
    get write() {
      return fbo2;
    },
    set write(value: FramebufferObject) {
      fbo2 = value;
    },
    swap(): void {
      const temp = fbo1;
      fbo1 = fbo2;
      fbo2 = temp;
    },
  };
}

function resizeFBO(
  gl: GLContext,
  copyProgram: { bind(): void; uniforms: Record<string, WebGLUniformLocation | null> },
  blit: (target: FramebufferObject | null, clear?: boolean) => void,
  target: FramebufferObject,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number,
): FramebufferObject {
  const newFBO = createFBO(gl, width, height, internalFormat, format, type, param);
  copyProgram.bind();
  gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
  blit(newFBO);
  return newFBO;
}

function resizeDoubleFBO(
  gl: GLContext,
  copyProgram: { bind(): void; uniforms: Record<string, WebGLUniformLocation | null> },
  blit: (target: FramebufferObject | null, clear?: boolean) => void,
  target: DoubleFramebufferObject,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number,
): DoubleFramebufferObject {
  if (target.width === width && target.height === height) return target;
  target.read = resizeFBO(gl, copyProgram, blit, target.read, width, height, internalFormat, format, type, param);
  target.write = createFBO(gl, width, height, internalFormat, format, type, param);
  target.width = width;
  target.height = height;
  target.texelSizeX = 1 / width;
  target.texelSizeY = 1 / height;
  return target;
}

function resizeCanvas(canvas: HTMLCanvasElement, win: Window): boolean {
  const width = scaleByPixelRatio(canvas.clientWidth, win);
  const height = scaleByPixelRatio(canvas.clientHeight, win);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function correctRadius(canvas: HTMLCanvasElement, radius: number): number {
  const aspectRatio = canvas.width / canvas.height;
  return aspectRatio > 1 ? radius * aspectRatio : radius;
}

function correctDeltaX(canvas: HTMLCanvasElement, delta: number): number {
  const aspectRatio = canvas.width / canvas.height;
  return aspectRatio < 1 ? delta * aspectRatio : delta;
}

function correctDeltaY(canvas: HTMLCanvasElement, delta: number): number {
  const aspectRatio = canvas.width / canvas.height;
  return aspectRatio > 1 ? delta / aspectRatio : delta;
}

function hexToRGB(hex: string): FluidColor {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return { r: r * 0.15, g: g * 0.15, b: b * 0.15 };
}

function generateColor(config: SplashCursorConfig): FluidColor {
  if (!config.RAINBOW_MODE) {
    return hexToRGB(config.COLOR);
  }
  const color = HSVtoRGB(Math.random(), 1, 1);
  color.r *= 0.15;
  color.g *= 0.15;
  color.b *= 0.15;
  return color;
}

function HSVtoRGB(h: number, s: number, v: number): FluidColor {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    default:
      return { r: v, g: p, b: q };
  }
}

function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
}

function getResolution(gl: GLContext, resolution: number): { width: number; height: number } {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);
  return gl.drawingBufferWidth > gl.drawingBufferHeight
    ? { width: max, height: min }
    : { width: min, height: max };
}

function scaleByPixelRatio(input: number, win: Window): number {
  const pixelRatio = win.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
