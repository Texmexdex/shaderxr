// Shared scene switcher. Include via <script src="./lib/scene-switch.js" defer></script>
// Each page should have a <nav id="scene-switch"></nav> element where the
// dropdown will be injected.

const SCENES = [
  { href: './',                 label: 'gyroid',   group: 'Shader Park' },
  { href: './park-swirl.html',  label: 'swirl',    group: 'Shader Park' },
  { href: './park-torus.html',  label: 'torus',    group: 'Shader Park' },
  { href: './park-contour.html',label: 'contour',  group: 'Shader Park' },
  { href: './toy-palette.html', label: 'palette',  group: 'Shadertoy'   },
  { href: './toy-tunnel.html',  label: 'tunnel',   group: 'Shadertoy'   },
  { href: './toy-happy.html',   label: 'happy bug',group: 'Shadertoy'   },
  { href: './splat.html',       label: 'splats',   group: 'GPGPU'       }
];

(function mountSwitcher(){
  const host = document.getElementById('scene-switch');
  if (!host) return;

  // Current page identification
  const here = location.pathname.replace(/\/+$/, '/').split('/').pop() || '';
  const currentHref = SCENES.find(s => {
    const leaf = s.href.replace(/^\.\//, '').replace(/^\/+/, '');
    if (leaf === '' && (here === '' || here === 'index.html')) return true;
    return leaf === here;
  });

  // Build dropdown grouped by category
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Scene');
  const groups = {};
  for (const s of SCENES) {
    (groups[s.group] = groups[s.group] || []).push(s);
  }
  for (const gname of Object.keys(groups)) {
    const og = document.createElement('optgroup');
    og.label = gname;
    for (const s of groups[gname]) {
      const opt = document.createElement('option');
      opt.value = s.href;
      opt.textContent = s.label;
      if (currentHref && s.href === currentHref.href) opt.selected = true;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }

  sel.addEventListener('change', () => {
    window.location.href = sel.value;
  });

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'scene';

  host.innerHTML = '';
  host.appendChild(label);
  host.appendChild(sel);
})();
