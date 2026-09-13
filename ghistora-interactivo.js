/* Resuelve una variable CSS (incluso oklch/color-mix) a un hex usable en Three.js/Leaflet */
function ghResolveColor(varName, fallback) {
  try {
    const el = document.createElement('div');
    el.style.color = 'var(' + varName + ')';
    el.style.position = 'absolute';
    el.style.opacity = '0';
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/\d+(\.\d+)?/g);
    if (!m) return fallback;
    const [r, g, b] = m.map(Number);
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return fallback;
  }
}

const GH_ACCENT = ghResolveColor('--color-accent-700', '#7d5411');
const GH_PURPLE = ghResolveColor('--gh-purple', '#6f5590');
const GH_BG = ghResolveColor('--color-bg', '#f3f2f2');

/* ======================= GLOBO INTERACTIVO ======================= */
(function () {
  const container = document.getElementById('gh-globe');
  if (!container || typeof THREE === 'undefined') return;
  const w = container.clientWidth, h = container.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.z = 3.2;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  const spinGroup = new THREE.Group();
  scene.add(spinGroup);
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = (23.5 * Math.PI) / 180;
  spinGroup.add(tiltGroup);

  const loader = new THREE.TextureLoader();
  const earthTex = loader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg');
  const geo = new THREE.SphereGeometry(1, 48, 48);
  const earth = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: earthTex }));
  tiltGroup.add(earth);

  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(5, 3, 5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x808080));

  // Red de conexiones con los colores propios de la marca (dorado + morado)
  const netGroup = new THREE.Group();
  const lines = [];
  const segs = 96, R = 1.03;
  const basePts = [];
  for (let s = 0; s <= segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    basePts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0));
  }
  const colorPalette = [new THREE.Color(GH_ACCENT), new THREE.Color(GH_PURPLE)];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.BufferGeometry().setFromPoints(basePts);
    const c = colorPalette[i % 2];
    const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.55 });
    const l = new THREE.Line(g, m);
    l.rotation.x = Math.random() * Math.PI;
    l.rotation.y = Math.random() * Math.PI;
    l.rotation.z = Math.random() * Math.PI;
    l.userData.phase = Math.random() * Math.PI * 2;
    l.userData.speed = 1 + Math.random() * 1.2;
    l.userData.driftX = (Math.random() - 0.5) * 0.006;
    l.userData.driftY = (Math.random() - 0.5) * 0.006;
    lines.push(l);
    netGroup.add(l);
  }
  tiltGroup.add(netGroup);

  let dragging = false, lastX = 0, lastY = 0, t = 0;
  const autoSpinY = 0.0016;
  renderer.domElement.style.cursor = 'grab';
  function onDown(x, y) { dragging = true; lastX = x; lastY = y; }
  function onMove(x, y) {
    if (!dragging) return;
    const dx = x - lastX, dy = y - lastY;
    spinGroup.rotation.y += dx * 0.006;
    spinGroup.rotation.x += dy * 0.006;
    spinGroup.rotation.x = Math.max(-1.3, Math.min(1.3, spinGroup.rotation.x));
    lastX = x; lastY = y;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => onDown(e.clientX, e.clientY));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.z = Math.max(1.6, Math.min(6, camera.position.z + e.deltaY * 0.003));
  }, { passive: false });
  let pinchDist = null;
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  });
  renderer.domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinchDist) camera.position.z = Math.max(1.6, Math.min(6, camera.position.z - (d - pinchDist) * 0.01));
      pinchDist = d;
    }
  }, { passive: false });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.02;
    if (!dragging && !reduceMotion) spinGroup.rotation.y += autoSpinY;
    lines.forEach((l) => {
      l.material.opacity = 0.2 + 0.65 * (0.5 + 0.5 * Math.sin(t * l.userData.speed + l.userData.phase));
      l.rotation.x += l.userData.driftX;
      l.rotation.y += l.userData.driftY;
    });
    renderer.render(scene, camera);
  }
  animate();
})();

