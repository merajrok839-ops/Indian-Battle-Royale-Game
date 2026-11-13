// ================= SAVED DATA & DEFAULT STATE =================
const defaultOutfits = [
  { id: 'navy', name: 'Commando Navy', c1: '#1565c0', c2: '#1c2630', helm: '#212121' },
  { id: 'army', name: 'Bharat Army Camo', c1: '#33691e', c2: '#263238', helm: '#1b5e20' },
  { id: 'gold', name: 'Royal Golden Raja', c1: '#ff8f00', c2: '#3e2723', helm: '#ffd54f' },
  { id: 'cobra', name: 'Black Cobra Ops', c1: '#212121', c2: '#b71c1c', helm: '#000000' }
];

let outfits = JSON.parse(localStorage.getItem('ibr_outfits')) || defaultOutfits;
let equippedOutfitId = localStorage.getItem('ibr_equipped') || 'navy';
let playerName = localStorage.getItem('ibr_name') || 'COMMANDO_IND';
let playerDP = localStorage.getItem('ibr_dp') || '';
let activeSeason = localStorage.getItem('ibr_season') || '🔥 SEASON 1: आरंभ';
let totalKills = parseInt(localStorage.getItem('ibr_kills')) || 0;
let booyahWins = parseInt(localStorage.getItem('ibr_booyah')) || 0;
let tempDPData = '';

// ================= 3D ENGINE VARIABLES =================
let scene, camera, renderer, playerGroup, leftLeg, rightLeg, leftArm, rightArm, torsoMesh, pantsMesh, helmetMesh, gunMesh, muzzleFlash, zoneRing;
let lobbyScene, lobbyCamera, lobbyRenderer, lobbyCharGroup;
let gameActive = false, playerHP = 200, medkits = 3, glooCount = 5;
let kills = 0, headshots = 0;
let isScoped = false, isCrouching = false, isFiring = false, isHealing = false;
let lastShotTime = 0, healTimer = 0, walkAnimTime = 0;
let playerYaw = 0, playerPitch = 0, velY = 0, isGrounded = true;
let joyX = 0, joyY = 0, zoneRadius = 140;

// Settings
let generalSens = 55, scopeSens = 50, gfxMode = 'high';

// Weapons
const weapons = [
  { name: 'AK-47', ammo: 30, maxAmmo: 30, rate: 125, bodyDmg: 40, headDmg: 160, zoom: 34, scopeLabel: '2X', scopeTitle: '2X OPTICAL' },
  { name: 'AWM SNIPER', ammo: 5, maxAmmo: 5, rate: 820, bodyDmg: 120, headDmg: 300, zoom: 17, scopeLabel: '4X', scopeTitle: '4X SNIPER' }
];
let currentWeaponIdx = 0;

const enemies = [];
const obstacles = [];
const lootBoxes = [];
const tracers = [];
const raycaster = new THREE.Raycaster();

// ================= SOUND SYNTHESIZER =================
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
    osc.frequency.setValueAtTime(currentWeaponIdx === 0 ? 185 : 105, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.11);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);
    osc.start(now); osc.stop(now + 0.11);
  } else if (type === 'headshot') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, now);
    osc.frequency.setValueAtTime(1950, now + 0.06);
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

// ================= REALISTIC PROCEDURAL TEXTURES =================
function createTerrainTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');

  // Rich olive-earth grass base
  ctx.fillStyle = '#3d632c';
  ctx.fillRect(0, 0, 512, 512);

  // Organic soil & grass variation
  for (let i = 0; i < 4500; i++) {
    const r = Math.random();
    ctx.fillStyle = r < 0.35 ? '#2f4f21' : (r < 0.7 ? '#4c7536' : '#5c6b3c');
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  // Dirt Road Cross-Path
  ctx.fillStyle = '#796349';
  ctx.fillRect(230, 0, 52, 512);
  ctx.fillRect(0, 230, 512, 52);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function createBuildingTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc3b4';
  ctx.fillRect(0, 0, 256, 256);

  // Plaster & Brick detail
  ctx.fillStyle = '#b8aa99';
  for (let i = 0; i < 600; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 2);
  }
  // Windows
  ctx.fillStyle = '#1c2833';
  ctx.fillRect(36, 55, 52, 65);
  ctx.fillRect(168, 55, 52, 65);
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 55, 52, 65);
  ctx.strokeRect(168, 55, 52, 65);

  return new THREE.CanvasTexture(c);
}

