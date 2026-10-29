const Sudoku = (() => {
  const ALL = 0x3fe; // bits 1..9

  const ROW = [], COL = [], BOX = [], PEERS = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0;
    COL[i] = i % 9;
    BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
  }
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    }
    PEERS[i] = p;
  }
  const UNITS = [];
  for (let u = 0; u < 9; u++) {
    UNITS.push([...Array(81).keys()].filter(i => ROW[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => COL[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => BOX[i] === u));
  }

  const popcount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const singleDigit = m => (m && !(m & (m - 1)) ? Math.log2(m) : 0);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Backtracking with most-constrained-cell-first. Returns solution count, capped at `limit`.
  // When `randomize` is set, digit order is shuffled and the first solution is written into `out`.
  function search(grid, limit, randomize, out) {
    const g = grid.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      if (!g[i]) continue;
      const bit = 1 << g[i];
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return 0;
      rows[ROW[i]] |= bit; cols[COL[i]] |= bit; boxes[BOX[i]] |= bit;
    }
    let count = 0;
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    (function step() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const mask = ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & ALL;
        const n = popcount(mask);
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n === 1) break; }
      }
      if (best === -1) {
        count++;
        if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
        return;
      }
      const order = randomize ? shuffle(digits.slice()) : digits;
      const r = ROW[best], c = COL[best], b = BOX[best];
      for (const d of order) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        step();
        g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  const countSolutions = (grid, limit = 2) => search(grid, limit, false, null);

  function solvableBySingles(grid) {
    const g = grid.slice();
    const cand = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let used = 0;
      for (const p of PEERS[i]) if (g[p]) used |= 1 << g[p];
      cand[i] = ALL & ~used;
    }
    const place = (i, d) => {
      g[i] = d; cand[i] = 0;
      for (const p of PEERS[i]) cand[p] &= ~(1 << d);
    };
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < 81; i++) {
        const d = !g[i] && singleDigit(cand[i]);
        if (d) { place(i, d); progress = true; }
      }
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          let spot = -1, n = 0;
          for (const i of unit) {
            if (g[i] === d) { n = -1; break; }
            if (!g[i] && cand[i] & bit) { spot = i; n++; }
          }
          if (n === 1) { place(spot, d); progress = true; }
        }
      }
    }
    return g.every(v => v);
  }

  // Easy/medium are guaranteed solvable with singles only; hard/expert just strip clues
  // as far as uniqueness allows, so their difficulty is approximate.
  const LEVELS = {
    easy:   { givens: 38, singlesOnly: true },
    medium: { givens: 30, singlesOnly: true },
    hard:   { givens: 26, singlesOnly: false },
    expert: { givens: 17, singlesOnly: false },
  };

  function generate(level = 'medium') {
    const { givens, singlesOnly } = LEVELS[level];
    const solution = new Array(81).fill(0);
    search(new Array(81).fill(0), 1, true, solution);
    const puzzle = solution.slice();
    let remaining = 81;
    for (const i of shuffle([...Array(81).keys()])) {
      if (remaining <= givens) break;
      const saved = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle) !== 1 || (singlesOnly && !solvableBySingles(puzzle))) puzzle[i] = saved;
      else remaining--;
    }
    return { puzzle, solution };
  }

  // Fills every empty cell whose notes hold exactly one digit, prunes that digit from peers'
  // notes, and repeats. Trusts the player's notes; cells without notes are left alone.
  // Stops at the first contradiction: a noted cell pruned to nothing, or a single that
  // collides with a digit already in its row/col/box.
  function cascade(values, notes) {
    const v = values.slice(), n = notes.slice();
    const steps = [];
    let contradiction = null;
    let progress = true;
    while (progress && contradiction === null) {
      progress = false;
      for (let i = 0; i < 81 && contradiction === null; i++) {
        const d = !v[i] && singleDigit(n[i]);
        if (!d) continue;
        if (PEERS[i].some(p => v[p] === d)) { contradiction = i; break; }
        v[i] = d; n[i] = 0;
        steps.push(i);
        progress = true;
        for (const p of PEERS[i]) {
          if (v[p] || !(n[p] & (1 << d))) continue;
          n[p] &= ~(1 << d);
          if (!n[p]) { contradiction = p; break; }
        }
      }
    }
    return { values: v, notes: n, steps, contradiction };
  }

  return { ROW, COL, BOX, PEERS, generate, countSolutions, solvableBySingles, cascade, singleDigit };
})();

if (typeof module !== 'undefined') module.exports = Sudoku;
