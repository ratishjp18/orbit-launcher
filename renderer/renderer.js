'use strict';

// ====================================================================
//  ANIMATION CONSTANTS  — edit these to tune the visuals
//  All speeds are in pixels-per-millisecond or radians-per-millisecond
// ====================================================================
const ANIM = {
  // Stars: ~1 per STAR_DENSITY screen pixels; size range 0.3–1.9 px; drift left
  STAR_DENSITY:             5_000,   // one star per N pixels of screen area
  STAR_MIN_SIZE:            0.3,
  STAR_MAX_SIZE:            1.9,
  STAR_BASE_SPEED:          0.040,   // px/ms at speedFactor = 1.0  (Normal)
  STAR_TWINKLE_BASE:        0.00050, // rad/ms base twinkle rate (×2 in Fast)

  // Shooting star — active in Normal and Fast modes
  SHOOTING_STAR_SPEED:          0.52,
  SHOOTING_STAR_LENGTH:         230,
  SHOOTING_STAR_DURATION:       900,
  SHOOTING_STAR_MIN_DELAY:      5_000,
  SHOOTING_STAR_MAX_DELAY:     10_000,

  // Page navigation
  PAGE_SLIDE_DURATION:          500,
  PAGE_SCROLL_COOLDOWN:         700,
  PAGE_SCROLL_MIN_DELTA:         10,

  // Reduce all canvas speeds to this fraction for prefers-reduced-motion
  REDUCED_MOTION_FACTOR:        0.05,
};

// ====================================================================
//  GRID CONSTANTS — change these two numbers to reshape the launcher
// ====================================================================
const ROWS           = 3;             // rows per page
const COLS           = 6;             // columns per page
const TILES_PER_PAGE = ROWS * COLS;   // 18

// ====================================================================
//  DOM REFS
// ====================================================================
const canvas       = /** @type {HTMLCanvasElement} */ (document.getElementById('space-canvas'));
const ctx          = canvas.getContext('2d');
const pagesWrapper = document.getElementById('pages-wrapper');
const pageDotsEl   = document.getElementById('page-dots');

// ====================================================================
//  REDUCED-MOTION
// ====================================================================
const mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let speedFactor = mqReducedMotion.matches ? ANIM.REDUCED_MOTION_FACTOR : 1.0;
// Re-apply everything (speeds, nebula, parallax) when OS setting changes
mqReducedMotion.addEventListener('change', () => applySettings());

// ====================================================================
//  CANVAS RESIZE
// ====================================================================
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', () => {
  resizeCanvas();
  initStars();
  applyPageTransform(false);
});

// ====================================================================
//  STARS
// ====================================================================
let stars = [];

// Derived per-speed properties — updated by applySettings()
let parallaxEnabled    = true;   // big stars move faster than small ones
let twinkleMul         = 2.0;    // multiplier on base twinkle rate
let shootingStarsEnabled = true; // disabled in Slow mode

function initStars() {
  stars = [];
  const W     = canvas.width;
  const H     = canvas.height;
  const count = Math.max(40, Math.floor((W * H) / ANIM.STAR_DENSITY));

  for (let i = 0; i < count; i++) {
    const size = ANIM.STAR_MIN_SIZE + Math.random() * (ANIM.STAR_MAX_SIZE - ANIM.STAR_MIN_SIZE);
    stars.push({
      x:          Math.random() * W,
      y:          Math.random() * H,
      size,
      alpha:      0.40 + Math.random() * 0.60,
      phase:      Math.random() * Math.PI * 2,
      phaseSpeed: ANIM.STAR_TWINKLE_BASE * (0.7 + Math.random() * 0.7),
    });
  }
}

function updateStars(dt) {
  const sf        = speedFactor;
  const W         = canvas.width;
  const H         = canvas.height;
  const sizeRange = ANIM.STAR_MAX_SIZE - ANIM.STAR_MIN_SIZE;

  for (const s of stars) {
    // Parallax: size 0→1 maps to speed multiplier 0.4→1.6
    const t        = (s.size - ANIM.STAR_MIN_SIZE) / sizeRange;
    const parallax = parallaxEnabled ? (0.40 + t * 1.20) : 1.0;

    s.x     += ANIM.STAR_BASE_SPEED * dt * sf * parallax; // → drift RIGHT
    s.phase += s.phaseSpeed * twinkleMul * dt;

    if (s.x > W + s.size) {          // re-enter from left edge
      s.x = -s.size;
      s.y = Math.random() * H;
    }
  }
}