function createContainerTexture(baseColor) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < 128; x += 8) ctx.fillRect(x, 0, 3, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(4, 4, 120, 120);
  return new THREE.CanvasTexture(c);
}

// ================= ARTICULATED 3D SOLDIER BUILDER =================
function getCurrentOutfit() {
  return outfits.find(o => o.id === equippedOutfitId) || outfits[0];
}

function createSoldierMesh(outfit) {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: outfit.c1, roughness: 0.5 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: outfit.c2, roughness: 0.7 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x1c222b, roughness: 0.4 });
  const helmMat = new THREE.MeshStandardMaterial({ color: outfit.helm, roughness: 0.3, metalness: 0.3 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

  // Left Leg + Boot
  const lLeg = new THREE.Group();
  lLeg.position.set(-0.17, 0.78, 0);
  const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.68, 10), pantsMat);
  lThigh.position.y = -0.34;
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.28), bootMat);
  lBoot.position.set(0, -0.7, -0.04);
  lLeg.add(lThigh, lBoot);

  // Right Leg + Boot
  const rLeg = new THREE.Group();
  rLeg.position.set(0.17, 0.78, 0);
  const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.68, 10), pantsMat);
  rThigh.position.y = -0.34;
  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.28), bootMat);
  rBoot.position.set(0, -0.7, -0.04);
  rLeg.add(rThigh, rBoot);

  // Torso & Tactical Armor Vest
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.76, 12), shirtMat);
  torso.position.y = 1.16;
  torso.scale.set(1.15, 1, 0.75);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.36), vestMat);
  vest.position.y = 1.18;

  // Military Backpack
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.22), new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 }));
  bag.position.set(0, 1.2, 0.26);

  // Neck, Head & Visor Helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skinMat);
  head.position.y = 1.72;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), helmMat);
  helmet.position.y = 1.75;

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.12), new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x006064 }));
  visor.position.set(0, 1.74, -0.19);

  // Left Arm
  const lArm = new THREE.Group();
  lArm.position.set(-0.37, 1.44, 0);
  const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.56, 8), shirtMat);
  lArmMesh.position.set(0.08, -0.22, -0.18);
  lArmMesh.rotation.x = 0.75;
  lArm.add(lArmMesh);

  // Right Arm + Detailed Assault Rifle
  const rArm = new THREE.Group();
  rArm.position.set(0.37, 1.44, 0);
  const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.54, 8), shirtMat);
  rArmMesh.position.set(-0.04, -0.18, -0.2);
  rArmMesh.rotation.x = 1.1;

  const gunGroup = new THREE.Group();
  gunGroup.position.set(-0.06, -0.24, -0.45);
  const bodyGun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.65), new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.7, roughness: 0.3 }));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.48);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
  mag.position.set(0, -0.12, -0.12);
  mag.rotation.x = 0.25;
  gunGroup.add(bodyGun, barrel, mag);

  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffea00 }));
  flash.position.set(0, 0.02, -0.72);
  flash.visible = false;
  gunGroup.add(flash);

  rArm.add(rArmMesh, gunGroup);

  root.add(lLeg, rLeg, torso, vest, bag, head, helmet, visor, lArm, rArm);
  root.traverse(obj => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });

  return { root, lLeg, rLeg, lArm, rArm, torso, lThigh, rThigh, helmet, gunGroup, flash };
}

