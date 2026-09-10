import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { neurons } from '../data/locomotor_circuit.json';

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const UP = new THREE.Vector3(0, 1, 0);

function surface(canvas, distance = 7, orthographic = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x050606);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = orthographic ? new THREE.OrthographicCamera(-5.4, 5.4, 4.3, -4.3, .05, 100) : new THREE.PerspectiveCamera(36, 1, .05, 100);
  camera.position.set(0, 0, distance);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = .08;
  orbit.enablePan = false; orbit.enableZoom = true;
  orbit.minDistance = 3.5; orbit.maxDistance = 13;
  orbit.autoRotate = !reducedMotion; orbit.autoRotateSpeed = .11;
  let width = 0, height = 0;
  return { renderer, scene, camera, orbit,
    resize(w, h) {
      if (w < 1 || h < 1 || (w === width && h === height)) return;
      width = w; height = h; renderer.setSize(w, h, false);
      if (orthographic) { const vertical = Math.max(8.6, 10.8 / (w / h)); camera.left = -vertical * w / h / 2; camera.right = -camera.left; camera.top = vertical / 2; camera.bottom = -camera.top; } else camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    render() { orbit.update(); renderer.render(scene, camera); },
    dispose() {
      orbit.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
    },
  };
}

// Actual soma positions from the public MaleCNS locomotor subset. We show only
// neurons with coordinates; no made-up arbor geometry or whole-brain outline.
window.createBrainScene = function createBrainScene(canvas) {
  const view = surface(canvas, 6.8);
  const { scene, camera, orbit } = view;
  const located = neurons.map((n, index) => ({ index, p: n.annotations?.somaLocation, side: n.side }))
    .filter(n => Array.isArray(n.p) && n.p.length === 3);
  const low = [0, 1, 2].map(axis => Math.min(...located.map(n => n.p[axis])));
  const high = [0, 1, 2].map(axis => Math.max(...located.map(n => n.p[axis])));
  const mid = low.map((n, axis) => (n + high[axis]) / 2);
  const scale = 3.65 / Math.max(...high.map((n, axis) => n - low[axis]));
  const positions = new Float32Array(located.length * 3);
  const colors = new Float32Array(located.length * 3);
  located.forEach((n, i) => {
    positions.set([(n.p[0] - mid[0]) * scale, -(n.p[2] - mid[2]) * scale, (n.p[1] - mid[1]) * scale], i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const cloud = new THREE.Group(); scene.add(cloud);
  cloud.rotation.y = -.32; cloud.rotation.z = -.06;
  cloud.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2.45, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .94 })));
  cloud.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .055, depthWrite: false, blending: THREE.AdditiveBlending })));
  // These quiet coordinate guides are a spatial reference, not neural anatomy.
  const guides = new THREE.BufferGeometry();
  const lines = [];
  for (const y of [-1.7, 0, 1.7]) {
    lines.push(-1.12, y, -.82, 1.12, y, -.82, 1.12, y, -.82, 1.12, y, .82, 1.12, y, .82, -1.12, y, .82, -1.12, y, .82, -1.12, y, -.82);
  }
  guides.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  cloud.add(new THREE.LineSegments(guides, new THREE.LineBasicMaterial({ color: 0x294445, transparent: true, opacity: .27 })));
  camera.position.set(2.1, .05, 6.2); orbit.target.set(0, 0, 0); orbit.update();
  return { ...view,
    locatedCount: located.length,
    update(brain = {}, running = false) {
      const nodes = Array.isArray(brain.nodes) ? brain.nodes : [];
      located.forEach((n, i) => {
        const a = clamp(nodes[n.index]);
        // Neutral/cyan at rest; warm white marks measured model activity.
        const side = n.side === 'left' ? .04 : 0;
        colors[i * 3] = .12 + a * .88;
        colors[i * 3 + 1] = .36 + side + a * .52;
        colors[i * 3 + 2] = .40 + side + a * .23;
      });
      geometry.attributes.color.needsUpdate = true;
      view.render();
    },
  };
};

