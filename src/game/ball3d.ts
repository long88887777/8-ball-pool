import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BALL_RADIUS, BALLS, PLAY_AREA, POCKETS, TABLE, type Vector } from './constants';
import type { PhysicsBallSnapshot } from './proPhysics/types';

export type Ball3DDefinition = {
  id: number;
  color: string;
  label?: number;
  stripe?: boolean;
  cueSpot?: boolean;
};

export type Ball3DStatusCallback = (active: boolean) => void;

type PocketAnimation = {
  pocket: Vector;
  elapsed: number;
  duration: number;
  start: THREE.Vector3;
};

const TEXTURE_SIZE = 1024;
const TEXTURE_HEIGHT = 512;
const POCKET_ANIMATION_SECONDS = 0.42;
const BALL_CENTER_Z = 53;
const BALL_SHADOW_Z = 39;
const POCKET_BOTTOM_Z = 7;
const ASSET_ROOT = 'assets';
let nextRendererId = 1;

function hasDevQaFault(name: string): boolean {
  return import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get(name) === '1';
}

/**
 * Three.js owns this transparent layer. Phaser remains responsible for input,
 * HUD, rules and physics; this class mirrors physics snapshots into a lit 3D
 * table and real UV-sphere balls.
 */
export class Ball3DRenderer {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly fallbackBallGeometry: THREE.SphereGeometry;
  private readonly shadowMaterial: THREE.SpriteMaterial;
  private readonly balls = new Map<number, THREE.Object3D>();
  private readonly shadows = new Map<number, THREE.Sprite>();
  private readonly animations = new Map<number, PocketAnimation>();
  private readonly angularVelocities = new Map<number, THREE.Vector3>();
  private readonly textures = new Map<number, THREE.CanvasTexture>();
  private readonly ballMaterials = new Map<number, THREE.Material[]>();
  private readonly tableTextures = new Set<THREE.Texture>();
  private readonly container: HTMLElement;
  private readonly loader = new GLTFLoader();
  private readonly proceduralTable: THREE.Group;
  private readonly onStatusChange: Ball3DStatusCallback;
  private readonly rotationAxis = new THREE.Vector3();
  private readonly rotationDelta = new THREE.Quaternion();
  private tableAsset: THREE.Object3D | null = null;
  private ballAsset: THREE.Object3D | null = null;
  private tableAssetState: 'loading' | 'loaded' | 'failed' = 'loading';
  private available = false;
  private contextLost = false;
  private definitions: Ball3DDefinition[] = [];
  private destroyed = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastPixelRatio = 0;

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.destroyed) return;
    this.contextLost = true;
    this.setAvailable(false, 'context-lost');
  };

  private readonly handleContextRestored = (): void => {
    if (this.destroyed) return;
    this.contextLost = false;
    if (this.tableAssetState !== 'failed') {
      this.setAvailable(true, 'ready');
    }
  };

  constructor(container: HTMLElement, onStatusChange: Ball3DStatusCallback = () => undefined) {
    this.container = container;
    this.onStatusChange = onStatusChange;
    container.querySelectorAll<HTMLCanvasElement>('canvas.pool-balls-3d').forEach((canvas) => canvas.remove());
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      -TABLE.width / 2,
      TABLE.width / 2,
      TABLE.height / 2,
      -TABLE.height / 2,
      0.1,
      2000,
    );
    this.camera.position.set(TABLE.width / 2, TABLE.height / 2, 1200);
    this.camera.lookAt(TABLE.width / 2, TABLE.height / 2, 0);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'pool-balls-3d';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.pointerEvents = 'none';
    this.renderer.domElement.dataset.rendererId = String(nextRendererId++);
    this.renderer.domElement.dataset.tableAsset = 'loading';
    this.renderer.domElement.dataset.ballAsset = 'loading';
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xb9dcff, 0x10161d, 1.55));
    const keyLight = new THREE.DirectionalLight(0xfff0d3, 3.3);
    keyLight.position.set(-220, 470, 850);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -640;
    keyLight.shadow.camera.right = 640;
    keyLight.shadow.camera.top = 420;
    keyLight.shadow.camera.bottom = -420;
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x73bbff, 1.15);
    fillLight.position.set(440, -260, 420);
    this.scene.add(fillLight);

    this.fallbackBallGeometry = new THREE.SphereGeometry(BALL_RADIUS, 48, 32);
    this.shadowMaterial = new THREE.SpriteMaterial({
      map: createShadowTexture(),
      color: 0x07111a,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.proceduralTable = createProceduralTable();
    this.proceduralTable.renderOrder = 0;
    this.scene.add(this.proceduralTable);
    this.resize();
    this.setAvailable(true, 'ready');
    void this.loadAssets();
  }

  static canCreate(container: HTMLElement | null): container is HTMLElement {
    return Boolean(container && typeof document !== 'undefined' && typeof window !== 'undefined');
  }

  private async loadAssets(): Promise<void> {
    const tableAssetUrl = hasDevQaFault('qaFailTable')
      ? `${ASSET_ROOT}/qa-missing-pool-table.glb`
      : `${ASSET_ROOT}/pool-table.glb`;
    const ballAssetUrl = hasDevQaFault('qaFailBall')
      ? `${ASSET_ROOT}/qa-missing-pool-ball.glb`
      : `${ASSET_ROOT}/pool-ball.glb`;
    const [table, ball] = await Promise.allSettled([
      this.loader.loadAsync(tableAssetUrl),
      this.loader.loadAsync(ballAssetUrl),
    ]);
    if (this.destroyed) {
      if (table.status === 'fulfilled') disposeObjectMaterials(table.value.scene);
      if (ball.status === 'fulfilled') disposeObjectMaterials(ball.value.scene);
      return;
    }

    if (table.status === 'fulfilled') {
      this.tableAsset = table.value.scene;
      prepareTableAsset(this.tableAsset, this.tableTextures);
      this.scene.remove(this.proceduralTable);
      this.scene.add(this.tableAsset);
      this.tableAssetState = 'loaded';
      this.renderer.domElement.dataset.tableAsset = 'loaded';
      if (!this.contextLost) this.setAvailable(true, 'ready');
    } else {
      this.tableAssetState = 'failed';
      this.renderer.domElement.dataset.tableAsset = 'failed';
      this.setAvailable(false, 'table-asset-failed');
      console.info('pool-table.glb unavailable; using the Phaser 2D fallback.', table.reason);
    }

    if (ball.status === 'fulfilled') {
      this.ballAsset = ball.value.scene;
      prepareBallAsset(this.ballAsset);
      this.rebuildBallObjects();
      this.renderer.domElement.dataset.ballAsset = 'loaded';
    } else {
      this.renderer.domElement.dataset.ballAsset = 'procedural';
      console.info('pool-ball.glb unavailable; using the Three.js UV-sphere fallback.', ball.reason);
    }
  }

  private setAvailable(active: boolean, status: string): void {
    if (this.destroyed && active) return;
    this.available = active;
    this.renderer.domElement.dataset.status = status;
    this.renderer.domElement.style.display = active ? 'block' : 'none';
    this.onStatusChange(active);
  }

  reset(definitions: Ball3DDefinition[]): void {
    this.definitions = definitions;
    this.clearBallObjects();
    for (const definition of definitions) {
      const texture = createBallTexture3D(definition);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
      const materials = createBallMaterials(texture);
      const object = this.createBallObject(materials);
      object.position.set(TABLE.width / 2, TABLE.height / 2, BALL_CENTER_Z);
      object.rotation.y = -Math.PI / 2;
      object.renderOrder = 4;
      this.scene.add(object);
      this.balls.set(definition.id, object);
      this.textures.set(definition.id, texture);
      this.ballMaterials.set(definition.id, materials);

      const shadow = new THREE.Sprite(this.shadowMaterial.clone());
      shadow.scale.set(BALL_RADIUS * 3.05, BALL_RADIUS * 1.72, 1);
      shadow.position.set(TABLE.width / 2 + 3, TABLE.height / 2 - 2, BALL_SHADOW_Z);
      shadow.renderOrder = 1;
      this.scene.add(shadow);
      this.shadows.set(definition.id, shadow);
    }
  }

  private createBallObject(materials: THREE.Material[]): THREE.Object3D {
    if (!this.ballAsset) {
      const mesh = new THREE.Mesh(this.fallbackBallGeometry, materials[0]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    const object = this.ballAsset.clone(true);
    let materialIndex = 0;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = materials[Math.min(materialIndex, materials.length - 1)];
      materialIndex += 1;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return object;
  }

  private rebuildBallObjects(): void {
    if (!this.ballAsset || this.definitions.length === 0) return;
    const state = this.definitions.map((definition) => {
      const object = this.balls.get(definition.id);
      const shadow = this.shadows.get(definition.id);
      return {
        definition,
        position: object?.position.clone() ?? new THREE.Vector3(TABLE.width / 2, TABLE.height / 2, BALL_CENTER_Z),
        rotation: object?.rotation.clone() ?? new THREE.Euler(),
        scale: object?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
        visible: object?.visible ?? true,
        shadowVisible: shadow?.visible ?? true,
      };
    });
    this.clearBallObjects();
    for (const entry of state) {
      const texture = createBallTexture3D(entry.definition);
      texture.colorSpace = THREE.SRGBColorSpace;
      const materials = createBallMaterials(texture);
      const object = this.createBallObject(materials);
      object.position.copy(entry.position);
      object.rotation.copy(entry.rotation);
      object.scale.copy(entry.scale);
      object.visible = entry.visible;
      object.renderOrder = 4;
      this.scene.add(object);
      this.balls.set(entry.definition.id, object);
      this.textures.set(entry.definition.id, texture);
      this.ballMaterials.set(entry.definition.id, materials);
      const shadow = new THREE.Sprite(this.shadowMaterial.clone());
      shadow.scale.set(BALL_RADIUS * 3.05, BALL_RADIUS * 1.72, 1);
      shadow.position.set(entry.position.x + 3, entry.position.y - 2, BALL_SHADOW_Z);
      shadow.visible = entry.shadowVisible;
      shadow.renderOrder = 1;
      this.scene.add(shadow);
      this.shadows.set(entry.definition.id, shadow);
    }
  }

  private clearBallObjects(): void {
    for (const object of this.balls.values()) {
      this.scene.remove(object);
      // Ball clones share the GLB geometry (or the fallback sphere geometry),
      // so only their per-ball materials are disposed here.
    }
    for (const shadow of this.shadows.values()) {
      this.scene.remove(shadow);
      shadow.material.dispose();
    }
    for (const texture of this.textures.values()) texture.dispose();
    for (const materials of this.ballMaterials.values()) {
      for (const material of materials) material.dispose();
    }
    this.balls.clear();
    this.shadows.clear();
    this.textures.clear();
    this.ballMaterials.clear();
    this.animations.clear();
    this.angularVelocities.clear();
  }

  updateBall(snapshot: PhysicsBallSnapshot, previous: Vector | undefined): void {
    const object = this.balls.get(snapshot.id);
    const shadow = this.shadows.get(snapshot.id);
    if (!object || !shadow || snapshot.pocketed) return;

    const x = snapshot.position.x;
    const y = TABLE.height - snapshot.position.y;
    object.position.set(x, y, BALL_CENTER_Z);
    shadow.position.set(x + 3, y - 2, BALL_SHADOW_Z);
    if (snapshot.angularVelocity) {
      const angularVelocity = this.angularVelocities.get(snapshot.id) ?? new THREE.Vector3();
      angularVelocity.set(
        snapshot.angularVelocity.x,
        snapshot.angularVelocity.y,
        snapshot.angularVelocity.z,
      );
      this.angularVelocities.set(snapshot.id, angularVelocity);
    } else if (previous) {
      const roll = calculateBallRoll(previous, snapshot.position, snapshot.state);
      if (roll) {
        this.applyQuaternionStep(object, roll.x, roll.y, 0, Math.hypot(roll.x, roll.y));
      }
    }
    object.scale.setScalar(1);
    shadow.scale.set(BALL_RADIUS * 3.05, BALL_RADIUS * 1.72, 1);
    shadow.visible = true;
    object.visible = true;
  }

  cancelPocketAnimation(id: number): void {
    this.animations.delete(id);
    const object = this.balls.get(id);
    if (object) {
      object.visible = true;
      object.scale.setScalar(1);
      setObjectOpacity(object, 1);
    }
    const shadow = this.shadows.get(id);
    if (shadow) {
      shadow.visible = true;
      shadow.scale.set(BALL_RADIUS * 3.05, BALL_RADIUS * 1.72, 1);
      shadow.material.opacity = 0.38;
    }
  }

  animatePocket(id: number, pocket: Vector): void {
    const object = this.balls.get(id);
    const shadow = this.shadows.get(id);
    if (!object || !shadow) return;
    this.animations.set(id, {
      pocket,
      elapsed: 0,
      duration: POCKET_ANIMATION_SECONDS,
      start: object.position.clone(),
    });
    shadow.visible = true;
    object.visible = true;
  }

  hideBall(id: number): void {
    const object = this.balls.get(id);
    if (object) object.visible = false;
    const shadow = this.shadows.get(id);
    if (shadow) shadow.visible = false;
    this.animations.delete(id);
  }

  render(deltaSeconds = 0): void {
    if (this.destroyed || !this.available) return;
    const rotationSeconds = Math.min(Math.max(deltaSeconds, 0), 0.05);
    for (const [id, angularVelocity] of this.angularVelocities) {
      if (this.animations.has(id)) continue;
      const object = this.balls.get(id);
      if (!object?.visible) continue;
      const angularSpeed = angularVelocity.length();
      if (angularSpeed > 0.0001 && rotationSeconds > 0) {
        this.applyQuaternionStep(
          object,
          angularVelocity.x,
          angularVelocity.y,
          angularVelocity.z,
          angularSpeed * rotationSeconds,
        );
      }
    }
    for (const [id, animation] of this.animations) {
      const object = this.balls.get(id);
      const shadow = this.shadows.get(id);
      if (!object || !shadow) continue;
      animation.elapsed += Math.max(0, deltaSeconds);
      const progress = Math.min(animation.elapsed / animation.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const target = new THREE.Vector3(animation.pocket.x, TABLE.height - animation.pocket.y, POCKET_BOTTOM_Z);
      object.position.lerpVectors(animation.start, target, eased);
      object.rotation.x += 0.14;
      object.rotation.y += 0.2;
      object.scale.setScalar(1 - eased * 0.72);
      setObjectOpacity(object, 1 - eased);
      shadow.position.set(object.position.x + 3, object.position.y - 2, BALL_SHADOW_Z);
      shadow.scale.setScalar(1 - eased * 0.58);
      shadow.material.opacity = 0.38 * (1 - eased);
      if (progress >= 1) {
        object.visible = false;
        shadow.visible = false;
        setObjectOpacity(object, 1);
        this.animations.delete(id);
      }
    }
    this.resize();
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.calls = String(this.renderer.info.render.calls);
    this.renderer.domElement.dataset.triangles = String(this.renderer.info.render.triangles);
    this.renderer.domElement.dataset.geometries = String(this.renderer.info.memory.geometries);
    this.renderer.domElement.dataset.textures = String(this.renderer.info.memory.textures);
  }

  private applyQuaternionStep(
    object: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    angle: number,
  ): void {
    if (angle <= 0.000001) return;
    this.rotationAxis.set(x, y, z);
    if (this.rotationAxis.lengthSq() <= 0.000001) return;
    this.rotationAxis.normalize();
    this.rotationDelta.setFromAxisAngle(this.rotationAxis, angle);
    object.quaternion.premultiply(this.rotationDelta).normalize();
  }

  resize(): void {
    if (this.destroyed) return;
    const containerRect = this.container.getBoundingClientRect();
    const phaserCanvas = this.container.querySelector<HTMLCanvasElement>('canvas:not(.pool-balls-3d)');
    const rect = phaserCanvas?.getBoundingClientRect() ?? containerRect;
    const width = rect.width || TABLE.width;
    const height = rect.height || TABLE.height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const containerStyle = getComputedStyle(this.container);
    const borderLeft = Number.parseFloat(containerStyle.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(containerStyle.borderTopWidth) || 0;
    const offsetLeft = rect.left - containerRect.left - borderLeft;
    const offsetTop = rect.top - containerRect.top - borderTop;
    this.renderer.domElement.style.left = `${offsetLeft}px`;
    this.renderer.domElement.style.top = `${offsetTop}px`;
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    if (width === this.lastWidth && height === this.lastHeight && pixelRatio === this.lastPixelRatio) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.left = -TABLE.width / 2;
    this.camera.right = TABLE.width / 2;
    this.camera.top = TABLE.height / 2;
    this.camera.bottom = -TABLE.height / 2;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearBallObjects();
    if (this.tableAsset) {
      this.scene.remove(this.tableAsset);
      disposeObjectMaterials(this.tableAsset, true, false);
      this.tableAsset = null;
    }
    if (this.ballAsset) {
      disposeObjectMaterials(this.ballAsset);
      this.ballAsset = null;
    }
    this.scene.remove(this.proceduralTable);
    disposeObjectMaterials(this.proceduralTable);
    this.fallbackBallGeometry.dispose();
    this.shadowMaterial.map?.dispose();
    this.shadowMaterial.dispose();
    for (const texture of this.tableTextures) texture.dispose();
    this.tableTextures.clear();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.onStatusChange(false);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function createBall3DRenderer(
  container: HTMLElement | null,
  onStatusChange: Ball3DStatusCallback = () => undefined,
): Ball3DRenderer | null {
  if (!Ball3DRenderer.canCreate(container)) {
    onStatusChange(false);
    return null;
  }
  try {
    if (hasDevQaFault('qaFailThree')) {
      throw new Error('QA fault injection: Three.js initialization');
    }
    return new Ball3DRenderer(container, onStatusChange);
  } catch (error) {
    onStatusChange(false);
    console.warn('3D pool renderer unavailable; using 2D fallback sprites.', error);
    return null;
  }
}

function createBallMaterials(texture: THREE.CanvasTexture): THREE.MeshStandardMaterial[] {
  return [new THREE.MeshPhysicalMaterial({
    map: texture,
    roughness: 0.075,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.92,
    specularIntensity: 1,
  })];
}

function prepareTableAsset(asset: THREE.Object3D, textureSink: Set<THREE.Texture>): void {
  // Blender's glTF exporter stores a Blender (x, y, z) point as glTF
  // (x, z, -y): Blender's tabletop is the X/Y plane while Three's tabletop
  // is the X/Y plane viewed down -Z. Rotate the imported scene onto that plane
  // and mirror its screen-space Y axis around TABLE.height so the GLB occupies
  // the same 0..TABLE.width x 0..TABLE.height coordinates as Phaser.
  // Three.js accounts for the negative determinant when selecting front
  // faces, so valid exported normals remain sufficient without DoubleSide.
  asset.rotation.x = Math.PI / 2;
  asset.scale.set(1, 1, -1);
  asset.position.y = TABLE.height;
  const preparedMaterials = new Set<THREE.Material>();
  asset.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      material.side = THREE.FrontSide;
      if (!preparedMaterials.has(material)) {
        preparedMaterials.add(material);
        collectMaterialTextures(material, textureSink);
        applyTableMaterialDefaults(material, textureSink);
      }
    }
    child.renderOrder = 0;
  });
}

function applyTableMaterialDefaults(material: THREE.Material, textureSink: Set<THREE.Texture>): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const name = material.name.toLowerCase();
  if (name.includes('cloth')) {
    const cloth = createTableTexture('cloth');
    material.color.set(0xffffff);
    material.map = cloth.color;
    material.bumpMap = cloth.bump;
    material.bumpScale = 0.055;
    material.roughness = 0.91;
    textureSink.add(cloth.color);
    textureSink.add(cloth.bump);
  } else if (name.includes('walnut')) {
    const wood = createTableTexture('wood');
    material.color.set(0xffffff);
    material.map = wood.color;
    material.roughness = 0.3;
    textureSink.add(wood.color);
  } else if (name.includes('dark edge')) {
    material.color.set(0x32130e);
    material.roughness = 0.38;
  } else if (name.includes('rubber')) {
    material.color.set(0x238eaf);
    material.roughness = 0.46;
  } else if (name.includes('leather lip')) {
    material.color.set(0x071923);
    material.roughness = 0.5;
  } else if (name.includes('burgundy outer-wall highlight')) {
    material.color.set(0xa3292d);
    material.emissive.set(0x5a000b);
    material.emissiveIntensity = 0.62;
    material.roughness = 0.68;
  } else if (name.includes('burgundy lining') || name.includes('burgundy inner wall')) {
    material.color.set(0x29070c);
    material.emissive.set(0x160002);
    material.emissiveIntensity = 0.28;
    material.roughness = 0.7;
  } else if (name.includes('black depth')) {
    material.color.set(0x000000);
    material.emissive.set(0x000000);
    material.metalness = 0;
    material.roughness = 1;
  } else if (name.includes('corner guard')) {
    material.color.set(0x929ca6);
    material.metalness = 0.48;
    material.roughness = 0.24;
  }
}

function createTableTexture(kind: 'cloth' | 'wood'): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const width = kind === 'cloth' ? 1024 : 768;
  const height = kind === 'cloth' ? 512 : 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorContext = colorCanvas.getContext('2d');
  if (!colorContext) throw new Error('Canvas 2D context unavailable for table material');
  colorContext.fillStyle = kind === 'cloth' ? '#277fa3' : '#a83b20';
  colorContext.fillRect(0, 0, width, height);

  let seed = kind === 'cloth' ? 0x41a7 : 0x7a31;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  if (kind === 'cloth') {
    const centerGlow = colorContext.createRadialGradient(width * 0.5, height * 0.42, height * 0.04, width * 0.5, height * 0.5, width * 0.54);
    centerGlow.addColorStop(0, 'rgba(168,225,239,0.20)');
    centerGlow.addColorStop(0.54, 'rgba(72,157,194,0.06)');
    centerGlow.addColorStop(1, 'rgba(2,24,57,0.18)');
    colorContext.fillStyle = centerGlow;
    colorContext.fillRect(0, 0, width, height);
    for (let i = 0; i < 42; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radiusX = 32 + random() * 130;
      const radiusY = 18 + random() * 70;
      const haze = colorContext.createRadialGradient(x, y, 0, x, y, radiusX);
      haze.addColorStop(0, random() > 0.48 ? 'rgba(191,226,237,0.055)' : 'rgba(0,23,55,0.062)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      colorContext.save();
      colorContext.translate(x, y);
      colorContext.scale(1, radiusY / radiusX);
      colorContext.translate(-x, -y);
      colorContext.fillStyle = haze;
      colorContext.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
      colorContext.restore();
    }
    for (let i = 0; i < 5200; i += 1) {
      const x = random() * width;
      const y = random() * height;
      colorContext.fillStyle = random() > 0.48
        ? `rgba(226,243,247,${0.007 + random() * 0.012})`
        : `rgba(0,25,55,${0.006 + random() * 0.011})`;
      colorContext.fillRect(x, y, 1, 1);
    }
  } else {
    const woodGlow = colorContext.createLinearGradient(0, 0, 0, height);
    woodGlow.addColorStop(0, 'rgba(255,183,112,0.26)');
    woodGlow.addColorStop(0.34, 'rgba(255,121,61,0.08)');
    woodGlow.addColorStop(1, 'rgba(39,4,2,0.32)');
    colorContext.fillStyle = woodGlow;
    colorContext.fillRect(0, 0, width, height);
    for (let i = 0; i < 92; i += 1) {
      const y = random() * height;
      colorContext.strokeStyle = `rgba(${75 + Math.floor(random() * 70)},${22 + Math.floor(random() * 28)},${10 + Math.floor(random() * 18)},${0.18 + random() * 0.22})`;
      colorContext.lineWidth = 1 + random() * 2;
      colorContext.beginPath();
      colorContext.moveTo(0, y);
      colorContext.bezierCurveTo(width * 0.24, y - 10 + random() * 20, width * 0.72, y + 10 - random() * 20, width, y + random() * 4);
      colorContext.stroke();
    }
    for (let i = 0; i < 260; i += 1) {
      colorContext.fillStyle = `rgba(210,125,70,${0.035 + random() * 0.07})`;
      colorContext.fillRect(random() * width, random() * height, 1 + random() * 4, 1);
    }
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpContext = bumpCanvas.getContext('2d');
  if (!bumpContext) throw new Error('Canvas 2D context unavailable for table bump');
  bumpContext.fillStyle = '#808080';
  bumpContext.fillRect(0, 0, width, height);
  for (let i = 0; i < (kind === 'cloth' ? 6200 : 900); i += 1) {
    const shade = 92 + Math.floor(random() * 80);
    bumpContext.fillStyle = `rgb(${shade},${shade},${shade})`;
    bumpContext.fillRect(random() * width, random() * height, kind === 'cloth' ? 1 : 2 + random() * 3, 1);
  }
  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.wrapS = THREE.ClampToEdgeWrapping;
  colorTexture.wrapT = THREE.ClampToEdgeWrapping;
  bumpTexture.wrapS = THREE.ClampToEdgeWrapping;
  bumpTexture.wrapT = THREE.ClampToEdgeWrapping;
  colorTexture.anisotropy = 8;
  bumpTexture.anisotropy = 8;
  return { color: colorTexture, bump: bumpTexture };
}

function prepareBallAsset(asset: THREE.Object3D): void {
  asset.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function disposeObjectMaterials(object: THREE.Object3D, disposeGeometry = true, disposeTextures = true): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      materials.add(material);
      collectMaterialTextures(material, textures);
    }
  });
  if (disposeGeometry) geometries.forEach((geometry) => geometry.dispose());
  if (disposeTextures) textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function collectMaterialTextures(material: THREE.Material, sink: Set<THREE.Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) sink.add(value);
  }
}

