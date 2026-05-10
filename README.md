https://texmexdex.github.io/shaderxr/

# Shader Park → Quest 3 AR

A single-file WebXR viewer for a Shader Park sculpt. Drop your Shader Park code
into `index.html` (see the `spSource` constant) and open the page. On desktop
you get an orbit camera with sliders. On a Quest 3 browser, hit **Enter AR** for
passthrough and grab the sculpt with the controllers.

## How to run

### Desktop (local preview)
1. From this folder, run:
   ```
   powershell -ExecutionPolicy Bypass -File .\serve.ps1
   ```
2. Open `http://localhost:8000/` in Chrome/Edge.

> You can also just double-click `index.html`, but some browsers block ES module
> import maps over `file://`. The server path is more reliable.

### Quest 3 (AR passthrough)
WebXR's `immersive-ar` session requires **HTTPS** (except `localhost`). Easiest
options:

- **ngrok** (recommended):
  1. Start the local server as above.
  2. In another terminal: `ngrok http 8000`
  3. Copy the `https://…ngrok-free.app` URL and open it in the Quest 3 browser.
  4. Tap **Enter AR**. Grant camera/passthrough permission if prompted.

- **Meta Quest Developer Hub** "Proxy" feature or any HTTPS tunnel works too.

- **mkcert / self-signed cert** — more involved; skip unless you already have
  certificates set up.

### Controls in AR
- **Squeeze one controller** → grab and move/rotate the sculpt with that hand.
- **Squeeze both controllers** → pinch to scale, plus positional/rotational
  midpoint control (like grabbing a balloon with two hands).
- **Trigger (select) on either controller** → reset pose to "in front of me".

### Controls on desktop
- Drag to orbit, scroll to zoom.
- Sliders in the top-left tune `size`, `gyroidSteps`, scale, rotation, height.

## Swapping in a different Shader Park sculpt

Open `index.html`, find the `spSource` template string near the top of the
module, and replace it. Any `input(...)` calls become live uniforms with the
variable's name, so if you add `let foo = input(1, 0, 5)` you can read/write
`uniforms.foo.value` from JS.

## How it works (quick)

- `shader-park-core.sculptToThreeJSShaderSource(src)` compiles your JS sculpt
  to GLSL + a uniform descriptor list.
- We build our own `THREE.ShaderMaterial` using those — crucially with the
  **same Three.js instance** that owns the WebXR renderer, so everything
  lives in one WebGL context.
- The raymarch runs inside a `SphereGeometry` bounding mesh (`BackSide` so
  you can pass through it). A parent `Group` takes all transform changes.
- `renderer.xr.enabled = true` + `ARButton` + controller squeeze/select
  events handle the grab/pinch-scale gestures.

## Performance tips

- The Quest 3 renders stereo at ~90Hz with passthrough composited. If the
  shader stutters, reduce `MAX_ITERATIONS` in the generated shader (Shader
  Park defaults to 300 — high). You can lower it by editing the fragment
  source returned from `sculptToThreeJSShaderSource` before handing it to
  `ShaderMaterial`, e.g. `.frag.replace('MAX_ITERATIONS = 300', 'MAX_ITERATIONS = 80')`.
- Keep `stepSize` (uniform `stepSize`) in the 0.7–0.95 range; lower = more
  accurate but slower.
- Non-uniform scaling distorts the SDF. Stick to uniform scaling (which is
  what the two-hand pinch gesture does).
