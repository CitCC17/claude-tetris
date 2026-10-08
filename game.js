'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
  '#f06292', // + - pentominó (rosa)
  '#4db6ac', // U - pentominó (verde azulado)
  '#aed581', // Y - pentominó (lima)
  '#fafafa', // single 1×1 (blanco)
  '#ffffff', // comodín (se dibuja con arcoíris animado)
  '#5c5c6e', // basura (modo desafío)
  '#8d6e63', // bloque fijo pre-colocado (modo desafío)
];

const WILD = 13;
const GARBAGE = 14;
const FIXED = 15;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca, 3×3 hueca)
  [[0,9,0],[9,9,9],[0,9,0]],                  // +
  [[10,0,10],[10,10,10],[0,0,0]],             // U
  [[0,0,0,0],[11,11,11,11],[0,11,0,0],[0,0,0,0]], // Y
  [[12]],                                     // single
];

const STANDARD_PIECES = [1, 2, 3, 4, 5, 6, 7];
const SPECIAL_PIECES  = [8, 9, 10, 11];  // 3×3 hueca (reto) + pentominós
const SPECIAL_CHANCE  = 0.12;            // probabilidad de pieza especial
const PIECE_T      = 3;
const PIECE_SINGLE = 12;                 // recompensa tras un Tetris

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600];  // T-spin con 0, 1, 2, 3 líneas
const B2B_MULTIPLIER = 1.5;                   // Tetris/T-spin consecutivos
const PERFECT_CLEAR_BONUS = 3000;             // × nivel, tablero vacío
const WILD_BONUS = 100;                       // × nivel, por comodín limpiado

// Power-ups: cada POWER_EVERY_LINES líneas la siguiente pieza trae uno.
// El efecto se activa al fijarla, centrado en la pieza.
const POWER_EVERY_LINES = 5;
const FREEZE_MS = 5000;
const POWERS = {
  bomb:    { name: 'BOMBA',    icon: 'B', color: '#ff5252' },  // destruye 3×3
  ray:     { name: 'RAYO',     icon: 'R', color: '#ffee58' },  // limpia fila + columna
  tint:    { name: 'TINTE',    icon: 'T', color: '#e040fb' },  // su color → comodines
  gravity: { name: 'GRAVEDAD', icon: 'G', color: '#69f0ae' },  // compacta huecos
  freeze:  { name: 'CONGELAR', icon: 'F', color: '#80d8ff' },  // sin caída 5 s
};
const POWER_KEYS = Object.keys(POWERS);

// Energía: se llena limpiando líneas; llena (100) permite usar una habilidad con E
const ENERGY_MAX = 100;
const ENERGY_PER_LINE = 10;
const ENERGY_BONUS = 10;          // extra por Tetris o T-spin con líneas
const QUEUE_SIZE = 5;
const PREVIEW_MS = 30000;         // duración de "ver siguientes 5"
const SLOW_MS = 10000;
const SLOW_FACTOR = 2.5;
const ABILITIES = ['preview', 'swap', 'slow', 'undo', 'hold'];

// Modos: clásico (sin objetivo) y desafíos con un objetivo concreto
const MODES = {
  classic:   { name: 'Clásico' },
  sprint:    { name: 'Sprint 40', goalLines: 40, timeLimit: 120000 },
  garbage:   { name: 'Basura', survive: 120000, garbageEvery: 10000 },
  fixed:     { name: 'Bloques fijos', fixedRows: 6 },
  invisible: { name: 'Invisible', goalLines: 20, invisible: true },
  reverse:   { name: 'Rotación inversa', goalLines: 20, startLevel: 4, reverseFromLevel: 5 },
};
const MODE_KEYS = Object.keys(MODES);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const b2bEl = document.getElementById('b2b');
const nextPowerEl = document.getElementById('next-power');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const abilityMenu = document.getElementById('ability-menu');
const abilityButtons = abilityMenu.querySelectorAll('[data-ability]');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const modeMenu = document.getElementById('mode-menu');
const modeButtons = modeMenu.querySelectorAll('[data-mode]');
const objectiveSection = document.getElementById('objective-section');
const objectiveEl = document.getElementById('objective');

