// ================= SAVED DATA & DEFAULT STATE =================
const defaultOutfits = [
  { id: 'navy', name: 'Commando Navy', c1: '#1565c0', c2: '#1c2630', helm: '#212121' },
  { id: 'army', name: 'Bharat Army Camo', c1: '#4b6b32', c2: '#2d3b22', helm: '#334726' },
  { id: 'gold', name: 'Royal Golden Raja', c1: '#ff9800', c2: '#4e342e', helm: '#ffd54f' },
  { id: 'cobra', name: 'Black Cobra Ops', c1: '#222222', c2: '#b71c1c', helm: '#111111' }
];

let outfits = JSON.parse(localStorage.getItem('ibr_outfits')) || defaultOutfits;
let equippedOutfitId = localStorage.getItem('ibr_equipped') || 'navy';
let playerName = localStorage.getItem('ibr_name') || 'COMMANDO_IND';
let playerDP = localStorage.getItem('ibr_dp') || '';
let activeSeason = localStorage.getItem('ibr_season') || '🔥 SEASON 1: आरंभ';
let totalKills = parseInt(localStorage.getItem('ibr_kills')) || 0;
let booyahWins = parseInt(localStorage.getItem('ibr_booyah')) || 0;
let tempDPData = '';

// ================= REAL 3D HUMAN MODEL LOADER =================
let baseSoldierGLTF = null;
let modelReady = false;
const SOLDIER_MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';

function preloadRealHumanModel(onLoaded) {
  if (modelReady && baseSoldierGLTF) {
    if (onLoaded) onLoaded();
    return;
  }
  if (typeof THREE.GLTFLoader === 'undefined') return;
  const loader = new THREE.GLTFLoader();
  loader.load(
    SOLDIER_MODEL_URL,
    (gltf) => {
      baseSoldierGLTF = gltf;
      modelReady = true;
      if (onLoaded) onLoaded();
    },
    undefined,
    (err) => { console.warn('Using fallback soldier mesh:', err); }
  );
}

// ================= 3D ENGINE & GAME STATE =================
let scene, camera, renderer, playerGroup, playerMixer, playerIdleAct, playerRunAct, currentPlayerAction;
let gunMesh, ak47Group, awmGroup, katanaGroup, muzzleFlash, parachuteGroup, airplaneGroup, propellerMesh, zoneRing;
let lobbyScene, lobbyCamera, lobbyRenderer, lobbyCharGroup, lobbyMixer;
let gameActive = false, flightState = 'ground'; // 'plane' | 'freefall' | 'parachute' | 'ground'
let planeProgress = 0, katanaSwingTimer = 0;
let playerHP = 200, playerArmor = 150, medkits = 4, glooCount = 6;
let kills = 0, headshots = 0;
let isScoped = false, isCrouching = false, isFiring = false, isHealing = false;
let lastShotTime = 0, healTimer = 0;
let playerYaw = 0, playerPitch = 0, velY = 0, isGrounded = true;
let joyX = 0, joyY = 0, zoneRadius = 155;

// Settings
let generalSens = 55, scopeSens = 50, gfxMode = 'high';

// Weapons: AK-47, AWM Sniper, and Katana Sword
const weapons = [
  { name: 'AK-47', type: 'gun', ammo: 30, maxAmmo: 30, rate: 130, bodyDmg: 38, headDmg: 145, zoom: 34, scopeLabel: '2X', scopeTitle: '2X OPTICAL' },
  { name: 'AWM SNIPER', type: 'gun', ammo: 5, maxAmmo: 5, rate: 800, bodyDmg: 115, headDmg: 280, zoom: 17, scopeLabel: '4X', scopeTitle: '4X SNIPER' },
  { name: 'KATANA ⚔️', type: 'melee', ammo: '∞', maxAmmo: '∞', rate: 380, bodyDmg: 110, headDmg: 200, zoom: 55, scopeLabel: '1X', scopeTitle: 'MELEE FOCUS' }
];
let currentWeaponIdx = 0;

const enemies = [];
const obstacles = [];
const walkablePlatforms = []; // Roofs & Stairs for climbing buildings
const lootBoxes = [];
const flyingBullets = [];
const frostRings = [];
const raycaster = new THREE.Raycaster();

// ================= REALISTIC AUDIO & WIND AMBIENCE =================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let windGainNode = null;

function startWindAmbience() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (windGainNode) return;
  const bufferSize = audioCtx.sampleRate * 2;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 2.5;
  }
  const whiteNoise = audioCtx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 340;
  filter.Q.value = 1.8;

  windGainNode = audioCtx.createGain();
  windGainNode.gain.value = 0.065;

  whiteNoise.connect(filter);
  filter.connect(windGainNode);
  windGainNode.connect(audioCtx.destination);
  whiteNoise.start(0);
}

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
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);
    osc.start(now); osc.stop(now + 0.11);
  } else if (type === 'katana') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.start(now); osc.stop(now + 0.18);
  } else if (type === 'headshot') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, now);
    osc.frequency.setValueAtTime(1950, now + 0.06);
    gain.gain.setValueAtTime(0.3, now);
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
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.2);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'chute') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.28);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.start(now); osc.stop(now + 0.28);
  }
}

