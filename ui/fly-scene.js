import * as THREE from 'three';

// Original, decorative character geometry. Neural motor outputs animate the
// performance; the anatomy, gait, headphones and little DJ booth are artwork.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const UP = new THREE.Vector3(0, 1, 0);
const COLORS = { acid: 0xd8f353, lavender: 0xafb9f0, body: 0x282b27, red: 0xd34a2b, cream: 0xe8e6ce };

window.createFlyScene = function createFlyScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(0x181b15, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x181b15, 16, 31);
  const camera = new THREE.OrthographicCamera(-5, 5, 2.2, -2.2, 0.1, 50);
  camera.position.set(5.4, 5.4, 9);
  camera.lookAt(0, 0.8, 0);
  scene.add(new THREE.HemisphereLight(0xe5ecd4, 0x2c3229, 2.3));
  const key = new THREE.DirectionalLight(0xffe1b7, 4.1);
  key.position.set(-3, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5; key.shadow.camera.right = 5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.normalBias = 0.03;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8f353, 2.3);
  rim.position.set(-4, 3, -5); scene.add(rim);
  const soft = new THREE.DirectionalLight(0xbacaff, 1.5);
  soft.position.set(5, 3, 0); scene.add(soft);

  const materials = [];
  function material(color, options = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .52, metalness: .12, ...options });
    materials.push(m); return m;
  }
  const shell = material(COLORS.body, { roughness: .35, metalness: .27 });
  const softShell = material(0x3a3a2e, { roughness: .62 });
  const stripe = material(0x807052, { roughness: .62 });
  const black = material(0x141812, { roughness: .7 });
  const cream = material(COLORS.cream, { roughness: .44 });
  const accent = material(COLORS.acid, { roughness: .43 });
  const eye = new THREE.MeshPhysicalMaterial({ color: COLORS.red, roughness: .3, metalness: .12, clearcoat: .85, clearcoatRoughness: .22, flatShading: true });
  materials.push(eye);
  const glow = material(COLORS.acid, { emissive: COLORS.acid, emissiveIntensity: .65, roughness: .6 });
  const groundMaterial = material(0x1b1e17, { roughness: .96, metalness: 0 });
  const sphereGeometry = new THREE.SphereGeometry(1, 26, 18);
  const jointGeometry = new THREE.SphereGeometry(1, 12, 8);
  const tubeGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const ownedGeometry = new Set([sphereGeometry, jointGeometry, tubeGeometry]);

  function mesh(geometry, m, parent = scene, castShadow = true) {
    ownedGeometry.add(geometry);
    const object = new THREE.Mesh(geometry, m);
    object.castShadow = castShadow; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function ellipsoid(parent, m, position, scale, geometry = sphereGeometry) {
    const object = mesh(geometry, m, parent);
    object.position.set(...position); object.scale.set(...scale); return object;
  }
  function box(parent, m, position, size) {
    const object = mesh(new THREE.BoxGeometry(...size), m, parent);
    object.position.set(...position); return object;
  }
  function cylinder(parent, m, position, radius, height, segments = 32) {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, height, segments), m, parent);
    object.position.set(...position); return object;
  }
  function segment(parent, m, radius) {
    const object = mesh(tubeGeometry, m, parent);
    object.userData.radius = radius; return object;
  }
  const direction = new THREE.Vector3();
  function connect(object, a, b) {
    direction.subVectors(b, a);
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.scale.set(object.userData.radius, direction.length(), object.userData.radius);
    object.quaternion.setFromUnitVectors(UP, direction.normalize());
  }
  function curve(parent, m, points, radius = .012) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(path, 18, radius, 5, false), m, parent, false);
  }
  function roundedBlock(parent, m, width, depth, height, y, radius = .15) {
    const shape = new THREE.Shape(), x = -width / 2, z = -depth / 2;
    shape.moveTo(x + radius, z);
    shape.lineTo(x + width - radius, z); shape.quadraticCurveTo(x + width, z, x + width, z + radius);
    shape.lineTo(x + width, z + depth - radius); shape.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
    shape.lineTo(x + radius, z + depth); shape.quadraticCurveTo(x, z + depth, x, z + depth - radius);
    shape.lineTo(x, z + radius); shape.quadraticCurveTo(x, z, x + radius, z);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, steps: 1, bevelEnabled: true, bevelThickness: .045, bevelSize: .045, bevelSegments: 2, curveSegments: 6 });
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, y - height / 2, 0);
    return mesh(geometry, m, parent);
  }

  const ground = mesh(new THREE.PlaneGeometry(50, 50), groundMaterial, scene, false);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.21;
  // Fine green ground lines form a small studio stage without a remote texture.
  const grid = new THREE.GridHelper(22, 44, 0x30372a, 0x252d21);
  grid.position.y = -.202; grid.material.transparent = true; grid.material.opacity = .42; scene.add(grid);
  ownedGeometry.add(grid.geometry); materials.push(grid.material);

  const booth = new THREE.Group(); scene.add(booth);
  roundedBlock(booth, shell, 6.3, 2.5, .3, .05);
  roundedBlock(booth, black, 6.15, 2.36, .035, .24, .12);
  // A front lip and two recessed acid strips read well in a recorded video.
  box(booth, softShell, [0, .035, 1.28], [5.92, .19, .035]);
  box(booth, glow, [0, -.018, 1.305], [4.8, .018, .012]);
  for (const side of [-1, 1]) {
    box(booth, black, [side * 2.7, -.145, .77], [.3, .12, .24]);
    box(booth, black, [side * 2.7, -.145, -.77], [.3, .12, .24]);
    const platter = cylinder(booth, softShell, [side * 2.25, .285, .07], .65, .05, 52);
    cylinder(booth, black, [side * 2.25, .317, .07], .55, .02, 52);
    cylinder(booth, stripe, [side * 2.25, .332, .07], .14, .018, 24);
    for (const radius of [.3, .38, .46]) {
      const ring = mesh(new THREE.TorusGeometry(radius, .006, 4, 48), softShell, booth, false);
      ring.rotation.x = Math.PI / 2; ring.position.set(side * 2.25, .333, .07);
    }
    const marker = box(platter, accent, [0, .039, -.46], [.045, .012, .13]);
    marker.userData.platter = true;
    for (let i = 0; i < 3; i++) box(booth, i === 0 ? accent : cream, [side * 2.25 + (i - 1) * .22, .296, .93], [.13, .035, .12]);
  }
  const channels = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * .44;
    const channelMaterial = material(i < 3 ? COLORS.acid : COLORS.lavender, { emissive: i < 3 ? COLORS.acid : COLORS.lavender, emissiveIntensity: .15 });
    const stem = box(booth, softShell, [x, .284, .42], [.045, .016, .91]);
    box(booth, black, [x, .302, .42], [.018, .011, .85]);
    const fader = box(booth, cream, [x, .33, .62], [.22, .075, .105]);
    box(fader, black, [0, .04, 0], [.15, .008, .012]);
    const led = box(booth, channelMaterial, [x, .298, -.2], [.19, .019, .055]);
    const knob = cylinder(booth, shell, [x, .35, -.48], .078, .13, 14);
    box(knob, accent, [0, .067, .031], [.016, .009, .052]);
    const levels = [];
    for (let k = 0; k < 6; k++) levels.push(box(booth, channelMaterial, [x + .142, .297, .75 - k * .115], [.035, .01, .065]));
    channels.push({ fader, led, knob, levels, material: channelMaterial, x, stem });
  }

  const character = new THREE.Group(); scene.add(character);
  character.position.set(0, .26, -.3);
  // Oversized head and compound eyes deliberately make the little DJ readable.
  const abdomen = ellipsoid(character, stripe, [0, .94, -.57], [.43, .42, .65]);
  for (let i = 0; i < 4; i++) {
    const z = -.88 + i * .19;
    const ringRadius = Math.sqrt(Math.max(.1, 1 - ((z + .57) / .68) ** 2));
    const band = mesh(new THREE.TorusGeometry(.42 * ringRadius, .048, 8, 30), shell, character);
    band.scale.y = .93; band.position.set(0, .94, z);
  }
  ellipsoid(character, shell, [0, 1.15, -.07], [.44, .46, .49]);
  ellipsoid(character, softShell, [0, 1.3, .04], [.34, .34, .4]);
  const head = new THREE.Group(); character.add(head);
  head.position.set(0, 1.4, .47);
  ellipsoid(head, shell, [0, 0, 0], [.45, .39, .35]);
  const eyeGeometry = new THREE.IcosahedronGeometry(1, 3);
  for (const side of [-1, 1]) {
    const eyeball = ellipsoid(head, eye, [side * .295, .07, .233], [.31, .335, .254], eyeGeometry);
    eyeball.rotation.z = side * -.12;
    ellipsoid(head, cream, [side * .282 - .055, .185, .451], [.042, .064, .012]);
    ellipsoid(head, cream, [side * .282 + .026, .108, .477], [.016, .023, .009]);
  }
  // Short mouthparts and a curved line add expression without human eyeballs.
  ellipsoid(head, softShell, [0, -.16, .344], [.079, .063, .088]);
  curve(head, black, [[-.095, -.13, .329], [0, -.19, .372], [.095, -.13, .329]], .012);
  const antennae = [];
  for (const side of [-1, 1]) {
    const antenna = new THREE.Group(); head.add(antenna); antenna.position.set(side * .115, .29, .16);
    curve(antenna, shell, [[0, 0, 0], [side * .04, .17, .065], [side * .11, .26, .09]], .018);
    ellipsoid(antenna, softShell, [side * .11, .26, .09], [.04, .06, .035]);
    for (let i = 0; i < 3; i++) curve(antenna, stripe, [[side * (.052 + i * .02), .17 + i * .03, .07], [side * (.13 + i * .026), .19 + i * .05, .075]], .003);
    antennae.push(antenna);
  }
  const headphones = new THREE.Group(); head.add(headphones);
  const headband = mesh(new THREE.TorusGeometry(.535, .052, 10, 32, Math.PI), black, headphones);
  headband.position.set(0, -.02, -.014);
  const headbandEdge = mesh(new THREE.TorusGeometry(.545, .014, 6, 32, Math.PI), accent, headphones);
  headbandEdge.position.set(0, -.015, .022);
  for (const side of [-1, 1]) {
    const cup = cylinder(headphones, black, [side * .512, -.015, -.014], .18, .13, 22);
    cup.rotation.z = Math.PI / 2;
    const cap = cylinder(headphones, accent, [side * .584, -.015, -.014], .128, .018, 22);
    cap.rotation.z = Math.PI / 2;
    ellipsoid(headphones, black, [side * .602, -.015, -.014], [.012, .053, .052]);
  }

  const wingMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd8e3d9, roughness: .21, metalness: .12, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
  const veinMaterial = material(0xafbda5, { transparent: true, opacity: .43, roughness: .6 });
  materials.push(wingMaterial);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * .22, 1.41, -.19); character.add(pivot);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.bezierCurveTo(.32, .12, 1.38, .48, 1.42, .05);
    shape.bezierCurveTo(1.42, -.33, .72, -.65, .08, -.14); shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 20);
    geometry.rotateX(-Math.PI / 2); geometry.scale(side, 1, 1);
    const wing = mesh(geometry, wingMaterial, pivot, false); wing.renderOrder = 4;
    const paths = [
      [[0, .006, 0], [side * .48, .006, .08], [side * 1.31, .006, -.09]],
      [[side * .1, .008, .075], [side * .55, .008, .29], [side * 1.15, .008, .22]],
      [[side * .42, .009, .08], [side * .67, .009, .2], [side * .89, .009, .31]],
      [[side * .74, .009, .03], [side * 1.02, .009, .08], [side * 1.28, .009, .15]],
    ];
    for (const path of paths) curve(pivot, veinMaterial, path, .007);
    pivot.rotation.z = side * .11; pivot.rotation.y = side * .24;
    wings.push({ pivot, side });
  }

  const legs = [];
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let leg = 0; leg < 3; leg++) {
      const index = sideIndex * 3 + leg;
      const anchor = new THREE.Vector3(side * .32, 1.01 - leg * .06, .21 - leg * .3);
      const foot = new THREE.Vector3(side * (.55 + leg * .32), .065, .92 - leg * .39);
      const knee = new THREE.Vector3(side * (.75 + leg * .12), .64, .48 - leg * .36);
      const upper = segment(character, shell, .049);
      const lower = segment(character, softShell, .031);
      const shin = segment(character, shell, .021);
      const joint = ellipsoid(character, stripe, [0, 0, 0], [.07, .07, .07], jointGeometry);
      const shoe = ellipsoid(character, black, [0, 0, 0], [.08, .035, .115], jointGeometry);
      const toe = ellipsoid(character, stripe, [0, 0, 0], [.025, .023, .067], jointGeometry);
      legs.push({ index, side, leg, anchor, foot, knee, upper, lower, shin, joint, shoe, toe,
        currentFoot: foot.clone(), currentKnee: knee.clone(), ankle: foot.clone() });
    }
  }
  // A few bristles catch the studio rim light; no texture/image is required.
  for (let i = 0; i < 15; i++) {
    const angle = i * 2.39996;
    const x = Math.cos(angle) * .31, z = Math.sin(angle) * .28;
    curve(character, stripe, [[x, 1.48, z - .06], [x * 1.12, 1.6 + (i % 3) * .025, z - .07]], .005);
  }

  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0, height = 0, disposed = false, previousNow = 0, phase = 0;
  let currentX = 0, currentZ = -.3, currentYaw = -.16;
  function resize(w, h) {
    if (!w || !h || (width === w && height === h)) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const vertical = Math.max(3.65, 6.4 / aspect);
    camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
    camera.top = vertical / 2; camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
  }
  function update(brain = {}, running = false, music = {}) {
    if (disposed) return;
    const now = performance.now() / 1000;
    const dt = Math.min(.1, previousNow ? now - previousNow : .033); previousNow = now;
    const activity = brain.activity || [];
    const mean = activity.reduce((total, value) => total + clamp(value), 0) / Math.max(1, activity.length);
    if (running && !motionReduced) phase += dt * (3.2 + mean * 11);
    const idle = motionReduced ? 0 : now;
    const smooth = 1 - Math.exp(-dt * 7);
    const positionX = (clamp(brain.x ?? .5) - .5) * .43;
    const positionZ = -.3 + (clamp(brain.y ?? .5) - .5) * .18;
    currentX += (positionX - currentX) * smooth;
    currentZ += (positionZ - currentZ) * smooth;
    const desiredYaw = -.16 + Math.sin(Number.isFinite(brain.heading) ? brain.heading : 0) * .18 + clamp(brain.turn ?? 0, -1, 1) * .1;
    currentYaw += (desiredYaw - currentYaw) * smooth;
    character.position.set(currentX, .26 + (running ? Math.sin(phase * 2) * .018 * clamp(mean * 3) : 0), currentZ);
    character.rotation.y = currentYaw;
    head.rotation.z = running ? Math.sin(phase) * .036 : Math.sin(idle * .6) * .012;
    head.rotation.x = running ? Math.sin(phase * 2) * .016 : 0;
    abdomen.rotation.x = running ? Math.sin(phase) * .018 : 0;
    antennae.forEach((antenna, i) => { antenna.rotation.z = Math.sin(idle * 1.6 + i * 1.5) * .065; });
    wings.forEach(({ pivot, side }, i) => {
      const wingBeat = running ? Math.sin(phase * 3 + i) * .055 * clamp(mean * 3) : 0;
      pivot.rotation.z = side * (.11 + Math.sin(idle * 1.7 + i * .3) * .022 + wingBeat);
    });
    for (const leg of legs) {
      const signal = clamp(activity[leg.index]);
      const legPhase = phase + leg.leg * 2.1 + (leg.side === 1 ? Math.PI : 0);
      const gait = running && !motionReduced ? Math.sin(legPhase) * clamp(signal * 2.8) : 0;
      leg.currentFoot.copy(leg.foot);
      leg.currentFoot.z += gait * .15;
      leg.currentFoot.y += Math.max(0, gait) * .095;
      leg.currentKnee.copy(leg.knee);
      leg.currentKnee.y += Math.max(0, gait) * .07;
      leg.currentKnee.z += gait * .075;
      leg.ankle.copy(leg.currentFoot); leg.ankle.y += .14; leg.ankle.x -= leg.side * .07;
      connect(leg.upper, leg.anchor, leg.currentKnee);
      connect(leg.lower, leg.currentKnee, leg.ankle);
      connect(leg.shin, leg.ankle, leg.currentFoot);
      leg.joint.position.copy(leg.currentKnee);
      leg.shoe.position.copy(leg.currentFoot);
      leg.toe.position.copy(leg.currentFoot).add(new THREE.Vector3(0, 0, .095));
    }
    channels.forEach((channel, i) => {
      const voice = music.voices?.[i];
      const value = clamp(voice?.level ?? 0);
      channel.fader.position.z = .82 - value * 1.33;
      channel.knob.rotation.y = clamp(voice?.pan ?? 0, -1, 1) * 1.2;
      channel.material.emissiveIntensity = voice?.active ? .65 + clamp(activity[i]) * 1.7 : .03;
      channel.levels.forEach((led, k) => { led.visible = Boolean(voice?.active) && k < Math.max(1, Math.ceil(value * 12)); });
    });
    renderer.render(scene, camera);
  }
  function dispose() {
    disposed = true;
    for (const geometry of ownedGeometry) geometry.dispose();
    for (const m of new Set(materials)) m.dispose();
    renderer.dispose();
  }
  resize(canvas.clientWidth, canvas.clientHeight);
  return { update, resize, dispose };
};
