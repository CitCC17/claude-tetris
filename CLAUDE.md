# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly or serve with any static server:

```bash
open index.html                  # macOS direct open
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield; left panel with `<canvas id="hold-canvas">`, combo and energy bar; right panel with HUD (`#score`, `#lines`, `#level`), challenge objective, `<canvas id="next-canvas">` (120px tall, 360px while the 5-piece preview is active) and controls. Overlays: `#overlay` (PAUSE / GAME OVER / win), `#ability-menu` and `#mode-menu`.
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~1000 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–12` = piece color index, `WILD` (13), `GARBAGE` (14), `FIXED` (15) |
| Piece representation | `{ type, shape, power, x, y }` created by `makePiece(type, power)`; `shape` is a 2-D matrix |
| Piece pool | `STANDARD_PIECES` (1–7) and, with `SPECIAL_CHANCE`, `SPECIAL_PIECES` (3×3 hollow + pentominoes); `PIECE_SINGLE` after a Tetris |
| Queue / hold | `queue` (5 upcoming pieces, `takeNext()`); `hold` + `canHold`, `holdPiece(force)` |
| Rotation | `rotateCW(shape)` — transpose + reverse; `tryRotate()` applies wall kicks `[0,±1,±2]` (CCW when `isReversed()`) |
| Collision | `collide(shape, ox, oy)` — checks bounds and board occupancy |
| Game loop | `loop(ts)` via `requestAnimationFrame` always runs; `update(dt)` only while `state === 'playing'` |
| Lock pipeline | `lockPiece()` = `isTSpin()` → `merge()` → `applyPower()` → `clearLines()` → `scoreLock()` → `addLines()` → `addEnergy()` → `spawn()` |
| Scoring | `LINE_SCORES` / `TSPIN_SCORES` × `level` × `combo`, `B2B_MULTIPLIER`, `PERFECT_CLEAR_BONUS`, `WILD_BONUS`; hard drop +2/cell, soft drop +1/row |
| Power-ups | `POWERS` (bomb, ray, tint, gravity, freeze); every `POWER_EVERY_LINES` the next piece gets one |
| Abilities | `energy` (0–`ENERGY_MAX`), `ABILITIES`, `useAbility(name)`; undo restores `undoSnapshot` (state at the last piece's spawn) |
| Challenge modes | `MODES`, `modeKey`, `mode`; `updateChallenge(dt)` checks goals, `objectiveText()` feeds the panel |
| Speed | `speedFor(level) = max(100, 1000 − (level−1) × 90)` ms; level = `(mode.startLevel ‖ 1) + floor(lines/10)` |
| Effects | `popup()`, `flash()`, `shake()`, `sfx.*` (Web Audio, `M` mutes) |
| State | `state`: `'menu' \| 'playing' \| 'paused' \| 'ability' \| 'over' \| 'won'`; `animId` (RAF handle) |

### Game flow

On load: `init('classic')` + `showModeMenu()`. Choosing a mode → `init(key)` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: `update(dt)` (timers, auto-drop or `lockPiece()`, effects, challenge goals) → `draw()`. If `spawn()` immediately collides → `endGame()`; reaching a challenge goal → `winGame()`.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS`, `LINE_SCORES`, `TSPIN_SCORES`, `SPECIAL_CHANCE`, `POWER_EVERY_LINES`, `FREEZE_MS`, `ENERGY_*`, `PREVIEW_MS`, `SLOW_MS`, `SLOW_FACTOR`, `MODES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
