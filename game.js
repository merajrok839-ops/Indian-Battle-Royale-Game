let scene, camera, renderer, playerGroup, leftLeg, rightLeg, rightArm, gunMesh, muzzleFlash, zoneRing;
let gameActive = false, playerHP = 200, medkits = 3, glooCount = 5;
let kills = 0, headshots = 0, totalKills = 0, booyahWins = 0;
let isScoped = false, isCrouching = false, isFiring = false, isHealing = false;
let lastShotTime = 0, healTimer = 0, walkAnimTime = 0;
let playerYaw = 0, playerPitch = 0, velY = 0, isGrounded = true;
let joyX = 0, joyY = 0, zoneRadius = 130;

// Settings
let generalSens = 50, scopeSens = 45, gfxMode = 'high';

// Weapons Loadout
const weapons = [
  { name: 'AK-47', ammo: 30, maxAmmo: 30, rate: 130, bodyDmg: 38, headDmg: 155, zoom: 34, scopeLabel: '2X' },
  { name: 'AWM SNIPER', ammo: 5, maxAmmo: 5, rate: 850, bodyDmg: 115, headDmg: 300, zoom: 18, scopeLabel: '4X' }
];
let currentWeaponIdx = 0;

const enemies = [];
const obstacles = [];
const lootBoxes = [];
const raycaster = new THREE.Raycaster();

// Sound Synthesizer
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    osc.type = currentWeaponIdx === 0 ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(currentWeaponIdx === 0 ? 170 : 110, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.11);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);
    osc.start(now); osc.stop(now + 0.11);
  } else if (type === 'headshot') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.setValueAtTime(1900, now + 0.06);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
    osc.start(now); osc.stop(now + 0.24);
  } else if (type === 'heal') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.start(now); osc.stop(now + 0.25);
  } else if (type === 'gloo') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.15);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  }
}

// Procedural Textures for High Detail
function createGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#477a32';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#3b6828' : '#568c3e';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(45, 45);
  return tex;
}

function createWallTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d7ccc8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#bcaaa4';
  ctx.lineWidth = 2;
  for (let y = 0; y < 128; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ec8e3);
  scene.fog = new THREE.Fog(0x7ec8e3, 45, 200);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 320);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.id = 'game-canvas';
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3b5323, 0.85);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff3e0, 0.95);
  dirLight.position.set(60, 95, 50);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Textured Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshLambertMaterial({ map: createGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Safe Zone Blue Ring
  zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(zoneRadius - 0.8, zoneRadius, 72),
    new THREE.MeshBasicMaterial({ color: 0x00b0ff, side: THREE.DoubleSide })
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.1;
  scene.add(zoneRing);

  buildDetailedPlayer();
  buildIndianMap();
  applyGraphicsQuality();
}

function buildDetailedPlayer() {
  playerGroup = new THREE.Group();

  // Legs
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1c2630 });
  leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.26), legMat);
  leftLeg.position.set(-0.18, 0.32, 0);
  rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.26), legMat);
  rightLeg.position.set(0.18, 0.32, 0);

  // Tactical Vest Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.85, 0.38), new THREE.MeshLambertMaterial({ color: 0x1565c0 }));
  torso.position.y = 1.05;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.42), new THREE.MeshLambertMaterial({ color: 0x263238 }));
  vest.position.y = 1.08;

  // Backpack
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.25), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
  bag.position.set(0, 1.12, 0.28);

  // Head + Level 3 Helmet
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xffcc80 }));
  head.position.y = 1.72;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 14), new THREE.MeshLambertMaterial({ color: 0x212121 }));
  helmet.position.y = 1.78;

  // Right Arm + Detailed Gun + Muzzle Flash
  rightArm = new THREE.Group();
  rightArm.position.set(0.42, 1.32, 0);
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.55), new THREE.MeshLambertMaterial({ color: 0x1565c0 }));
  armMesh.position.z = -0.22;

  gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.85), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gunMesh.position.set(0, -0.02, -0.55);

  muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffea00 })
  );
  muzzleFlash.position.set(0, 0, -1.02);
  muzzleFlash.visible = false;

  rightArm.add(armMesh, gunMesh, muzzleFlash);
  playerGroup.add(leftLeg, rightLeg, torso, vest, bag, head, helmet, rightArm);
  scene.add(playerGroup);
}