function drawStars() {
  for (const s of stars) {
    const brightness = 0.60 + 0.40 * Math.sin(s.phase);
    const a = s.alpha * brightness;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fill();
  }
}

// ====================================================================
//  SHOOTING STAR
// ====================================================================
let shootingStar = null;
let nextShotAt   = 0; // performance.now() timestamp

function scheduleShootingStar() {
  const delay =
    ANIM.SHOOTING_STAR_MIN_DELAY +
    Math.random() * (ANIM.SHOOTING_STAR_MAX_DELAY - ANIM.SHOOTING_STAR_MIN_DELAY);
  nextShotAt = performance.now() + delay;
}

function spawnShootingStar() {
  // Streaks left → right, slightly downward (~12° ± 7°) — matches star drift
  const angle = Math.PI * 0.07 + (Math.random() - 0.5) * 0.12;
  shootingStar = {
    x:        -ANIM.SHOOTING_STAR_LENGTH,                       // off-screen left
    y:        canvas.height * (0.08 + Math.random() * 0.55),   // random vertical
    vx:       Math.cos(angle) * ANIM.SHOOTING_STAR_SPEED,       // rightward
    vy:       Math.sin(angle) * ANIM.SHOOTING_STAR_SPEED,       // slightly downward
    elapsed:  0,
    duration: ANIM.SHOOTING_STAR_DURATION,
    length:   ANIM.SHOOTING_STAR_LENGTH,
  };
}

function updateShootingStar(dt, now) {
  if (!shootingStarsEnabled) return;
  if (shootingStar) {
    // Shoot at minimum 30% of speed even under reduced-motion so it's visible
    const sf = Math.max(speedFactor, 0.30);
    shootingStar.x       += shootingStar.vx * dt * sf;
    shootingStar.y       += shootingStar.vy * dt * sf;
    shootingStar.elapsed += dt;

    const gone =
      shootingStar.elapsed >= shootingStar.duration ||
      shootingStar.x > canvas.width + shootingStar.length;

    if (gone) {
      shootingStar = null;
      scheduleShootingStar();
    }
  } else if (nextShotAt > 0 && now >= nextShotAt) {
    spawnShootingStar();
  }
}

