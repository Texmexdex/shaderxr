// Shader Park XR viewer.
// Exports mountPark(spSource, options) which:
//   - compiles the Shader Park source via shader-park-core
//   - wires up a THREE.ShaderMaterial with OUR three instance
//   - builds a grab-and-pinch XR scene with AR passthrough
//   - returns { uniforms } so callers can hook up sliders.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { sculptToThreeJSShaderSource } from 'shader-park-core';

/**
 * @param {string} spSource - Shader Park source code
 * @param {object} [options]
 * @param {'sphere'|'plane'} [options.geometry='sphere'] - bounding mesh shape
 * @param {number} [options.radius=1.0] - sphere radius / plane half-size
 * @param {THREE.Vector3} [options.initialPosition]
 * @param {number} [options.initialScale=0.3]
 * @returns {{ uniforms: object, sculptGroup: THREE.Group, scene: THREE.Scene }}
 */
export function mountPark(spSource, options = {}) {
  const {
    geometry = 'sphere',
    radius = 1.0,
    initialPosition = new THREE.Vector3(0, 1.2, 0),
    initialScale = 0.3
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
  camera.position.set(0, 1.4, 1.2);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(initialPosition);
  controls.enableDamping = true;

  // Compile the Shader Park source
  const sp = sculptToThreeJSShaderSource(spSource);
  if (sp.error) {
    console.error('Shader Park compile error:', sp.error);
    const logEl = document.getElementById('log');
    if (logEl) logEl.textContent = 'Shader Park error: ' + sp.error;
  }

  const uniforms = {};
  for (const u of sp.uniforms) {
    if (u.type === 'float')     uniforms[u.name] = { value: Number(u.value) };
    else if (u.type === 'vec2') uniforms[u.name] = { value: new THREE.Vector2(u.value[0] ?? 0, u.value[1] ?? 0) };
    else if (u.type === 'vec3') uniforms[u.name] = { value: new THREE.Vector3(u.value[0] ?? 0, u.value[1] ?? 0, u.value[2] ?? 0) };
    else if (u.type === 'vec4') uniforms[u.name] = { value: new THREE.Vector4(u.value[0] ?? 0, u.value[1] ?? 0, u.value[2] ?? 0, u.value[3] ?? 0) };
  }
  uniforms.msdf = { value: new THREE.DataTexture(new Uint8Array([0,0,0,0]), 1, 1) };
  uniforms.msdf.value.needsUpdate = true;
  if (uniforms._scale) uniforms._scale.value = radius;
  if (uniforms.opacity) uniforms.opacity.value = 1.0;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: sp.vert,
    fragmentShader: sp.frag,
    transparent: true,
    side: THREE.BackSide
  });

  let geo;
  if (geometry === 'plane') {
    // For 2D Shader Park sculpts (enable2D). We use DoubleSide so either side
    // is visible, and switch to FrontSide culling since there's no volume to
    // raymarch through.
    geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    material.side = THREE.DoubleSide;
  } else {
    geo = new THREE.SphereGeometry(radius, 32, 32);
  }

  const sculptMesh = new THREE.Mesh(geo, material);
  const sculptGroup = new THREE.Group();
  sculptGroup.add(sculptMesh);
  sculptGroup.position.copy(initialPosition);
  sculptGroup.scale.setScalar(initialScale);
  scene.add(sculptGroup);

  const initialPose = {
    position: sculptGroup.position.clone(),
    quaternion: sculptGroup.quaternion.clone(),
    scale: sculptGroup.scale.clone()
  };

  // --- WebXR setup ---
  const xrBtnWrap = document.getElementById('xrbtn-wrap');
  if (xrBtnWrap) {
    xrBtnWrap.appendChild(ARButton.createButton(renderer, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'hit-test']
    }));
  }

  renderer.xr.addEventListener('sessionstart', () => {
    const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none';
    const sw = document.getElementById('scene-switch'); if (sw) sw.style.display = 'none';
    sculptGroup.position.set(0, 1.3, -0.8);
    sculptGroup.quaternion.identity();
    sculptGroup.scale.setScalar(initialScale);
    initialPose.position.copy(sculptGroup.position);
    initialPose.quaternion.copy(sculptGroup.quaternion);
    initialPose.scale.copy(sculptGroup.scale);
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
  for (const c of controllers) {
    const line = new THREE.Line(rayGeo, rayMat); line.scale.z = 2; c.add(line);
  }

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

  const controllerWorld = (c, outPos, outQuat) => {
    c.updateWorldMatrix(true, false);
    c.matrixWorld.decompose(outPos, outQuat, tmpScale);
  };

  const beginOneHand = (idx) => {
    controllers[idx].updateWorldMatrix(true, false);
    sculptGroup.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(controllers[idx].matrixWorld).invert();
    oneHandOffset[idx].multiplyMatrices(inv, sculptGroup.matrixWorld);
    grabbing[idx] = true;
  };
  const endOneHand = (idx) => { grabbing[idx] = false; };

  const beginTwoHand = () => {
    controllerWorld(controllers[0], tmpPosA, tmpQuatA);
    controllerWorld(controllers[1], tmpPosB, tmpQuatB);
    twoHand.startDist = Math.max(0.001, tmpPosA.distanceTo(tmpPosB));
    twoHand.startScale = sculptGroup.scale.x;
    twoHand.startMidPos.addVectors(tmpPosA, tmpPosB).multiplyScalar(0.5);
    twoHand.startMidQuat.copy(tmpQuatA).slerp(tmpQuatB, 0.5);
    twoHand.startGroupPos.copy(sculptGroup.position);
    twoHand.startGroupQuat.copy(sculptGroup.quaternion);
    twoHand.active = true;
    grabbing[0] = false; grabbing[1] = false;
  };
  const endTwoHand = () => { twoHand.active = false; };

  for (let i = 0; i < 2; i++) {
    controllers[i].addEventListener('squeezestart', () => {
      squeezing[i] = true;
      if (squeezing[0] && squeezing[1]) beginTwoHand();
      else beginOneHand(i);
    });
    controllers[i].addEventListener('squeezeend', () => {
      squeezing[i] = false;
      if (twoHand.active) {
        endTwoHand();
        const other = 1 - i;
        if (squeezing[other]) beginOneHand(other);
      } else {
        endOneHand(i);
      }
    });
    controllers[i].addEventListener('select', () => {
      sculptGroup.position.copy(initialPose.position);
      sculptGroup.quaternion.copy(initialPose.quaternion);
      sculptGroup.scale.copy(initialPose.scale);
    });
  }

  const clock = new THREE.Clock();
  const tmpMatrix = new THREE.Matrix4();

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (uniforms.time) uniforms.time.value += dt;

    if (twoHand.active) {
      controllerWorld(controllers[0], tmpPosA, tmpQuatA);
      controllerWorld(controllers[1], tmpPosB, tmpQuatB);

      const dist = Math.max(0.001, tmpPosA.distanceTo(tmpPosB));
      const scale = Math.min(5.0, Math.max(0.02, twoHand.startScale * (dist / twoHand.startDist)));
      sculptGroup.scale.setScalar(scale);

      const midPos = tmpPosA.clone().add(tmpPosB).multiplyScalar(0.5);
      const midQuat = tmpQuatA.clone().slerp(tmpQuatB, 0.5);

      const deltaQuat = midQuat.clone().multiply(twoHand.startMidQuat.clone().invert());
      sculptGroup.quaternion.copy(deltaQuat).multiply(twoHand.startGroupQuat);

      const offsetFromMid = twoHand.startGroupPos.clone().sub(twoHand.startMidPos);
      offsetFromMid.applyQuaternion(deltaQuat);
      sculptGroup.position.copy(midPos).add(offsetFromMid);
    } else {
      for (let i = 0; i < 2; i++) {
        if (grabbing[i]) {
          controllers[i].updateWorldMatrix(true, false);
          tmpMatrix.multiplyMatrices(controllers[i].matrixWorld, oneHandOffset[i]);
          tmpMatrix.decompose(sculptGroup.position, sculptGroup.quaternion, sculptGroup.scale);
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

  return { uniforms, sculptGroup, scene, renderer };
}
