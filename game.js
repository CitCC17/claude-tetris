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
];

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
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, lastTime, dropAccum, dropInterval, animId;
let state; // 'playing' | 'paused' | 'over'
let hold, canHold;
let combo, backToBack, lastMoveRotate;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  const pool = Math.random() < SPECIAL_CHANCE ? SPECIAL_PIECES : STANDARD_PIECES;
  return makePiece(pool[Math.floor(Math.random() * pool.length)]);
}

function takeNext() {
  const piece = next;
  next = randomPiece();
  drawNext();
  return piece;
}

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

function tryRotate() {
  const rotated = rotateCW(current.shape);
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
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function addLines(cleared) {
  if (!cleared) return;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  const tspin = isTSpin();
  merge();
  const cleared = clearLines();
  scoreLock(cleared, tspin);
  addLines(cleared);
  // Recompensa: tras un Tetris la siguiente pieza es un single 1×1
  if (cleared >= 4) {
    next = makePiece(PIECE_SINGLE);
    drawNext();
  }
  updateHUD();
  spawn();
}

function spawn() {
  current = takeNext();
  canHold = true;
  lastMoveRotate = false;
  drawHold();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
}

// Hold: guarda la pieza actual (en su orientación inicial) y saca la reservada,
// o la siguiente si el slot está vacío. Solo una vez por pieza.
function holdPiece() {
  if (!canHold) return;
  const prev = current;
  current = hold ? makePiece(hold.type) : takeNext();
  hold = makePiece(prev.type);
  canHold = false;
  drawHold();
  if (collide(current.shape, current.x, current.y)) endGame();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo >= 2 ? `x${combo}` : '—';
  b2bEl.classList.toggle('hidden', !backToBack);
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
  };
})();

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

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
  for (const [r, c] of cells) drawBlock(context, c, r, piece.shape[r][c], size);
  context.restore();
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPiecePreview(nextCtx, next, 30, 0, nextCanvas.height);
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold) drawPiecePreview(holdCtx, hold, 30, 0, holdCanvas.height);
  holdCanvas.classList.toggle('locked', !canHold);
}

function endGame() {
  state = 'over';
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  sfx.gameOver();
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
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!tryMove(0, 1)) lockPiece();
  }
  updateEffects(dt);
}

// El loop sigue corriendo en pausa/menús (solo se congela la lógica) y se
// detiene al terminar la partida.
function loop(ts) {
  const dt = Math.min(ts - lastTime, 100);
  lastTime = ts;
  if (state === 'playing') update(dt);
  draw();
  if (state !== 'over') animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  state = 'playing';
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  hold = null;
  combo = 0;
  backToBack = false;
  popups = [];
  flashAlpha = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  sfx.unlock();
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM') { sfx.toggleMute(); return; }
  if (state !== 'playing') return;
  switch (e.code) {
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

restartBtn.addEventListener('click', init);

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

init();