// ================= LOBBY 3D PREVIEW & UI SYNC =================
function initLobby3D() {
  const canvas = document.getElementById('lobby-canvas');
  if (!canvas) return;
  lobbyScene = new THREE.Scene();
  lobbyCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  lobbyCamera.position.set(0, 1.35, 3.6);

  lobbyRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  lobbyRenderer.setSize(window.innerWidth, window.innerHeight);
  lobbyRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x263238, 1.1);
  lobbyScene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffecb3, 1.2);
  dir.position.set(3, 5, 4);
  lobbyScene.add(dir);

  // Pedestal Platform
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.6, roughness: 0.3 })
  );
  ped.position.y = -0.07;
  lobbyScene.add(ped);

  rebuildLobbyCharacter();
}

function rebuildLobbyCharacter() {
  if (!lobbyScene) return;
  if (lobbyCharGroup) lobbyScene.remove(lobbyCharGroup);
  const built = createSoldierMesh(getCurrentOutfit());
  lobbyCharGroup = built.root;
  lobbyScene.add(lobbyCharGroup);
}

function syncLobbyUI() {
  document.getElementById('player-name-display').innerText = playerName;
  if (playerDP) document.getElementById('player-dp-img').src = playerDP;
  document.getElementById('season-banner').innerText = activeSeason;
  document.getElementById('total-kills-badge').innerText = `KILLS: ${totalKills}`;
  document.getElementById('booyah-badge').innerText = `BOOYAH: ${booyahWins}`;
  const eq = getCurrentOutfit();
  document.getElementById('equipped-outfit-label').innerText = eq.name;
}

// ================= PROFILE, OUTFITS & OWNER MODALS =================
function openProfileModal() {
  document.getElementById('input-player-name').value = playerName;
  tempDPData = playerDP;
  document.getElementById('profile-modal').style.display = 'flex';
}

function previewDP(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { tempDPData = ev.target.result; };
  reader.readAsDataURL(file);
}

function saveProfile() {
  const val = document.getElementById('input-player-name').value.trim();
  if (val) {
    playerName = val;
    localStorage.setItem('ibr_name', playerName);
  }
  if (tempDPData) {
    playerDP = tempDPData;
    localStorage.setItem('ibr_dp', playerDP);
  }
  syncLobbyUI();
  closeModal('profile-modal');
}

function openVaultModal() {
  const list = document.getElementById('outfit-list');
  list.innerHTML = '';
  outfits.forEach(o => {
    const div = document.createElement('div');
    div.className = 'outfit-item' + (o.id === equippedOutfitId ? ' active' : '');
    div.innerHTML = `<span class="outfit-swatch" style="background:linear-gradient(135deg,${o.c1},${o.c2})"></span><span>${o.name}</span>`;
    div.onclick = () => {
      equippedOutfitId = o.id;
      localStorage.setItem('ibr_equipped', equippedOutfitId);
      rebuildLobbyCharacter();
      syncLobbyUI();
      openVaultModal();
    };
    list.appendChild(div);
  });
  document.getElementById('vault-modal').style.display = 'flex';
}

function openOwnerModal() {
  document.getElementById('owner-pin-step').style.display = 'block';
  document.getElementById('owner-controls-step').style.display = 'none';
  document.getElementById('owner-pin-input').value = '';
  document.getElementById('owner-modal').style.display = 'flex';
}

function verifyOwnerPin() {
  const pin = document.getElementById('owner-pin-input').value.trim();
  if (pin === '1234') {
    document.getElementById('owner-pin-step').style.display = 'none';
    document.getElementById('owner-controls-step').style.display = 'block';
    document.getElementById('admin-season-input').value = activeSeason;
  } else {
    alert('गलत PIN! Default PIN: 1234');
  }
}