function buildIndianMap() {
  const wallTex = createWallTexture();
  const fortMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xbf360c });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x616161 });

  // Central Indian Fort / Haveli Walls
  const structures = [
    [0, -24, 14, 4.5, 1.2], [-7.5, -18, 1.2, 4.5, 12], [7.5, -18, 1.2, 4.5, 12],
    [24, 16, 8, 4, 7], [-26, 22, 9, 4.2, 7], [28, -28, 7, 3.8, 7], [-28, -28, 8, 4.5, 8],
    [12, 8, 2.5, 1.8, 2.5], [-14, 6, 2.8, 2, 2.8], [0, 26, 4, 2.2, 2]
  ];

  structures.forEach(([x, z, w, h, d], idx) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), idx > 6 ? rockMat : fortMat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);

    if (idx >= 3 && idx <= 6) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), roofMat);
      roof.position.set(x, h + 0.2, z);
      scene.add(roof);
    }
  });

  // 3D Trees across the Map
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  for (let i = 0; i < 36; i++) {
    const angle = (Math.PI * 2 * i) / 36;
    const dist = 22 + (i % 5) * 20;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.6, 8), trunkMat);
    trunk.position.set(tx, 1.3, tz);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.2, 8), leafMat);
    leaves.position.set(tx, 4.2, tz);
    scene.add(trunk, leaves);
    obstacles.push(trunk);
  }
}

function spawnEnemies(count) {
  enemies.forEach(e => scene.remove(e.group));
  enemies.length = 0;

  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.42), new THREE.MeshLambertMaterial({ color: 0xc62828 }));
    bodyMesh.position.y = 1.05;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshLambertMaterial({ color: 0xffd54f }));
    headMesh.position.y = 1.85;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.36), new THREE.MeshLambertMaterial({ color: 0x212121 }));
    legs.position.y = 0.28;

    const enemyObj = { group, headMesh, bodyMesh, hp: 160, alive: true, shootTimer: 1 + Math.random() * 2 };
    bodyMesh.userData = { isHead: false, enemy: enemyObj };
    headMesh.userData = { isHead: true, enemy: enemyObj };

    group.add(bodyMesh, headMesh, legs);
    const angle = (Math.PI * 2 * i) / count;
    const dist = 28 + Math.random() * 68;
    group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    scene.add(group);
    enemies.push(enemyObj);
  }
}

function spawnLootCrates(count) {
  lootBoxes.forEach(l => scene.remove(l.mesh));
  lootBoxes.length = 0;

  const boxMat = new THREE.MeshLambertMaterial({ color: 0xffb300 });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.9), boxMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 75;
    mesh.position.set(Math.cos(angle) * dist, 0.33, Math.sin(angle) * dist);
    scene.add(mesh);
    lootBoxes.push({ mesh, active: true });
  }
}

function startMatch() {
  if (!scene) init3D();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  playerHP = 200; medkits = 3; glooCount = 5; kills = 0; headshots = 0; zoneRadius = 130;
  weapons[0].ammo = 30; weapons[1].ammo = 5; currentWeaponIdx = 0;
  isScoped = false; isCrouching = false; isHealing = false;
  camera.fov = 65; camera.updateProjectionMatrix();

  playerGroup.position.set(0, 0, 8);
  playerYaw = 0; playerPitch = 0;
  spawnEnemies(12);
  spawnLootCrates(10);
  updateHUD();

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  gameActive = true;
}

function exitToLobby() {
  gameActive = false;
  isFiring = false;
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
  document.getElementById('total-kills-badge').innerText = `KILLS: ${totalKills}`;
  document.getElementById('booyah-badge').innerText = `BOOYAH: ${booyahWins}`;
}

function updateHUD() {
  const w = weapons[currentWeaponIdx];
  const aliveCount = enemies.filter(e => e.alive).length + 1;
  document.getElementById('alive-box').innerText = `ALIVE: ${aliveCount} | KILLS: ${kills}`;
  document.getElementById('zone-box').innerText = `ZONE: ${Math.round(zoneRadius)}m`;
  document.getElementById('hp-text').innerText = `HP: ${Math.max(0, Math.round(playerHP))} / 200`;
  document.getElementById('hp-fill').style.width = `${Math.max(0, (playerHP / 200) * 100)}%`;
  document.getElementById('medkit-btn').innerText = `💊 MEDKIT (${medkits})`;
  document.getElementById('weapon-btn').innerText = `🔫 ${w.name} [${w.ammo}]`;
  document.getElementById('gloo-btn').innerText = `GLOO (${glooCount})`;
  document.getElementById('scope-btn').innerText = w.scopeLabel;
}