// Original decorative anatomy over the modeled animal's actual world state.
// Position, altitude and heading come from the simulation; joints and wingbeats
// illustrate its six motor outputs rather than biomechanical physics.
window.createFlyScene = function createFlyScene(canvas, { onPlaceFruit } = {}) {
  const view = surface(canvas, 14, true);
  const { scene, camera, orbit, renderer } = view;
  orbit.autoRotate = false; orbit.minZoom = .7; orbit.maxZoom = 1.5;
  orbit.minPolarAngle = Math.PI * .15; orbit.maxPolarAngle = Math.PI * .43;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  scene.add(new THREE.HemisphereLight(0xdce9e5, 0x403023, 2));
  const key = new THREE.DirectionalLight(0xffe4bb, 3.7); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xaed6d2, 2.3); rim.position.set(4, 3, -3); scene.add(rim);
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
  const amber = material(0xb98a4d), thoraxMaterial = material(0x967247), dark = material(0x3a2b1e);
  const black = material(0x101817), pale = material(0xa4aaa3), red = material(0x981e17, { roughness: .34 });
  const sphere = new THREE.SphereGeometry(1, 20, 14), tube = new THREE.CylinderGeometry(1, 1, 1, 6);
  function mesh(g, m, parent = scene) { const o = new THREE.Mesh(g, m); parent.add(o); return o; }
  function ellipsoid(parent, m, p, s, g = sphere) { const o = mesh(g, m, parent); o.position.set(...p); o.scale.set(...s); return o; }
  function box(parent, m, p, s) { const o = mesh(new THREE.BoxGeometry(...s), m, parent); o.position.set(...p); return o; }
  function line(parent, points, color = 0x6e644e, opacity = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const o = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); parent.add(o); return o;
  }
  function segment(parent, m, radius) { const o = mesh(tube, m, parent); o.userData.radius = radius; return o; }
  const direction = new THREE.Vector3();
  function connect(o, a, b) { direction.subVectors(b, a); o.position.copy(a).add(b).multiplyScalar(.5); o.scale.set(o.userData.radius, direction.length(), o.userData.radius); o.quaternion.setFromUnitVectors(UP, direction.normalize()); }
  const stage = new THREE.Group(); scene.add(stage);
  const soil = material(0x323a27, { roughness: 1 }), rimMaterial = material(0x637258, { roughness: .85 });
  const tray = mesh(new THREE.CylinderGeometry(4.85, 4.85, .20, 80), black, stage); tray.position.y = -.13;
  const ground = mesh(new THREE.CircleGeometry(4.68, 80), soil, stage); ground.rotation.x = -Math.PI / 2; ground.position.y = -.02;
  const border = mesh(new THREE.TorusGeometry(4.73, .055, 6, 100), rimMaterial, stage); border.rotation.x = Math.PI / 2; border.position.y = -.015;
  // The complete [0,1] square simulation area fits inside this circular tray.
  const WORLD = 6.6;
  const worldToScene = value => (clamp(value) - .5) * WORLD;
  for (let i = -3; i <= 3; i++) {
    line(stage, [[i, -.006, -3.3], [i, -.006, 3.3]], 0x586342, .17);
    line(stage, [[-3.3, -.006, i], [3.3, -.006, i]], 0x586342, .17);
  }
  for (let i = 0; i < 45; i++) {
    const a = i * 2.39996, r = 4.25 + Math.sin(i * 3.71) * .17;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let j = 0; j < 3; j++) line(stage, [[x, 0, z], [x + Math.sin(i + j) * .11, .13 + j * .05, z + Math.cos(i + j) * .11]], 0x65784a, .85);
  }
  const shadow = mesh(new THREE.CircleGeometry(.38, 24), new THREE.MeshBasicMaterial({ color: 0x030502, transparent: true, opacity: .3, depthWrite: false }), stage);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .006;
  const trailPositions = new Float32Array(90 * 3), trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3)); trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xa8c48d, transparent: true, opacity: .22 })); stage.add(trail);
  const trailPoints = [];
  let lastTrailTime = -1;
  const fruitMaterials = { banana: material(0xe4c45b), apple: material(0xad4030), grape: material(0x69528d), leaf: material(0x71904c), stem: material(0x57402a) };
  const fruitTemplates = new Map();
  for (const kind of ['banana', 'apple', 'grape']) {
    const group = new THREE.Group();
    if (kind === 'banana') {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.36,.11,-.07),new THREE.Vector3(-.16,.13,.07),new THREE.Vector3(.14,.17,.10),new THREE.Vector3(.34,.27,-.02)]);
      mesh(new THREE.TubeGeometry(curve, 14, .105, 7, false), fruitMaterials.banana, group);
      ellipsoid(group, fruitMaterials.stem, [.36,.27,-.02], [.05,.045,.05]);
      ellipsoid(group, fruitMaterials.stem, [-.37,.11,-.07], [.035,.035,.035]);
    } else if (kind === 'apple') {
      ellipsoid(group, fruitMaterials.apple, [0,.23,0], [.24,.25,.24]);
      ellipsoid(group, fruitMaterials.apple, [-.09,.28,0], [.15,.15,.21]);
      const stem = mesh(new THREE.CylinderGeometry(.018,.027,.15,5),fruitMaterials.stem,group);stem.position.set(0,.48,0);stem.rotation.z=-.25;
      const leaf = ellipsoid(group,fruitMaterials.leaf,[.11,.49,0],[.16,.028,.075]);leaf.rotation.z=.28;
    } else {
      for (const [x,y,z] of [[0,.13,0],[-.11,.31,-.03],[.11,.31,.02],[0,.33,.17],[-.11,.48,.04],[.10,.47,.05],[0,.47,-.11]]) ellipsoid(group,fruitMaterials.grape,[x,y,z],[.135,.14,.135]);
      const stem = mesh(new THREE.CylinderGeometry(.018,.025,.15,5),fruitMaterials.stem,group);stem.position.set(0,.64,0);stem.rotation.z=.3;
    }
    fruitTemplates.set(kind, group);
  }
  const fruitObjects = new Map();
  function updateFruit(fruits) {
    const ids = new Set();
    for (const item of fruits) {
      ids.add(item.id);
      let object = fruitObjects.get(item.id);
      if (!object || object.userData.kind !== item.kind) {
        if (object) stage.remove(object);
        object = (fruitTemplates.get(item.kind) || fruitTemplates.get('banana')).clone(true);
        object.userData.kind = item.kind; fruitObjects.set(item.id, object); stage.add(object);
      }
      object.position.set(worldToScene(item.x), .015, worldToScene(item.y));
      object.scale.setScalar(.35 + Math.sqrt(clamp(item.amount ?? 1)) * .65);
      object.visible = (item.amount ?? 1) > .005;
    }
    for (const [id, object] of fruitObjects) if (!ids.has(id)) { stage.remove(object); fruitObjects.delete(id); }
  }
  const placement = mesh(new THREE.RingGeometry(.20, .24, 28), new THREE.MeshBasicMaterial({color:0xe4c45b,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}),stage);
  placement.rotation.x = -Math.PI / 2; placement.position.y = .03; placement.visible = false;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0,1,0),0), hit = new THREE.Vector3();
  let down = null;
  function pointOnFloor(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    if (!raycaster.ray.intersectPlane(floor,hit) || Math.abs(hit.x)>WORLD/2 || Math.abs(hit.z)>WORLD/2) return null;
    return {x:clamp(hit.x/WORLD+.5),y:clamp(hit.z/WORLD+.5)};
  }
  function pointerMove(event) {const point=pointOnFloor(event);placement.visible=Boolean(point);if(point)placement.position.set(worldToScene(point.x),.03,worldToScene(point.y));}
  function pointerDown(event) { if(event.button===0)down={x:event.clientX,y:event.clientY}; }
  function pointerUp(event) { if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<5){const point=pointOnFloor(event);if(point)onPlaceFruit?.(point);}down=null; }
  function pointerLeave() {placement.visible=false;down=null;}
  canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointerleave',pointerLeave);
  const fly = new THREE.Group(); scene.add(fly); fly.position.set(0, .02, 0); fly.scale.setScalar(.56);
  ellipsoid(fly, amber, [0, .85, -.54], [.30, .28, .63]);
  for (let i = 0; i < 5; i++) {
    const z = -.92 + i * .19;
    const radius = .3 * Math.sqrt(Math.max(.12, 1 - ((z + .54) / .63) ** 2));
    const band = mesh(new THREE.TorusGeometry(radius, .025, 5, 24), dark, fly);
    band.scale.y = .91; band.position.set(0, .85, z);
  }
  ellipsoid(fly, thoraxMaterial, [0, .99, -.01], [.31, .32, .43]);
  const head = new THREE.Group(); head.position.set(0, 1.03, .47); fly.add(head);
  ellipsoid(head, amber, [0, 0, 0], [.30, .25, .23]);
  const eyeGeometry = new THREE.IcosahedronGeometry(1, 3);
  for (const side of [-1, 1]) {
    const eye = ellipsoid(head, red, [side * .23, .025, .077], [.16, .215, .17], eyeGeometry); eye.rotation.z = side * -.14;
    ellipsoid(head, dark, [side * .077, .01, .235], [.028, .05, .06]);
    line(head, [[side * .077, .045, .255], [side * .16, .11, .29], [side * .23, .16, .31]], 0xac986d);
    for (let j = 0; j < 4; j++) line(head, [[side * (.13 + j * .025), .085 + j * .018, .28 + j * .007], [side * (.16 + j * .03), .14 + j * .026, .29 + j * .007]], 0x817351);
  }
  ellipsoid(head, dark, [0, -.13, .20], [.047, .095, .042]);
  const wingMaterial = material(0xdde4d9, { transparent: true, opacity: .25, metalness: .16, roughness: .23, side: THREE.DoubleSide, depthWrite: false });
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * .14, 1.24, -.14); fly.add(pivot);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.bezierCurveTo(.28, .20, 1.20, .20, 1.36, -.20);
    shape.bezierCurveTo(1.45, -.64, .77, -.73, .06, -.13); shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 16); g.rotateX(-Math.PI / 2); g.scale(side, 1, 1);
    mesh(g, wingMaterial, pivot);
    for (const points of [
      [[0, .007, 0], [.55, .007, .06], [1.29, .007, .24]],
      [[.1, .008, .04], [.48, .008, .3], [1.1, .008, .51]],
      [[.35, .008, .04], [.56, .008, .29], [.69, .008, .47]],
      [[.8, .008, .14], [.87, .008, .38], [1.14, .008, .42]],
    ]) line(pivot, points.map(p => [p[0] * side, p[1], p[2]]), 0x889d8e, .58);
    pivot.rotation.y = side * -.4; pivot.rotation.z = side * .045;
    wings.push({ pivot, side });
  }
  const legs = [];
  for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg++) {
    const index = (side < 0 ? 0 : 3) + leg;
    const anchor = new THREE.Vector3(side * .22, .89, .16 - leg * .22);
    const knee = new THREE.Vector3(side * (.54 + leg * .10), .55, .56 - leg * .53);
    const foot = new THREE.Vector3(side * (.68 + leg * .2), .06, .97 - leg * .78);
    const upper = segment(fly, thoraxMaterial, .023), lower = segment(fly, amber, .017), tarsus = segment(fly, dark, .010);
    legs.push({ index, side, leg, anchor, knee, foot, upper, lower, tarsus, k: knee.clone(), f: foot.clone(), toe: foot.clone() });
  }
  // Fine bristles and wing veins are original decorative linework.
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996, x = Math.cos(a) * .23, z = Math.sin(a) * .28;
    line(fly, [[x, 1.19 + Math.cos(a) * .035, z], [x * 1.16, 1.36 + i % 3 * .018, z * 1.1]], 0x514433);
  }
  camera.position.set(7, 9, 12); orbit.target.set(0, .55, 0); orbit.update();
  let phase = 0, previous = 0, initialPosition = true;
  return { ...view,
    setFruitKind(kind) { placement.material.color.set(fruitMaterials[kind]?.color || fruitMaterials.banana.color); },
    update(brain = {}, running = false) {
      const now = performance.now() / 1000, dt = Math.min(.07, previous ? now - previous : .033); previous = now;
      const a = brain.activity || [], mean = a.reduce((sum, v) => sum + clamp(v), 0) / Math.max(1, a.length);
      const altitude = clamp(brain.height), flying = altitude > .05;
      if (running && !reducedMotion) phase += dt * (2.4 + mean * 5);
      const targetX = worldToScene(brain.x ?? .5), targetZ = worldToScene(brain.y ?? .5), targetY = .02 + altitude * 1.75;
      const ease = initialPosition || reducedMotion ? 1 : 1 - Math.exp(-dt * 13); initialPosition = false;
      fly.position.x += (targetX - fly.position.x) * ease; fly.position.z += (targetZ - fly.position.z) * ease; fly.position.y += (targetY - fly.position.y) * ease;
      const targetYaw = Math.PI / 2 - (Number.isFinite(brain.heading) ? brain.heading : 0);
      const delta = Math.atan2(Math.sin(targetYaw-fly.rotation.y),Math.cos(targetYaw-fly.rotation.y));fly.rotation.y += delta * ease;
      fly.rotation.x = flying ? -.10 : 0;
      head.rotation.x = brain.behavior === 'feeding' ? .17 + (running && !reducedMotion ? Math.sin(phase*3)*.04 : 0) : 0;
      shadow.position.set(fly.position.x,.006,fly.position.z);shadow.scale.setScalar(1+altitude*.4);shadow.material.opacity=.3-altitude*.18;
      legs.forEach(l => {
        const signal = clamp(a[l.index]), oscillation = running && !reducedMotion ? Math.sin(phase + l.index * Math.PI * .73) * signal : 0;
        l.k.copy(l.knee); l.k.y += Math.max(0, oscillation) * .09;
        l.f.copy(l.foot); l.f.z += oscillation * .11; l.f.y += Math.max(0, oscillation) * .14 + (flying ? .12 : 0);
        l.toe.copy(l.f); l.toe.x += l.side * .12; l.toe.z += .05; l.toe.y = Math.max(.025, l.f.y - .035);
        connect(l.upper, l.anchor, l.k); connect(l.lower, l.k, l.f); connect(l.tarsus, l.f, l.toe);
      });
      wings.forEach(w => {
        const beat = running && !reducedMotion ? (flying ? Math.sin(now*67)*.52 : Math.sin(phase*3)*mean*.045) : 0;
        w.pivot.rotation.z = w.side * (.045+beat);w.pivot.rotation.y = w.side * (flying ? -.2 : -.4);
      });
      updateFruit(Array.isArray(brain.fruits) ? brain.fruits : []);
      if (Number.isFinite(brain.time) && brain.time !== lastTrailTime) {
        if (brain.time < lastTrailTime) trailPoints.length = 0;
        lastTrailTime = brain.time;
        trailPoints.push([targetX,.012,targetZ]);if(trailPoints.length>90)trailPoints.shift();
        trailPoints.forEach((p,i)=>trailPositions.set(p,i*3));trailGeometry.attributes.position.needsUpdate=true;trailGeometry.setDrawRange(0,trailPoints.length);
      }
      view.render();
    },
    dispose() {
      canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointerleave',pointerLeave);
      // Keep template resources reachable for the shared resource disposer.
      fruitTemplates.forEach(template=>scene.add(template));view.dispose();
    },
  };
};