function saveNewSeason() {
  const s = document.getElementById('admin-season-input').value.trim();
  if (s) {
    activeSeason = s;
    localStorage.setItem('ibr_season', activeSeason);
    syncLobbyUI();
    alert('नया Season अपडेट हो गया!');
  }
}

function addNewOutfit() {
  const name = document.getElementById('admin-outfit-name').value.trim();
  const c1 = document.getElementById('admin-outfit-color1').value;
  const c2 = document.getElementById('admin-outfit-color2').value;
  if (!name) return;
  const newItem = { id: 'custom_' + Date.now(), name, c1, c2, helm: c1 };
  outfits.push(newItem);
  localStorage.setItem('ibr_outfits', JSON.stringify(outfits));
  equippedOutfitId = newItem.id;
  localStorage.setItem('ibr_equipped', equippedOutfitId);
  rebuildLobbyCharacter();
  syncLobbyUI();
  document.getElementById('admin-outfit-name').value = '';
  alert(`नया कपड़ा "${name}" जुड़ गया और पहना दिया गया!`);
}

function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

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

// ================= IN-GAME 3D WORLD =================
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fb7d6);
  scene.fog = new THREE.FogExp2(0x88c4dc, 0.0055);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 350);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.id = 'game-canvas';
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xfff8e7, 0x3b5323, 0.85);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.1);
  dirLight.position.set(70, 110, 60);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Sun Disc in Sky
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff59d }));
  sunMesh.position.set(120, 140, -160);
  scene.add(sunMesh);

  // Textured Terrain
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ map: createTerrainTexture(), roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Safe Zone Blue Energy Wall
  zoneRing = new THREE.Mesh(
    new THREE.CylinderGeometry(zoneRadius, zoneRadius, 18, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x00b0ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  zoneRing.position.y = 9;
  scene.add(zoneRing);

  buildRealisticMap();
  applyGraphicsQuality();
}

function buildRealisticMap() {
  const houseMat = new THREE.MeshStandardMaterial({ map: createBuildingTexture(), roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d3b24, roughness: 0.7 });
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9 });

  // Detailed Compounds & Houses
  const houses = [
    [22, 18, 9, 4.4, 7], [-25, 22, 10, 4.6, 8], [28, -28, 9, 4.2, 8],
    [-28, -26, 11, 5, 9], [0, -34, 14, 4.8, 8]
  ];
  houses.forEach(([x, z, w, h, d]) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), houseMat);
    body.position.set(x, h / 2, z);
    body.castShadow = true; body.receiveShadow = true;
    scene.add(body); obstacles.push(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.45, d + 0.8), roofMat);
    roof.position.set(x, h + 0.22, z);
    roof.castShadow = true;
    scene.add(roof);
  });

  // Military Shipping Containers
  const containers = [
    [12, -10, '#1565c0', 0.3], [-14, -8, '#c62828', -0.4], [14, 32, '#2e7d32', 1.4]
  ];
  containers.forEach(([x, z, col, rot]) => {
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.7, 6.5),
      new THREE.MeshStandardMaterial({ map: createContainerTexture(col), metalness: 0.4, roughness: 0.5 })
    );
    cont.position.set(x, 1.35, z);
    cont.rotation.y = rot;
    cont.castShadow = true; cont.receiveShadow = true;
    scene.add(cont); obstacles.push(cont);
  });

  // Sandbag Cover Bunkers
  const bunkers = [[0, 15], [-9, 4], [9, 3], [-15, 20], [18, -18]];
  bunkers.forEach(([x, z]) => {
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.15, 0.9), sandbagMat);
    bunker.position.set(x, 0.58, z);
    bunker.castShadow = true; bunker.receiveShadow = true;
    scene.add(bunker); obstacles.push(bunker);
  });

  // Multi-Foliage Realistic Trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
  const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });

  for (let i = 0; i < 42; i++) {
    const angle = (Math.PI * 2 * i) / 42;
    const dist = 24 + (i % 6) * 20;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 3.2, 8), trunkMat);
    trunk.position.set(tx, 1.6, tz);
    trunk.castShadow = true;

    const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9, 1), leafMat1);
    crown1.position.set(tx, 3.8, tz);
    crown1.castShadow = true;

    const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), leafMat2);
    crown2.position.set(tx + 0.6, 4.7, tz - 0.4);
    crown2.castShadow = true;

    scene.add(trunk, crown1, crown2);
    obstacles.push(trunk);
  }
}

