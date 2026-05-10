https://texmexdex.github.io/shaderxr/

# shaderxr

A collection of small WebXR experiments that run in the Quest 3 browser over
AR passthrough. No build step — each page is a static HTML file that pulls
three.js and shader-park-core from a CDN via an import map.

All demos share a scene-switcher dropdown in the top-right: pick a shader and
the page swaps. In AR you'll drop back to the browser view between scenes
(WebXR sessions can't carry across page navigations), so tap **Enter AR**
again after switching.

## The demos

| URL                   | Source           | Treatment                          |
|-----------------------|------------------|------------------------------------|
| `/`                   | Shader Park SDF  | Raymarched sculpt (gyroid)         |
| `/park-swirl.html`    | Shader Park 2D   | Flat sculpt on a floating panel    |
| `/park-torus.html`    | Shader Park SDF  | Noisy animated torus               |
| `/park-contour.html`  | Shader Park SDF  | Metallic contour-noise torus       |
| `/toy-palette.html`   | Shadertoy frag   | iq-palette fractal portal          |
| `/toy-tunnel.html`    | Shadertoy frag   | Raymarched infinite tunnel portal  |
| `/toy-happy.html`     | Shadertoy frag   | "Happy accident" raymarch portal   |
| `/splat.html`         | Custom GLSL      | 65k GPU-simulated 3D gaussian splats |

## Shader Park demos

Shader Park is a JavaScript DSL that compiles to GLSL. We use
`sculptToThreeJSShaderSource` to get the raw GLSL + uniform descriptors, then
build our own `THREE.ShaderMaterial` with the main Three.js instance (so it
shares a WebGL context with the WebXR renderer). 3D sculpts render inside a
`SphereGeometry` bounding mesh; 2D sculpts (those using `enable2D()`) render
on a `PlaneGeometry`.

Helper: `lib/park-viewer.js` — a single `mountPark(spSource, opts)` call
creates the scene, XR session, grab gestures, and returns `{ uniforms }` for
hooking sliders.

## Shadertoy demos

Shadertoy shaders expect a `void mainImage(out vec4, in vec2)` entrypoint and
standard uniforms (`iTime`, `iResolution`, `iMouse`, `iDate`, `iFrame`,
`iTimeDelta`). We wrap those into a fragment shader attached to a framed,
grabbable floating plane in AR — the "portal panel" approach. 2D shaders
become flat windows; 3D raymarched shaders look like genuine windows into
another dimension.

Helper: `lib/toy-viewer.js` — `mountToy(mainImageSource, opts)` mounts the
panel. Aspect ratio, world-meter width, and internal resolution are tunable.

Not wired (easy to add if you need it): `iChannel0..3`, `iChannelTime`,
`iChannelResolution`. These are the inputs that Shadertoy pipes in from
textures/buffers/audio — the demos we've ported don't use them.

## Procedural gaussian splat field (`/splat.html`)

The most practically interesting demo in terms of where shader work is
heading. 65,536 animated splats with state stored in GPU float textures,
advanced every frame by a ping-pong fragment-shader pass (the WebGL2
equivalent of a WGSL compute shader). Rendered as instanced anisotropic
billboarded gaussians with premultiplied-alpha additive blending, which
composites cleanly against AR passthrough.

Why this matters:
- **Fragment-shader-only** tools like Shadertoy and Shader Park can't express
  per-frame GPU state evolution. Particle sims, fluids, reaction-diffusion,
  neural fields all need this pattern.
- **Gaussian Splatting** is the current frontier for real-time
  photoreal-looking volumetrics. Doing it procedurally sidesteps the
  dataset-dependency barrier while keeping the visual language.
- **WGSL-port-ready**: the sim shader is structured so each fragment maps
  1:1 to a compute-shader invocation. See the comments in `splat.html`.

## Running locally

```
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Open `http://localhost:8000/` in Chrome/Edge.

### Quest 3 AR
WebXR's `immersive-ar` session needs HTTPS. Two options:

1. **Use GitHub Pages** (already set up): open the live URL on the Quest.
2. **ngrok** for local testing: `ngrok http 8000`, then open the
   `https://…ngrok-free.app` URL on the headset.

## Controls

**Desktop:** drag to orbit, scroll to zoom, sliders in the top-left for any
tunable uniforms. On `/splat.html`, hold the mouse to attract particles to
the cursor.

**Quest 3 AR:**
- Squeeze one controller grip to grab and move/rotate.
- Squeeze both to pinch-scale and rotate about the midpoint.
- Pull the trigger to reset the pose.

## Performance tips

- The Quest 3 renders stereo at ~90Hz with passthrough composited. If
  Shader Park demos stutter, lower `MAX_ITERATIONS` by editing the fragment
  string in `lib/park-viewer.js` before it's passed to `ShaderMaterial`
  (default is 300 — try 80).
- On `/splat.html`, drop the **particles** slider if framerate suffers.
- Shadertoy raymarched demos are usually the heaviest. Lower the panel
  `resolution` option in `lib/toy-viewer.js` (default 512–720) for a fps win.

## Adding a new shader

1. **Shader Park sculpt**: copy `park-torus.html`, swap the `spSource`
   template string, tweak `geometry` (`'sphere'` or `'plane'`).
2. **Shadertoy frag**: copy `toy-tunnel.html`, paste your `mainImage`
   function into the `frag` variable, tune `aspect` / `width` / `resolution`.
3. Add it to the manifest in `lib/scene-switch.js` so the dropdown shows it.

## Licensing note

Shadertoy ports include attribution in their HTML files. Please keep those
comments intact when forking.
</content>