/* ======================= CIELO DE LA CABECERA (estrellas + estrella fugaz a pantalla completa) ======================= */
(function () {
  const canvas = document.getElementById('gh-hero-starfield');
  const sky = document.getElementById('gh-hero-sky');
  if (!canvas || !sky) return;
  const ctx = canvas.getContext('2d');
  let w, h, stars = [];
  function resize() {
    w = canvas.width = sky.clientWidth;
    h = canvas.height = sky.clientHeight;
    stars = [];
    const count = Math.floor((w * h) / 3500);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.5 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 2
      });
    }
  }
  resize();
  window.addEventListener('resize', resize);

  let shoot = null, shootNext = 1 + Math.random() * 2;
  function spawnShoot() {
    const fromLeft = Math.random() < 0.5;
    shoot = fromLeft
      ? { x1: -40, y1: Math.random() * h * 0.5, x2: w + 40, y2: h * (0.4 + Math.random() * 0.6) }
      : { x1: w + 40, y1: Math.random() * h * 0.5, x2: -40, y2: h * (0.4 + Math.random() * 0.6) };
    shoot.progress = 0;
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0;
  function frame() {
    requestAnimationFrame(frame);
    t += 0.02;
    ctx.clearRect(0, 0, w, h);
    stars.forEach((s) => {
      const op = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + op + ')';
      ctx.fill();
    });
    if (!reduceMotion) {
      shootNext -= 0.016;
      if (!shoot && shootNext <= 0) spawnShoot();
      if (shoot) {
        shoot.progress += 0.012;
        const p = shoot.progress;
        const x = shoot.x1 + (shoot.x2 - shoot.x1) * p;
        const y = shoot.y1 + (shoot.y2 - shoot.y1) * p;
        const tailLen = 0.1;
        const tp = Math.max(0, p - tailLen);
        const tx = shoot.x1 + (shoot.x2 - shoot.x1) * tp;
        const ty = shoot.y1 + (shoot.y2 - shoot.y1) * tp;
        const fade = p < 0.08 ? p / 0.08 : p > 0.85 ? (1 - p) / 0.15 : 1;
        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(255,255,255,' + 0.9 * fade + ')');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (p >= 1) { shoot = null; shootNext = 3 + Math.random() * 5; }
      }
    }
    ctx.restore && ctx.restore();
  }
  if (!reduceMotion) requestAnimationFrame(frame);
  else { frame(); }
})();

/* ======================= SECCIONES CON FONDO ESTRELLADO (alternas) ======================= */
(function () {
  document.querySelectorAll('.gh-starry').forEach((section) => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none;';
    section.style.position = 'relative';
    section.style.overflow = 'hidden';
    section.insertBefore(canvas, section.firstChild);
    const ctx = canvas.getContext('2d');
    let w, h, stars = [];
    function resize() {
      w = canvas.width = section.clientWidth;
      h = canvas.height = section.clientHeight;
      stars = [];
      const count = Math.floor((w * h) / 6000);
      for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h, r: 0.4 + Math.random() * 1.3, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 1.6 });
      }
    }
    resize();
    window.addEventListener('resize', resize);
    let shoot = null, shootNext = 2 + Math.random() * 4;
    function spawnShoot() {
      const fromLeft = Math.random() < 0.5;
      shoot = fromLeft
        ? { x1: -30, y1: Math.random() * h * 0.5, x2: w + 30, y2: h * (0.3 + Math.random() * 0.6) }
        : { x1: w + 30, y1: Math.random() * h * 0.5, x2: -30, y2: h * (0.3 + Math.random() * 0.6) };
      shoot.progress = 0;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = Math.random() * 10;
    function frame() {
      if (!reduceMotion) requestAnimationFrame(frame);
      t += 0.02;
      ctx.clearRect(0, 0, w, h);
      stars.forEach((s) => {
        const op = 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + op + ')';
        ctx.fill();
      });
      if (!reduceMotion) {
        shootNext -= 0.016;
        if (!shoot && shootNext <= 0) spawnShoot();
        if (shoot) {
          shoot.progress += 0.014;
          const p = shoot.progress;
          const x = shoot.x1 + (shoot.x2 - shoot.x1) * p;
          const y = shoot.y1 + (shoot.y2 - shoot.y1) * p;
          const tp = Math.max(0, p - 0.1);
          const tx = shoot.x1 + (shoot.x2 - shoot.x1) * tp;
          const ty = shoot.y1 + (shoot.y2 - shoot.y1) * tp;
          const fade = p < 0.08 ? p / 0.08 : p > 0.85 ? (1 - p) / 0.15 : 1;
          const grad = ctx.createLinearGradient(tx, ty, x, y);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, 'rgba(255,255,255,' + 0.85 * fade + ')');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (p >= 1) { shoot = null; shootNext = 4 + Math.random() * 6; }
        }
      }
    }
    frame();
  });
})();