function buildPlayerCharacter() {
  if (playerGroup) scene.remove(playerGroup);
  const built = createSoldierMesh(getCurrentOutfit());
  playerGroup = built.root;
  leftLeg = built.lLeg;
  rightLeg = built.rLeg;
  leftArm = built.lArm;
  rightArm = built.rArm;
  torsoMesh = built.torso;
  gunMesh = built.gunGroup;
  muzzleFlash = built.flash;
  scene.add(playerGroup);
}

function spawnEnemies(count) {
  enemies.forEach(e => scene.remove(e.group));
  enemies.length = 0;

  const enemyOutfit = { c1: '#b71c1c', c2: '#212121', helm: '#ffca28' };
  for (let i = 0; i < count; i++) {
    const built = createSoldierMesh(enemyOutfit);
    const group = built.root;

    // Hitboxes
    const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    bodyHit.position.y = 1.05;
    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
    headHit.position.y = 1.78;

    const enemyObj = {
      group, headHit, bodyHit, lLeg: built.lLeg, rLeg: built.rLeg,
      hp: 160, alive: true, shootTimer: 1 + Math.random() * 2, anim: Math.random() * 5
    };
    bodyHit.userData = { isHead: false, enemy: enemyObj };
    headHit.userData = { isHead: true, enemy: enemyObj };

    group.add(bodyHit, headHit);
    const angle = (Math.PI * 2 * i) / count;
    const dist = 30 + Math.random() * 75;
    group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    scene.add(group);
    enemies.push(enemyObj);
  }
}

function spawnLootCrates(count) {
  lootBoxes.forEach(l => scene.remove(l.mesh));
  lootBoxes.length = 0;

  const boxMat = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.4, roughness: 0.4 });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.95), boxMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 80;
    mesh.position.set(Math.cos(angle) * dist, 0.33, Math.sin(angle) * dist);
    mesh.castShadow = true;
    scene.add(mesh);
    lootBoxes.push({ mesh, active: true });
  }
}

function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function startMatch() {
  enterFullscreen();
  if (!scene) init3D();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  buildPlayerCharacter();
  playerHP = 200; medkits = 3; glooCount = 5; kills = 0; headshots = 0; zoneRadius = 140;
  weapons[0].ammo = 30; weapons[1].ammo = 5; currentWeaponIdx = 0;
  isScoped = false; isCrouching = false; isHealing = false;
  camera.fov = 65; camera.updateProjectionMatrix();
  document.getElementById('scope-overlay').style.display = 'none';

  playerGroup.position.set(0, 0, 8);
  playerYaw = 0; playerPitch = 0;
  spawnEnemies(12);
  spawnLootCrates(12);
  updateHUD();

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  gameActive = true;
}

function exitToLobby() {
  gameActive = false;
  isFiring = false;
  isScoped = false;
  document.getElementById('scope-overlay').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
  syncLobbyUI();
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
  document.getElementById('scope-overlay').style.display = 'none';
  document.getElementById('scope-btn').style.background = 'rgba(12, 18, 30, 0.62)';
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
    if (box.active && playerGroup.position.distanceTo(box.mesh.position) < 3.4) {
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

function spawnBulletTracer(startPos, endPos) {
  const mat = new THREE.LineBasicMaterial({ color: 0xffea00 });
  const geo = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life: 0.08 });
}

