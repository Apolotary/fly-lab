import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { neurons } from '../data/locomotor_circuit.json';
import { createDemoRecorder } from './recorder.js';

window.createDemoRecorder = createDemoRecorder;

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
      if (orthographic) { const vertical = Math.max(7.7, 10.2 / (w / h)); camera.left = -vertical * w / h / 2; camera.right = -camera.left; camera.top = vertical / 2; camera.bottom = -camera.top; } else camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    render() { orbit.update(); renderer.render(scene, camera); },
    dispose() {
      orbit.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
      });
      const textures = new Set();
      materials.forEach(m => { if (m.map) textures.add(m.map); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose();
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
  const stringStage = new THREE.Group(), gardenStage = new THREE.Group(), tombolaStage = new THREE.Group();
  stage.add(stringStage, gardenStage, tombolaStage); tombolaStage.visible = false;
  // A deliberately broad, original six-string instrument: every sounding
  // segment occupies the same normalized world coordinates as contact detection.
  const WORLD = 6.6;
  const worldToScene = value => (clamp(value) - .5) * WORLD;
  const plinth = material(0x202926), maple = material(0x9b6835), rosewood = material(0x543c29);
  const table = box(stage, plinth, [0, -.38, 0], [8.0, .25, 7.3]);
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(1.05, -1.50);
  bodyShape.bezierCurveTo(.1, -2.80, -1.00, -2.32, -1.18, -1.86);
  bodyShape.bezierCurveTo(-1.8, -2.58, -3.47, -2.65, -3.50, -1.12);
  bodyShape.bezierCurveTo(-3.80, .15, -3.38, 2.65, -1.91, 2.52);
  bodyShape.bezierCurveTo(-1.28, 2.47, -1.20, 1.70, -.77, 1.77);
  bodyShape.bezierCurveTo(-.13, 2.14, .60, 2.25, 1.05, 1.50);
  bodyShape.closePath();
  const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, { depth: .20, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .065, bevelThickness: .035, curveSegments: 30 });
  const body = mesh(bodyGeometry, maple, stringStage); body.rotation.x = -Math.PI / 2; body.position.y = -.23;
  box(stringStage, rosewood, [1.56, -.055, 0], [2.55, .11, 2.88]);
  const headstock = box(stringStage, maple, [3.05, -.07, 0], [.70, .14, 3.07]); headstock.rotation.y = -.035;
  for (let i = 0; i < 6; i++) {
    const x = .49 + i * .33;
    line(stringStage, [[x, .004, -1.40], [x, .004, 1.40]], 0x95968a, .68);
  }
  for (const z of [-1.22, -.72, -.22, .28, .78, 1.28]) {
    ellipsoid(stringStage, pale, [3.30, .04, z], [.12, .07, .085]);
  }
  const soundHole = mesh(new THREE.CircleGeometry(.64, 40), black, stringStage); soundHole.rotation.x = -Math.PI / 2; soundHole.position.set(-1.22, .014, 0);
  for (const radius of [.68, .72]) { const ring = mesh(new THREE.TorusGeometry(radius, .016, 4, 50), rosewood, stringStage); ring.rotation.x = Math.PI / 2; ring.position.set(-1.22, .018, 0); }
  box(stringStage, rosewood, [worldToScene(.12), .012, 0], [.16, .045, 2.94]);
  box(stringStage, pale, [worldToScene(.88), .012, 0], [.055, .045, 2.83]);
  // An original virtual touch instrument: a simple tray, colored patch leads,
  // and a small MIDI box. Wires illustrate mappings, not electrical physics.
  box(gardenStage, material(0x26352d), [0, -.14, 0], [6.85, .28, 6.85]);
  for (const z of [-3.42, 3.42]) box(gardenStage, material(0x485046), [0, -.01, z], [6.96, .10, .06]);
  for (const x of [-3.45, 3.45]) box(gardenStage, material(0x485046), [x, -.01, 0], [.06, .10, 6.90]);
  const midiBox = box(gardenStage, material(0x879491, {roughness: .45, metalness: .35}), [3.79, -.025, 2.34], [.62, .44, 1.40]);
  box(gardenStage, black, [3.79, .201, 2.34], [.49, .012, 1.21]);
  const midiLED = ellipsoid(gardenStage, material(0x90bf95, {emissive: 0x76ff95, emissiveIntensity: .16}), [3.80, .22, 1.88], [.047, .02, .047]);
  for (let i = 0; i < 6; i++) ellipsoid(gardenStage, dark, [3.475, .04, 1.96 + i * .135], [.025, .036, .036]);
  line(gardenStage, [[4.10,.0,2.34],[4.32,-.1,2.34],[4.34,-.15,3.45]], 0x718482);
  function labelSprite(text, color = '#d7e5d4') {
    const label = document.createElement('canvas'); label.width = 192; label.height = 72;
    const context = label.getContext('2d');
    context.fillStyle = '#101913'; context.beginPath(); context.roundRect(8, 8, 176, 56, 9); context.fill();
    context.font = '500 34px ui-monospace, Menlo, monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, 96, 37);
    const texture = new THREE.CanvasTexture(label); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, transparent: true, depthWrite: false}));
    sprite.scale.set(.94, .35, 1); return sprite;
  }
  const midiLabel = labelSprite('MIDI', '#b8ddc8'); midiLabel.scale.set(.65, .245, 1); midiLabel.position.set(3.79, .54, 2.39); gardenStage.add(midiLabel);
  // This chamber is a view of the server's collision geometry. Its six walls
  // rotate with the reported physics angle; the renderer never invents bounces.
  const chamber = new THREE.Group(); tombolaStage.add(chamber);
  const chamberRadius = .43 * WORLD, chamberHeight = 1.18;
  const chamberFrame = material(0xa0c6ad, {metalness: .32, roughness: .34, emissive: 0x344f3c, emissiveIntensity: .2});
  const chamberGlass = material(0x9fe7bf, {transparent: true, opacity: .065, side: THREE.DoubleSide, depthWrite: false, roughness: .14});
  const chamberFloor = mesh(new THREE.CylinderGeometry(3.42,3.55,.20,80), material(0x122219, {metalness: .24, roughness: .48}), tombolaStage); chamberFloor.position.y = -.14;
  for (const radius of [3.08,3.30]) { const ring = mesh(new THREE.TorusGeometry(radius,.013,4,80), material(0x4e7259), tombolaStage); ring.rotation.x = Math.PI / 2; ring.position.y = -.024; }
  for (let index = 0; index < 6; index++) {
    const a = index * Math.PI / 3, b = (index + 1) * Math.PI / 3;
    const x1 = Math.cos(a) * chamberRadius, z1 = Math.sin(a) * chamberRadius, x2 = Math.cos(b) * chamberRadius, z2 = Math.sin(b) * chamberRadius;
    for (const height of [.045,chamberHeight]) {const rail=segment(chamber,chamberFrame,.025);connect(rail,new THREE.Vector3(x1,height,z1),new THREE.Vector3(x2,height,z2));}
    const post=segment(chamber,chamberFrame,.025);connect(post,new THREE.Vector3(x1,.045,z1),new THREE.Vector3(x1,chamberHeight,z1));
    ellipsoid(chamber,chamberFrame,[x1,chamberHeight,z1],[.065,.065,.065]);
    const wall=mesh(new THREE.PlaneGeometry(chamberRadius,chamberHeight),chamberGlass,chamber);wall.position.set((x1+x2)/2,chamberHeight/2,(z1+z2)/2);wall.rotation.y=-Math.atan2(z2-z1,x2-x1);
    const numeral=labelSprite(String(index+1),'#8cbd9f');numeral.scale.set(.29,.11,1);numeral.position.set((x1+x2)/2,.14,(z1+z2)/2);chamber.add(numeral);
  }
  const chamberName=labelSprite('CHAMBER','#aacbb4');chamberName.position.set(0,.03,3.08);chamberName.scale.set(.80,.30,1);tombolaStage.add(chamberName);
  const impactFlashes = Array.from({length:24}, () => {
    const halo=mesh(new THREE.RingGeometry(.10,.15,32),new THREE.MeshBasicMaterial({color:0xe7f9bf,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),tombolaStage);halo.rotation.x=-Math.PI/2;
    const spark=ellipsoid(tombolaStage,new THREE.MeshBasicMaterial({color:0xf5ffdf,transparent:true,opacity:0,depthWrite:false}),[0,0,0],[.075,.22,.075]);
    return {halo,spark,struck:-100};
  });
  const seenCollisions=new Set();let impactCursor=0,lastPhysicsHits=null,lastPhysicsMode=false,displayedChamberAngle=null;
  function updateChamber(physics, mode, now, running, dt) {
    if(mode!=='tombola'){lastPhysicsMode=false;displayedChamberAngle=null;return;}
    const hits=physics.totalHits??0,collisions=Array.isArray(physics.collisions)?physics.collisions:[];
    if(!lastPhysicsMode||(lastPhysicsHits!==null&&hits<lastPhysicsHits)){seenCollisions.clear();collisions.forEach(hit=>seenCollisions.add(hit.id));impactFlashes.forEach(item=>item.struck=-100);}
    lastPhysicsMode=true;lastPhysicsHits=hits;
    // Follow only the latest observed angle with the same easing as body poses.
    // Wrapped deltas avoid a full reverse turn across ±π; speed never advances
    // this display independently of a simulation snapshot.
    const targetAngle=Number.isFinite(physics.angle)?physics.angle:0,angleEase=displayedChamberAngle===null||reducedMotion||!running?1:1-Math.exp(-dt*8);
    if(displayedChamberAngle===null)displayedChamberAngle=targetAngle;
    const angleDelta=Math.atan2(Math.sin(targetAngle-displayedChamberAngle),Math.cos(targetAngle-displayedChamberAngle));
    displayedChamberAngle+=angleDelta*angleEase;
    chamber.rotation.y=-displayedChamberAngle;chamber.scale.setScalar(clamp(physics.radius??.43,.1,.5)/.43);
    for(const collision of collisions){if(seenCollisions.has(collision.id))continue;seenCollisions.add(collision.id);if(seenCollisions.size>256)seenCollisions.delete(seenCollisions.values().next().value);const flash=impactFlashes[impactCursor++%impactFlashes.length];flash.struck=now;flash.halo.position.set(worldToScene(collision.x),.055,worldToScene(collision.y));flash.spark.position.set(worldToScene(collision.x),.22,worldToScene(collision.y));}
    for(const flash of impactFlashes){const age=Math.max(0,now-flash.struck),pulse=Math.exp(-age*8);flash.halo.material.opacity=pulse*.9;flash.halo.scale.setScalar(1+Math.min(age,1)*4);flash.spark.material.opacity=pulse*.8;}
  }
  // Contact highlights are driven only by composer contact events. Their
  // illustrated vibration is decorative, not a simulated acoustic waveform.
  const fallbackStrings = [.30, .38, .46, .54, .62, .70].map((y, i) => ({ id: `string-${i + 1}`, x1: .12, x2: .88, y, pitch: [48, 55, 60, 64, 67, 72][i] }));
  const stringObjects = new Map(), seenContacts = new Set(), strikeColor = new THREE.Color(0xffedb9);
  let previousContactCount = null, previousMode = null, previousModeRevision = null, midiStruck = -100;
  function createString(spec, index) {
    const positions = new Float32Array(41 * 3), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stringMaterial = new THREE.LineBasicMaterial({color: index < 3 ? 0x51564f : 0x68736f, transparent: true, opacity: .9});
    const object = new THREE.Line(geometry, stringMaterial); stringStage.add(object);
    const halo = mesh(new THREE.RingGeometry(.10, .14, 24), new THREE.MeshBasicMaterial({color: 0xf5d995, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false}), stringStage);
    halo.rotation.x = -Math.PI / 2; halo.position.y = .06;
    return {spec, object, geometry, positions, material: stringMaterial, baseColor: stringMaterial.color.clone(), halo, struck: -100, contactX: .5};
  }
  function updateStrings(music, now) {
    const specs = Array.isArray(music.strings) && music.strings.length ? music.strings : fallbackStrings;
    const ids = new Set(specs.map(spec => spec.id));
    for (const [id, item] of stringObjects) if (!ids.has(id)) { stringStage.remove(item.object, item.halo); item.geometry.dispose(); item.material.dispose(); item.halo.geometry.dispose(); item.halo.material.dispose(); stringObjects.delete(id); }
    specs.forEach((spec, index) => { if (!stringObjects.has(spec.id)) stringObjects.set(spec.id, createString(spec, index)); stringObjects.get(spec.id).spec = spec; });
    for (const item of stringObjects.values()) {
      const {spec, positions} = item, age = now - item.struck, envelope = Math.exp(-age * 5.5), y = Number.isFinite(spec.y) ? spec.y : spec.y1;
      const x1 = worldToScene(spec.x1), x2 = worldToScene(spec.x2), z = worldToScene(y);
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, vibration = reducedMotion ? 0 : Math.sin(t * Math.PI) * Math.sin(age * 68) * .047 * envelope;
        positions.set([x1 + (x2 - x1) * t, .03, z + vibration], i * 3);
      }
      item.geometry.attributes.position.needsUpdate = true;
      item.material.color.copy(item.baseColor).lerp(strikeColor, Math.min(1, envelope));
      item.halo.position.x = worldToScene(item.contactX); item.halo.position.z = z;
      item.halo.material.opacity = envelope * .8; item.halo.scale.setScalar(1 + Math.min(age, 1) * 2.5);
    }
  }
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
  const fruitColors = {banana: 0xe4c45b, apple: 0xe97761, grape: 0xa98bdb};
  const fallbackFruitNotes = {banana: {pitch: 60, label: 'C4'}, apple: {pitch: 64, label: 'E4'}, grape: {pitch: 67, label: 'G4'}};
  const fallbackAmbientNotes = {banana: {pitch: 72, label: 'C5'}, apple: {pitch: 76, label: 'E5'}, grape: {pitch: 79, label: 'G5'}};
  function disposeFruit(item) {
    stage.remove(item.object); gardenStage.remove(item.wire);
    item.materials.forEach(m => m.dispose()); item.halo.geometry.dispose(); item.halo.material.dispose();
    item.label.material.map.dispose(); item.label.material.dispose(); item.wire.geometry.dispose(); item.wire.material.dispose();
  }
  function createFruit(item, noteLabel) {
    const object = new THREE.Group(), model = (fruitTemplates.get(item.kind) || fruitTemplates.get('banana')).clone(true);
    const materials = [];
    model.traverse(child => {if (child.isMesh) {child.material = child.material.clone(); materials.push(child.material);}});
    object.add(model); stage.add(object);
    const color = fruitColors[item.kind] ?? 0x99c9b1;
    const halo = mesh(new THREE.RingGeometry(.32, .36, 36), new THREE.MeshBasicMaterial({color, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false}), object);
    halo.rotation.x = -Math.PI / 2; halo.position.y = .02;
    const label = labelSprite(noteLabel); label.position.set(0, .88, 0); object.add(label);
    const wire = line(gardenStage, [[0,0,0],[0,0,0]], color, .67);
    return {object, model, materials, halo, label, labelText: noteLabel, wire, color: new THREE.Color(color), kind: item.kind, pathKey: '', struck: -100};
  }
  function updateFruit(fruits, music, fruitMode, now) {
    const ids = new Set();
    for (const [index, item] of fruits.entries()) {
      ids.add(item.id);
      const note = music.fruitNotes?.[item.kind] ?? (music.instrumentMode === 'ambient' ? fallbackAmbientNotes[item.kind] : fallbackFruitNotes[item.kind]), noteLabel = note?.label ?? 'NOTE';
      let visual = fruitObjects.get(item.id);
      if (!visual || visual.kind !== item.kind || visual.labelText !== noteLabel) {
        if (visual) disposeFruit(visual);
        visual = createFruit(item, noteLabel); fruitObjects.set(item.id, visual);
      }
      const {object, model, halo, label, wire} = visual, x = worldToScene(item.x), z = worldToScene(item.y);
      object.position.set(x, .015, z);
      object.visible = (item.amount ?? 1) > .005;
      const age = Math.max(0, now - visual.struck), pulse = Math.exp(-age * 5.5);
      model.scale.setScalar((.35 + Math.sqrt(clamp(item.amount ?? 1)) * .65) * (fruitMode && !reducedMotion ? 1 + pulse * .075 : 1));
      label.visible = halo.visible = fruitMode;
      halo.material.opacity = .18 + pulse * .78; halo.scale.setScalar(1 + pulse * .6);
      visual.materials.forEach(m => {m.emissive.copy(visual.color); m.emissiveIntensity = fruitMode ? pulse * .45 : 0;});
      wire.visible = fruitMode && object.visible;
      wire.material.color.copy(visual.color).lerp(strikeColor, pulse); wire.material.opacity = .53 + pulse * .47;
      const portZ = 1.96 + (index % 6) * .135, pathKey = `${x}:${z}:${portZ}`;
      if (pathKey !== visual.pathKey) {
        const points = [new THREE.Vector3(x,.055,z), new THREE.Vector3(x + .25,.05,z + .20), new THREE.Vector3((x + 3.45) * .5,.025,(z + portZ) * .5 + .30), new THREE.Vector3(3.25,.025,portZ), new THREE.Vector3(3.48,.04,portZ)];
        const geometry = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(32));
        wire.geometry.dispose(); wire.geometry = geometry; visual.pathKey = pathKey;
      }
    }
    for (const [id, object] of fruitObjects) if (!ids.has(id)) { disposeFruit(object); fruitObjects.delete(id); }
  }
  const contactKey = contact => `${contact.instrumentMode ?? (contact.fruitId ? 'fruit' : 'strings')}:${contact.id ?? [contact.fruitId ?? contact.stringId, contact.flyId, contact.time].join(':')}`;
  function beginContacts(music, mode) {
    const contacts = Array.isArray(music.contacts) ? music.contacts : [];
    const revision = music.modeRevision ?? 0;
    const baseline = previousMode !== mode || previousModeRevision !== revision || (previousContactCount !== null && (music.noteCount ?? 0) < previousContactCount);
    if (baseline) {
      // A mode change keeps the piece. Its old contact log is a baseline, not a
      // new set of touches to animate on the newly selected instrument.
      seenContacts.clear(); contacts.forEach(contact => seenContacts.add(contactKey(contact)));
      stringObjects.forEach(item => item.struck = -100); fruitObjects.forEach(item => item.struck = -100); midiStruck = -100;
    }
    previousMode = mode; previousModeRevision = revision; previousContactCount = music.noteCount ?? 0;
  }
  function updateContacts(music, now, mode) {
    const contacts = Array.isArray(music.contacts) ? music.contacts : [];
    for (const contact of contacts) {
      const key = contactKey(contact); if (seenContacts.has(key)) continue;
      seenContacts.add(key); if (seenContacts.size > 256) seenContacts.delete(seenContacts.values().next().value);
      const contactMode = contact.instrumentMode ?? (contact.fruitId ? 'fruit' : 'strings');
      if (contactMode !== mode) continue;
      if (mode !== 'strings') {
        const item = fruitObjects.get(contact.fruitId); if (item) {item.struck = now; midiStruck = now;}
      } else {
        const item = stringObjects.get(contact.stringId); if (item) {item.struck = now; item.contactX = clamp(contact.x ?? .5);}
      }
    }
    midiLED.material.emissiveIntensity = .16 + Math.exp(-(now - midiStruck) * 6) * 2.2;
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
  function createFly(primary = false, detailed = true) {
  const fly = new THREE.Group(); scene.add(fly); fly.position.set(0, 0, 0); fly.scale.setScalar(detailed ? .43 : .34);
  ellipsoid(fly, amber, [0, .85, -.54], [.30, .28, .63]);
  for (let i = 0; i < (detailed ? 5 : 3); i++) {
    const z = -.92 + i * .19;
    const radius = .3 * Math.sqrt(Math.max(.12, 1 - ((z + .54) / .63) ** 2));
    const band = mesh(new THREE.TorusGeometry(radius, .025, 5, 24), dark, fly);
    band.scale.y = .91; band.position.set(0, .85, z);
  }
  ellipsoid(fly, thoraxMaterial, [0, .99, -.01], [.31, .32, .43]);
  const head = new THREE.Group(); head.position.set(0, 1.03, .47); fly.add(head);
  ellipsoid(head, amber, [0, 0, 0], [.30, .25, .23]);
  const eyeGeometry = new THREE.IcosahedronGeometry(1, detailed ? 3 : 1);
  for (const side of [-1, 1]) {
    const eye = ellipsoid(head, red, [side * .23, .025, .077], [.16, .215, .17], eyeGeometry); eye.rotation.z = side * -.14;
    ellipsoid(head, dark, [side * .077, .01, .235], [.028, .05, .06]);
    line(head, [[side * .077, .045, .255], [side * .16, .11, .29], [side * .23, .16, .31]], 0xac986d);
    if (detailed) for (let j = 0; j < 4; j++) line(head, [[side * (.13 + j * .025), .085 + j * .018, .28 + j * .007], [side * (.16 + j * .03), .14 + j * .026, .29 + j * .007]], 0x817351);
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
    if (detailed) for (const points of [
      [[0, .007, 0], [.55, .007, .06], [1.29, .007, .24]],
      [[.1, .008, .04], [.48, .008, .3], [1.1, .008, .51]],
      [[.35, .008, .04], [.56, .008, .29], [.69, .008, .47]],
      [[.8, .008, .14], [.87, .008, .38], [1.14, .008, .42]],
    ]) line(pivot, points.map(p => [p[0] * side, p[1], p[2]]), 0x889d8e, .58);
    pivot.rotation.y = side * -.4; pivot.rotation.z = side * .045;
    wings.push({ pivot, side });
  }
  const legs = [];
  let legLines = null, legPositions = null;
  if (!detailed) {
    legPositions = new Float32Array(6 * 18);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(legPositions, 3));
    legLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0xc4a772})); fly.add(legLines);
  }
  for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg++) {
    const index = (side < 0 ? 0 : 3) + leg;
    const anchor = new THREE.Vector3(side * .22, .89, .16 - leg * .22);
    const knee = new THREE.Vector3(side * (.54 + leg * .10), .55, .56 - leg * .53);
    const foot = new THREE.Vector3(side * (.68 + leg * .2), .06, .97 - leg * .78);
    const upper = detailed ? segment(fly, thoraxMaterial, .023) : null, lower = detailed ? segment(fly, amber, .017) : null, tarsus = detailed ? segment(fly, dark, .010) : null;
    legs.push({ index, side, leg, anchor, knee, foot, upper, lower, tarsus, k: knee.clone(), f: foot.clone(), toe: foot.clone() });
  }
  // Fine bristles and wing veins are original decorative linework.
  for (let i = 0; i < (detailed ? 22 : 0); i++) {
    const a = i * 2.39996, x = Math.cos(a) * .23, z = Math.sin(a) * .28;
    line(fly, [[x, 1.19 + Math.cos(a) * .035, z], [x * 1.16, 1.36 + i % 3 * .018, z * 1.1]], 0x514433);
  }
  const shadow = mesh(new THREE.CircleGeometry(.30, 24), new THREE.MeshBasicMaterial({ color: 0x030502, transparent: true, opacity: .30, depthWrite: false }), stage);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .023;
  const marker = mesh(new THREE.RingGeometry(.36, .38, 28), new THREE.MeshBasicMaterial({ color: 0xc8eabc, transparent: true, opacity: .47, side: THREE.DoubleSide, depthWrite: false }), stage);
  marker.rotation.x = -Math.PI / 2; marker.position.y = .026; marker.visible = primary;
  const noteLabel=labelSprite('C4');noteLabel.scale.set(.52,.20,1);noteLabel.visible=false;scene.add(noteLabel);
  return { fly, head, wings, legs, legLines, legPositions, shadow, marker, noteLabel, noteText:'C4', phase: 0, initial: true };
  }
  camera.position.set(4.3, 10.8, 10); orbit.target.set(0, .12, 0); orbit.update();
  const flyObjects = new Map();
  let previous = 0;
  return { ...view,
    setFruitKind(kind) { placement.material.color.set(fruitMaterials[kind]?.color || fruitMaterials.banana.color); },
    update(brain = {}, running = false, music = {}) {
      const now = performance.now() / 1000, dt = Math.min(.07, previous ? now - previous : .033); previous = now;
      const mode = ['strings','ambient','tombola'].includes(music.instrumentMode) ? music.instrumentMode : 'fruit', tombolaMode=mode==='tombola';
      if(tombolaMode!==(previousMode==='tombola')){camera.zoom=tombolaMode?1.17:1;camera.updateProjectionMatrix();}
      const flies = Array.isArray(brain.flies) && brain.flies.length ? brain.flies : [{...brain, id: 'fly-1'}];
      const ids = new Set(flies.map((state, index) => state.id ?? `fly-${index + 1}`));
      for (const [id, model] of flyObjects) { model.fly.visible = ids.has(id); model.shadow.visible = ids.has(id); model.noteLabel.visible=tombolaMode&&ids.has(id); model.marker.visible = ids.has(id) && id === (flies[0]?.id ?? 'fly-1'); }
      flies.forEach((state, index) => {
        const id = state.id ?? `fly-${index + 1}`;
        if (!flyObjects.has(id)) flyObjects.set(id, createFly(index === 0, flies.length <= 3 || index === 0));
        const model = flyObjects.get(id), {fly, head, legs, wings, shadow, marker} = model;
        fly.visible = true; shadow.visible = true;
        const a = state.activity || [], mean = a.reduce((sum, v) => sum + clamp(v), 0) / Math.max(1, a.length);
        const altitude = clamp(state.height), flying = altitude > .08;
        if (running && !reducedMotion) model.phase += dt * (2.4 + mean * 5);
        const phase = model.phase, targetX = worldToScene(state.x ?? .5), targetZ = worldToScene(state.y ?? .5), targetY = altitude * 1.75;
        // Smooth only between observed positions. We neither extrapolate past a
        // sample nor speed up the model's neural output. A paused world snaps
        // to its reported pose, as do stationary contacts outside the chamber.
        const ease = model.initial || reducedMotion || !running || (!tombolaMode && (state.behavior === 'feeding' || state.behavior === 'resting')) ? 1 : 1 - Math.exp(-dt * 8); model.initial = false;
        fly.position.x += (targetX - fly.position.x) * ease; fly.position.z += (targetZ - fly.position.z) * ease; fly.position.y += (targetY - fly.position.y) * ease;
        const targetYaw = Math.PI / 2 - (Number.isFinite(state.heading) ? state.heading : 0);
        const delta = Math.atan2(Math.sin(targetYaw - fly.rotation.y), Math.cos(targetYaw - fly.rotation.y)); fly.rotation.y += delta * ease;
        fly.rotation.x = flying ? -.10 : 0;
        head.rotation.x = state.behavior === 'feeding' ? .17 + (running && !reducedMotion ? Math.sin(phase * 3) * .04 : 0) : 0;
        shadow.position.set(fly.position.x, .022, fly.position.z); shadow.scale.setScalar(1 + altitude * .4); shadow.material.opacity = .3 - altitude * .18;
        marker.position.set(fly.position.x, .026, fly.position.z); marker.visible = index === 0;
        model.noteLabel.visible=tombolaMode;
        if(tombolaMode){const pitches=music.layout?.pitches||[],names=music.layout?.noteNames||[],pitch=pitches.length?pitches[index%pitches.length]:60,noteText=names.length?names[index%names.length]:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]+(Math.floor(pitch/12)-1);if(noteText!==model.noteText){const replacement=labelSprite(noteText,index===0?'#edffcc':'#bedbc8');model.noteLabel.material.map.dispose();model.noteLabel.material.dispose();model.noteLabel.material=replacement.material;model.noteText=noteText;}model.noteLabel.position.set(fly.position.x,fly.position.y+.83,fly.position.z);}
        legs.forEach(l => {
          const signal = clamp(a[l.index]), oscillation = running && !reducedMotion ? Math.sin(phase + l.index * Math.PI * .73) * signal : 0;
          l.k.copy(l.knee); l.k.y += Math.max(0, oscillation) * .09;
          l.f.copy(l.foot); l.f.z += oscillation * .11; l.f.y += Math.max(0, oscillation) * .14 + (flying ? .12 : 0);
          l.toe.copy(l.f); l.toe.x += l.side * .12; l.toe.z += .05; l.toe.y = Math.max(.025, l.f.y - .035);
          if (model.legLines) {
            const offset = l.index * 18;
            [l.anchor, l.k, l.k, l.f, l.f, l.toe].forEach((point, i) => point.toArray(model.legPositions, offset + i * 3));
          } else {connect(l.upper, l.anchor, l.k); connect(l.lower, l.k, l.f); connect(l.tarsus, l.f, l.toe);}
        });
        if (model.legLines) model.legLines.geometry.attributes.position.needsUpdate = true;
        wings.forEach(w => {
          const beat = running && !reducedMotion ? (flying ? Math.sin(now * 67 + index) * .52 : Math.sin(phase * 3) * mean * .045) : 0;
          w.pivot.rotation.z = w.side * (.045 + beat); w.pivot.rotation.y = w.side * (flying ? -.2 : -.4);
        });
      });
      stringStage.visible = mode === 'strings'; gardenStage.visible = mode === 'ambient'||mode==='fruit';tombolaStage.visible=tombolaMode;table.visible=!tombolaMode;
      beginContacts(music, mode);
      updateFruit(Array.isArray(brain.fruits) ? brain.fruits : [], music, mode !== 'strings'&&!tombolaMode, now);
      if (mode === 'strings') updateStrings(music, now);
      updateContacts(music, now, mode);
      updateChamber(brain.tombola||{},mode,now,running,dt);
      view.render();
    },
    dispose() {
      canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointerleave',pointerLeave);
      // Keep template resources reachable for the shared resource disposer.
      fruitTemplates.forEach(template=>scene.add(template));view.dispose();
    },
  };
};