// ================= TEXTURE GENERATORS =================
function createTerrainTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3d632c';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4500; i++) {
    const r = Math.random();
    ctx.fillStyle = r < 0.35 ? '#2f4f21' : (r < 0.7 ? '#4c7536' : '#5c6b3c');
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  ctx.fillStyle = '#6d5b47';
  ctx.fillRect(232, 0, 48, 512);
  ctx.fillRect(0, 232, 512, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function createBuildingTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d5c7b6';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#b9aa97';
  for (let i = 0; i < 600; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 2);
  ctx.fillStyle = '#1b2631';
  ctx.fillRect(34, 54, 52, 64);
  ctx.fillRect(170, 54, 52, 64);
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 54, 52, 64);
  ctx.strokeRect(170, 54, 52, 64);
  return new THREE.CanvasTexture(c);
}

function createRedFortTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9e2a2b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#6e1415';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  ctx.fillStyle = '#3e0a0b';
  ctx.beginPath();
  ctx.arc(128, 175, 42, Math.PI, 0);
  ctx.lineTo(170, 256);
  ctx.lineTo(86, 256);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

function createGlooWallTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#00e5ff');
  grad.addColorStop(0.5, '#00838f');
  grad.addColorStop(1, '#01579b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(224, 247, 250, 0.85)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 32; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 16 + Math.random() * 26;
    ctx.beginPath();
    for (let s = 0; s < 6; s++) {
      const ang = (Math.PI * 2 * s) / 6;
      const px = x + Math.cos(ang) * r;
      const py = y + Math.sin(ang) * r;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(132, 255, 255, 0.22)';
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = '#a7ffeb';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  return new THREE.CanvasTexture(c);
}

// ================= WEAPONS: AK-47, AWM SNIPER & KATANA =================
function createDetailedWeapons() {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.85, roughness: 0.25 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6d3b1e, roughness: 0.65 });

  // 1. AK-47
  const ak = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.45), metalMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.42, 10), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.42);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.24), woodMat);
  handguard.position.set(0, 0.01, -0.28);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.28), woodMat);
  stock.position.set(0, -0.02, 0.34);
  stock.rotation.x = 0.15;
  const curvedMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.09), new THREE.MeshStandardMaterial({ color: 0x8d4925, roughness: 0.5 }));
  curvedMag.position.set(0, -0.14, -0.08);
  curvedMag.rotation.x = 0.32;
  ak.add(receiver, barrel, handguard, stock, curvedMag);

  // 2. AWM Sniper
  const awm = new THREE.Group();
  const sniperBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b5323, roughness: 0.55 });
  const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.65), sniperBodyMat);
  const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 10), metalMat);
  sBarrel.rotation.x = Math.PI / 2;
  sBarrel.position.set(0, 0.02, -0.58);
  const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), metalMat);
  muzzleBrake.position.set(0, 0.02, -0.86);
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.34, 12), metalMat);
  scopeTube.rotation.x = Math.PI / 2;
  scopeTube.position.set(0, 0.1, -0.08);
  awm.add(sBody, sBarrel, muzzleBrake, scopeTube);
  awm.visible = false;

  // 3. Katana Sword
  const katana = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  hilt.rotation.x = Math.PI / 2.6;
  hilt.position.set(0, 0, 0.12);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0xffca28, metalness: 0.9 }));
  guard.rotation.x = Math.PI / 2.6;
  guard.position.set(0, 0.05, -0.02);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.045, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xe0f7fa, emissive: 0x00838f, metalness: 0.95, roughness: 0.1 })
  );
  blade.rotation.x = -0.35;
  blade.position.set(0, 0.24, -0.52);
  katana.add(hilt, guard, blade);
  katana.visible = false;

  const holder = new THREE.Group();
  holder.add(ak, awm, katana);

  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffea00 }));
  flash.position.set(0, 0.02, -0.75);
  flash.visible = false;
  holder.add(flash);

  return { holder, ak, awm, katana, flash };
}

// ================= REAL 3D HUMAN SOLDIER BUILDER =================
function getCurrentOutfit() {
  return outfits.find(o => o.id === equippedOutfitId) || outfits[0];
}

function createRealHumanCharacter(outfit, isEnemy = false) {
  const wrapper = new THREE.Group();

  if (modelReady && baseSoldierGLTF && typeof THREE.SkeletonUtils !== 'undefined') {
    const model = THREE.SkeletonUtils.clone(baseSoldierGLTF.scene);
    model.scale.set(1.12, 1.12, 1.12);

    const tintColor = new THREE.Color(isEnemy ? '#d32f2f' : outfit.c1);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          child.material.color.lerp(tintColor, 0.55);
        }
      }
    });
    wrapper.add(model);

    const wep = createDetailedWeapons();
    wep.holder.position.set(0.24, 1.24, -0.28);
    wrapper.add(wep.holder);

    const mixer = new THREE.AnimationMixer(model);
    const clips = baseSoldierGLTF.animations;
    const idleClip = THREE.AnimationClip.findByName(clips, 'Idle') || clips[0];
    const runClip = THREE.AnimationClip.findByName(clips, 'Run') || clips[1] || clips[0];

    const idleAct = mixer.clipAction(idleClip);
    const runAct = mixer.clipAction(runClip);
    idleAct.play();

    return { root: wrapper, mixer, idleAct, runAct, activeAct: idleAct, wep, isRealGLB: true };
  }

  // Articulated Human Fallback
  const shirtMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0xc62828 : outfit.c1, roughness: 0.5 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x212121 : outfit.c2, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.21, 0.75, 12), shirtMat);
  torso.position.y = 1.15;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.78, 12), pantsMat);
  legs.position.y = 0.39;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skinMat);
  head.position.y = 1.72;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: outfit.helm }));
  helm.position.y = 1.75;

  wrapper.add(torso, legs, head, helm);
  const wep = createDetailedWeapons();
  wep.holder.position.set(0.28, 1.24, -0.28);
  wrapper.add(wep.holder);

  return { root: wrapper, mixer: null, wep, isRealGLB: false };
}