let board, current, queue, score, lines, level, lastTime, dropAccum, dropInterval, animId;
let state; // 'menu' | 'playing' | 'paused' | 'ability' | 'over' | 'won'
let modeKey, mode, elapsed, garbageTimer;
let hold, canHold;
let combo, backToBack, lastMoveRotate;
let nextPowerAt, freezeTimer;
let energy, previewTimer, slowTimer, spawnSnapshot, undoSnapshot;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type, power = null) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, power, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  const pool = Math.random() < SPECIAL_CHANCE ? SPECIAL_PIECES : STANDARD_PIECES;
  return makePiece(pool[Math.floor(Math.random() * pool.length)]);
}

function takeNext() {
  const piece = queue.shift();
  queue.push(randomPiece());
  drawNext();
  return piece;
}

const clonePiece = p => p && makePiece(p.type, p.power);

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

const rotateCCW = shape => rotateCW(rotateCW(rotateCW(shape)));

const isReversed = () => !!mode.reverseFromLevel && level >= mode.reverseFromLevel;

function tryRotate() {
  const rotated = isReversed() ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveRotate = true;
      return;
    }
  }
}

function tryMove(dx, dy) {
  if (collide(current.shape, current.x + dx, current.y + dy)) return false;
  current.x += dx;
  current.y += dy;
  lastMoveRotate = false;
  return true;
}

// T-spin: la T se fijó justo después de rotar y al menos 3 de las 4 esquinas
// de su caja 3×3 están ocupadas (o fuera del tablero).
function isTSpin() {
  if (current.type !== PIECE_T || !lastMoveRotate) return false;
  let filled = 0;
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
    const x = current.x + dx, y = current.y + dy;
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) filled++;
  }
  return filled >= 3;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0, wilds = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      wilds += board[r].filter(v => v === WILD).length;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return { cleared, wilds };
}

function pieceCenter(piece) {
  let sx = 0, sy = 0, n = 0;
  piece.shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) { sx += piece.x + c; sy += piece.y + r; n++; }
  }));
  return { cx: Math.round(sx / n), cy: Math.round(sy / n) };
}

// Aplica el power-up de la pieza recién fijada (ya está en el tablero)
function applyPower(piece) {
  const { cx, cy } = pieceCenter(piece);
  const p = POWERS[piece.power];
  switch (piece.power) {
    case 'bomb':
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++)
          if (y >= 0 && y < ROWS && x >= 0 && x < COLS) board[y][x] = 0;
      flash('rgba(255,82,82,', 0.5);
      shake();
      break;
    case 'ray':
      for (let y = 0; y < ROWS; y++) board[y][cx] = 0;
      board.splice(cy, 1);
      board.unshift(new Array(COLS).fill(0));
      flash('rgba(255,238,88,', 0.5);
      break;
    case 'tint':
      for (const row of board)
        for (let x = 0; x < COLS; x++)
          if (row[x] === piece.type) row[x] = WILD;
      flash('rgba(224,64,251,', 0.35);
      break;
    case 'gravity':
      for (let x = 0; x < COLS; x++) {
        const cells = board.map(row => row[x]).filter(v => v);
        for (let y = 0; y < ROWS; y++)
          board[y][x] = y < ROWS - cells.length ? 0 : cells[y - (ROWS - cells.length)];
      }
      flash('rgba(105,240,174,', 0.35);
      break;
    case 'freeze':
      freezeTimer = FREEZE_MS;
      flash('rgba(128,216,255,', 0.4);
      break;
  }
  popup(p.name, p.color, 28);
  sfx.power();
}