function drawShootingStar() {
  if (!shootingStar) return;

  const ss      = shootingStar;
  const prog    = ss.elapsed / ss.duration;
  const alpha   = (1 - prog) * 0.92;
  const tailLen = ss.length * (0.55 + 0.45 * (1 - prog));

  // Unit vector pointing opposite to travel direction (tail direction)
  const spd = Math.hypot(ss.vx, ss.vy);
  const nx  = -ss.vx / spd;
  const ny  = -ss.vy / spd;
  const tx  = ss.x + nx * tailLen;
  const ty  = ss.y + ny * tailLen;

  // Tail gradient
  const grad = ctx.createLinearGradient(ss.x, ss.y, tx, ty);
  grad.addColorStop(0.00, `rgba(255,255,255,${alpha.toFixed(2)})`);
  grad.addColorStop(0.25, `rgba(210,220,255,${(alpha * 0.65).toFixed(2)})`);
  grad.addColorStop(1.00, 'rgba(180,200,255,0)');

  ctx.save();
  ctx.lineWidth   = 1.8;
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ss.x, ss.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // Glow at the tip
  const glowR = 3.5 + (1 - prog) * 3;
  const glow  = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, glowR);
  glow.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(2)})`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ss.x, ss.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ====================================================================
//  ANIMATION LOOP
// ====================================================================
let rafId      = null;
let animPaused = false;
let lastFrameTs = 0;

function loop(now) {
  if (animPaused) { rafId = null; return; }

  // Cap delta to ~2 frames so big pauses don't cause visual jumps
  const dt = Math.min(now - lastFrameTs, 48);
  lastFrameTs = now;

  // Clear canvas — background colour (#03000a) and nebula show through from CSS
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  updateStars(dt);  drawStars();
  updateShootingStar(dt, now); drawShootingStar();

  rafId = requestAnimationFrame(loop);
}

function startAnimation() {
  if (rafId !== null) return;
  animPaused  = false;
  lastFrameTs = performance.now();
  scheduleShootingStar();
  rafId = requestAnimationFrame(loop);
}

function pauseAnimation() {
  animPaused = true;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function resumeAnimation() {
  if (rafId !== null) return;
  animPaused  = false;
  lastFrameTs = performance.now();
  rafId = requestAnimationFrame(loop);
}

// Pause when window is hidden / minimized, resume when visible again
document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  hidden ? pauseAnimation() : resumeAnimation();
  // Also pause/resume the CSS nebula animations
  const state = hidden ? 'paused' : 'running';
  document.querySelectorAll('.nebula').forEach((el) => {
    el.style.animationPlayState = state;
  });
});

// ====================================================================
//  TILE RENDERING
// ====================================================================
const LETTER_COLORS = [
  '#6d28d9', '#2563eb', '#059669', '#b45309',
  '#db2777', '#0891b2', '#dc2626', '#7c3aed',
];

function letterBg(name) {
  let h = 0;
  for (const ch of name) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return LETTER_COLORS[Math.abs(h) % LETTER_COLORS.length];
}

/**
 * Build a tile DOM element.
 * @param {{ id:string, name:string, action:{type:string,path:string}, _notFound?:boolean }} tile
 */
function makeTileEl(tile) {
  const el = document.createElement('div');
  el.className = 'tile' + (tile._notFound ? ' not-found' : '');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', tile.name + (tile._notFound ? ' – not found' : ''));

  // Icon container (will be swapped for real icon once loaded)
  const wrap = document.createElement('div');
  wrap.className = 'tile-icon-wrap';
  wrap.dataset.id = tile.id;

  const letter = document.createElement('div');
  letter.className = 'tile-letter';
  letter.style.background = letterBg(tile.name);
  letter.textContent = (tile.name[0] ?? '?').toUpperCase();
  wrap.appendChild(letter);

  // Name label
  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = tile.name;

  el.appendChild(wrap);
  el.appendChild(nameEl);

  // Not-found: dim icon, add warning badge, tooltip on hover
  if (tile._notFound) {
    el.title = 'Click to set path';
    const badge = document.createElement('div');
    badge.className = 'tile-not-found-badge';
    badge.textContent = '!';
    badge.setAttribute('aria-hidden', 'true');
    wrap.appendChild(badge);
  }

  el.addEventListener('click', () => handleTileClick(tile));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTileClick(tile); }
  });

  return el;
}

/** Swap a tile's letter icon for the real extracted icon once it arrives. */
function applyIcon(tile, iconWrap, dataUrl) {
  tile._iconDataUrl = dataUrl;
  iconWrap.innerHTML = '';
  const img = new Image();
  img.className = 'tile-icon';
  img.src = dataUrl;
  img.alt = '';
  iconWrap.appendChild(img);
}

/** Async: extract the native Windows icon and update the DOM tile. */
async function loadTileIcon(tile, iconWrap) {
  if (tile._notFound) return;
  const { type, path: p, iconPath } = tile.action ?? {};
  // url / command / store tiles have non-file paths — skip direct extraction
  // unless an explicit iconPath override is provided
  const noFileTypes = new Set(['url', 'command', 'store']);
  const extractFrom = iconPath || (!noFileTypes.has(type) ? p : null);
  if (!extractFrom) return;

  const dataUrl = await window.orbitAPI.getFileIcon(extractFrom);
  if (dataUrl) applyIcon(tile, iconWrap, dataUrl);
}

async function handleTileClick(tile) {
  if (tile._notFound) {
    // TODO (Step 3): open file picker so user can set the correct path
    return;
  }
  const result = await window.orbitAPI.launchTile(tile);
  if (result?.success) {
    window.orbitAPI.hideWindow();
  } else if (result?.error) {
    console.error('Launch failed:', result.error);
  }
}

// ====================================================================
//  PAGE STATE & NAVIGATION
// ====================================================================
let tiles       = [];
let currentPage = 0;
let pageCount   = 1;
let lastScrollMs = 0;
// TILES_PER_PAGE = ROWS * COLS is defined at the top of this file

function buildPages() {
  pagesWrapper.innerHTML = '';
  pageDotsEl.innerHTML   = '';

  pageCount = Math.max(1, Math.ceil(tiles.length / TILES_PER_PAGE));

  for (let p = 0; p < pageCount; p++) {
    const pageTiles = tiles.slice(p * TILES_PER_PAGE, (p + 1) * TILES_PER_PAGE);
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    // Stamp the grid shape from the ROWS/COLS constants (one place to change)
    pageEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    pageEl.style.gridTemplateRows    = `repeat(${ROWS}, 1fr)`;

    for (let i = 0; i < TILES_PER_PAGE; i++) {
      if (i < pageTiles.length) {
        const tileEl = makeTileEl(pageTiles[i]);
        pageEl.appendChild(tileEl);

        const iconWrap = tileEl.querySelector('.tile-icon-wrap');
        // Fire-and-forget async icon load — updates DOM when ready
        loadTileIcon(pageTiles[i], iconWrap);
      } else {
        const empty = document.createElement('div');
        empty.className = 'tile tile-empty';
        empty.setAttribute('aria-hidden', 'true');
        pageEl.appendChild(empty);
      }
    }

    pagesWrapper.appendChild(pageEl);

    // Page dot
    const dot = document.createElement('button');
    dot.className = 'page-dot' + (p === currentPage ? ' active' : '');
    dot.setAttribute('aria-label', `Page ${p + 1}`);
    dot.addEventListener('click', () => goToPage(p));
    pageDotsEl.appendChild(dot);
  }

  applyPageTransform(false);
}

function goToPage(index) {
  if (index < 0 || index >= pageCount) return;
  currentPage = index;
  applyPageTransform(true);
  updatePageDots();
}

function applyPageTransform(animate) {
  if (!animate) {
    pagesWrapper.style.transition = 'none';
    // Force a reflow so the browser applies transition:none before the transform
    // eslint-disable-next-line no-unused-expressions
    pagesWrapper.offsetHeight;
  } else {
    pagesWrapper.style.transition =
      `transform ${ANIM.PAGE_SLIDE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  }
  pagesWrapper.style.transform = `translateY(-${currentPage * 100}vh)`;
}