function setCharacterAnim(charObj, moving) {
  if (!charObj || !charObj.mixer || !charObj.isRealGLB) return;
  const target = moving ? charObj.runAct : charObj.idleAct;
  if (charObj.activeAct !== target) {
    charObj.activeAct.fadeOut(0.18);
    target.reset().fadeIn(0.18).play();
    charObj.activeAct = target;
  }
}

// ================= LOBBY 3D PREVIEW & UI SYNC =================
function initLobby3D() {
  const canvas = document.getElementById('lobby-canvas');
  if (!canvas) return;
  lobbyScene = new THREE.Scene();
  lobbyCamera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 50);
  lobbyCamera.position.set(0, 1.25, 3.8);

  lobbyRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  lobbyRenderer.setSize(window.innerWidth, window.innerHeight);
  lobbyRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x263238, 1.25);
  lobbyScene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffecb3, 1.4);
  dir.position.set(3, 6, 4);
  lobbyScene.add(dir);

  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: 0x1c2636, metalness: 0.7, roughness: 0.25 })
  );
  ped.position.y = -0.07;
  lobbyScene.add(ped);

  preloadRealHumanModel(() => rebuildLobbyCharacter());
  rebuildLobbyCharacter();
}

function rebuildLobbyCharacter() {
  if (!lobbyScene) return;
  if (lobbyCharGroup) lobbyScene.remove(lobbyCharGroup);
  const built = createRealHumanCharacter(getCurrentOutfit(), false);
  lobbyCharGroup = built.root;
  lobbyMixer = built.mixer;
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

// ================= BHARAT ISLAND 3D WORLD & CLIMBABLE HOUSES =================
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fb7d6);
  scene.fog = new THREE.FogExp2(0x88c4dc, 0.0042);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 450);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.id = 'game-canvas';
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xfff8e7, 0x3b5323, 0.95);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.2);
  dirLight.position.set(80, 130, 70);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Surrounding Blue Ocean & Sandy Island Shore
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x0277bd, roughness: 0.25, metalness: 0.4 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.35;
  scene.add(ocean);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(330, 330),
    new THREE.MeshStandardMaterial({ color: 0xd7b889, roughness: 0.9 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = -0.15;
  scene.add(beach);

  const islandGround = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ map: createTerrainTexture(), roughness: 0.88 })
  );
  islandGround.rotation.x = -Math.PI / 2;
  islandGround.receiveShadow = true;
  scene.add(islandGround);

  // Safe Zone Blue Energy Cylinder
  zoneRing = new THREE.Mesh(
    new THREE.CylinderGeometry(zoneRadius, zoneRadius, 24, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x00b0ff, transparent: true, opacity: 0.24, side: THREE.DoubleSide })
  );
  zoneRing.position.y = 12;
  scene.add(zoneRing);

  buildBharatIslandMap();
  buildIndianAirplane();
  applyGraphicsQuality();
}

function buildIndianAirplane() {
  airplaneGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.6, roughness: 0.3 });
  const saffronMat = new THREE.MeshStandardMaterial({ color: 0xff6f00 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 16, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 16), saffronMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -9.6;

  const wings = new THREE.Mesh(new THREE.BoxGeometry(19, 0.28, 3.4), bodyMat);
  wings.position.set(0, 0.3, -1);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 3.4), saffronMat);
  wingTipL.position.set(-10.2, 0.3, -1);
  const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 3.4), greenMat);
  wingTipR.position.set(10.2, 0.3, -1);

  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 2.5), saffronMat);
  tailFin.position.set(0, 2.2, 6.8);

  propellerMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 0.15), new THREE.MeshBasicMaterial({ color: 0xffca28 }));
  propellerMesh.position.set(0, 0, -11.3);

  airplaneGroup.add(fuselage, nose, wings, wingTipL, wingTipR, tailFin, propellerMesh);
  airplaneGroup.visible = false;
  scene.add(airplaneGroup);
}

