/*
  Offline Tetris (no deps)
  - 10x20 visible board, 22 rows total (2 hidden)
  - 7-bag randomizer
  - Hold (once per piece)
  - Ghost
  - Next queue (5)
  - Basic SRS kicks (JLSTZ + I) for CW/CCW
*/

(() => {
  'use strict';

  // ===== DOM
  const boardCanvas = document.getElementById('board');
  const holdCanvas = document.getElementById('hold');
  const nextCanvas = document.getElementById('next');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const overlayBtn = document.getElementById('overlayBtn');

  const ctx = boardCanvas.getContext('2d');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCtx = nextCanvas.getContext('2d');

  // ===== Config
  const COLS = 10;
  const VISIBLE_ROWS = 20;
  const TOTAL_ROWS = 22; // includes 2 hidden rows at top
  const BLOCK = 30; // boardCanvas is 300x600
  const PREVIEW_BLOCK = 24;

  const COLORS = {
    I: '#63b3ed',
    O: '#f6e05e',
    T: '#b794f4',
    S: '#68d391',
    Z: '#fc8181',
    J: '#7f9cf5',
    L: '#f6ad55',
    GHOST: 'rgba(255,255,255,0.18)',
    GRID: 'rgba(255,255,255,0.06)',
    BORDER: 'rgba(255,255,255,0.18)',
    TEXT: 'rgba(255,255,255,0.85)',
  };

  const LOCK_DELAY_MS = 450;
  const DAS_MS = 120; // left/right auto-repeat delay
  const ARR_MS = 30;  // auto-repeat rate

  // Gravity speeds (ms per row). Rough guideline.
  function gravityMs(level) {
    // clamp 1..30
    const l = Math.max(1, Math.min(30, level));
    // exponential-ish; level 1 ~800ms, level 10 ~200ms
    const ms = 800 * Math.pow(0.86, l - 1);
    return Math.max(50, Math.floor(ms));
  }

  // ===== Tetromino definitions (4x4 matrices)
  // Using SRS spawn orientations.
  const SHAPES = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [0,1,1,0],
      [0,1,1,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
    T: [
      [0,1,0,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
    S: [
      [0,1,1,0],
      [1,1,0,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
    Z: [
      [1,1,0,0],
      [0,1,1,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
    J: [
      [1,0,0,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
    L: [
      [0,0,1,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0],
    ],
  };

  const TYPES = Object.keys(SHAPES);

  // SRS kicks: JLSTZ use same table; I uses its own; O no kicks needed.
  // Each entry is list of (dx, dy) tests for rotation from state a -> b.
  // states: 0 spawn, 1 R, 2 2, 3 L
  const KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };

  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };

  // ===== Utilities
  function cloneMatrix(m) {
    return m.map(row => row.slice());
  }

  function rotateMatrixCW(m) {
    const N = m.length;
    const out = Array.from({length: N}, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        out[c][N - 1 - r] = m[r][c];
      }
    }
    return out;
  }

  function rotateMatrixCCW(m) {
    const N = m.length;
    const out = Array.from({length: N}, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        out[N - 1 - c][r] = m[r][c];
      }
    }
    return out;
  }

  function now() {
    return performance.now();
  }

  // ===== Game state
  let grid;
  let bag = [];
  let nextQueue = [];

  let current = null; // {type, matrix, x, y, rot}
  let holdType = null;
  let holdLocked = false;

  let score = 0;
  let level = 1;
  let lines = 0;

  let paused = false;
  let gameOver = false;

  // timing
  let lastFrame = 0;
  let accGravity = 0;
  let lockTimerStart = null;

  // input
  const keysDown = new Set();
  const keyState = {
    left: {down:false, t0:0, tLast:0},
    right:{down:false, t0:0, tLast:0},
  };

  function reset() {
    grid = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    bag = [];
    nextQueue = [];
    holdType = null;
    holdLocked = false;

    score = 0;
    level = 1;
    lines = 0;

    paused = false;
    gameOver = false;

    lastFrame = 0;
    accGravity = 0;
    lockTimerStart = null;

    keysDown.clear();
    keyState.left.down = keyState.right.down = false;

    // prime queue
    while (nextQueue.length < 5) nextQueue.push(drawFromBag());
    spawnNext();

    hideOverlay();
    syncHUD();
    drawAll();
  }

  function drawFromBag() {
    if (bag.length === 0) {
      bag = TYPES.slice();
      // shuffle
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function spawnNext() {
    const type = nextQueue.shift();
    while (nextQueue.length < 5) nextQueue.push(drawFromBag());

    const matrix = cloneMatrix(SHAPES[type]);
    // spawn x centered, y at top hidden
    const x = 3; // for 4x4 shapes in 10 cols
    const y = 0;

    current = { type, matrix, x, y, rot: 0 };
    holdLocked = false;

    if (!canPlace(current.matrix, current.x, current.y)) {
      // immediate collision => game over
      gameOver = true;
      showOverlay('Game Over', 'Press R to restart');
    }
  }

  function canPlace(matrix, x, y) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!matrix[r][c]) continue;
        const gx = x + c;
        const gy = y + r;
        if (gx < 0 || gx >= COLS) return false;
        if (gy >= TOTAL_ROWS) return false;
        if (gy >= 0 && grid[gy][gx]) return false;
      }
    }
    return true;
  }

  function mergePiece() {
    const {matrix, x, y, type} = current;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!matrix[r][c]) continue;
        const gx = x + c;
        const gy = y + r;
        if (gy >= 0 && gy < TOTAL_ROWS && gx >= 0 && gx < COLS) {
          grid[gy][gx] = type;
        }
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (grid[r].every(cell => cell !== null)) {
        grid.splice(r, 1);
        grid.unshift(Array(COLS).fill(null));
        cleared++;
      }
    }

    if (cleared > 0) {
      lines += cleared;
      // scoring: 1=100,2=300,3=500,4=800 (x level)
      const base = [0, 100, 300, 500, 800][cleared] || 0;
      score += base * level;

      // level up every 10 lines
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
      }
    }

    return cleared;
  }

  function tryMove(dx, dy) {
    if (!current || paused || gameOver) return false;
    const nx = current.x + dx;
    const ny = current.y + dy;
    if (canPlace(current.matrix, nx, ny)) {
      current.x = nx;
      current.y = ny;
      lockTimerStart = null;
      return true;
    }
    return false;
  }

  function getKickTable(type) {
    if (type === 'I') return KICKS_I;
    return KICKS_JLSTZ;
  }

  function tryRotate(dir) {
    if (!current || paused || gameOver) return false;
    if (current.type === 'O') return true; // O rotation is symmetric

    const from = current.rot;
    const to = (dir === 'CW') ? (from + 1) % 4 : (from + 3) % 4;

    const rotated = (dir === 'CW') ? rotateMatrixCW(current.matrix) : rotateMatrixCCW(current.matrix);
    const table = getKickTable(current.type);
    const key = `${from}>${to}`;
    const tests = table[key] || [[0,0]];

    for (const [dx, dy] of tests) {
      const nx = current.x + dx;
      const ny = current.y - dy; // SRS uses +y up; our y increases downward, so invert
      if (canPlace(rotated, nx, ny)) {
        current.matrix = rotated;
        current.x = nx;
        current.y = ny;
        current.rot = to;
        lockTimerStart = null;
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    if (!current || paused || gameOver) return;
    let dropped = 0;
    while (tryMove(0, 1)) {
      dropped++;
    }
    if (dropped > 0) score += dropped * 2; // hard drop points
    lockAndSpawn();
  }

  function softDrop() {
    if (!current || paused || gameOver) return;
    if (tryMove(0, 1)) {
      score += 1;
    } else {
      // touching ground; start lock timer
      if (lockTimerStart === null) lockTimerStart = now();
    }
  }

  function hold() {
    if (!current || paused || gameOver) return;
    if (holdLocked) return;

    const curType = current.type;
    if (holdType === null) {
      holdType = curType;
      spawnNext();
    } else {
      const swap = holdType;
      holdType = curType;
      current = { type: swap, matrix: cloneMatrix(SHAPES[swap]), x: 3, y: 0, rot: 0 };
      if (!canPlace(current.matrix, current.x, current.y)) {
        gameOver = true;
        showOverlay('Game Over', 'Press R to restart');
      }
    }
    holdLocked = true;
    lockTimerStart = null;
  }

  function lockAndSpawn() {
    mergePiece();
    clearLines();
    spawnNext();
    lockTimerStart = null;
    syncHUD();
  }

  function getGhostY() {
    if (!current) return 0;
    let y = current.y;
    while (canPlace(current.matrix, current.x, y + 1)) y++;
    return y;
  }

  // ===== Rendering
  function clearCanvas(c, w, h) {
    c.clearRect(0, 0, w, h);
  }

  function drawCell(c, x, y, size, color, alpha=1) {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(x, y, size, size);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, size - 2, size - 2);
    c.restore();
  }

  function drawGridLines() {
    ctx.save();
    ctx.strokeStyle = COLORS.GRID;
    ctx.lineWidth = 1;

    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK, 0);
      ctx.lineTo(x * BLOCK, VISIBLE_ROWS * BLOCK);
      ctx.stroke();
    }
    for (let y = 0; y <= VISIBLE_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK);
      ctx.lineTo(COLS * BLOCK, y * BLOCK);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoard() {
    clearCanvas(ctx, boardCanvas.width, boardCanvas.height);

    // background
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // locked blocks (only visible rows: TOTAL_ROWS - VISIBLE_ROWS .. end)
    const yOffset = TOTAL_ROWS - VISIBLE_ROWS;
    for (let r = yOffset; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        if (!t) continue;
        drawCell(ctx, c * BLOCK, (r - yOffset) * BLOCK, BLOCK, COLORS[t]);
      }
    }

    // ghost
    if (current && !gameOver) {
      const gy = getGhostY();
      drawPiece(current, current.x, gy, COLORS.GHOST, 1, true);
    }

    // current piece
    if (current && !gameOver) {
      drawPiece(current, current.x, current.y, COLORS[current.type], 1, false);
    }

    drawGridLines();

    // border
    ctx.save();
    ctx.strokeStyle = COLORS.BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, boardCanvas.width - 2, boardCanvas.height - 2);
    ctx.restore();
  }

  function drawPiece(piece, x, y, color, alpha=1, ghost=false) {
    const yOffset = TOTAL_ROWS - VISIBLE_ROWS;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!piece.matrix[r][c]) continue;
        const gx = x + c;
        const gy = y + r;
        if (gy < yOffset) continue; // hidden
        if (gx < 0 || gx >= COLS || gy < 0 || gy >= TOTAL_ROWS) continue;
        const px = gx * BLOCK;
        const py = (gy - yOffset) * BLOCK;
        if (ghost) {
          // ghost outline
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.fillStyle = COLORS.GHOST;
          ctx.fillRect(px, py, BLOCK, BLOCK);
          ctx.strokeRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);
          ctx.restore();
        } else {
          drawCell(ctx, px, py, BLOCK, color, alpha);
        }
      }
    }
  }

  function drawMini(canvasCtx, width, height, type) {
    clearCanvas(canvasCtx, width, height);
    canvasCtx.fillStyle = 'rgba(0,0,0,0.22)';
    canvasCtx.fillRect(0, 0, width, height);

    if (!type) return;
    const m = SHAPES[type];

    // center shape in 4x4
    const size = PREVIEW_BLOCK;
    // compute bounding box
    let minR = 4, maxR = -1, minC = 4, maxC = -1;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!m[r][c]) continue;
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
    const bw = (maxC - minC + 1) * size;
    const bh = (maxR - minR + 1) * size;
    const ox = Math.floor((width - bw) / 2);
    const oy = Math.floor((height - bh) / 2);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!m[r][c]) continue;
        const x = ox + (c - minC) * size;
        const y = oy + (r - minR) * size;
        drawCell(canvasCtx, x, y, size, COLORS[type]);
      }
    }
  }

  function drawHold() {
    drawMini(holdCtx, holdCanvas.width, holdCanvas.height, holdType);
  }

  function drawNext() {
    clearCanvas(nextCtx, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = 'rgba(0,0,0,0.22)';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    const slotH = 72;
    for (let i = 0; i < 5; i++) {
      const type = nextQueue[i];
      if (!type) continue;
      // draw into a virtual sub-rect
      const y0 = i * slotH;
      const m = SHAPES[type];

      // bounding box
      let minR = 4, maxR = -1, minC = 4, maxC = -1;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!m[r][c]) continue;
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
      const bw = (maxC - minC + 1) * PREVIEW_BLOCK;
      const bh = (maxR - minR + 1) * PREVIEW_BLOCK;
      const ox = Math.floor((nextCanvas.width - bw) / 2);
      const oy = y0 + Math.floor((slotH - bh) / 2);

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!m[r][c]) continue;
          const x = ox + (c - minC) * PREVIEW_BLOCK;
          const y = oy + (r - minR) * PREVIEW_BLOCK;
          drawCell(nextCtx, x, y, PREVIEW_BLOCK, COLORS[type]);
        }
      }
    }
  }

  function drawAll() {
    drawBoard();
    drawHold();
    drawNext();
  }

  function syncHUD() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
    linesEl.textContent = String(lines);
  }

  // ===== Overlay
  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove('hidden');
    overlayBtn.textContent = (title === 'Game Over') ? 'Restart' : 'Resume';
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ===== Input handling
  function setPaused(v) {
    if (gameOver) return;
    paused = v;
    if (paused) {
      showOverlay('Paused', 'Press P to resume');
      btnPause.textContent = 'Resume';
    } else {
      hideOverlay();
      btnPause.textContent = 'Pause';
      lastFrame = now();
    }
  }

  function togglePause() {
    setPaused(!paused);
  }

  function onKeyDown(e) {
    if (e.repeat) return;

    const key = e.key;
    if (['ArrowLeft','ArrowRight','ArrowDown',' ','Spacebar','ArrowUp'].includes(key)) {
      e.preventDefault();
    }

    if (key === 'p' || key === 'P') {
      togglePause();
      return;
    }

    if (key === 'r' || key === 'R') {
      reset();
      return;
    }

    if (paused || gameOver) {
      return;
    }

    if (key === 'ArrowLeft') {
      startAuto('left');
      tryMove(-1, 0);
    } else if (key === 'ArrowRight') {
      startAuto('right');
      tryMove(1, 0);
    } else if (key === 'ArrowDown') {
      softDrop();
    } else if (key === ' ' || key === 'Spacebar') {
      hardDrop();
    } else if (key === 'ArrowUp' || key === 'x' || key === 'X') {
      tryRotate('CW');
    } else if (key === 'z' || key === 'Z') {
      tryRotate('CCW');
    } else if (key === 'c' || key === 'C' || key === 'Shift') {
      hold();
    }

    drawAll();
    syncHUD();
  }

  function onKeyUp(e) {
    const key = e.key;
    if (key === 'ArrowLeft') stopAuto('left');
    if (key === 'ArrowRight') stopAuto('right');
  }

  function startAuto(dir) {
    const s = keyState[dir];
    s.down = true;
    s.t0 = now();
    s.tLast = s.t0;
  }

  function stopAuto(dir) {
    const s = keyState[dir];
    s.down = false;
  }

  function autoShift() {
    if (paused || gameOver) return;
    const t = now();

    for (const dir of ['left','right']) {
      const s = keyState[dir];
      if (!s.down) continue;
      const held = t - s.t0;
      if (held < DAS_MS) continue;
      if (t - s.tLast >= ARR_MS) {
        s.tLast = t;
        tryMove(dir === 'left' ? -1 : 1, 0);
      }
    }
  }

  // ===== Main loop
  function tick(ts) {
    if (!lastFrame) lastFrame = ts;
    const dt = ts - lastFrame;
    lastFrame = ts;

    if (!paused && !gameOver) {
      autoShift();

      accGravity += dt;
      const g = gravityMs(level);
      while (accGravity >= g) {
        accGravity -= g;
        if (!tryMove(0, 1)) {
          if (lockTimerStart === null) lockTimerStart = ts;
          break;
        }
      }

      // lock delay
      if (lockTimerStart !== null) {
        if (ts - lockTimerStart >= LOCK_DELAY_MS) {
          // if still can't move down, lock
          if (!canPlace(current.matrix, current.x, current.y + 1)) {
            lockAndSpawn();
          }
          lockTimerStart = null;
        }
      }

      drawAll();
      syncHUD();
    }

    requestAnimationFrame(tick);
  }

  // ===== Buttons / overlay
  btnPause.addEventListener('click', () => togglePause());
  btnRestart.addEventListener('click', () => reset());
  overlayBtn.addEventListener('click', () => {
    if (gameOver) reset();
    else setPaused(false);
  });

  // ===== Events
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);

  // ===== Start
  reset();
  requestAnimationFrame(tick);
})();
