const KEY = 'sudoku.v1';
const HISTORY_CAP = 300;
const { ROW, COL, BOX, PEERS } = Sudoku;

const $ = id => document.getElementById(id);
const main = document.querySelector('main');
const boardEl = $('board'), padEl = $('pad');
const cells = [], padButtons = [];

let s;

function newGame(level) {
  const { puzzle, solution } = Sudoku.generate(level);
  s = {
    level, puzzle, solution,
    values: puzzle.slice(),
    notes: new Array(81).fill(0),
    history: [],
    selected: null,
    notesMode: false,
    contradiction: null,
    won: false,
  };
  save();
  render();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { s = JSON.parse(raw); return true; }
  } catch {}
  return false;
}

function pushHistory() {
  s.history.push({ values: s.values.slice(), notes: s.notes.slice() });
  if (s.history.length > HISTORY_CAP) s.history.shift();
}

function undo() {
  const prev = s.history.pop();
  if (!prev) return;
  s.values = prev.values;
  s.notes = prev.notes;
  s.contradiction = null;
  s.won = false;
  commit();
}

function pruneNotes(i, d) {
  for (const p of PEERS[i]) s.notes[p] &= ~(1 << d);
}

function input(d) {
  const i = s.selected;
  if (i === null || s.puzzle[i] || s.won) return;
  pushHistory();
  s.contradiction = null;
  if (s.notesMode) {
    if (s.values[i]) { s.history.pop(); return; }
    s.notes[i] ^= 1 << d;
  } else if (s.values[i] === d) {
    s.values[i] = 0;
  } else {
    s.values[i] = d;
    s.notes[i] = 0;
    pruneNotes(i, d);
  }
  commit();
  checkWin();
}

function erase() {
  const i = s.selected;
  if (i === null || s.puzzle[i] || s.won) return;
  if (!s.values[i] && !s.notes[i]) return;
  pushHistory();
  s.values[i] = 0;
  s.notes[i] = 0;
  s.contradiction = null;
  commit();
}

function runCascade() {
  if (s.won) return;
  const r = Sudoku.cascade(s.values, s.notes);
  if (!r.steps.length && r.contradiction === null) {
    toast('Nothing to fill: no cell has a single note');
    return;
  }
  pushHistory();
  s.values = r.values;
  s.notes = r.notes;
  s.contradiction = r.contradiction;
  commit(r.steps);
  if (r.contradiction !== null) {
    const c = r.contradiction;
    toast(`Contradiction at row ${ROW[c] + 1}, col ${COL[c] + 1}. Undo to back out.`, 4000);
  } else {
    toast(`Filled ${r.steps.length} cell${r.steps.length === 1 ? '' : 's'}`);
  }
  checkWin();
}

function checkWin() {
  if (!s.values.every(v => v)) return;
  if (s.values.every((v, i) => v === s.solution[i])) {
    s.won = true;
    s.selected = null;
    commit();
    toast('Solved', 3000);
  } else {
    toast('Board is full, but something is off', 3000);
  }
}

function commit(popSteps) {
  save();
  render(popSteps);
}

let toastTimer;
function toast(msg, ms = 2000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function build() {
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.setAttribute('role', 'gridcell');
    el.addEventListener('click', () => { s.selected = i; render(); });
    boardEl.appendChild(el);
    cells.push(el);
  }
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.addEventListener('click', () => input(d));
    padEl.appendChild(b);
    padButtons.push(b);
  }
  $('undo-btn').addEventListener('click', undo);
  $('erase-btn').addEventListener('click', erase);
  $('notes-btn').addEventListener('click', () => { s.notesMode = !s.notesMode; commit(); });
  $('cascade-btn').addEventListener('click', runCascade);

  const dialog = $('new-dialog');
  $('new-btn').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', () => { if (dialog.returnValue) newGame(dialog.returnValue); });

  document.addEventListener('keydown', e => {
    if (dialog.open) return;
    const i = s.selected ?? 40;
    if (e.key >= '1' && e.key <= '9') input(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') erase();
    else if (e.key === 'n') { s.notesMode = !s.notesMode; commit(); }
    else if (e.key === 'z') undo();
    else if (e.key === 'a') runCascade();
    else if (e.key.startsWith('Arrow')) {
      const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      s.selected = (i + move + 81) % 81;
      render();
      e.preventDefault();
    }
  });
}

function render(popSteps = []) {
  const sel = s.selected;
  const selVal = sel !== null ? s.values[sel] : 0;
  const popOrder = new Map(popSteps.map((i, k) => [i, k]));

  for (let i = 0; i < 81; i++) {
    const v = s.values[i];
    const cls = ['cell'];
    if (COL[i] % 3 === 2) cls.push('br');
    if (ROW[i] % 3 === 2) cls.push('bb');
    if (s.puzzle[i]) cls.push('given');
    if (sel !== null && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel])) cls.push('peer');
    if (selVal && v === selVal) cls.push('same');
    if (i === sel) cls.push('selected');
    if (v && (v !== s.solution[i] || PEERS[i].some(p => s.values[p] === v))) cls.push('conflict');
    if (i === s.contradiction) cls.push('contradiction');
    if (popOrder.has(i)) cls.push('pop');
    cells[i].className = cls.join(' ');

    if (v) {
      const delay = popOrder.has(i) ? ` style="animation-delay:${popOrder.get(i) * 60}ms"` : '';
      cells[i].innerHTML = `<span class="digit"${delay}>${v}</span>`;
    } else if (s.notes[i]) {
      let html = '<div class="notes">';
      for (let d = 1; d <= 9; d++) {
        const on = s.notes[i] & (1 << d);
        html += `<span${on && d === selVal ? ' class="hit"' : ''}>${on ? d : ''}</span>`;
      }
      cells[i].innerHTML = html + '</div>';
    } else {
      cells[i].innerHTML = '';
    }
  }

  const counts = new Array(10).fill(0);
  for (const v of s.values) counts[v]++;
  padButtons.forEach((b, k) => {
    const left = 9 - counts[k + 1];
    b.innerHTML = `${k + 1}<small>${left > 0 ? left : ''}</small>`;
    b.classList.toggle('done', left <= 0);
  });

  main.classList.toggle('notes-mode', s.notesMode);
  $('notes-btn').setAttribute('aria-pressed', String(s.notesMode));
  $('level').textContent = s.level;
  $('status').textContent = s.won ? 'Solved' : '';
}

build();
if (!load()) newGame('medium');
else render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
