// Fully-immersive 360 shader viewer.
//
// Renders a user-supplied fragment shader onto the INSIDE of a large inverted
// sphere centered on the head. The shader receives:
//
//   vRayDir    : vec3  — world-space normalized view direction per fragment
//   vWorldPos  : vec3  — world-space position on the sphere surface
//   cameraPosition : vec3 (built-in in ShaderMaterial) — head position, PER EYE
//
// Why this gives you 360° stereo for free:
//   The sphere is a fixed object in world space. For each fragment, rd comes
//   from (vWorldPos - cameraPosition). Because cameraPosition is updated per
//   eye by the WebXR camera rig, each eye computes its own ray — and if the
//   shader raymarches from cameraPosition along rd, you get honest stereo
//   parallax in the procedural world.
//
// Perf notes:
//   - We use immersive-ar so the AR button keeps its role across the site,
//     but since the sphere fully surrounds you, passthrough never shows.
//   - setFramebufferScaleFactor lets us render at sub-native resolution to
//     buy perf back on heavy raymarchers without reducing iteration count.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vRayDir;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    // cameraPosition is a THREE built-in, per-eye in XR
    vRayDir = normalize(vWorldPos - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG_PRELUDE = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;
  varying vec3 vRayDir;

  uniform float iTime;
  uniform float iTimeDelta;
  uniform int   iFrame;
  uniform vec3  iResolution;
  uniform vec4  iMouse;
  uniform vec4  iDate;
`;

/**
 * @param {string} fragmentBody
 *   GLSL fragment code that must define `void main()` and may use
 *   `vRayDir`, `vWorldPos`, `cameraPosition`, plus the iTime/iResolution/etc uniforms.
 * @param {object} [options]
 * @param {object} [options.uniforms] - extra uniforms to merge in
 * @param {number} [options.radius=30] - sphere radius in world meters
 * @param {number} [options.frameScale=1.0] - XR framebuffer scale factor (0.7 = 70% resolution)
 * @param {number} [options.fov=1.0] - resolution used by iResolution (for Shadertoy compatibility)
 * @returns {{ uniforms, scene, renderer, material }}
 */
export function mountImmersive(fragmentBody, options = {}) {
  const {
    uniforms: extraUniforms = {},
    radius = 30,
    frameScale = 1.0
  } = options;

  const app = document.getElementById('app') || document.body;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setFramebufferScaleFactor(frameScale);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 1.6, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.6, -0.01);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = -0.3; // invert so desktop dragging feels like looking around

  const uniforms = Object.assign({
    iTime:       { value: 0 },
    iTimeDelta:  { value: 1/60 },
    iFrame:      { value: 0 },
    iResolution: { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    iMouse:      { value: new THREE.Vector4() },
    iDate:       { value: new THREE.Vector4() }
  }, extraUniforms);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG_PRELUDE + '\n' + fragmentBody,
    side: THREE.BackSide,       // render interior of the sphere
    depthWrite: false,
    depthTest: false
  });

  // Inverted sphere (BackSide does the flip; we draw inside it)
  const sphereGeo = new THREE.SphereGeometry(radius, 64, 32);
  const domeMesh = new THREE.Mesh(sphereGeo, material);
  // Keep the dome centered on the head at all times so the user can't walk
  // out of it. We update its position every frame to match the camera.
  scene.add(domeMesh);

  // Floor grid so you have spatial reference while testing on desktop
  // (hidden in VR — the dome fills the view anyway)

  // XR button
  const xrBtnWrap = document.getElementById('xrbtn-wrap');
  if (xrBtnWrap) {
    xrBtnWrap.appendChild(ARButton.createButton(renderer, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking']
    }));
  }

  renderer.xr.addEventListener('sessionstart', () => {
    const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none';
    const sw = document.getElementById('scene-switch'); if (sw) sw.style.display = 'none';
  });
  renderer.xr.addEventListener('sessionend', () => {
    const ui = document.getElementById('ui'); if (ui) ui.style.display = '';
    const sw = document.getElementById('scene-switch'); if (sw) sw.style.display = '';
  });

  // Controllers — used here only for the "reset view / cycle" trigger
  const controllers = [0, 1].map((i) => { const c = renderer.xr.getController(i); scene.add(c); return c; });
  const grips = [0, 1].map((i) => { const g = renderer.xr.getControllerGrip(i); scene.add(g); return g; });
  const modelFactory = new XRControllerModelFactory();
  for (const g of grips) g.add(modelFactory.createControllerModel(g));

  // Expose a simple event hook so pages can wire trigger to something useful
  const listeners = { select: [] };
  for (let i = 0; i < 2; i++) {
    controllers[i].addEventListener('select', () => { for (const fn of listeners.select) fn(i); });
  }

  const clock = new THREE.Clock();
  const headPos = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    uniforms.iTime.value += dt;
    uniforms.iTimeDelta.value = dt;
    uniforms.iFrame.value += 1;

    // Keep the dome centered on the head. The shader uses world-space
    // ray directions so this doesn't break anything — it just ensures the
    // user can't "walk out" of the dome during room-scale motion.
    const xrCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    xrCam.getWorldPosition(headPos);
    domeMesh.position.copy(headPos);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    uniforms.iResolution.value.set(size.x, size.y, 1);

    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    uniforms,
    scene,
    renderer,
    material,
    domeMesh,
    onSelect(fn) { listeners.select.push(fn); }
  };
}