function createClimbableHouse(x, z, w, d) {
  const h = 4.0;
  const houseMat = new THREE.MeshStandardMaterial({ map: createBuildingTexture(), roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.85 });
  const stairMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.7 });

  // Main House Block
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), houseMat);
  body.position.set(x, h / 2, z);
  body.castShadow = true; body.receiveShadow = true;
  scene.add(body);
  obstacles.push(body);

  // Climbable Roof Slab + Parapet Rails
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), roofMat);
  roof.position.set(x, h + 0.15, z);
  roof.receiveShadow = true;
  scene.add(roof);

  // Register Roof as Walkable Platform!
  walkablePlatforms.push({
    minX: x - w / 2 - 0.2, maxX: x + w / 2 + 0.2,
    minZ: z - d / 2 - 0.2, maxZ: z + d / 2 + 0.2,
    y: h + 0.3, isRamp: false
  });

  // Exterior Stairs leading up to the Roof (on +X side)
  const stairWidth = 2.0;
  const stairLen = 5.4;
  const stairX = x + w / 2 + stairWidth / 2;
  const rampGeo = new THREE.BoxGeometry(stairWidth, 0.35, Math.hypot(stairLen, h + 0.3));
  const rampMesh = new THREE.Mesh(rampGeo, stairMat);
  rampMesh.position.set(stairX, (h + 0.3) / 2, z);
  rampMesh.rotation.x = Math.atan2(h + 0.3, stairLen);
  rampMesh.castShadow = true; rampMesh.receiveShadow = true;
  scene.add(rampMesh);

  // Register Stairs as Smooth Ramp Platform!
  walkablePlatforms.push({
    minX: stairX - stairWidth / 2 - 0.3, maxX: stairX + stairWidth / 2 + 0.3,
    minZ: z - stairLen / 2, maxZ: z + stairLen / 2,
    isRamp: true, lowY: 0, highY: h + 0.3
  });
}

function buildBharatIslandMap() {
  walkablePlatforms.length = 0;

  // 1. Iconic Red Fort (लाल किला) Landmark in Center-North
  const fortMat = new THREE.MeshStandardMaterial({ map: createRedFortTexture(), roughness: 0.75 });
  const fortBase = new THREE.Mesh(new THREE.BoxGeometry(22, 6.5, 10), fortMat);
  fortBase.position.set(0, 3.25, -45);
  fortBase.castShadow = true; fortBase.receiveShadow = true;
  scene.add(fortBase); obstacles.push(fortBase);

  const domeMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, roughness: 0.4 });
  [-6, 0, 6].forEach(dx => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 14), domeMat);
    dome.position.set(dx, 7.2, -45);
    scene.add(dome);
  });

  // 2. Climbable Multi-Floor Houses with Stairs & Open Roofs
  const houseLocations = [
    [24, 18, 9, 7],
    [-26, 22, 10, 8],
    [30, -24, 9, 8],
    [-30, -22, 10, 8],
    [0, 36, 11, 7]
  ];
  houseLocations.forEach(([x, z, w, d]) => createClimbableHouse(x, z, w, d));

  // 3. Sandbag Cover Bunkers
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9 });
  [[0, 14], [-10, 4], [10, 3], [-16, 20], [18, -14]].forEach(([x, z]) => {
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.15, 0.9), sandbagMat);
    bunker.position.set(x, 0.58, z);
    bunker.castShadow = true; bunker.receiveShadow = true;
    scene.add(bunker); obstacles.push(bunker);
  });

  // 4. Lush Trees across Bharat Island
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
  const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });

  for (let i = 0; i < 48; i++) {
    const angle = (Math.PI * 2 * i) / 48;
    const dist = 26 + (i % 6) * 19;
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

function getGroundHeightAt(px, pz) {
  let maxY = 0;
  for (let p of walkablePlatforms) {
    if (px >= p.minX && px <= p.maxX && pz >= p.minZ && pz <= p.maxZ) {
      if (p.isRamp) {
        const t = Math.max(0, Math.min(1, (p.maxZ - pz) / (p.maxZ - p.minZ)));
        const rampH = p.lowY + t * (p.highY - p.lowY);
        if (rampH > maxY) maxY = rampH;
      } else {
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  return maxY;
}

// ================= PLAYER & ENEMY SPAWNING =================
let playerCharObj = null;
function buildPlayerCharacter() {
  if (playerGroup) scene.remove(playerGroup);
  playerCharObj = createRealHumanCharacter(getCurrentOutfit(), false);
  playerGroup = playerCharObj.root;
  playerMixer = playerCharObj.mixer;
  playerIdleAct = playerCharObj.idleAct;
  playerRunAct = playerCharObj.runAct;
  currentPlayerAction = playerCharObj.activeAct;
  gunMesh = playerCharObj.wep.holder;
  ak47Group = playerCharObj.wep.ak;
  awmGroup = playerCharObj.wep.awm;
  katanaGroup = playerCharObj.wep.katana;
  muzzleFlash = playerCharObj.wep.flash;

  // Tricolor Parachute Canopy attached to player
  parachuteGroup = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff6f00, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.6;
  const strapL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strapL.position.set(-0.9, 2.6, 0); strapL.rotation.z = -0.35;
  const strapR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2), new THREE.MeshBasicMaterial({ color: 0x138808 }));
  strapR.position.set(0.9, 2.6, 0); strapR.rotation.z = 0.35;
  parachuteGroup.add(canopy, strapL, strapR);
  parachuteGroup.visible = false;
  playerGroup.add(parachuteGroup);

  scene.add(playerGroup);
}

function createEnemyHPBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 20;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 20);
  ctx.fillStyle = '#ff1744'; ctx.fillRect(3, 3, 122, 14);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.3, 0.22, 1);
  sprite.position.set(0, 2.25, 0);
  return { sprite, canvas, ctx, tex };
}