function addLines(cleared) {
  if (!cleared) return;
  lines += cleared;
  const wasReversed = isReversed();
  level = (mode.startLevel || 1) + Math.floor(lines / 10);
  dropInterval = speedFor(level);
  if (!wasReversed && isReversed()) popup('¡ROTACIÓN INVERSA!', '#ff8a65', 24);
}

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function lineScore(cleared) {
  return cleared <= 4 ? LINE_SCORES[cleared] : LINE_SCORES[4] + (cleared - 4) * 400;
}

// Puntuación de una pieza fijada: combo encadenado, T-spin, B2B y Perfect Clear
function scoreLock(cleared, tspin) {
  if (!cleared) {
    combo = 0;
    if (tspin) {
      score += TSPIN_SCORES[0] * level;
      popup('T-SPIN', COLORS[PIECE_T]);
      sfx.tspin();
    }
    return;
  }

  combo++;
  const difficult = cleared >= 4 || tspin;
  const isB2B = difficult && backToBack;
  backToBack = difficult;

  let points = (tspin ? TSPIN_SCORES[Math.min(cleared, 3)] : lineScore(cleared)) * level;
  points *= combo;                                  // x1, x2, x3...
  if (isB2B) points = Math.round(points * B2B_MULTIPLIER);
  score += points;

  if (tspin) {
    popup(`T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][Math.min(cleared, 3)]}`, COLORS[PIECE_T]);
    sfx.tspin();
  } else if (cleared >= 4) {
    popup('TETRIS!', COLORS[1], 34);
    sfx.tetris();
    shake();
  }
  if (combo >= 2) popup(`COMBO x${combo}`, '#ffd54f');
  if (isB2B) {
    popup('BACK-TO-BACK', '#ff8a65');
    sfx.b2b();
  }
  popup(`+${points.toLocaleString()}`, '#7aa2f7', 18);
  sfx.clear(combo);
  flash('rgba(255,255,255,', 0.25 + Math.min(combo, 5) * 0.05);

  if (board.every(row => row.every(v => !v))) {
    score += PERFECT_CLEAR_BONUS * level;
    popup('PERFECT CLEAR!', '#80deea', 30);
    sfx.perfect();
    flash('rgba(128,222,234,', 0.6);
    shake();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy > current.y) lastMoveRotate = false;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (tryMove(0, 1)) {
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  // La basura puede empujar la pieza por encima del tablero: si se fija ahí, se pierde
  if (current.shape.some((row, r) => row.some(v => v && current.y + r < 0))) {
    endGame();
    return;
  }
  undoSnapshot = spawnSnapshot;
  const tspin = isTSpin();
  merge();
  if (current.power) applyPower(current);
  const { cleared, wilds } = clearLines();
  scoreLock(cleared, tspin);
  if (wilds) {
    score += wilds * WILD_BONUS * level;
    popup(`COMODÍN +${(wilds * WILD_BONUS * level).toLocaleString()}`, '#e040fb');
  }
  addLines(cleared);
  addEnergy(cleared * ENERGY_PER_LINE + (cleared >= 4 || (tspin && cleared) ? ENERGY_BONUS : 0));
  // Recompensa: tras un Tetris la siguiente pieza es un single 1×1
  if (cleared >= 4) {
    queue[0] = makePiece(PIECE_SINGLE);
    drawNext();
  }
  updateHUD();
  spawn();
  // El power-up va en la pieza siguiente, para que se vea antes en NEXT
  if (lines >= nextPowerAt) {
    while (lines >= nextPowerAt) nextPowerAt += POWER_EVERY_LINES;
    queue[0].power = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
    drawNext();
  }
}

function spawn() {
  current = takeNext();
  canHold = true;
  lastMoveRotate = false;
  spawnSnapshot = takeSnapshot();
  drawHold();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
}

// Hold: guarda la pieza actual (en su orientación inicial) y saca la reservada,
// o la siguiente si el slot está vacío. Solo una vez por pieza, salvo que se
// fuerce con la habilidad de reserva.
function holdPiece(force = false) {
  if (!canHold && !force) return;
  const prev = current;
  current = hold ? makePiece(hold.type, hold.power) : takeNext();
  hold = makePiece(prev.type, prev.power);
  canHold = false;
  drawHold();
  if (collide(current.shape, current.x, current.y)) endGame();
}

// ── Energía y habilidades ────────────────────────────────────────────────────
function addEnergy(amount) {
  if (!amount || energy >= ENERGY_MAX) return;
  energy = Math.min(ENERGY_MAX, energy + amount);
  if (energy === ENERGY_MAX) popup('ENERGÍA LISTA [E]', '#b388ff', 18);
}

// Copia del estado al aparecer cada pieza; al fijarla pasa a ser el punto
// de "deshacer" (así también se revierten los puntos de soft/hard drop).
function takeSnapshot() {
  return {
    board: board.map(row => [...row]),
    piece: clonePiece(current),
    queue: queue.map(clonePiece),
    hold: clonePiece(hold),
    score, lines, level, combo, backToBack, nextPowerAt, dropInterval,
  };
}

function abilityAvailable(name) {
  return name !== 'undo' || !!undoSnapshot;
}

function openAbilityMenu() {
  if (energy < ENERGY_MAX) return;
  state = 'ability';
  abilityButtons.forEach(btn => { btn.disabled = !abilityAvailable(btn.dataset.ability); });
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  state = 'playing';
  abilityMenu.classList.add('hidden');
}

function useAbility(name) {
  if (state !== 'ability' || !abilityAvailable(name)) return;
  closeAbilityMenu();
  switch (name) {
    case 'preview':   // ver las siguientes 5 piezas durante 30 s
      previewTimer = PREVIEW_MS;
      drawNext();
      popup('VISIÓN x5', '#b388ff');
      break;
    case 'swap': {    // cambia la pieza actual por otra distinta del pool estándar
      const options = STANDARD_PIECES.filter(t => t !== current.type);
      const piece = makePiece(options[Math.floor(Math.random() * options.length)]);
      if (!collide(piece.shape, current.x, current.y)) { piece.x = current.x; piece.y = current.y; }
      else if (collide(piece.shape, piece.x, piece.y)) return;  // no cabe: no gasta energía
      current = piece;
      lastMoveRotate = false;
      popup('INTERCAMBIO', '#b388ff');
      break;
    }
    case 'slow':      // caída más lenta durante 10 s
      slowTimer = SLOW_MS;
      popup('TIEMPO LENTO', '#b388ff');
      break;
    case 'undo': {    // deshace la última colocación
      const s = undoSnapshot;
      board = s.board;
      queue = s.queue;
      hold = s.hold;
      ({ score, lines, level, combo, backToBack, nextPowerAt, dropInterval } = s);
      current = s.piece;
      canHold = true;
      spawnSnapshot = takeSnapshot();
      undoSnapshot = null;
      drawNext();
      drawHold();
      popup('DESHACER', '#b388ff');
      break;
    }
    case 'hold':      // reserva aunque el hold ya se haya usado en esta pieza
      holdPiece(true);
      popup('RESERVA', '#b388ff');
      break;
  }
  energy = 0;
  sfx.power();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo >= 2 ? `x${combo}` : '—';
  b2bEl.classList.toggle('hidden', !backToBack);
  energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`;
  energyFill.parentElement.classList.toggle('full', energy >= ENERGY_MAX);
  energyHint.textContent = energy >= ENERGY_MAX ? 'Pulsa E' : `${energy}%`;
}

// ── Efectos visuales y sonoros ───────────────────────────────────────────────
let popups = [];           // textos flotantes sobre el tablero
let flashColor = '', flashAlpha = 0;

function popup(text, color, size = 22) {
  popups.push({ text, color, size, age: 0, life: 1300 });
}

function flash(rgbaPrefix, alpha) {
  flashColor = rgbaPrefix;
  flashAlpha = Math.max(flashAlpha, alpha);
}

function shake() {
  canvas.classList.remove('shake');
  void canvas.offsetWidth;   // reinicia la animación CSS
  canvas.classList.add('shake');
}

function updateEffects(dt) {
  popups.forEach(p => { p.age += dt; });
  popups = popups.filter(p => p.age < p.life);
  flashAlpha = Math.max(0, flashAlpha - dt / 400);
}

function drawEffects() {
  if (flashAlpha > 0) {
    ctx.fillStyle = `${flashColor}${flashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  popups.forEach((p, i) => {
    const t = p.age / p.life;
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `900 ${p.size}px 'Courier New', monospace`;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillText(p.text, canvas.width / 2, canvas.height * 0.35 + i * 34 - t * 40);
  });
  ctx.restore();
}

// Sonidos sintetizados con Web Audio (sin archivos). M silencia.
const sfx = (() => {
  let ac = null;
  let muted = false;

  function tone(freq, dur = 0.12, type = 'square', delay = 0, vol = 0.07) {
    if (muted || !ac) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur);
  }
  const arpeggio = (notes, step = 0.07, type = 'square') =>
    notes.forEach((f, i) => tone(f, 0.15, type, i * step));

  return {
    // El navegador solo permite audio tras una interacción del usuario
    unlock() {
      try {
        ac ??= new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') ac.resume();
      } catch { /* sin audio */ }
    },
    toggleMute() { muted = !muted; return muted; },
    // Cada eslabón del combo sube dos semitonos
    clear: c => tone(330 * Math.pow(2, (Math.min(c, 12) - 1) * 2 / 12), 0.14, 'triangle'),
    tetris: () => arpeggio([523, 659, 784, 1047]),
    tspin: () => arpeggio([392, 587], 0.09, 'sawtooth'),
    b2b: () => arpeggio([880, 1175], 0.06),
    perfect: () => arpeggio([523, 659, 784, 1047, 1319, 1568], 0.08, 'triangle'),
    power: () => arpeggio([220, 330, 440], 0.05, 'sawtooth'),
    gameOver: () => arpeggio([392, 330, 262, 196], 0.15, 'triangle'),
    garbage: () => tone(110, 0.2, 'sawtooth'),
  };
})();

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === WILD
    ? `hsl(${(performance.now() / 8 + (x + y) * 30) % 360}, 85%, 65%)`
    : COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // bloque fijo: remache central para distinguirlo
  if (colorIndex === FIXED) {
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(x * size + size / 2 - 3, y * size + size / 2 - 3, 6, 6);
  }
  context.globalAlpha = 1;
}