function setObjectOpacity(object: THREE.Object3D, opacity: number): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
    }
  });
}

function createProceduralTable(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4b2115, roughness: 0.35 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x180908, roughness: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x126f78, roughness: 0.82 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x073a48, roughness: 0.56 });
  const black = new THREE.MeshStandardMaterial({ color: 0x010306, roughness: 0.84 });
  const red = new THREE.MeshStandardMaterial({ color: 0x3b0d18, roughness: 0.67 });
  addBox(group, TABLE.width / 2, TABLE.height / 2, 8, TABLE.width - 22, TABLE.height - 22, 34, woodDark, 16);
  addFrame(group, TABLE.width / 2, TABLE.height / 2, TABLE.width - 54, TABLE.height - 54, PLAY_AREA.right - PLAY_AREA.left + 18, PLAY_AREA.bottom - PLAY_AREA.top + 18, 30, 28, wood, 12);
  addBox(group, TABLE.width / 2, TABLE.height / 2, 34, PLAY_AREA.right - PLAY_AREA.left, PLAY_AREA.bottom - PLAY_AREA.top, 8, cloth, 3);
  addBox(group, TABLE.width / 2, PLAY_AREA.top - 3, 52, TABLE.width - 190, 34, 28, rubber, 10);
  addBox(group, TABLE.width / 2, PLAY_AREA.bottom + 3, 52, TABLE.width - 190, 34, 28, rubber, 10);
  addBox(group, PLAY_AREA.left - 3, TABLE.height / 2, 52, 34, PLAY_AREA.bottom - PLAY_AREA.top - 120, 28, rubber, 10);
  addBox(group, PLAY_AREA.right + 3, TABLE.height / 2, 52, 34, PLAY_AREA.bottom - PLAY_AREA.top - 120, 28, rubber, 10);
  POCKETS.forEach(({ x, y }) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(29, 4, 10, 40), rubber);
    rim.position.set(x, TABLE.height - y, 64);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(24, 20, 22, 40), black);
    hole.position.set(x, TABLE.height - y, 47);
    group.add(hole);
    const lining = new THREE.Mesh(new THREE.CylinderGeometry(27, 23, 12, 40), red);
    lining.position.set(x, TABLE.height - y, 56);
    group.add(lining);
  });
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function addBox(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  bevelWidth: number,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (bevelWidth > 0) {
    const inner = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, width - bevelWidth), Math.max(1, height - bevelWidth), depth + 1), material);
    inner.position.copy(mesh.position);
    inner.castShadow = true;
    inner.receiveShadow = true;
    group.add(inner);
  }
}