function updateEnemyHPBar(enemy) {
  if (!enemy.hpBar) return;
  const { ctx, tex } = enemy.hpBar;
  const pct = Math.max(0, enemy.hp / 180);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 128, 20);
  ctx.fillStyle = '#ff1744'; ctx.fillRect(3, 3, 122 * pct, 14);
  tex.needsUpdate = true;
}

function spawnEnemies(count) {
  enemies.forEach(e => scene.remove(e.group));
  enemies.length = 0;

  const enemyOutfit = { c1: '#b71c1c', c2: '#212121', helm: '#ffca28' };
  for (let i = 0; i < count; i++) {
    const charObj = createRealHumanCharacter(enemyOutfit, true);
    const group = charObj.root;

    const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.3, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    bodyHit.position.y = 0.95;
    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
    headHit.position.y = 1.78;

    const hpBar = createEnemyHPBar();
    group.add(hpBar.sprite);

    const enemyObj = {
      group, charObj, headHit, bodyHit, hpBar,
      hp: 180, alive: true, shootTimer: 1.5 + Math.random() * 2, strafeDir: i % 2 === 0 ? 1 : -1
    };
    bodyHit.userData = { isHead: false, enemy: enemyObj };
    headHit.userData = { isHead: true, enemy: enemyObj };

    group.add(bodyHit, headHit);
    const angle = (Math.PI * 2 * i) / count;
    const dist = 34 + Math.random() * 75;
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
    const dist = 12 + Math.random() * 80;
    const lx = Math.cos(angle) * dist;
    const lz = Math.sin(angle) * dist;
    mesh.position.set(lx, getGroundHeightAt(lx, lz) + 0.33, lz);
    mesh.castShadow = true;
    scene.add(mesh);
    lootBoxes.push({ mesh, active: true });
  }
}

// ================= AIRPLANE & PARACHUTE DROP CONTROLS =================
function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function startMatch() {
  enterFullscreen();
  startWindAmbience();
  if (!scene) init3D();

  buildPlayerCharacter();
  playerHP = 200; playerArmor = 150; medkits = 4; glooCount = 6; kills = 0; headshots = 0; zoneRadius = 155;
  weapons[0].ammo = 30; weapons[1].ammo = 5; currentWeaponIdx = 0;
  isScoped = false; isCrouching = false; isHealing = false;
  camera.fov = 65; camera.updateProjectionMatrix();
  document.getElementById('scope-overlay').style.display = 'none';

  // Start inside Bharat Airforce Airplane!
  flightState = 'plane';
  planeProgress = 0;
  airplaneGroup.visible = true;
  airplaneGroup.position.set(0, 105, 130);
  playerGroup.position.set(0, 105, 130);
  playerGroup.visible = false;
  parachuteGroup.visible = false;

  spawnEnemies(12);
  spawnLootCrates(14);
  updateHUD();

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.getElementById('flight-hud').style.display = 'flex';
  document.getElementById('eject-btn').style.display = 'inline-block';
  document.getElementById('chute-btn').style.display = 'none';
  document.getElementById('flight-status-text').innerText = '✈️ BHARAT AIRFORCE • जहाज से कूदने की जगह चुनें';
  gameActive = true;
}

function ejectFromPlane() {
  if (flightState !== 'plane') return;
  flightState = 'freefall';
  playerGroup.visible = true;
  playerGroup.position.copy(airplaneGroup.position);
  playerGroup.position.y -= 2.5;
  document.getElementById('eject-btn').style.display = 'none';
  document.getElementById('chute-btn').style.display = 'inline-block';
  document.getElementById('flight-status-text').innerText = '🪂 FREEFALL • पैराशूट खोलें या नीचे उतरें';
}

function deployParachute() {
  if (flightState !== 'freefall') return;
  flightState = 'parachute';
  parachuteGroup.visible = true;
  playSound('chute');
  document.getElementById('chute-btn').style.display = 'none';
  document.getElementById('flight-status-text').innerText = '☂️ PARACHUTE • जॉयस्टिक से छत या मैदान पर उतरें';
}

function landOnIsland(groundY) {
  flightState = 'ground';
  playerGroup.position.y = groundY;
  parachuteGroup.visible = false;
  airplaneGroup.visible = false;
  document.getElementById('flight-hud').style.display = 'none';
}