function switchWeapon() {
  currentWeaponIdx = (currentWeaponIdx + 1) % weapons.length;
  isScoped = false;
  camera.fov = 65;
  camera.updateProjectionMatrix();
  document.getElementById('scope-btn').style.background = 'rgba(0,0,0,0.5)';
  gunMesh.scale.z = currentWeaponIdx === 1 ? 1.45 : 1.0;
  updateHUD();
}

function useMedkit() {
  if (isHealing || medkits <= 0 || playerHP >= 200) return;
  medkits--;
  isHealing = true;
  healTimer = 0;
  document.getElementById('heal-wrap').style.display = 'block';
  updateHUD();
}

function collectNearbyLoot() {
  for (let box of lootBoxes) {
    if (box.active && playerGroup.position.distanceTo(box.mesh.position) < 3.2) {
      box.active = false;
      scene.remove(box.mesh);
      medkits += 2;
      glooCount += 2;
      weapons[0].ammo = weapons[0].maxAmmo;
      weapons[1].ammo = weapons[1].maxAmmo;
      playSound('heal');
      updateHUD();
      document.getElementById('loot-btn').style.display = 'none';
      break;
    }
  }
}

function showDamage(dmg, isHead) {
  const pop = document.getElementById('dmg-popup');
  pop.innerText = isHead ? `HEADSHOT! -${dmg}` : `-${dmg}`;
  pop.style.color = isHead ? '#ff1744' : '#ffffff';
  pop.style.opacity = '1';
  pop.style.transform = 'translateY(-20px)';
  setTimeout(() => { pop.style.opacity = '0'; pop.style.transform = 'translateY(0)'; }, 360);
}

function fireWeapon() {
  const w = weapons[currentWeaponIdx];
  const now = performance.now();
  if (now - lastShotTime < w.rate) return;
  if (w.ammo <= 0) { reloadWeapon(); return; }

  lastShotTime = now;
  w.ammo--;
  updateHUD();
  playSound('shoot');

  // Muzzle Flash & Gun Recoil
  muzzleFlash.visible = true;
  gunMesh.position.z = -0.42;
  setTimeout(() => {
    if (muzzleFlash) muzzleFlash.visible = false;
    if (gunMesh) gunMesh.position.z = -0.55;
  }, 65);

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  enemies.forEach(e => { if (e.alive) targets.push(e.headMesh, e.bodyMesh); });
  obstacles.forEach(o => targets.push(o));

  const hits = raycaster.intersectObjects(targets);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    if (hitObj.userData && hitObj.userData.enemy) {
      const enemy = hitObj.userData.enemy;
      const isHead = hitObj.userData.isHead;
      const dmg = isHead ? w.headDmg : w.bodyDmg;
      enemy.hp -= dmg;
      showDamage(dmg, isHead);

      if (isHead) {
        headshots++;
        playSound('headshot');
      }

      if (enemy.hp <= 0 && enemy.alive) {
        enemy.alive = false;
        // Drop Death Loot Box
        const drop = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.65, 0.9),
          new THREE.MeshLambertMaterial({ color: 0x00e676 })
        );
        drop.position.set(enemy.group.position.x, 0.33, enemy.group.position.z);
        scene.add(drop);
        lootBoxes.push({ mesh: drop, active: true });

        scene.remove(enemy.group);
        kills++;
        totalKills++;
        updateHUD();
        if (enemies.every(e => !e.alive)) endMatch(true);
      }
    }
  }
}

function reloadWeapon() {
  const w = weapons[currentWeaponIdx];
  w.ammo = w.maxAmmo;
  updateHUD();
}

function placeGlooWall() {
  if (glooCount <= 0) return;
  glooCount--;
  updateHUD();
  playSound('gloo');

  const gloo = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 2.4, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.82 })
  );
  const fx = -Math.sin(playerYaw) * 3.3;
  const fz = -Math.cos(playerYaw) * 3.3;
  gloo.position.set(playerGroup.position.x + fx, 1.2, playerGroup.position.z + fz);
  gloo.rotation.y = playerYaw;
  scene.add(gloo);
  obstacles.push(gloo);
}

function endMatch(won) {
  gameActive = false;
  isFiring = false;
  if (won) booyahWins++;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('end-screen').style.display = 'flex';
  document.getElementById('end-title').innerText = won ? 'BOOYAH! 🇮🇳 इंडिया की जीत' : 'ELIMINATED! दोबारा खेलें';
  document.getElementById('end-stats').innerText = `Match Kills: ${kills} | Headshots: ${headshots}`;
}

