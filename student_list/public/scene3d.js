import * as THREE from '/vendor/three/three.module.js';

// One canvas, one camera, one scroll story. All usable content stays in the DOM.
const canvas = document.getElementById('scene-canvas');
const hero = document.getElementById('overview');
const bridge = document.getElementById('journey');
const dashboard = document.getElementById('dashboard');
const directory = document.getElementById('student-list');
const dashboardIntro = document.querySelector('.dashboard-intro');
const statSurfaces = [...document.querySelectorAll('.stat-tile .stat-surface')];
const formPanel = document.querySelector('.form-panel');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

if (canvas && hero && bridge && dashboard && directory && !reduced.matches) {
  try {
    startScene();
  } catch (error) {
    // The CSS constellation remains usable when WebGL is unavailable.
    console.warn('3D scene unavailable:', error);
  }
}

function startScene() {
  const CONFIG = {
    cyan: 0x73f0ff,
    violet: 0x9b82ff,
    blue: 0x447bea,
    stars: 90,
  };
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => mix(a, b, 1 - Math.exp(-lambda * dt));
  const mobile = () => window.innerWidth < 768;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050816, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
  camera.position.z = 10.5;
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.AmbientLight(0x91a4e8, 1.7));
  const key = new THREE.PointLight(CONFIG.cyan, 42, 18);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.PointLight(CONFIG.violet, 32, 18);
  rim.position.set(-3, -2, -2);
  scene.add(rim);

  // A faceted shared core stays visible while the individual records orbit it.
  const coreGeometry = new THREE.IcosahedronGeometry(1.13, 3);
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x162751, metalness: 0.48, roughness: 0.24,
    clearcoat: 0.9, clearcoatRoughness: 0.12,
    emissive: 0x152b68, emissiveIntensity: 0.5, flatShading: true,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  world.add(core);
  const cageSourceGeometry = new THREE.IcosahedronGeometry(1.27, 1);
  const cageGeometry = new THREE.EdgesGeometry(cageSourceGeometry);
  cageSourceGeometry.dispose();
  const cageMaterial = new THREE.LineBasicMaterial({ color: CONFIG.cyan, transparent: true, opacity: 0.34 });
  const cage = new THREE.LineSegments(cageGeometry, cageMaterial);
  world.add(cage);

  const ringGeometry = new THREE.TorusGeometry(1.84, 0.012, 5, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: CONFIG.cyan, transparent: true, opacity: 0.44 });
  const rings = [0, 1, 2].map(index => {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.set(index * 0.74 + 0.28, index * 0.91 + 0.22, index * 0.35);
    world.add(ring);
    return ring;
  });

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const context = glowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(137,246,255,.66)');
  gradient.addColorStop(0.25, 'rgba(70,154,255,.23)');
  gradient.addColorStop(1, 'rgba(70,154,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: CONFIG.blue, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.72,
  }));
  coreGlow.scale.set(5.4, 5.4, 1);
  coreGlow.position.z = -0.9;
  world.add(coreGlow);

  const nodeGeometry = new THREE.IcosahedronGeometry(0.15, 1);
  const pageGeometry = new THREE.PlaneGeometry(3.2, 4.5);
  const pageMaterial = new THREE.MeshBasicMaterial({
    color: 0x091b38, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
  const pagePanel = new THREE.Mesh(pageGeometry, pageMaterial);
  pagePanel.position.set(1.65, 0, -0.45);
  world.add(pagePanel);
  const pageBorderGeometry = new THREE.EdgesGeometry(pageGeometry);
  const pageBorderMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.cyan, transparent: true, opacity: 0,
  });
  const pageBorder = new THREE.LineSegments(pageBorderGeometry, pageBorderMaterial);
  pageBorder.position.copy(pagePanel.position);
  world.add(pageBorder);
  const students = [];
  const connections = new Float32Array(5 * 6);
  const connectionGeometry = new THREE.BufferGeometry();
  connectionGeometry.setAttribute('position', new THREE.BufferAttribute(connections, 3));
  const connectionMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.cyan, transparent: true, opacity: 0.16, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const network = new THREE.LineSegments(connectionGeometry, connectionMaterial);
  world.add(network);
  function labelTexture(student, index) {
    const surface = document.createElement('canvas');
    surface.width = 768;
    surface.height = 160;
    const ctx = surface.getContext('2d');
    const color = index % 2 ? '#ac94ff' : '#82f2ff';
    ctx.fillStyle = 'rgba(9,23,50,.96)';
    ctx.fillRect(2, 2, 764, 156);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 762, 154);
    ctx.fillStyle = color;
    ctx.fillRect(3, 3, 7, 154);
    ctx.fillStyle = 'rgba(48,72,118,.72)';
    ctx.beginPath();
    ctx.roundRect(20, 39, 82, 82, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139,173,255,.55)';
    ctx.stroke();
    ctx.fillStyle = '#b8eefa';
    ctx.font = '700 34px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(student.initials || '?').trim().slice(0, 3), 61, 81);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f4f8ff';
    let size = 42;
    do {
      ctx.font = '600 ' + size + 'px "Segoe UI", sans-serif';
      if (ctx.measureText(student.name).width <= 600) break;
      size -= 2;
    } while (size > 22);
    ctx.fillText(student.name, 118, 69, 610);
    ctx.fillStyle = '#a9c6e5';
    ctx.font = '26px "Segoe UI", sans-serif';
    ctx.fillText(student.studentId ? 'MSSV · ' + student.studentId : 'Hồ sơ sinh viên', 118, 120);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function titleTexture(count) {
    const surface = document.createElement('canvas');
    surface.width = 768;
    surface.height = 112;
    const ctx = surface.getContext('2d');
    ctx.fillStyle = '#89ecff';
    ctx.font = '700 44px "Segoe UI", sans-serif';
    ctx.fillText('TRANG 01', 8, 60);
    ctx.fillStyle = '#d9e8ff';
    ctx.font = '28px "Segoe UI", sans-serif';
    ctx.fillText('· ' + count + ' HỒ SƠ', 270, 58);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  let pageTitle;
  function setPageOne(data) {
    for (const student of students) {
      world.remove(student.node, student.label);
      student.node.material.dispose();
      student.label.material.map.dispose();
      student.label.material.dispose();
    }
    students.length = 0;
    if (pageTitle) {
      world.remove(pageTitle);
      pageTitle.material.map.dispose();
      pageTitle.material.dispose();
    }
    data.slice(0, 5).forEach((student, index) => {
      const node = new THREE.Mesh(nodeGeometry, new THREE.MeshBasicMaterial({
        color: index % 2 ? CONFIG.violet : CONFIG.cyan, toneMapped: false, transparent: true,
      }));
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture(student, index), transparent: true,
        opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
      }));
      label.scale.set(2.9, 0.62, 1);
      world.add(node, label);
      students.push({ node, label });
    });
    pageTitle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: titleTexture(students.length), transparent: true,
      opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    pageTitle.position.set(1.65, 2.02, 0.12);
    pageTitle.scale.set(2.9, 0.43, 1);
    world.add(pageTitle);
    connectionGeometry.setDrawRange(0, students.length * 2);
    if (metrics) wake();
  }
  function readPageOne() {
    return [...document.querySelectorAll('#student-rows .student-row')].slice(0, 5)
      .map(row => ({
        name: row.dataset.name,
        studentId: row.dataset.studentId,
        initials: row.querySelector('.student-avatar')?.textContent.trim() || '?',
      }));
  }

  const starPositions = new Float32Array(CONFIG.stars * 3);
  for (let i = 0; i < CONFIG.stars; i++) {
    const seed = i * 127.1;
    const random = offset => {
      const value = Math.sin(seed + offset) * 43758.5453;
      return value - Math.floor(value);
    };
    starPositions[i * 3] = (random(1.4) - 0.5) * 18;
    starPositions[i * 3 + 1] = (random(7.3) - 0.5) * 12;
    starPositions[i * 3 + 2] = (random(3.7) - 0.5) * 11 - 4;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0x9baeff, size: 0.028, sizeAttenuation: true,
    transparent: true, opacity: 0.65, depthWrite: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const state = { pointerX: 0, pointerY: 0, x: 0, y: 0, progress: 0, velocity: 0 };
  let metrics;
  let frame = null;
  let lastTime = 0;
  let lastScroll = window.scrollY;
  let quality = 1;
  let slowFrames = 0;
  let disposed = false;
  let formOffsetX = 0;
  let formOffsetY = 0;

  function measure() {
    const scroll = window.scrollY;
    metrics = {
      hero: hero.getBoundingClientRect().top + scroll,
      bridge: bridge.getBoundingClientRect().top + scroll,
      dashboard: dashboard.getBoundingClientRect().top + scroll,
      height: window.innerHeight,
    };
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    quality = mobile() ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(quality);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    wake();
  }
  function targetProgress() {
    return clamp((window.scrollY - metrics.hero) /
      Math.max(1, metrics.dashboard - metrics.hero - metrics.height * 0.18));
  }
  function resetDirectoryHandoff() {
    directory.classList.remove('is-page-handoff');
    directory.style.transform = '';
    directory.style.opacity = '';
  }
  function onDirectoryLink(event) {
    if (event.target.closest('a[href="#student-list"]')) {
      resetDirectoryHandoff();
      resetOffspring();
    }
  }
  function pageFrame() {
    // Project the four corners of the real 3D page into CSS pixels. The DOM
    // directory can then start at precisely the same viewport rectangle.
    const corners = [
      [-1.6, -2.25], [-1.6, 2.25], [1.6, -2.25], [1.6, 2.25],
    ].map(([x, y]) => pagePanel.localToWorld(new THREE.Vector3(x, y, 0)).project(camera));
    const xs = corners.map(point => (point.x + 1) * window.innerWidth / 2);
    const ys = corners.map(point => (1 - point.y) * window.innerHeight / 2);
    return {
      left: Math.min(...xs), top: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  function updateDirectoryHandoff(raw, enabled) {
    if (!enabled || raw >= 0.99) {
      resetDirectoryHandoff();
      return null;
    }
    if (raw < 0.78) {
      directory.classList.add('is-page-handoff');
      directory.style.transform = '';
      directory.style.opacity = '0';
      return null;
    }
    const source = pageFrame();
    // The grid remains in normal flow while its first child flies into place.
    // Measuring the untransformed parent avoids feedback from last frame's transform.
    const anchor = directory.parentElement.getBoundingClientRect();
    const width = directory.offsetWidth;
    const height = directory.offsetHeight;
    if (!width || !height) {
      resetDirectoryHandoff();
      return null;
    }
    const progress = smooth(0.78, 0.99, raw);
    const x = (source.left - anchor.left) * (1 - progress);
    const y = (source.top - anchor.top) * (1 - progress);
    const scaleX = mix(clamp(source.width / width), 1, progress);
    const scaleY = mix(clamp(source.height / height), 1, progress);
    directory.classList.add('is-page-handoff');
    directory.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
    directory.style.opacity = String(smooth(0.8, 0.82, raw));
    return { left: anchor.left + x, top: anchor.top + y, width: width * scaleX, height: height * scaleY };
  }
  function resetOffspring() {
    if (dashboardIntro) dashboardIntro.style.opacity = '';
    for (const element of [...statSurfaces, formPanel].filter(Boolean)) {
      element.classList.remove('is-story-offspring');
      element.style.transform = '';
      element.style.opacity = '';
      element.style.removeProperty('--offspring-detail');
    }
    formOffsetX = 0;
    formOffsetY = 0;
  }
  function placeOffspring(element, target, page, xFraction, yFraction, start, end, raw) {
    const progress = smooth(start, end, raw);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!width || !height) return { x: 0, y: 0 };
    const seedWidth = Math.min(width * 0.45, page.width * 0.46);
    const seedHeight = Math.min(height * 0.28, page.height * 0.22);
    const seedLeft = page.left + page.width * xFraction - seedWidth / 2;
    const seedTop = page.top + page.height * yFraction - seedHeight / 2;
    const x = (seedLeft - target.left) * (1 - progress);
    const y = (seedTop - target.top) * (1 - progress);
    const scaleX = mix(seedWidth / width, 1, progress);
    const scaleY = mix(seedHeight / height, 1, progress);
    element.classList.add('is-story-offspring');
    element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
    element.style.opacity = String(smooth(start, start + 0.065, raw));
    element.style.setProperty('--offspring-detail', String(smooth(start + 0.02, start + 0.085, raw)));
    return { x, y };
  }
  function updateOffspring(raw, enabled, page) {
    if (!enabled || raw >= 0.99) return resetOffspring();
    if (dashboardIntro) dashboardIntro.style.opacity = String(smooth(0.83, 0.94, raw));
    if (!page) {
      for (const element of [...statSurfaces, formPanel].filter(Boolean)) {
        element.classList.add('is-story-offspring');
        element.style.transform = '';
        element.style.opacity = '0';
        element.style.setProperty('--offspring-detail', '0');
      }
      formOffsetX = 0;
      formOffsetY = 0;
      return;
    }
    const starts = [0.8, 0.808, 0.816];
    const ends = [0.96, 0.97, 0.98];
    const origins = [[0.1, 0.28], [0.38, 0.2], [0.9, 0.22]];
    for (let i = 0; i < statSurfaces.length; i++) {
      const target = statSurfaces[i].parentElement.getBoundingClientRect();
      placeOffspring(statSurfaces[i], target, page, origins[i][0], origins[i][1], starts[i], ends[i], raw);
    }
    if (formPanel) {
      const current = formPanel.getBoundingClientRect();
      const target = { left: current.left - formOffsetX, top: current.top - formOffsetY };
      const offset = placeOffspring(formPanel, target, page, 0.94, 0.82, 0.804, 0.985, raw);
      formPanel.style.setProperty('--offspring-detail', String(smooth(0.86, 0.94, raw)));
      formOffsetX = offset.x;
      formOffsetY = offset.y;
    }
  }
  function wake() {
    if (!frame && !disposed && !document.hidden && !reduced.matches &&
      window.scrollY < metrics.dashboard + metrics.height * 0.12) {
      lastTime = 0;
      frame = window.requestAnimationFrame(render);
    }
  }
  function render(time) {
    frame = null;
    if (disposed || document.hidden || reduced.matches) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    const raw = targetProgress();
    // Match the bridge reveal to the progress line driven by app.js.
    const bridgeFill = clamp((metrics.height * .85 - (metrics.bridge - window.scrollY)) / (metrics.height * .65));
    const bridgeReveal = smooth(.04, .92, bridgeFill);
    const handoff = directory.dataset.storyPage === '1' && students.length > 0 &&
      !directory.contains(document.activeElement) && !formPanel?.contains(document.activeElement);
    const pageOpacity = handoff ? 1 - smooth(0.8, 0.82, raw) : 1;
    state.progress = damp(state.progress, raw, 7.5, dt);
    state.x = damp(state.x, state.pointerX, 3.2, dt);
    state.y = damp(state.y, state.pointerY, 3.2, dt);
    const scrollImpulse = Math.max(-1, Math.min(1, (window.scrollY - lastScroll) / 70));
    state.velocity = damp(state.velocity, scrollImpulse, 4, dt);
    lastScroll = window.scrollY;
    const p = state.progress;
    const unfold = smooth(0.12, 0.58, p);
    const gather = smooth(0.40, 0.66, p);
    const t = time * 0.001;
    const small = mobile();
    const stageX = small ? 0 : window.innerWidth < 1100 ? 1.25 : 2.2;
    const stageY = small ? -1.45 : 0;
    const bridgeSpace = smooth(0.08, 0.6, bridgeFill) * (1 - smooth(0.68, 0.86, p));
    world.position.x = mix(stageX, small ? 0 : 1.95, smooth(0.46, 0.8, p)) +
      (small ? 0 : window.innerWidth < 1100 ? 0.85 : 1.5) * bridgeSpace;
    world.position.y = mix(stageY, small ? -1.95 : 0.1, smooth(0.4, 0.8, p)) +
      gather * (small ? 0.65 : 0.9) + (small ? smooth(0.62, 0.78, p) * 2 - 1.8 * bridgeSpace : 0);
    world.scale.setScalar((small ? 0.8 : 1) * (1 + unfold * 0.06 - gather * 0.1));
    world.rotation.y = (t * 0.11 + state.x * 0.15) * (1 - gather);
    world.rotation.x = (-0.14 + state.y * 0.1) * (1 - gather);
    world.rotation.z = state.velocity * 0.07 * (1 - gather);
    camera.position.x = damp(camera.position.x, state.x * 0.22 * (1 - gather), 3.5, dt);
    camera.position.y = damp(camera.position.y, -state.y * 0.15 * (1 - gather), 3.5, dt);
    camera.position.z = damp(camera.position.z, 10.5 - unfold * 0.6 + gather * 0.8, 3.5, dt);
    camera.lookAt(0, 0, 0);
    core.rotation.y = t * 0.14;
    core.rotation.z = t * 0.07;
    core.scale.setScalar(Math.max(0.001, 1 - unfold * 0.58 - gather * 0.41));
    coreMaterial.opacity = 1 - unfold * 0.6 - gather * 0.4;
    coreMaterial.transparent = true;
    cage.rotation.y = -t * 0.12;
    cage.scale.copy(core.scale);
    cageMaterial.opacity = (1 - unfold * 0.65) * (1 - gather) * 0.34;
    ringMaterial.opacity = (1 - unfold * 0.65) * (1 - gather) * 0.44;
    for (let i = 0; i < rings.length; i++) rings[i].rotation.z += dt * (i % 2 ? -0.13 : 0.11);
    coreGlow.material.opacity = (1 - unfold * 0.7) * (1 - gather) * 0.72;
    const stackX = small ? 0 : 1.65;
    pagePanel.position.x = stackX;
    pageBorder.position.x = stackX;
    pageTitle.position.x = stackX;
    pageMaterial.opacity = students.length ? gather * 0.88 * pageOpacity * bridgeReveal : 0;
    pageBorderMaterial.opacity = students.length ? gather * 0.55 * pageOpacity * bridgeReveal : 0;
    pageTitle.material.opacity = students.length ? smooth(0.48, 0.66, p) * pageOpacity * bridgeReveal : 0;
    for (let i = 0; i < students.length; i++) {
      const angle = i * (Math.PI * 2 / Math.max(students.length, 1)) + 0.4 + t * 0.1;
      const orbit = new THREE.Vector3(
        Math.cos(angle) * 1.72,
        Math.sin(angle) * 1.48,
        Math.sin(angle * 1.6) * 0.55
      );
      const spread = new THREE.Vector3(stackX + (i % 2 ? 0.13 : -0.13), 1.42 - i * 0.69, 0.25);
      const stacked = new THREE.Vector3(stackX, 1.36 - i * 0.66, 0.24);
      const student = students[i];
      student.label.position.copy(orbit).lerp(spread, unfold).lerp(stacked, gather);
      student.label.material.opacity = smooth(0.15, 0.43, p) * pageOpacity * bridgeReveal;
      student.node.position.copy(orbit)
        .lerp(spread.clone().add(new THREE.Vector3(-1.52, 0, 0)), unfold)
        .lerp(stacked.clone().add(new THREE.Vector3(-1.52, 0, 0)), gather);
      const pulse = 1 + Math.sin(t * 1.8 + i * 2.4) * 0.13;
      student.node.scale.setScalar(pulse * (1 + Math.abs(state.velocity) * 0.15));
      student.node.material.opacity = (1 - gather) * pageOpacity;
      const j = i * 6;
      connections[j] = 0;
      connections[j + 1] = 0;
      connections[j + 2] = 0;
      connections[j + 3] = student.node.position.x;
      connections[j + 4] = student.node.position.y;
      connections[j + 5] = student.node.position.z;
    }
    connectionGeometry.attributes.position.needsUpdate = true;
    connectionMaterial.opacity = (1 - gather) * 0.26;
    stars.rotation.y = t * 0.005 + state.x * 0.015;
    stars.position.z = -unfold * 0.7;
    renderer.render(scene, camera);
    if (!document.body.classList.contains('has-webgl')) {
      document.body.classList.add('has-webgl');
      // The expanded story section changes the scroll range after WebGL is ready.
      metrics.dashboard = dashboard.getBoundingClientRect().top + window.scrollY;
    }
    const page = updateDirectoryHandoff(raw, handoff);
    updateOffspring(raw, handoff, page);
    // The 3D page hands its position to the actual first directory page.
    canvas.parentElement.style.opacity = String(1 - smooth(handoff ? 0.9 : 0.68, handoff ? 1 : 0.9, raw));
    if (raw < 0.99 && window.scrollY < metrics.dashboard + metrics.height * 0.12) {
      if (dt > 0.023) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 55 && quality > 1) {
        quality = 1;
        renderer.setPixelRatio(quality);
        slowFrames = 0;
      }
      frame = window.requestAnimationFrame(render);
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) window.cancelAnimationFrame(frame);
    resetDirectoryHandoff();
    resetOffspring();
    canvas.parentElement.style.opacity = '';
    window.removeEventListener('resize', measure);
    window.visualViewport?.removeEventListener('resize', measure);
    window.removeEventListener('scroll', wake);
    window.removeEventListener('directory:page-one-changed', onPageOneChanged);
    window.removeEventListener('directory:state-changed', wake);
    document.removeEventListener('click', onDirectoryLink, true);
    for (const student of students) {
      student.node.material.dispose();
      student.label.material.map.dispose();
      student.label.material.dispose();
    }
    pageTitle.material.map.dispose();
    pageTitle.material.dispose();
    for (const geometry of [coreGeometry, cageGeometry, ringGeometry, nodeGeometry, pageGeometry, pageBorderGeometry, connectionGeometry, starGeometry]) geometry.dispose();
    for (const material of [coreMaterial, cageMaterial, ringMaterial, pageMaterial, pageBorderMaterial, connectionMaterial, starMaterial, coreGlow.material]) material.dispose();
    glowTexture.dispose();
    renderer.dispose();
    document.body.classList.remove('has-webgl');
  }
  window.addEventListener('resize', measure, { passive: true });
  window.visualViewport?.addEventListener('resize', measure, { passive: true });
  window.addEventListener('scroll', wake, { passive: true });
  function onPageOneChanged(event) { if (!disposed) setPageOne(event.detail.students); }
  window.addEventListener('directory:page-one-changed', onPageOneChanged);
  window.addEventListener('directory:state-changed', wake);
  document.addEventListener('click', onDirectoryLink, true);
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    state.pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
    state.pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', () => { if (reduced.matches) dispose(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); dispose(); });
  window.addEventListener('pagehide', dispose, { once: true });
  setPageOne(readPageOne());
  measure();
}