function exitToLobby() {
  gameActive = false;
  isFiring = false;
  isScoped = false;
  document.getElementById('flight-hud').style.display = 'none';
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
  document.getElementById('hp-text').innerText = `ARMOR: ${Math.round(playerArmor)} | HP: ${Math.max(0, Math.round(playerHP))}`;
  document.getElementById('armor-fill').style.width = `${Math.max(0, (playerArmor / 150) * 100)}%`;
  document.getElementById('hp-fill').style.width = `${Math.max(0, (playerHP / 200) * 100)}%`;
  document.getElementById('medkit-btn').innerText = `💊 MEDKIT (${medkits})`;
  document.getElementById('weapon-btn').innerText = w.type === 'melee' ? `⚔️ ${w.name}` : `🔫 ${w.name} [${w.ammo}]`;
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
  if (ak47Group && awmGroup && katanaGroup) {
    ak47Group.visible = currentWeaponIdx === 0;
    awmGroup.visible = currentWeaponIdx === 1;
    katanaGroup.visible = currentWeaponIdx === 2;
  }
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
    if (box.active && playerGroup.position.distanceTo(box.mesh.position) < 3.6) {
      box.active = false;
      scene.remove(box.mesh);
      medkits += 2;
      glooCount += 2;
      playerArmor = Math.min(150, playerArmor + 75);
      weapons[0].ammo = weapons[0].maxAmmo;
      weapons[1].ammo = weapons[1].maxAmmo;
      playSound('heal');
      updateHUD();
      document.getElementById('loot-btn').style.display = 'none';
      break;
    }
  }
}

function spawnFlyingBullet(startPos, direction) {
  const bMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffea00 })
  );
  bMesh.position.copy(startPos);
  scene.add(bMesh);
  flyingBullets.push({ mesh: bMesh, dir: direction.clone().normalize(), life: 0.45 });
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

function eliminateEnemy(enemy, isHead) {
  enemy.alive = false;
  showKillBanner(isHead);

  const drop = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.65, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x004d40 })
  );
  drop.position.set(enemy.group.position.x, enemy.group.position.y + 0.33, enemy.group.position.z);
  scene.add(drop);
  lootBoxes.push({ mesh: drop, active: true });

  scene.remove(enemy.group);
  kills++;
  totalKills++;
  localStorage.setItem('ibr_kills', totalKills);
  updateHUD();
  if (enemies.every(e => !e.alive)) endMatch(true);
}

function fireWeapon() {
  if (flightState !== 'ground') return;
  const w = weapons[currentWeaponIdx];
  const now = performance.now();
  if (now - lastShotTime < w.rate) return;

  // KATANA SWORD MELEE SLASH
  if (w.type === 'melee') {
    lastShotTime = now;
    katanaSwingTimer = 0.25;
    playSound('katana');
    enemies.forEach(enemy => {
      if (!enemy.alive) return;
      const dist = playerGroup.position.distanceTo(enemy.group.position);
      if (dist <= 4.3) {
        const isHead = Math.random() < 0.4;
        const dmg = isHead ? w.headDmg : w.bodyDmg;
        enemy.hp -= dmg;
        updateEnemyHPBar(enemy);
        showHitFeedback(dmg, isHead);
        if (isHead) { headshots++; playSound('headshot'); }
        if (enemy.hp <= 0) eliminateEnemy(enemy, isHead);
      }
    });
    return;
  }

  // GUNS (AK-47 & AWM)
  if (w.ammo <= 0) { reloadWeapon(); return; }
  lastShotTime = now;
  w.ammo--;
  updateHUD();
  playSound('shoot');

  muzzleFlash.visible = true;
  gunMesh.position.z = -0.18;
  setTimeout(() => {
    if (muzzleFlash) muzzleFlash.visible = false;
    if (gunMesh) gunMesh.position.z = -0.28;
  }, 60);

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const muzzleWorld = new THREE.Vector3();
  muzzleFlash.getWorldPosition(muzzleWorld);
  spawnFlyingBullet(muzzleWorld, raycaster.ray.direction);

  const targets = [];
  enemies.forEach(e => { if (e.alive) targets.push(e.headHit, e.bodyHit); });
  obstacles.forEach(o => targets.push(o));

  const hits = raycaster.intersectObjects(targets);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    if (hitObj.userData && hitObj.userData.enemy) {
      const enemy = hitObj.userData.enemy;
      const isHead = hitObj.userData.isHead;
      const dmg = isHead ? w.headDmg : w.bodyDmg;
      enemy.hp -= dmg;
      updateEnemyHPBar(enemy);
      showHitFeedback(dmg, isHead);

      if (isHead) {
        headshots++;
        playSound('headshot');
      }
      if (enemy.hp <= 0 && enemy.alive) eliminateEnemy(enemy, isHead);
    }
  }
}

function reloadWeapon() {
  const w = weapons[currentWeaponIdx];
  if (w.type === 'melee') return;
  w.ammo = w.maxAmmo;
  updateHUD();
}