function showHitFeedback(dmg, isHead) {
  const hm = document.getElementById('hitmarker');
  hm.style.color = isHead ? '#ff1744' : '#ffffff';
  hm.style.opacity = '1';
  setTimeout(() => { hm.style.opacity = '0'; }, 120);

  const pop = document.getElementById('dmg-popup');
  pop.innerText = isHead ? `HEADSHOT! -${dmg}` : `-${dmg}`;
  pop.style.color = isHead ? '#ff1744' : '#ffeb3b';
  pop.style.opacity = '1';
  pop.style.transform = 'translateY(-22px)';
  setTimeout(() => { pop.style.opacity = '0'; pop.style.transform = 'translateY(0)'; }, 360);
}

function showKillBanner(isHead) {
  const kb = document.getElementById('kill-banner');
  kb.innerText = isHead ? `💀 ${playerName} • HEADSHOT KILL!` : `🔥 ${playerName} • ELIMINATED ENEMY!`;
  kb.style.display = 'block';
  setTimeout(() => { kb.style.display = 'none'; }, 2200);
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

  // Muzzle Flash & Recoil
  muzzleFlash.visible = true;
  gunMesh.position.z = -0.34;
  setTimeout(() => {
    if (muzzleFlash) muzzleFlash.visible = false;
    if (gunMesh) gunMesh.position.z = -0.45;
  }, 60);

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  enemies.forEach(e => { if (e.alive) targets.push(e.headHit, e.bodyHit); });
  obstacles.forEach(o => targets.push(o));

  const hits = raycaster.intersectObjects(targets);
  const muzzleWorld = new THREE.Vector3();
  muzzleFlash.getWorldPosition(muzzleWorld);
  const endPoint = hits.length > 0 ? hits[0].point : raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 90);
  spawnBulletTracer(muzzleWorld, endPoint);

  if (hits.length > 0) {
    const hitObj = hits[0].object;
    if (hitObj.userData && hitObj.userData.enemy) {
      const enemy = hitObj.userData.enemy;
      const isHead = hitObj.userData.isHead;
      const dmg = isHead ? w.headDmg : w.bodyDmg;
      enemy.hp -= dmg;
      showHitFeedback(dmg, isHead);

      if (isHead) {
        headshots++;
        playSound('headshot');
      }

      if (enemy.hp <= 0 && enemy.alive) {
        enemy.alive = false;
        showKillBanner(isHead);

        const drop = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.65, 0.95),
          new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x004d40 })
        );
        drop.position.set(enemy.group.position.x, 0.33, enemy.group.position.z);
        scene.add(drop);
        lootBoxes.push({ mesh: drop, active: true });

        scene.remove(enemy.group);
        kills++;
        totalKills++;
        localStorage.setItem('ibr_kills', totalKills);
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
    new THREE.BoxGeometry(3.6, 2.5, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.78, roughness: 0.2 })
  );
  const fx = -Math.sin(playerYaw) * 3.4;
  const fz = -Math.cos(playerYaw) * 3.4;
  gloo.position.set(playerGroup.position.x + fx, 1.25, playerGroup.position.z + fz);
  gloo.rotation.y = playerYaw;
  scene.add(gloo);
  obstacles.push(gloo);
}

function endMatch(won) {
  gameActive = false;
  isFiring = false;
  isScoped = false;
  document.getElementById('scope-overlay').style.display = 'none';
  if (won) {
    booyahWins++;
    localStorage.setItem('ibr_booyah', booyahWins);
  }
  document.getElementById('hud').style.display = 'none';
  document.getElementById('end-screen').style.display = 'flex';
  document.getElementById('end-title').innerText = won ? `BOOYAH! ${playerName} की जीत 🇮🇳` : 'ELIMINATED! अगली बार कोशिश करें';
  document.getElementById('end-stats').innerText = `Match Kills: ${kills} | Headshots: ${headshots}`;
}

