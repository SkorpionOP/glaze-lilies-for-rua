/**
 * 3D Botanical Lily Animation - Application Controller
 * Futuristic 3D Holographic Frame + Romantic Gift Interaction
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { smootherstep, clamp } from './math.js';
import { buildLilyBouquetScene } from './botanical.js';
import { BotanicalParticleSystem } from './particles.js';

// Lily Botanical Lore & Fun Facts
const LILY_FUN_FACTS = {
  'Aqua Teal (Sky Blue)': {
    pill: '🩵 Aqua Teal (Sky Blue)',
    symbolism: "Devotion, Glaze Lily Grace & Rua's Favorite",
    fact: "Aqua teal reminds me of Glaze Lilies, which were loved by Guizhong and Zhongli. In ancient lore, these mystical blossoms only open in tranquility to the sweet melody of music — symbolizing a cherished bond that transcends time."
  },
  'Sapphire (Deep Blue)': {
    pill: '💙 Sapphire (Deep Blue)',
    symbolism: 'Rarity, Mystery & Infinite Skies',
    fact: "True blue lilies are botanically impossible in nature. In folklore, they represent the 'impossible made possible' — a rare, once-in-a-lifetime wonder that defies all ordinary rules."
  },
  'Stargazer (Rose Pink)': {
    pill: '🌸 Stargazer (Rose Pink)',
    symbolism: 'Romance, Affection & Starlit Dreams',
    fact: "Named 'Stargazer' because their blooms boldly point upward toward the starry night sky. They symbolize dreaming boldly and wishing someone boundless joy."
  },
  'Crimson (Ruby Red)': {
    pill: '❤️ Crimson (Ruby Red)',
    symbolism: 'Fiery Passion & Devotion',
    fact: "Ancient Mediterranean legend held that red lilies sprang from droplets of celestial nectar — the ultimate romantic declaration of passionate commitment."
  },
  'Sunset (Warm Peach)': {
    pill: '🧡 Sunset (Warm Peach)',
    symbolism: 'Warmth, Confidence & Gratitude',
    fact: "In Victorian floriography, gifting a peach-toned lily carried the secret message: 'My world is illuminated because of you.' They radiate heartfelt warmth and gratitude."
  },
  'Golden (Sun Yellow)': {
    pill: '💛 Golden (Sun Yellow)',
    symbolism: 'Joy, Sunshine & Laughter',
    fact: "Yellow lilies represent happiness and lighthearted joy. Folklore says keeping golden lilies nearby invites sunshine into a home and turns cloudy days bright."
  },
  'Emerald (Mint Green)': {
    pill: '💚 Emerald (Mint Green)',
    symbolism: 'Eternal Renewal & Serenity',
    fact: "Ultra-rare pale green lilies symbolize nature's peaceful cycle of renewal, celebrating a connection that stays forever fresh and calm."
  },
  'Royal (Lilac Purple)': {
    pill: '💜 Royal (Lilac Purple)',
    symbolism: 'Royalty, Grace & Admiration',
    fact: "Historically the rarest pigment in floral history, reserved for royal gardens as tributes of the highest reverence, enchantment, and adoration."
  },
  'Orchid (Magenta Pink)': {
    pill: '🩷 Orchid (Magenta Pink)',
    symbolism: 'Authenticity & Fearless Joy',
    fact: "A vibrant bloom celebrating someone whose bright energy, fearless individuality, and sweet smile make the whole room lighter."
  },
  'Custom (Pick Any Color)': {
    pill: '🎨 Custom (Pick Any Color)',
    symbolism: 'Your Unique Love Story',
    fact: "With millions of digital shades, this bespoke lily is uniquely yours — crafted to reflect your special memories together."
  }
};

// Configuration
const urlParams = new URLSearchParams(window.location.search);
const RECIPIENT_NAME = urlParams.get('name') || 'Rua';

const DURATION = 13.0;
let currentTime = 0.0;
let isPlaying = false;          // Paused until user clicks "Click to Open"
let playbackSpeed = 1.0;
let isLooping = false;          // NO continuous loop — plays once and stays bloomed
let cameraMode = 'cinematic';   // 'cinematic' | 'orbit'
let hasOpened = false;          // Gift open flag
let colorDrawerRevealed = false;// Color prompt drawer flag
let currentChosenColor = 'Aqua Teal (Sky Blue)'; // Rua's favorite color is Aqua Teal / Sky Blue!
const DEFAULT_BLUE_HUE_SHIFT = -2.75;

// Scene & Three.js Objects
let renderer, scene, camera, controls;
let sceneGroup;
let botanicalElements = [];
let particleSystem = null;
let lastTimestamp = performance.now();

// DOM Elements
let canvasContainer;
let giftIntroModal;
let btnOpenGift;
let giftMessageHeader;
let colorChoiceDrawer;
let drawerPromptText;
let drawerSubText;
let playPauseBtn;
let playPauseText;
let restartBtn;
let aspectToggleBtn;
let snapshotBtn;
let customColorInput;

export function init() {
  canvasContainer = document.getElementById('canvas-container');
  if (!canvasContainer) {
    setTimeout(init, 50);
    return;
  }

  giftIntroModal = document.getElementById('gift-intro-modal');
  btnOpenGift = document.getElementById('btn-open-gift');
  giftMessageHeader = document.getElementById('gift-message-header');
  colorChoiceDrawer = document.getElementById('color-choice-drawer');
  drawerPromptText = document.getElementById('drawer-prompt-text');
  drawerSubText = document.getElementById('drawer-sub-text');
  playPauseBtn = document.getElementById('btn-play-pause');
  playPauseText = document.getElementById('play-pause-text');
  restartBtn = document.getElementById('btn-restart');
  aspectToggleBtn = document.getElementById('aspect-toggle-btn');
  snapshotBtn = document.getElementById('btn-snapshot');
  customColorInput = document.getElementById('custom-color-input');

  // Personalize initial texts for Rua
  if (drawerPromptText) {
    drawerPromptText.textContent = `${RECIPIENT_NAME}'s Favorite: Aqua Teal (Sky Blue) ✨`;
  }
  const mainTitleInit = document.getElementById('gift-main-title');
  if (mainTitleInit) {
    mainTitleInit.textContent = `I picked these Aqua Teal Glaze Lilies just for you, ${RECIPIENT_NAME}`;
  }
  const giftForTextInit = document.getElementById('gift-for-text');
  if (giftForTextInit) {
    giftForTextInit.textContent = `for ${RECIPIENT_NAME}`;
  }

  // 1. Renderer Setup
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  const width = canvasContainer.clientWidth || 600;
  const height = canvasContainer.clientHeight || 1000;
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  canvasContainer.appendChild(renderer.domElement);

  // 2. Camera Setup
  camera = new THREE.PerspectiveCamera(
    28,
    width / height,
    0.1,
    50
  );
  camera.position.set(0, 0, 5.2);

  // 3. Orbit Controls (Enabled automatically when flower blooms!)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(-0.02, 0.40, 0.08);
  controls.minDistance = 1.2;
  controls.maxDistance = 12.0;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.6;
  controls.enabled = false;

  // Once user touches/drags, pause auto-rotation so they have 100% free manual control
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });

  // 4. Scene & Lighting — dark velvety studio backdrop
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0810);
  sceneGroup = new THREE.Group();
  scene.add(sceneGroup);

  // Subdued botanical studio lighting
  const ambientLight = new THREE.AmbientLight(0xdcd4cc, 0.28);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 0.58);
  keyLight.position.set(-2, 4, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xa5bed5, 0.22);
  fillLight.position.set(3, -1, 3);
  scene.add(fillLight);

  // 5. Build Procedural Bouquet
  botanicalElements = buildLilyBouquetScene();
  for (const el of botanicalElements) {
    if (el.mesh) sceneGroup.add(el.mesh);
    if (el.wireLines) sceneGroup.add(el.wireLines);
    if (el.papillaeGroup) sceneGroup.add(el.papillaeGroup);
  }

  // 6. Floating Pollen Particles (delicate fairy sparkles)
  particleSystem = new BotanicalParticleSystem(75);
  sceneGroup.add(particleSystem.points);

  // Apply initial Blue color shift (her favorite color!)
  applyHueShift(DEFAULT_BLUE_HUE_SHIFT);

  // Initialize initial closed-state preview
  for (const el of botanicalElements) {
    el.update(0.0, DURATION, 0.0);
  }
  updateCamera(0.0);

  // 7. Event Listeners & UI Binding
  setupUI();
  window.addEventListener('resize', onWindowResize);

  // Kickoff Animation Loop
  requestAnimationFrame(animate);
}

function updateFunFactCard(colorName) {
  const factData = LILY_FUN_FACTS[colorName] || LILY_FUN_FACTS['Custom Shade'];
  const factPill = document.getElementById('fact-pill');
  const factSymbolism = document.getElementById('fact-symbolism');
  const factText = document.getElementById('fun-fact-text');

  if (factPill) factPill.textContent = factData.pill;
  if (factSymbolism) factSymbolism.textContent = factData.symbolism;
  if (factText) {
    factText.style.opacity = '0';
    setTimeout(() => {
      factText.textContent = factData.fact;
      factText.style.opacity = '1';
    }, 120);
  }
}

function updateCamera(t) {
  if (cameraMode !== 'cinematic') {
    controls.update();
    return;
  }

  const p_all = clamp(t / DURATION, 0.0, 1.0);

  let azSway = 0.0;
  if (p_all > 0.72) {
    azSway = 0.22 * Math.sin(((p_all - 0.72) / 0.28) * Math.PI);
  }
  const azimuth = -0.32 + 0.56 * smootherstep(0.0, 0.78, p_all) + azSway;
  const elevation = 0.06 + 0.10 * smootherstep(0.10, 0.65, p_all) - 0.03 * smootherstep(0.75, 1.0, p_all);

  const y_target = -0.40 * (1.0 - smootherstep(0.0, 0.32, p_all)) + 0.48 * smootherstep(0.15, 0.55, p_all);
  const cam_target = new THREE.Vector3(-0.02, y_target, 0.08);
  const cam_dist = 5.35 - 0.15 * smootherstep(0.25, 0.85, p_all);

  // Spherical orbit calculation
  const cosElev = Math.cos(elevation);
  const sinElev = Math.sin(elevation);
  const cosAz = Math.cos(azimuth);
  const sinAz = Math.sin(azimuth);

  const camPos = new THREE.Vector3(
    cam_target.x + cam_dist * sinAz * cosElev,
    cam_target.y + cam_dist * sinElev,
    cam_target.z + cam_dist * cosAz * cosElev
  );

  camera.position.copy(camPos);
  camera.lookAt(cam_target);
  controls.target.copy(cam_target);
}

function animate(now) {
  requestAnimationFrame(animate);

  const delta = (now - lastTimestamp) / 1000;
  lastTimestamp = now;

  if (isPlaying) {
    currentTime += delta * playbackSpeed;

    // Check if flowers reached bloom (~5.8s) -> reveal color choice drawer with fun facts & enable free 3D rotation!
    if (currentTime >= 5.8 && !colorDrawerRevealed) {
      revealColorDrawer();
      enableFreeRotation();
    }

    // Stop at end of bloom — DO NOT loop continuously
    if (currentTime >= DURATION) {
      currentTime = DURATION;
      isPlaying = false;
      updatePlayPauseButton(false);
      if (!colorDrawerRevealed) {
        revealColorDrawer();
      }
      enableFreeRotation();
    }
  }

  // Update botanical elements (pass 1.0 for active wireframes)
  for (const el of botanicalElements) {
    el.update(currentTime, DURATION, 1.0);
  }

  // Update ambient particles
  if (particleSystem) {
    particleSystem.update(currentTime);
  }

  // Camera update
  updateCamera(currentTime);

  renderer.render(scene, camera);
}

function updatePlayPauseButton(playing) {
  const playPauseSvg = document.getElementById('play-pause-svg');
  if (playPauseText) {
    playPauseText.textContent = playing ? 'Pause' : 'Play';
  }
  if (playPauseSvg) {
    if (playing) {
      playPauseSvg.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
      playPauseSvg.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  }
}

function revealColorDrawer() {
  colorDrawerRevealed = true;
  if (colorChoiceDrawer) {
    colorChoiceDrawer.classList.remove('hidden');
    colorChoiceDrawer.classList.remove('minimized');
  }
}

function minimizeDrawer() {
  if (colorChoiceDrawer) {
    colorChoiceDrawer.classList.add('minimized');
  }
  const reopenBtn = document.getElementById('btn-reopen-drawer');
  if (reopenBtn) {
    reopenBtn.classList.remove('hidden');
  }
}

function restoreDrawer() {
  if (colorChoiceDrawer) {
    colorChoiceDrawer.classList.remove('minimized');
    colorChoiceDrawer.classList.remove('hidden');
  }
  const reopenBtn = document.getElementById('btn-reopen-drawer');
  if (reopenBtn) {
    reopenBtn.classList.add('hidden');
  }
  if (giftMessageHeader) {
    giftMessageHeader.classList.remove('hidden');
  }
}

function enableFreeRotation() {
  if (cameraMode !== 'orbit') {
    cameraMode = 'orbit';
    controls.enabled = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
  }
}

function setCameraMode(mode) {
  cameraMode = mode;
  controls.enabled = mode === 'orbit';
  if (mode === 'cinematic') {
    controls.autoRotate = false;
  }
}

function applyHueShift(hueShiftRadians) {
  for (const el of botanicalElements) {
    if (el.surfaceMaterial && el.surfaceMaterial.uniforms.uHueShift) {
      el.surfaceMaterial.uniforms.uHueShift.value = hueShiftRadians;
    }
    if (el.wireMaterial && el.wireMaterial.uniforms.uHueShift) {
      el.wireMaterial.uniforms.uHueShift.value = hueShiftRadians;
    }
  }
}

function spawnBurstPetals() {
  const container = document.getElementById('intro-burst-container');
  if (!container) return;
  container.innerHTML = '';
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const distance = 95 + Math.random() * 85;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const rot = (Math.random() - 0.5) * 220;

    const mote = document.createElement('span');
    mote.className = 'burst-mote';
    mote.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    mote.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    mote.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    container.appendChild(mote);
  }
}

function setupUI() {
  // 1. "Unwrap Your Flowers" Starting Experience (Midnight Garden Edition)
  if (btnOpenGift && giftIntroModal) {
    btnOpenGift.addEventListener('click', () => {
      if (hasOpened) return;
      hasOpened = true;

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const completeGiftOpening = () => {
        giftIntroModal.classList.add('dismissed');

        // Reveal top love note
        if (giftMessageHeader) {
          giftMessageHeader.classList.remove('hidden');
        }

        // Begin blooming animation
        currentTime = 0.0;
        isPlaying = true;
        updatePlayPauseButton(true);
      };

      if (prefersReduced) {
        completeGiftOpening();
      } else {
        // Magical opening transition: petal burst + radiant bloom
        giftIntroModal.classList.add('card-opening');
        spawnBurstPetals();
        setTimeout(completeGiftOpening, 520);
      }
    });
  }

  // 2. Play / Pause
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (currentTime >= DURATION) {
        currentTime = 0.0;
        isPlaying = true;
        updatePlayPauseButton(true);
        return;
      }

      isPlaying = !isPlaying;
      updatePlayPauseButton(isPlaying);
    });
  }

  // 3. Restart / Replay Bloom
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      currentTime = 0.0;
      isPlaying = true;
      setCameraMode('cinematic');
      controls.enabled = false;
      controls.autoRotate = false;
      updatePlayPauseButton(true);
    });
  }

  // Close Drawer Button
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeDrawer();
    });
  }

  // Drag handle tap to close
  const drawerDragHandle = document.getElementById('drawer-drag-handle');
  if (drawerDragHandle) {
    drawerDragHandle.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeDrawer();
    });
  }

  // Reopen Floating Button
  const btnReopenDrawer = document.getElementById('btn-reopen-drawer');
  if (btnReopenDrawer) {
    btnReopenDrawer.addEventListener('click', () => {
      restoreDrawer();
    });
  }

  // Close Top Note Button
  const btnCloseHeader = document.getElementById('btn-close-header');
  if (btnCloseHeader) {
    btnCloseHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      if (giftMessageHeader) {
        giftMessageHeader.classList.add('hidden');
      }
    });
  }

  // Mobile Touch Swipe-Down to minimize
  const drawerPanel = document.querySelector('.drawer-glass-panel');
  if (drawerPanel) {
    let touchStartY = 0;
    drawerPanel.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    drawerPanel.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - touchStartY > 45) {
        minimizeDrawer();
      }
    }, { passive: true });
  }

  // 4. 3D Frame vs Full Widescreen Toggle
  if (aspectToggleBtn) {
    aspectToggleBtn.addEventListener('click', () => {
      const appWrapper = document.getElementById('app-wrapper');
      appWrapper.classList.toggle('reel-mode');
      const isReel = appWrapper.classList.contains('reel-mode');
      const label = aspectToggleBtn.querySelector('.btn-label');
      if (label) {
        label.textContent = isReel ? 'Frame' : 'Wide';
      }
      setTimeout(onWindowResize, 60);
    });
  }

  // 5. High-Resolution Snapshot
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `lily-bouquet-${currentChosenColor.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    });
  }

  // 6. Color Swatches (Interactive with Fun Facts & Glaze Lily lore)
  updateFunFactCard(currentChosenColor);

  document.querySelectorAll('[data-hue-shift]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('[data-hue-shift]').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');

      const hueShift = parseFloat(swatch.getAttribute('data-hue-shift'));
      const colorName = swatch.getAttribute('data-color-name') || 'Custom';
      currentChosenColor = colorName;

      applyHueShift(hueShift);
      updateFunFactCard(colorName);

      // Sweet interactive response — ONLY say "Rua's Favorite" for Aqua Teal (Sky Blue)!
      const isFav = colorName.includes('Aqua Teal') || colorName.includes('Sky Blue');
      if (drawerPromptText) {
        if (isFav) {
          drawerPromptText.textContent = `${RECIPIENT_NAME}'s Favorite: ${colorName} ✨`;
        } else {
          drawerPromptText.textContent = `${colorName} Lilies ✨`;
        }
      }
      if (drawerSubText) {
        drawerSubText.textContent = isFav 
          ? `Reminds me of Glaze Lilies, loved by Guizhong & Zhongli` 
          : `A living bouquet crafted with love for ${RECIPIENT_NAME}`;
      }

      const mainTitle = document.getElementById('gift-main-title');
      if (mainTitle) {
        if (isFav) {
          mainTitle.textContent = `I picked these Aqua Teal Glaze Lilies just for you, ${RECIPIENT_NAME}`;
        } else {
          mainTitle.textContent = `I picked these ${colorName} lilies just for you, ${RECIPIENT_NAME}`;
        }
      }
    });
  });

  // 7. Custom Color Picker Input
  if (customColorInput) {
    customColorInput.addEventListener('input', (e) => {
      document.querySelectorAll('[data-hue-shift]').forEach(s => s.classList.remove('active'));
      const hex = e.target.value;
      const r = parseInt(hex.slice(1,3), 16) / 255;
      const g = parseInt(hex.slice(3,5), 16) / 255;
      const b = parseInt(hex.slice(5,7), 16) / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      let h = 0;
      if (mx !== mn) {
        const d = mx - mn;
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (mx === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      const baseHue = 0.94;
      let shift = (h - baseHue);
      if (shift < -0.5) shift += 1.0;
      if (shift > 0.5) shift -= 1.0;

      applyHueShift(shift * Math.PI * 2);
      currentChosenColor = 'Custom (Pick Any Color)';
      updateFunFactCard('Custom (Pick Any Color)');

      if (drawerPromptText) {
        drawerPromptText.textContent = `Custom Shade Lilies ✨`;
      }
      if (drawerSubText) {
        drawerSubText.textContent = `Your bespoke digital color creation`;
      }
    });
  }
}

function onWindowResize() {
  if (!renderer || !canvasContainer) return;
  const width = canvasContainer.clientWidth || window.innerWidth;
  const height = canvasContainer.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