// Settings Functions
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
function updateSettingsUI() {
  generalSens = parseInt(document.getElementById('sens-general').value);
  scopeSens = parseInt(document.getElementById('sens-scope').value);
  document.getElementById('sens-gen-val').innerText = generalSens;
  document.getElementById('sens-scp-val').innerText = scopeSens;
}
function applyGraphicsQuality() {
  gfxMode = document.getElementById('gfx-quality').value;
  if (!renderer) return;
  if (gfxMode === 'low') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
  } else if (gfxMode === 'medium') {
    renderer.setPixelRatio(1.5);
    renderer.shadowMap.enabled = true;
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
  }
}

// Mini-Map Radar Renderer
function drawMiniMap() {
  const canvas = document.getElementById('minimap');
  if (!canvas || !playerGroup) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1b3319';
  ctx.fillRect(0, 0, w, h);

  const scale = 0.7;
  // Safe Zone Circle
  ctx.strokeStyle = '#00b0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - playerGroup.position.x * scale, cy - playerGroup.position.z * scale, zoneRadius * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Loot Dots (Yellow)
  ctx.fillStyle = '#ffca28';
  lootBoxes.forEach(l => {
    if (!l.active) return;
    const dx = (l.mesh.position.x - playerGroup.position.x) * scale;
    const dz = (l.mesh.position.z - playerGroup.position.z) * scale;
    ctx.fillRect(cx + dx - 2, cy + dz - 2, 4, 4);
  });

  // Enemy Red Dots
  ctx.fillStyle = '#ff1744';
  enemies.forEach(e => {
    if (!e.alive) return;
    const dx = (e.group.position.x - playerGroup.position.x) * scale;
    const dz = (e.group.position.z - playerGroup.position.z) * scale;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dz, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Player Center White Dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Touch Controls
let joyTouchId = null, lookTouchId = null, fireTouchId = null;
let lastLookX = 0, lastLookY = 0, lastFireY = 0;

const joyZone = document.getElementById('joy-zone');
const joyStick = document.getElementById('joy-stick');
joyZone.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  updateJoystick(t);
});
joyZone.addEventListener('touchmove', e => {
  for (let t of e.changedTouches) { if (t.identifier === joyTouchId) updateJoystick(t); }
});
joyZone.addEventListener('touchend', e => {
  for (let t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null; joyX = 0; joyY = 0;
      joyStick.style.transform = 'translate(-50%, -50%)';
    }
  }
});

function updateJoystick(t) {
  const rect = joyZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy;
  const maxR = 44, dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyX = dx / maxR; joyY = dy / maxR;
}

const lookZone = document.getElementById('look-zone');
lookZone.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  if (lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; }
});
lookZone.addEventListener('touchmove', e => {
  for (let t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const mult = isScoped ? (scopeSens / 10000) : (generalSens / 9000);
      playerYaw -= (t.clientX - lastLookX) * mult;
      playerPitch = Math.max(-0.68, Math.min(0.68, playerPitch - (t.clientY - lastLookY) * mult));
      lastLookX = t.clientX; lastLookY = t.clientY;
    }
  }
});
lookZone.addEventListener('touchend', e => {
  for (let t of e.changedTouches) { if (t.identifier === lookTouchId) lookTouchId = null; }
});

// Fire & Drag-Headshot
const fireBtn = document.getElementById('fire-btn');
fireBtn.addEventListener('touchstart', e => {
  e.stopPropagation();
  const t = e.changedTouches[0];
  fireTouchId = t.identifier;
  lastFireY = t.clientY;
  isFiring = true;
  fireWeapon();
});
fireBtn.addEventListener('touchmove', e => {
  e.stopPropagation();
  for (let t of e.changedTouches) {
    if (t.identifier === fireTouchId) {
      const dragUp = lastFireY - t.clientY;
      const dragMult = (scopeSens / 10000);
      playerPitch = Math.max(-0.68, Math.min(0.68, playerPitch + dragUp * dragMult));
      lastFireY = t.clientY;
    }
  }
});
fireBtn.addEventListener('touchend', e => {
  for (let t of e.changedTouches) { if (t.identifier === fireTouchId) { fireTouchId = null; isFiring = false; } }
});

document.getElementById('jump-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  if (isGrounded) { velY = 0.23; isGrounded = false; }
});

document.getElementById('crouch-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  isCrouching = !isCrouching;
  playerGroup.scale.y = isCrouching ? 0.68 : 1.0;
  document.getElementById('crouch-btn').style.background = isCrouching ? '#ff6f00' : 'rgba(0,0,0,0.5)';
});