// ================= MINI-MAP RADAR =================
function drawMiniMap() {
  const canvas = document.getElementById('minimap');
  if (!canvas || !playerGroup) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#142615';
  ctx.fillRect(0, 0, w, h);

  const scale = 0.65;
  ctx.strokeStyle = '#00b0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - playerGroup.position.x * scale, cy - playerGroup.position.z * scale, zoneRadius * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffca28';
  lootBoxes.forEach(l => {
    if (!l.active) return;
    const dx = (l.mesh.position.x - playerGroup.position.x) * scale;
    const dz = (l.mesh.position.z - playerGroup.position.z) * scale;
    ctx.fillRect(cx + dx - 2, cy + dz - 2, 4, 4);
  });

  ctx.fillStyle = '#ff1744';
  enemies.forEach(e => {
    if (!e.alive) return;
    const dx = (e.group.position.x - playerGroup.position.x) * scale;
    const dz = (e.group.position.z - playerGroup.position.z) * scale;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dz, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

// ================= MULTI-TOUCH CONTROLS (FREE FIRE STYLE) =================
let joyTouchId = null, lookTouchId = null, fireTouchId = null;
let lastLookX = 0, lastLookY = 0, lastFireX = 0, lastFireY = 0;

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
  const maxR = 42, dist = Math.hypot(dx, dy);
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
      const mult = isScoped ? (scopeSens / 9500) : (generalSens / 8200);
      playerYaw -= (t.clientX - lastLookX) * mult;
      playerPitch = Math.max(-0.72, Math.min(0.72, playerPitch - (t.clientY - lastLookY) * mult));
      lastLookX = t.clientX; lastLookY = t.clientY;
    }
  }
});
lookZone.addEventListener('touchend', e => {
  for (let t of e.changedTouches) { if (t.identifier === lookTouchId) lookTouchId = null; }
});