/* ======================= VISOR DE PROYECTOS (caso Ribera de Arriba) ======================= */
(function () {
  const mapEl = document.getElementById('gh-visor-map');
  if (!mapEl || typeof L === 'undefined') return;

  const map = L.map(mapEl, { zoomControl: false, scrollWheelZoom: false }).setView([43.298, -5.849], 13);
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '', maxZoom: 17, subdomains: 'abc'
  }).addTo(map);

  const resultados = [
    { src: 'assets/caso-relieve.jpg', alt: 'Relieve del territorio de Ribera de Arriba' },
    { src: 'assets/caso-curvas-nivel.jpg', alt: 'Curvas de nivel de Ribera de Arriba' },
    { src: 'assets/caso-parcelario.jpg', alt: 'Fragmentación parcelaria catastral de Ribera de Arriba' },
    { src: 'assets/caso-cambios-nbr.jpg', alt: 'Detección de cambios NBR 2018-2026 en Ribera de Arriba' }
  ];
  let idx = 0;

  const icon = L.divIcon({
    className: '',
    html: '<div class="gh-marker-pulse" style="width:40px;height:40px;border-radius:50%;background:rgba(220,38,38,0.85);border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;cursor:pointer; overflow:hidden;"><img src="assets/logo-ghistora-lupa-blanco.svg" alt="" style="width:75%; height:75%; object-fit:contain;"></div>',
    iconSize: [40, 40], iconAnchor: [20, 20]
  });
  const marker = L.marker([43.298, -5.849], { icon }).addTo(map);

  function popupHtml() {
    const r = resultados[idx];
    return '<div style="text-align:center; max-width:220px; font-family:var(--font-body);">' +
      '<img src="' + r.src + '" alt="' + r.alt + '" style="width:100%; border-radius:2px; box-shadow:0 0 0 2px ' + GH_ACCENT + ', 0 0 0 4px ' + GH_PURPLE + ';">' +
      '<p style="font-size:12px; margin:8px 0 4px; color:#201f1d;">' + r.alt + '</p>' +
      '<p style="font-size:11px; color:#7d7979; margin:0;">' + (idx + 1) + ' de ' + resultados.length + ' · toca la lupa para ver el siguiente</p>' +
      '</div>';
  }
  marker.bindPopup(popupHtml());
  marker.on('click', () => {
    idx = (idx + 1) % resultados.length;
    marker.setPopupContent(popupHtml());
    marker.openPopup();
  });
  setTimeout(() => map.invalidateSize(), 300);
})();

/* ======================= FORMULARIO DE CONTACTO ======================= */
(function () {
  const form = document.getElementById('gh-contact-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    if (form.action.includes('TU_ID_AQUI')) {
      e.preventDefault();
      alert('Falta configurar el ID de Formspree en el action del formulario.');
      return;
    }
    e.preventDefault();
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (res.ok) {
        document.getElementById('gh-form-ok').hidden = false;
        form.reset();
      }
    } catch (err) { console.error(err); }
  });
})();
