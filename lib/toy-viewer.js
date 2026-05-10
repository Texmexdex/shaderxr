// Shadertoy → XR "portal panel" viewer.
// Wraps a Shadertoy-style `mainImage(out vec4, in vec2)` fragment into a
// THREE.ShaderMaterial and applies it to a grabbable floating plane in AR.
//
// Supported uniforms (pre-declared in the shader):
//   iResolution : vec3   (only .xy used; .z is pixel aspect, = 1)
//   iTime       : float
//   iTimeDelta  : float
//   iFrame      : int
//   iMouse      : vec4
//   iDate       : vec4
// Channels (iChannel0..3, iChannelTime, iChannelResolution) are NOT wired —
// the shaders we're targeting don't use them. Easy to add if needed.
//
// The panel is a flat quad with tunable aspect ratio that you can grab
// (one-hand squeeze = move/rotate, two-hand squeeze = scale) in AR.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG_HEADER = /* glsl */ `
  precision highp float;

  uniform vec3  iResolution;
  uniform float iTime;
  uniform float iTimeDelta;
  uniform int   iFrame;
  uniform vec4  iMouse;
  uniform vec4  iDate;

  varying vec2 vUv;
`;

const FRAG_FOOTER = /* glsl */ `
  void main(){
    vec4 col = vec4(0.0);
    vec2 fragCoord = vUv * iResolution.xy;
    mainImage(col, fragCoord);
    // Shadertoy expects opaque output; force alpha = 1 so additive-free
    // compositing looks right against passthrough.
    gl_FragColor = vec4(col.rgb, 1.0);
  }