function updatePageDots() {
  pageDotsEl.querySelectorAll('.page-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentPage);
  });
}

function tryNavigate(dir) {
  const target = currentPage + dir;
  if (target < 0 || target >= pageCount) return; // no wrap

  const now = Date.now();
  if (now - lastScrollMs < ANIM.PAGE_SCROLL_COOLDOWN) return;
  lastScrollMs = now;

  goToPage(target);
}

// ====================================================================
//  SETTINGS
// ====================================================================
const SETTINGS_DEFAULTS = { tileSize: 'xlarge', bgSpeed: 'fast' };

const ICON_SIZES   = {
  medium: 'clamp(42px, 5.5vmin, 70px)',
  large:  'clamp(50px, 6.5vmin, 82px)',
  xlarge: 'clamp(58px, 7.5vmin, 96px)',
};
const SPEED_VALUES = { slow: 0.35, normal: 0.70, fast: 1.00 };

let currentSettings = { ...SETTINGS_DEFAULTS };

function loadSettings() {
  try {
    const raw = localStorage.getItem('orbit-settings');
    if (raw) currentSettings = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem('orbit-settings', JSON.stringify(currentSettings));
}

// Nebula CSS animation durations [purple, blue] per speed setting
const NEBULA_DURATIONS = {
  slow:   ['48s', '44s'],
  normal: ['30s', '27s'],
  fast:   ['18s', '15s'],
};

function applySettings() {
  // Icon size via CSS variable
  const size = ICON_SIZES[currentSettings.tileSize] ?? ICON_SIZES.xlarge;
  document.documentElement.style.setProperty('--icon-size', size);

  const reduced = mqReducedMotion.matches;
  const spd     = reduced ? 'slow' : (currentSettings.bgSpeed ?? 'fast');

  // Canvas speed factor
  speedFactor = reduced ? ANIM.REDUCED_MOTION_FACTOR : (SPEED_VALUES[spd] ?? 1.0);

  // Parallax: off in Slow, light in Normal, full in Fast
  parallaxEnabled = (spd !== 'slow');

  // Twinkle rate: 1× Slow, 1.5× Normal, 2× Fast
  twinkleMul = spd === 'fast' ? 2.0 : spd === 'normal' ? 1.5 : 1.0;

  // Shooting stars: off in Slow
  shootingStarsEnabled = (spd !== 'slow');
  if (!shootingStarsEnabled) { shootingStar = null; nextShotAt = 0; }

  // Nebula CSS animation duration + reduced-motion freeze
  const nebulaPurple = document.querySelector('.nebula-purple');
  const nebulaBlue   = document.querySelector('.nebula-blue');
  if (nebulaPurple && nebulaBlue) {
    if (reduced) {
      nebulaPurple.style.animationPlayState = 'paused';
      nebulaBlue.style.animationPlayState   = 'paused';
    } else {
      const [pd, bd] = NEBULA_DURATIONS[currentSettings.bgSpeed] ?? NEBULA_DURATIONS.fast;
      nebulaPurple.style.animationDuration  = pd;
      nebulaBlue.style.animationDuration    = bd;
      nebulaPurple.style.animationPlayState = 'running';
      nebulaBlue.style.animationPlayState   = 'running';
    }
  }

  syncSettingsUI();
}

function syncSettingsUI() {
  document.querySelectorAll('#size-group .setting-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === currentSettings.tileSize);
  });
  document.querySelectorAll('#speed-group .setting-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === currentSettings.bgSpeed);
  });
}

function openSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('settings-close').focus();
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.getElementById('settings-btn').focus();
}

// ── Settings event listeners ─────────────────────────────────────
document.getElementById('settings-btn').addEventListener('click', openSettings);

document.getElementById('settings-close').addEventListener('click', closeSettings);

// Click outside the card → close
document.getElementById('settings-panel').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});

// Tile size buttons
document.getElementById('size-group').addEventListener('click', (e) => {
  const btn = e.target.closest('.setting-option');
  if (!btn) return;
  currentSettings.tileSize = btn.dataset.value;
  saveSettings();
  applySettings();
});

// Speed buttons
document.getElementById('speed-group').addEventListener('click', (e) => {
  const btn = e.target.closest('.setting-option');
  if (!btn) return;
  currentSettings.bgSpeed = btn.dataset.value;
  saveSettings();
  applySettings();
});

// Reset to defaults
document.getElementById('reset-defaults').addEventListener('click', () => {
  currentSettings = { ...SETTINGS_DEFAULTS };
  saveSettings();
  applySettings();
});

// ====================================================================
//  TOAST NOTIFICATION
// ====================================================================
function showToast(msg, durationMs = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('visible'), durationMs);
}

// ====================================================================
//  INPUT EVENTS
// ====================================================================

// Wheel — { passive: false } so we can call preventDefault()
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (Math.abs(e.deltaY) < ANIM.PAGE_SCROLL_MIN_DELTA) return;
  tryNavigate(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

// Keyboard
window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
    case 'PageDown':
      e.preventDefault();
      tryNavigate(1);
      break;
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      tryNavigate(-1);
      break;
    case 'Escape':
      if (document.getElementById('settings-panel').classList.contains('open')) {
        closeSettings();
      } else {
        window.orbitAPI?.hideWindow();
      }
      break;
  }
});

// Touch / trackpad swipe
let touchStartY = 0;
window.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  const dy = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(dy) > 40) tryNavigate(dy > 0 ? 1 : -1);
}, { passive: true });

// ====================================================================
//  INIT
// ====================================================================
async function init() {
  if (!window.orbitAPI) {
    console.error('[OrbitLauncher] orbitAPI not available — preload may have failed.');
    return;
  }

  // 1. Canvas
  resizeCanvas();
  initStars();

  // 2. Load persisted settings before starting animation
  loadSettings();
  applySettings();

  // Listen for toast messages from the main process (e.g. hotkey conflicts)
  window.orbitAPI.onToast?.((msg) => showToast(msg));

  // 3. Start the space animation immediately (tiles load async in the background)
  startAnimation();

  // 3. Load tile layout from main process
  let rawTiles = [];
  try {
    const data = await window.orbitAPI.getTiles();
    rawTiles = data?.tiles ?? [];
  } catch (err) {
    console.error('[OrbitLauncher] Failed to load tiles:', err);
  }

  // 4. Check each tile's path in parallel
  tiles = await Promise.all(
    rawTiles.map(async (tile) => {
      const { type, path: p } = tile.action ?? {};
      let notFound = false;
      if (type === 'app' || type === 'folder' || type === 'project') {
        notFound = !(await window.orbitAPI.pathExists(p));
      }
      return { ...tile, _notFound: notFound };
    }),
  );

  // 5. Build the page DOM (icons load async afterwards inside buildPages)
  buildPages();
}

init();