// ================= CRYSTAL-ARMOR FREE FIRE GLOO WALL =================
let glooTexCache = null;
function placeGlooWall() {
  if (flightState !== 'ground' || glooCount <= 0) return;
  glooCount--;
  updateHUD();
  playSound('gloo');

  if (!glooTexCache) glooTexCache = createGlooWallTexture();

  const glooGroup = new THREE.Group();
  const glooGeo = new THREE.CylinderGeometry(2.6, 2.6, 2.5, 24, 1, false, Math.PI - 0.72, 1.44);
  const glooMat = new THREE.MeshStandardMaterial({
    map: glooTexCache,
    color: 0x40c4ff,
    emissive: 0x004d66,
    roughness: 0.12,
    metalness: 0.3,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide
  });
  const shieldMesh = new THREE.Mesh(glooGeo, glooMat);
  shieldMesh.position.y = 1.25;
  shieldMesh.castShadow = true;

  // Reinforced Top & Bottom Steel Trim
  const trimGeo = new THREE.CylinderGeometry(2.64, 2.64, 0.14, 24, 1, false, Math.PI - 0.74, 1.48);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe0f7fa, metalness: 0.85, roughness: 0.2 });
  const topTrim = new THREE.Mesh(trimGeo, trimMat);
  topTrim.position.y = 2.48;
  const botTrim = new THREE.Mesh(trimGeo, trimMat);
  botTrim.position.y = 0.07;

  glooGroup.add(shieldMesh, topTrim, botTrim);
  const fx = -Math.sin(playerYaw) * 1.1;
  const fz = -Math.cos(playerYaw) * 1.1;
  glooGroup.position.set(playerGroup.position.x + fx, playerGroup.position.y, playerGroup.position.z + fz);
  glooGroup.rotation.y = playerYaw;
  scene.add(glooGroup);
  obstacles.push(shieldMesh);

  // Expanding Ground Frost Shockwave
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0x84ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(playerGroup.position.x - Math.sin(playerYaw) * 2.5, playerGroup.position.y + 0.08, playerGroup.position.z - Math.cos(playerYaw) * 2.5);
  scene.add(ring);
  frostRings.push({ mesh: ring, life: 0.45 });
}

function applyBalancedDamageToPlayer(rawDmg) {
  if (playerArmor > 0) {
    const absorbed = Math.min(playerArmor, rawDmg * 0.75);
    playerArmor -= absorbed;
    playerHP -= (rawDmg - absorbed);
  } else {
    playerHP -= rawDmg;
  }
  updateHUD();
  if (playerHP <= 0) endMatch(false);
}

function endMatch(won) {
  gameActive = false;
  isFiring = false;
  isScoped = false;
  document.getElementById('flight-hud').style.display = 'none';
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

// ================= MULTI-TOUCH CONTROLS =================
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
  if (flightState === 'ground' && isGrounded) { velY = 0.25; isGrounded = false; }
});

document.getElementById('crouch-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  if (flightState !== 'ground') return;
  isCrouching = !isCrouching;
  document.getElementById('crouch-btn').style.background = isCrouching ? '#ff6f00' : 'rgba(12, 18, 30, 0.62)';
});