`;

/**
 * @param {string} mainImageSource  The Shadertoy snippet, must contain a
 *                                  `void mainImage(out vec4, in vec2)` definition.
 * @param {object} [options]
 * @param {number} [options.aspect=16/9]
 * @param {number} [options.width=1.2]   panel width in world meters
 * @param {number} [options.resolution=512]  internal render resolution (width, height derived from aspect)
 * @param {THREE.Vector3} [options.initialPosition]
 */
export function mountToy(mainImageSource, options = {}) {
  const {
    aspect = 16/9,
    width = 1.2,
    resolution = 512,
    initialPosition = new THREE.Vector3(0, 1.3, -0.6)
  } = options;

  const app = document.getElementById('app') || document.body;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 1.4, 1.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(initialPosition);
  controls.enableDamping = true;

  // Panel dimensions: width in world units; resolution drives the internal
  // pixel grid exposed as iResolution.
  const resX = resolution;
  const resY = Math.round(resolution / aspect);
  const height = width / aspect;

  const uniforms = {
    iResolution: { value: new THREE.Vector3(resX, resY, 1.0) },
    iTime:       { value: 0 },
    iTimeDelta:  { value: 1/60 },
    iFrame:      { value: 0 },
    iMouse:      { value: new THREE.Vector4() },
    iDate:       { value: new THREE.Vector4() }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG_HEADER + '\n' + mainImageSource + '\n' + FRAG_FOOTER,
    side: THREE.DoubleSide
  });

  const panelGeo = new THREE.PlaneGeometry(width, height);
  // Frame around the panel so it reads as a physical object in AR
  const frameGeo = new THREE.PlaneGeometry(width * 1.04, height * 1.04);
  const frameMat = new THREE.MeshBasicMaterial({
    color: 0x0a0d12, transparent: true, opacity: 0.85, side: THREE.DoubleSide
  });

  const panelMesh = new THREE.Mesh(panelGeo, material);
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.z = -0.001; // behind the panel

  const panelGroup = new THREE.Group();
  panelGroup.add(frameMesh);
  panelGroup.add(panelMesh);
  panelGroup.position.copy(initialPosition);
  scene.add(panelGroup);

  const initialPose = {
    position: panelGroup.position.clone(),
    quaternion: panelGroup.quaternion.clone(),
    scale: panelGroup.scale.clone()
  };

  // --- XR controller grab/pinch (same pattern as park-viewer) ---
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
    panelGroup.position.set(0, 1.5, -0.9);
    panelGroup.quaternion.identity();
    panelGroup.scale.setScalar(1);
    initialPose.position.copy(panelGroup.position);
    initialPose.quaternion.copy(panelGroup.quaternion);
    initialPose.scale.copy(panelGroup.scale);
  });
  renderer.xr.addEventListener('sessionend', () => {
    const ui = document.getElementById('ui'); if (ui) ui.style.display = '';
    const sw = document.getElementById('scene-switch'); if (sw) sw.style.display = '';
  });

  const controllers = [0, 1].map((i) => { const c = renderer.xr.getController(i); scene.add(c); return c; });
  const grips = [0, 1].map((i) => { const g = renderer.xr.getControllerGrip(i); scene.add(g); return g; });
  const modelFactory = new XRControllerModelFactory();
  for (const g of grips) g.add(modelFactory.createControllerModel(g));

  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0,0,-1)]);
  const rayMat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45 });
  for (const c of controllers) { const l = new THREE.Line(rayGeo, rayMat); l.scale.z = 2; c.add(l); }

  const squeezing = [false, false];
  const grabbing = [false, false];
  const oneHandOffset = [new THREE.Matrix4(), new THREE.Matrix4()];
  const twoHand = {
    active: false, startDist: 1, startScale: 1,
    startMidPos: new THREE.Vector3(), startMidQuat: new THREE.Quaternion(),
    startGroupPos: new THREE.Vector3(), startGroupQuat: new THREE.Quaternion()
  };
  const tmpPosA = new THREE.Vector3(), tmpPosB = new THREE.Vector3();
  const tmpQuatA = new THREE.Quaternion(), tmpQuatB = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();

  const controllerWorld = (c, op, oq) => {
    c.updateWorldMatrix(true, false);
    c.matrixWorld.decompose(op, oq, tmpScale);
  };

  const beginOneHand = (idx) => {
    controllers[idx].updateWorldMatrix(true, false);
    panelGroup.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(controllers[idx].matrixWorld).invert();
    oneHandOffset[idx].multiplyMatrices(inv, panelGroup.matrixWorld);
    grabbing[idx] = true;
  };
  const beginTwoHand = () => {
    controllerWorld(controllers[0], tmpPosA, tmpQuatA);
    controllerWorld(controllers[1], tmpPosB, tmpQuatB);
    twoHand.startDist = Math.max(0.001, tmpPosA.distanceTo(tmpPosB));
    twoHand.startScale = panelGroup.scale.x;
    twoHand.startMidPos.addVectors(tmpPosA, tmpPosB).multiplyScalar(0.5);
    twoHand.startMidQuat.copy(tmpQuatA).slerp(tmpQuatB, 0.5);
    twoHand.startGroupPos.copy(panelGroup.position);
    twoHand.startGroupQuat.copy(panelGroup.quaternion);
    twoHand.active = true;
    grabbing[0] = false; grabbing[1] = false;
  };

  for (let i = 0; i < 2; i++) {
    controllers[i].addEventListener('squeezestart', () => {
      squeezing[i] = true;
      if (squeezing[0] && squeezing[1]) beginTwoHand();
      else beginOneHand(i);
    });
    controllers[i].addEventListener('squeezeend', () => {
      squeezing[i] = false;
      if (twoHand.active) {
        twoHand.active = false;
        const other = 1 - i;
        if (squeezing[other]) beginOneHand(other);
      } else {
        grabbing[i] = false;
      }
    });
    controllers[i].addEventListener('select', () => {
      panelGroup.position.copy(initialPose.position);
      panelGroup.quaternion.copy(initialPose.quaternion);
      panelGroup.scale.copy(initialPose.scale);
    });
  }

  const clock = new THREE.Clock();
  const tmpMatrix = new THREE.Matrix4();

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    uniforms.iTime.value += dt;
    uniforms.iTimeDelta.value = dt;
    uniforms.iFrame.value += 1;
    const now = new Date();
    uniforms.iDate.value.set(
      now.getFullYear(), now.getMonth(), now.getDate(),
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    );

    if (twoHand.active) {
      controllerWorld(controllers[0], tmpPosA, tmpQuatA);
      controllerWorld(controllers[1], tmpPosB, tmpQuatB);

      const dist = Math.max(0.001, tmpPosA.distanceTo(tmpPosB));
      const scale = Math.min(4.0, Math.max(0.1, twoHand.startScale * (dist / twoHand.startDist)));
      panelGroup.scale.setScalar(scale);

      const midPos = tmpPosA.clone().add(tmpPosB).multiplyScalar(0.5);
      const midQuat = tmpQuatA.clone().slerp(tmpQuatB, 0.5);
      const deltaQuat = midQuat.clone().multiply(twoHand.startMidQuat.clone().invert());
      panelGroup.quaternion.copy(deltaQuat).multiply(twoHand.startGroupQuat);
      const offsetFromMid = twoHand.startGroupPos.clone().sub(twoHand.startMidPos);
      offsetFromMid.applyQuaternion(deltaQuat);
      panelGroup.position.copy(midPos).add(offsetFromMid);
    } else {
      for (let i = 0; i < 2; i++) {
        if (grabbing[i]) {
          controllers[i].updateWorldMatrix(true, false);
          tmpMatrix.multiplyMatrices(controllers[i].matrixWorld, oneHandOffset[i]);
          tmpMatrix.decompose(panelGroup.position, panelGroup.quaternion, panelGroup.scale);
          break;
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if ('xr' in navigator) {
    navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
      if (!ok) {
        const logEl = document.getElementById('log');
        if (logEl) logEl.textContent = 'immersive-ar not supported here. Open on Quest 3 browser for AR.';
      }
    });
  }

  return { uniforms, panelGroup, scene, renderer, panelMesh };
}