document.getElementById('scope-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  const w = weapons[currentWeaponIdx];
  isScoped = !isScoped;
  camera.fov = isScoped ? w.zoom : 65;
  camera.updateProjectionMatrix();
  document.getElementById('scope-btn').style.background = isScoped ? '#ff6f00' : 'rgba(0,0,0,0.5)';
});

document.getElementById('gloo-btn').addEventListener('touchstart', e => { e.stopPropagation(); placeGlooWall(); });
document.getElementById('reload-btn').addEventListener('touchstart', e => { e.stopPropagation(); reloadWeapon(); });

// Main Game Loop
let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  prevTime = now;

  if (gameActive && playerGroup) {
    if (isFiring && currentWeaponIdx === 0) fireWeapon();

    // Movement & Leg Animation
    const moveSpeed = (isCrouching ? 6 : 11.5) * dt;
    const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
    const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
    playerGroup.position.addScaledVector(forward, -joyY * moveSpeed);
    playerGroup.position.addScaledVector(right, joyX * moveSpeed);
    playerGroup.rotation.y = playerYaw;

    if (Math.hypot(joyX, joyY) > 0.1) {
      walkAnimTime += dt * 12;
      leftLeg.rotation.x = Math.sin(walkAnimTime) * 0.65;
      rightLeg.rotation.x = -Math.sin(walkAnimTime) * 0.65;
    } else {
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
    }

    // Jump & Gravity
    playerGroup.position.y += velY;
    if (playerGroup.position.y > 0) velY -= 0.012;
    else { playerGroup.position.y = 0; velY = 0; isGrounded = true; }

    // Medkit Healing Progress
    if (isHealing) {
      healTimer += dt;
      document.getElementById('heal-fill').style.width = `${Math.min(100, (healTimer / 2.2) * 100)}%`;
      if (healTimer >= 2.2) {
        isHealing = false;
        playerHP = Math.min(200, playerHP + 85);
        document.getElementById('heal-wrap').style.display = 'none';
        playSound('heal');
        updateHUD();
      }
    }

    // Check Nearby Loot Crates
    let nearLoot = false;
    for (let box of lootBoxes) {
      if (box.active) {
        box.mesh.rotation.y += dt * 1.5;
        if (playerGroup.position.distanceTo(box.mesh.position) < 3.2) nearLoot = true;
      }
    }
    document.getElementById('loot-btn').style.display = nearLoot ? 'block' : 'none';

    // Over-the-Shoulder TPP Camera
    const camDist = isScoped ? 1.1 : 3.7;
    const rightOff = isScoped ? 0.52 : 0.78;
    const baseHeight = isCrouching ? 1.55 : 2.15;
    const camX = playerGroup.position.x + Math.sin(playerYaw) * camDist + Math.cos(playerYaw) * rightOff;
    const camZ = playerGroup.position.z + Math.cos(playerYaw) * camDist - Math.sin(playerYaw) * rightOff;
    const camY = playerGroup.position.y + baseHeight - Math.sin(playerPitch) * 1.4;
    camera.position.set(camX, camY, camZ);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = playerYaw;
    camera.rotation.x = playerPitch;

    // Safe Zone Shrink
    if (zoneRadius > 20) {
      zoneRadius -= 0.75 * dt;
      zoneRing.scale.set(zoneRadius / 130, zoneRadius / 130, 1);
    }
    if (playerGroup.position.length() > zoneRadius) {
      playerHP -= 6 * dt;
      updateHUD();
      if (playerHP <= 0) endMatch(false);
    }

    // Enemy AI
    enemies.forEach(enemy => {
      if (!enemy.alive) return;
      const toPlayer = new THREE.Vector3().subVectors(playerGroup.position, enemy.group.position);
      const dist = toPlayer.length();
      enemy.group.lookAt(playerGroup.position.x, 0, playerGroup.position.z);

      if (dist > 15 && dist < 95) {
        toPlayer.normalize();
        enemy.group.position.addScaledVector(toPlayer, 4.4 * dt);
      }

      enemy.shootTimer -= dt;
      if (dist < 60 && enemy.shootTimer <= 0) {
        enemy.shootTimer = 1.7 + Math.random();
        const dir = toPlayer.clone().normalize();
        const botRay = new THREE.Raycaster(
          new THREE.Vector3(enemy.group.position.x, 1.4, enemy.group.position.z),
          dir, 0, dist
        );
        const blocked = botRay.intersectObjects(obstacles);
        if (blocked.length === 0 && Math.random() < 0.45) {
          playerHP -= 12;
          updateHUD();
          if (playerHP <= 0) endMatch(false);
        }
      }
    });

    drawMiniMap();
    renderer.render(scene, camera);
  }
}
animate();

window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