// Marca de power-up: borde pulsante del color del poder + letra
function drawPowerMark(context, x, y, size, power) {
  const p = POWERS[power];
  context.save();
  context.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 120);
  context.strokeStyle = p.color;
  context.lineWidth = 2;
  context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.globalAlpha = 1;
  context.fillStyle = '#0f0f17';
  context.font = `900 ${Math.round(size * 0.55)}px 'Courier New', monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(p.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board (en modo invisible solo se revela al terminar la partida)
  const hideBoard = mode.invisible && state !== 'over' && state !== 'won';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!hideBoard) drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
      if (current.power) drawPowerMark(ctx, current.x + c, current.y + r, BLOCK, current.power);
    }

  // congelado: tinte azul
  if (freezeTimer > 0) {
    ctx.fillStyle = 'rgba(128,216,255,0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // efectos temporales activos, con cuenta regresiva
  const statuses = [
    [freezeTimer, 'CONGELADO', POWERS.freeze.color],
    [slowTimer, 'LENTO', '#b388ff'],
    [previewTimer, 'VISIÓN x5', '#b388ff'],
  ].filter(([t]) => t > 0);
  ctx.save();
  ctx.font = "700 14px 'Courier New', monospace";
  ctx.textAlign = 'center';
  statuses.forEach(([t, label, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(`${label} ${(t / 1000).toFixed(1)}s`, canvas.width / 2, 18 + i * 18);
  });
  ctx.restore();

  drawEffects();
}

// Dibuja una pieza centrada (por sus celdas ocupadas) en una franja del canvas.
function drawPiecePreview(context, piece, size, boxY, boxH) {
  const cells = [];
  piece.shape.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push([r, c]); }));
  const minR = Math.min(...cells.map(([r]) => r));
  const maxR = Math.max(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  const maxC = Math.max(...cells.map(([, c]) => c));
  const w = (maxC - minC + 1) * size;
  const h = (maxR - minR + 1) * size;
  context.save();
  context.translate((context.canvas.width - w) / 2 - minC * size, boxY + (boxH - h) / 2 - minR * size);
  for (const [r, c] of cells) {
    drawBlock(context, c, r, piece.shape[r][c], size);
    if (piece.power) drawPowerMark(context, c, r, size, piece.power);
  }
  context.restore();
}

// NEXT: normalmente 1 pieza; con la habilidad de visión, 5 (las 4 extra en pequeño)
function drawNext() {
  const visible = previewTimer > 0 ? QUEUE_SIZE : 1;
  const height = 120 + (visible - 1) * 60;
  if (nextCanvas.height !== height) nextCanvas.height = height;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPiecePreview(nextCtx, queue[0], 30, 0, 120);
  for (let i = 1; i < visible; i++) drawPiecePreview(nextCtx, queue[i], 15, 120 + (i - 1) * 60, 60);

  const next = queue[0];
  nextPowerEl.classList.toggle('hidden', !next.power);
  if (next.power) {
    nextPowerEl.textContent = POWERS[next.power].name;
    nextPowerEl.style.background = POWERS[next.power].color;
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold) drawPiecePreview(holdCtx, hold, 30, 0, holdCanvas.height);
  holdCanvas.classList.toggle('locked', !canHold);
}

function endGame(title = 'GAME OVER') {
  state = 'over';
  overlayTitle.textContent = title;
  overlayTitle.classList.remove('won');
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  sfx.gameOver();
}

function winGame() {
  state = 'won';
  overlayTitle.textContent = '¡OBJETIVO CUMPLIDO!';
  overlayTitle.classList.add('won');
  overlayScore.textContent = `${mode.name} · ${formatTime(elapsed)} · ${score.toLocaleString()} pts`;
  overlay.classList.remove('hidden');
  sfx.perfect();
}

// ── Modo desafío ─────────────────────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Bloques fijos en las filas de abajo, siempre con al menos 2 huecos por fila
function placeFixedBlocks(rows) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    const filled = 4 + Math.floor(Math.random() * 4);   // 4–7 de 10
    const cols = [...Array(COLS).keys()].sort(() => Math.random() - 0.5).slice(0, filled);
    for (const c of cols) board[r][c] = FIXED;
  }
}

// Sube una fila de basura (con un hueco) desde abajo
function addGarbageRow() {
  if (board[0].some(v => v)) { endGame(); return; }
  const row = new Array(COLS).fill(GARBAGE);
  row[Math.floor(Math.random() * COLS)] = 0;
  board.shift();
  board.push(row);
  if (collide(current.shape, current.x, current.y)) current.y--;
  if (collide(current.shape, current.x, current.y)) { endGame(); return; }
  flash('rgba(92,92,110,', 0.3);
  sfx.garbage();
}

const countCells = value => board.reduce((n, row) => n + row.filter(v => v === value).length, 0);

function updateChallenge(dt) {
  elapsed += dt;
  if (mode.garbageEvery) {
    garbageTimer += dt;
    if (garbageTimer >= mode.garbageEvery) {
      garbageTimer = 0;
      addGarbageRow();
      if (state !== 'playing') return;
    }
  }
  if (mode.goalLines && lines >= mode.goalLines) return winGame();
  if (mode.survive && elapsed >= mode.survive) return winGame();
  if (mode.fixedRows && countCells(FIXED) === 0) return winGame();
  if (mode.timeLimit && elapsed >= mode.timeLimit) return endGame('¡TIEMPO!');
}

function objectiveText() {
  switch (modeKey) {
    case 'sprint':    return `Líneas ${lines}/${mode.goalLines} · quedan ${formatTime(mode.timeLimit - elapsed)}`;
    case 'garbage':   return `Sobrevive ${formatTime(mode.survive - elapsed)} · basura en ${formatTime(mode.garbageEvery - garbageTimer)}`;
    case 'fixed':     return `Elimina los bloques fijos · quedan ${countCells(FIXED)}`;
    case 'invisible': return `Líneas ${lines}/${mode.goalLines} · piezas invisibles al caer`;
    case 'reverse':   return `Líneas ${lines}/${mode.goalLines} · rotación ${isReversed() ? 'INVERSA' : `normal hasta nivel ${mode.reverseFromLevel}`}`;
    default:          return '';
  }
}

function showModeMenu() {
  state = 'menu';
  overlay.classList.add('hidden');
  abilityMenu.classList.add('hidden');
  modeMenu.classList.remove('hidden');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    overlay.classList.add('hidden');
  }
}

function update(dt) {
  if (previewTimer > 0) {
    previewTimer = Math.max(0, previewTimer - dt);
    if (previewTimer === 0) drawNext();
  }
  if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);

  if (freezeTimer > 0) {
    freezeTimer = Math.max(0, freezeTimer - dt);   // congelado: no hay caída
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval * (slowTimer > 0 ? SLOW_FACTOR : 1)) {
      dropAccum = 0;
      if (!tryMove(0, 1)) lockPiece();
    }
  }
  updateEffects(dt);
  if (state === 'playing') updateChallenge(dt);
  objectiveEl.textContent = objectiveText();
}

// El loop sigue corriendo en pausa/menús (solo se congela la lógica) y se
// detiene al terminar la partida.
function loop(ts) {
  const dt = Math.min(ts - lastTime, 100);
  lastTime = ts;
  if (state === 'playing') update(dt);
  draw();
  if (state !== 'over' && state !== 'won') animId = requestAnimationFrame(loop);
}

function init(key = modeKey) {
  modeKey = key;
  mode = MODES[key];
  board = createBoard();
  if (mode.fixedRows) placeFixedBlocks(mode.fixedRows);
  score = 0;
  lines = 0;
  level = mode.startLevel || 1;
  state = 'playing';
  dropInterval = speedFor(level);
  dropAccum = 0;
  elapsed = 0;
  garbageTimer = 0;
  lastTime = performance.now();
  hold = null;
  combo = 0;
  backToBack = false;
  nextPowerAt = POWER_EVERY_LINES;
  freezeTimer = 0;
  energy = 0;
  previewTimer = 0;
  slowTimer = 0;
  undoSnapshot = null;
  popups = [];
  flashAlpha = 0;
  queue = Array.from({ length: QUEUE_SIZE }, randomPiece);
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  abilityMenu.classList.add('hidden');
  modeMenu.classList.add('hidden');
  objectiveSection.classList.toggle('hidden', key === 'classic');
  objectiveEl.textContent = objectiveText();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  sfx.unlock();
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM') { sfx.toggleMute(); return; }
  if (state === 'menu') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= MODE_KEYS.length) init(MODE_KEYS[n - 1]);
    return;
  }
  if (state === 'ability') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ABILITIES.length) useAbility(ABILITIES[n - 1]);
    else if (e.code === 'Escape' || e.code === 'KeyE') closeAbilityMenu();
    return;
  }
  if (state !== 'playing') return;
  switch (e.code) {
    case 'KeyE':
      openAbilityMenu();
      break;
    case 'ArrowLeft':
      tryMove(-1, 0);
      break;
    case 'ArrowRight':
      tryMove(1, 0);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

// blur(): que Espacio (hard drop) no vuelva a "pulsar" el botón enfocado
restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });
menuBtn.addEventListener('click', () => { menuBtn.blur(); showModeMenu(); });
abilityButtons.forEach(btn => btn.addEventListener('click', () => { btn.blur(); useAbility(btn.dataset.ability); }));
modeButtons.forEach(btn => btn.addEventListener('click', () => { btn.blur(); init(btn.dataset.mode); }));

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

init('classic');
showModeMenu();