// FIRE BUTTON: Full 360° Rotation + Upward Drag-Headshot while Firing!
const fireBtn = document.getElementById('fire-btn');
fireBtn.addEventListener('touchstart', e => {
  e.stopPropagation();
  const t = e.changedTouches[0];
  fireTouchId = t.identifier;
  lastFireX = t.clientX;
  lastFireY = t.clientY;
  isFiring = true;
  fireWeapon();
});
fireBtn.addEventListener('touchmove', e => {
  e.stopPropagation();
  for (let t of e.changedTouches) {
    if (t.identifier === fireTouchId) {
      const rotMult = isScoped ? (scopeSens / 9500) : (generalSens / 8200);
      const dragMult = scopeSens / 9000;
      playerYaw -= (t.clientX - lastFireX) * rotMult;
      playerPitch = Math.max(-0.72, Math.min(0.72, playerPitch + (lastFireY - t.clientY) * dragMult));
      lastFireX = t.clientX;
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
  document.getElementById('crouch-btn').style.background = isCrouching ? '#ff6f00' : 'rgba(12, 18, 30, 0.62)';
});

document.getElementById('scope-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  const w = weapons[currentWeaponIdx];
  isScoped = !isScoped;
  camera.fov = isScoped ? w.zoom : 65;
  camera.updateProjectionMatrix();
  document.getElementById('scope-zoom-text').innerText = w.scopeTitle;
  document.getElementById('scope-overlay').style.display = isScoped ? 'flex' : 'none';
  document.getElementById('scope-btn').style.background = isScoped ? '#ff6f00' : 'rgba(12, 18, 30, 0.62)';
});

document.getElementById('gloo-btn').addEventListener('touchstart', e => { e.stopPropagation(); placeGlooWall(); });
document.getElementById('reload-btn').addEventListener('touchstart', e => { e.stopPropagation(); reloadWeapon(); });

// ================= MAIN ANIMATION LOOP =================
let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  prevTime = now;

  // Lobby 3D Character Rotation
  if (!gameActive && lobbyRenderer && lobbyScene && lobbyCamera) {
    if (lobbyCharGroup) lobbyCharGroup.rotation.y += dt * 0.7;
    lobbyRenderer.render(lobbyScene, lobbyCamera);
  }

  // Active Match Loop
  if (gameActive && playerGroup) {
    if (isFiring && currentWeaponIdx === 0) fireWeapon();

    // Movement & Realistic Leg/Arm Animation
    const moveSpeed = (isCrouching ? 6.2 : 12.0) * dt;
    const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
    const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
    playerGroup.position.addScaledVector(forward, -joyY * moveSpeed);
    playerGroup.position.addScaledVector(right, joyX * moveSpeed);
    playerGroup.rotation.y = playerYaw;

    // Realistic Crouch Stance
    const targetScaleY = isCrouching ? 0.72 : 1.0;
    playerGroup.scale.y += (targetScaleY - playerGroup.scale.y) * 0.25;

    if (Math.hypot(joyX, joyY) > 0.1) {
      walkAnimTime += dt * 13;
      leftLeg.rotation.x = Math.sin(walkAnimTime) * 0.7;
      rightLeg.rotation.x = -Math.sin(walkAnimTime) * 0.7;
      leftArm.rotation.z = Math.sin(walkAnimTime) * 0.08;
    } else {
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
    }

    // Jump & Gravity
    playerGroup.position.y += velY;
    if (playerGroup.position.y > 0) velY -= 0.012;
    else { playerGroup.position.y = 0; velY = 0; isGrounded = true; }

    // Bullet Tracers Fade
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers.splice(i, 1);
      }
    }

    // Medkit Progress
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

    // Loot Proximity Check
    let nearLoot = false;
    for (let box of lootBoxes) {
      if (box.active) {
        box.mesh.rotation.y += dt * 1.5;
        if (playerGroup.position.distanceTo(box.mesh.position) < 3.4) nearLoot = true;
      }
    }
    document.getElementById('loot-btn').style.display = nearLoot ? 'block' : 'none';

    // Over-the-Shoulder TPP Camera
    const camDist = isScoped ? 0.6 : 3.6;
    const rightOff = isScoped ? 0.35 : 0.75;
    const baseHeight = isCrouching ? 1.45 : 2.05;
    const camX = playerGroup.position.x + Math.sin(playerYaw) * camDist + Math.cos(playerYaw) * rightOff;
    const camZ = playerGroup.position.z + Math.cos(playerYaw) * camDist - Math.sin(playerYaw) * rightOff;
    const camY = playerGroup.position.y + baseHeight - Math.sin(playerPitch) * 1.35;
    camera.position.set(camX, camY, camZ);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = playerYaw;
    camera.rotation.x = playerPitch;

    // Safe Zone Shrink
    if (zoneRadius > 22) {
      zoneRadius -= 0.7 * dt;
      zoneRing.scale.set(zoneRadius / 140, 1, zoneRadius / 140);
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

      if (dist > 15 && dist < 100) {
        toPlayer.normalize();
        enemy.group.position.addScaledVector(toPlayer, 4.5 * dt);
        enemy.anim += dt * 10;
        enemy.lLeg.rotation.x = Math.sin(enemy.anim) * 0.6;
        enemy.rLeg.rotation.x = -Math.sin(enemy.anim) * 0.6;
      }

      enemy.shootTimer -= dt;
      if (dist < 62 && enemy.shootTimer <= 0) {
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

window.addEventListener('DOMContentLoaded', () => {
  initLobby3D();
  syncLobbyUI();
  animate();
});

window.addEventListener('resize', () => {
  if (lobbyCamera && lobbyRenderer) {
    lobbyCamera.aspect = window.innerWidth / window.innerHeight;
    lobbyCamera.updateProjectionMatrix();
    lobbyRenderer.setSize(window.innerWidth, window.innerHeight);
  }
  if (camera && renderer) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});