function addFrame(
  group: THREE.Group,
  centerX: number,
  centerY: number,
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
  z: number,
  depth: number,
  material: THREE.Material,
  bevelWidth: number,
): void {
  const sideWidth = Math.max(4, (outerWidth - innerWidth) / 2);
  const sideHeight = Math.max(4, (outerHeight - innerHeight) / 2);
  addBox(group, centerX, centerY - (outerHeight - sideHeight) / 2, z, outerWidth, sideHeight, depth, material, bevelWidth);
  addBox(group, centerX, centerY + (outerHeight - sideHeight) / 2, z, outerWidth, sideHeight, depth, material, bevelWidth);
  addBox(group, centerX - (outerWidth - sideWidth) / 2, centerY, z, sideWidth, innerHeight, depth, material, bevelWidth);
  addBox(group, centerX + (outerWidth - sideWidth) / 2, centerY, z, sideWidth, innerHeight, depth, material, bevelWidth);
}

function createBallTexture3D(definition: Ball3DDefinition): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable for ball texture');

  const base = definition.color;
  context.fillStyle = definition.stripe ? '#f7f1df' : base;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_HEIGHT);
  if (definition.stripe) {
    const stripeTop = Math.round(TEXTURE_HEIGHT * 0.275);
    const stripeHeight = Math.round(TEXTURE_HEIGHT * 0.45);
    context.fillStyle = base;
    context.fillRect(0, stripeTop, TEXTURE_SIZE, stripeHeight);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(0, stripeTop, TEXTURE_SIZE, 7);
    context.fillStyle = 'rgba(0,0,0,0.12)';
    context.fillRect(0, stripeTop + stripeHeight - 7, TEXTURE_SIZE, 7);
  }
  const sheen = context.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT);
  sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(0.36, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.74, 'rgba(0,0,0,0.025)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  context.fillStyle = sheen;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_HEIGHT);

  if (definition.cueSpot) {
    context.beginPath();
    context.arc(TEXTURE_SIZE / 2, TEXTURE_HEIGHT / 2, 30, 0, Math.PI * 2);
    context.fillStyle = '#c7443a';
    context.fill();
    context.strokeStyle = '#fff4dc';
    context.lineWidth = 6;
    context.stroke();
  } else if (definition.label !== undefined) {
    context.shadowColor = 'rgba(0, 0, 0, 0.24)';
    context.shadowBlur = 10;
    context.shadowOffsetY = 4;
    context.beginPath();
    context.arc(TEXTURE_SIZE / 2, TEXTURE_HEIGHT / 2, 108, 0, Math.PI * 2);
    context.fillStyle = '#fffdf1';
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = 'rgba(30,27,24,0.78)';
    context.lineWidth = 8;
    context.stroke();
    context.fillStyle = '#1d1b18';
    context.font = '900 100px Arial Black, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(definition.label), TEXTURE_SIZE / 2, TEXTURE_HEIGHT / 2 + 3);
  }
  return new THREE.CanvasTexture(canvas);
}

function createShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable for ball shadow');
  const gradient = context.createRadialGradient(64, 36, 5, 64, 36, 62);
  gradient.addColorStop(0, 'rgba(0, 0, 0, .55)');
  gradient.addColorStop(0.52, 'rgba(0, 0, 0, .26)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

export function createDefaultBall3DDefinitions(ballIds?: readonly number[]): Ball3DDefinition[] {
  const definitions: Ball3DDefinition[] = [
    { id: 0, color: '#f7f2df', cueSpot: true },
    ...BALLS.map((ball) => ({ id: ball.id, color: ball.color, label: ball.id, stripe: ball.id >= 9 })),
  ];
  if (!ballIds) return definitions;
  const activeIds = new Set(ballIds);
  return definitions.filter((definition) => activeIds.has(definition.id));
}

export function calculateBallRoll(
  previous: Vector,
  current: Vector,
  state: PhysicsBallSnapshot['state'],
): { x: number; y: number } | null {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if (Math.hypot(dx, dy) <= 0.01) return null;
  const spin = state === 'sliding' ? 0.34 : state === 'rolling' ? 1 : 0.68;
  return { x: (dy / BALL_RADIUS) * spin, y: (dx / BALL_RADIUS) * spin };
}