document.getElementById('scope-btn').addEventListener('touchstart', e => {
  e.stopPropagation();
  if (flightState !== 'ground') return;
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

// ================= MAIN GAME & FLIGHT LOOP =================
let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  prevTime = now;

  // Lobby 3D Preview
  if (!gameActive && lobbyRenderer && lobbyScene && lobbyCamera) {
    if (lobbyMixer) lobbyMixer.update(dt);
    if (lobbyCharGroup) lobbyCharGroup.rotation.y += dt * 0.65;
    lobbyRenderer.render(lobbyScene, lobbyCamera);
  }

  if (gameActive && playerGroup) {
    // 1. AIRPLANE FLIGHT PHASE
    if (flightState === 'plane') {
      planeProgress += dt * 16;
      if (propellerMesh) propellerMesh.rotation.z += dt * 35;
      airplaneGroup.position.set(Math.sin(planeProgress * 0.02) * 35, 105, 130 - planeProgress);
      playerGroup.position.copy(airplaneGroup.position);
      document.getElementById('altitude-box').innerText = `ALTITUDE: 105m`;

      const camX = airplaneGroup.position.x + Math.sin(playerYaw) * 16;
      const camZ = airplaneGroup.position.z + Math.cos(playerYaw) * 16;
      camera.position.set(camX, airplaneGroup.position.y + 6 - Math.sin(playerPitch) * 5, camZ);
      camera.lookAt(airplaneGroup.position);

      if (airplaneGroup.position.z < -125) ejectFromPlane();
    }
    // 2. SKYDIVING & PARACHUTE DESCENT PHASE
    else if (flightState === 'freefall' || flightState === 'parachute') {
      const fallSpeed = flightState === 'freefall' ? 22 : 9.5;
      const glideSpeed = flightState === 'freefall' ? 14 : 18;
      playerGroup.position.y -= fallSpeed * dt;

      const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
      const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      playerGroup.position.addScaledVector(forward, (-joyY + 0.35) * glideSpeed * dt);
      playerGroup.position.addScaledVector(right, joyX * glideSpeed * dt);
      playerGroup.rotation.y = playerYaw;

      const groundY = getGroundHeightAt(playerGroup.position.x, playerGroup.position.z);
      const alt = Math.max(0, Math.round(playerGroup.position.y - groundY));
      document.getElementById('altitude-box').innerText = `ALTITUDE: ${alt}m`;

      if (flightState === 'freefall' && alt <= 32) deployParachute();
      if (playerGroup.position.y <= groundY) landOnIsland(groundY);

      const camX = playerGroup.position.x + Math.sin(playerYaw) * 6.5;
      const camZ = playerGroup.position.z + Math.cos(playerYaw) * 6.5;
      camera.position.set(camX, playerGroup.position.y + 3.2 - Math.sin(playerPitch) * 2.5, camZ);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = playerYaw;
      camera.rotation.x = playerPitch - 0.15;
    }
    // 3. GROUND COMBAT & CLIMBABLE HOUSES PHASE
    else if (flightState === 'ground') {
      if (isFiring && currentWeaponIdx === 0) fireWeapon();

      const isMoving = Math.hypot(joyX, joyY) > 0.1;
      setCharacterAnim(playerCharObj, isMoving);
      if (playerMixer) playerMixer.update(dt);

      // Katana Slash Swing Animation
      if (katanaSwingTimer > 0) {
        katanaSwingTimer -= dt;
        gunMesh.rotation.y = Math.sin(katanaSwingTimer * 25) * 1.4;
      } else if (gunMesh) {
        gunMesh.rotation.y = 0;
      }

      const moveSpeed = (isCrouching ? 6.5 : 12.2) * dt;
      const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
      const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      playerGroup.position.addScaledVector(forward, -joyY * moveSpeed);
      playerGroup.position.addScaledVector(right, joyX * moveSpeed);
      playerGroup.rotation.y = playerYaw;

      // Keep inside Bharat Island bounds
      playerGroup.position.x = Math.max(-142, Math.min(142, playerGroup.position.x));
      playerGroup.position.z = Math.max(-142, Math.min(142, playerGroup.position.z));

      // Crouch Stance
      const targetScaleY = isCrouching ? 0.72 : 1.0;
      playerGroup.scale.y += (targetScaleY - playerGroup.scale.y) * 0.25;

      // Climbable Stairs, Roofs & Gravity
      const floorY = getGroundHeightAt(playerGroup.position.x, playerGroup.position.z);
      playerGroup.position.y += velY;
      if (playerGroup.position.y > floorY) {
        velY -= 0.013;
        isGrounded = false;
      } else {
        playerGroup.position.y = floorY;
        velY = 0;
        isGrounded = true;
      }

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
    }

    // Flying 3D Bullets Animation
    for (let i = flyingBullets.length - 1; i >= 0; i--) {
      const b = flyingBullets[i];
      b.mesh.position.addScaledVector(b.dir, 145 * dt);
      b.life -= dt;
      if (b.life <= 0) {
        scene.remove(b.mesh);
        flyingBullets.splice(i, 1);
      }
    }

    // Gloo Wall Frost Shockwaves
    for (let i = frostRings.length - 1; i >= 0; i--) {
      const fr = frostRings[i];
      fr.life -= dt;
      fr.mesh.scale.addScalar(dt * 8);
      fr.mesh.material.opacity = Math.max(0, fr.life * 1.8);
      if (fr.life <= 0) {
        scene.remove(fr.mesh);
        frostRings.splice(i, 1);
      }
    }

    // Medkit Healing Progress
    if (isHealing) {
      healTimer += dt;
      document.getElementById('heal-fill').style.width = `${Math.min(100, (healTimer / 2.0) * 100)}%`;
      if (healTimer >= 2.0) {
        isHealing = false;
        playerHP = Math.min(200, playerHP + 90);
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
        if (playerGroup.position.distanceTo(box.mesh.position) < 3.6) nearLoot = true;
      }
    }
    document.getElementById('loot-btn').style.display = (flightState === 'ground' && nearLoot) ? 'block' : 'none';

    // Safe Zone Shrink
    if (zoneRadius > 24) {
      zoneRadius -= 0.65 * dt;
      zoneRing.scale.set(zoneRadius / 155, 1, zoneRadius / 155);
    }
    if (flightState === 'ground' && playerGroup.position.length() > zoneRadius) {
      applyBalancedDamageToPlayer(4 * dt);
    }

    // Smart Enemy AI with Tactical Strafing
    enemies.forEach(enemy => {
      if (!enemy.alive) return;
      if (enemy.charObj && enemy.charObj.mixer) enemy.charObj.mixer.update(dt);

      const toPlayer = new THREE.Vector3().subVectors(playerGroup.position, enemy.group.position);
      const dist = toPlayer.length();
      enemy.group.lookAt(playerGroup.position.x, enemy.group.position.y, playerGroup.position.z);

      const enemyMoving = dist > 16 && dist < 105;
      setCharacterAnim(enemy.charObj, enemyMoving);
      if (enemyMoving) {
        toPlayer.normalize();
        enemy.group.position.addScaledVector(toPlayer, 4.4 * dt);
      } else if (dist <= 16) {
        // Tactical strafe sideways in close combat
        const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        enemy.group.position.addScaledVector(strafe, 2.2 * enemy.strafeDir * dt);
      }
      enemy.group.position.y = getGroundHeightAt(enemy.group.position.x, enemy.group.position.z);

      enemy.shootTimer -= dt;
      if (flightState === 'ground' && dist < 58 && enemy.shootTimer <= 0) {
        enemy.shootTimer = 2.1 + Math.random() * 1.2;
        const dir = toPlayer.clone().normalize();
        const botRay = new THREE.Raycaster(
          new THREE.Vector3(enemy.group.position.x, enemy.group.position.y + 1.4, enemy.group.position.z),
          dir, 0, dist
        );
        const blocked = botRay.intersectObjects(obstacles);
        if (blocked.length === 0 && Math.random() < 0.38) {
          applyBalancedDamageToPlayer(8);
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
