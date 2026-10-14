import { firebaseConfig } from './config.js';

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

const params = new URLSearchParams(location.search);
const BOARD_ID = (params.get('tablero') || 'principal').replace(/[^\w-]/g, '').slice(0, 60) || 'principal';

const COLORS = ['', '#e5484d', '#f76b15', '#f5b300', '#30a46c', '#2f6fed', '#8e4ec6', '#d6409f'];

// Crea un elemento: h('div', {class: 'x', onclick: fn}, 'texto', otroElemento)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value' || (k in el && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function durText(fromIso, toIso) {
  const ms = (toIso ? new Date(toIso) : new Date()) - new Date(fromIso);
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return days === 1 ? '1 día' : `${days} días`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} h`;
  return 'menos de 1 h';
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function hueOf(text) {
  let n = 0;
  for (const ch of text || '') n = (n * 31 + ch.charCodeAt(0)) % 360;
  return n;
}
function safeUrl(url) {
  url = (url || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { return new URL(url).href; } catch { return null; }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

// Ventana de pregunta reutilizable
function ask({ title, hint = '', value = '', input = true, okText = 'Aceptar', danger = false }) {
  return new Promise(resolve => {
    const d = $('#askDialog');
    $('#askTitle').textContent = title;
    $('#askHint').textContent = hint;
    $('#askHint').hidden = !hint;
    const inp = $('#askInput');
    inp.hidden = !input;
    inp.required = input;
    inp.value = value;
    const ok = $('#askOk');
    ok.textContent = okText;
    ok.classList.toggle('danger', danger);
    d.returnValue = '';
    d.addEventListener('close', () => {
      if (d.returnValue !== 'ok') return resolve(null);
      resolve(input ? inp.value.trim() || null : true);
    }, { once: true });
    d.showModal();
    if (input) { inp.focus(); inp.select(); } else ok.focus();
  });
}
const confirmDlg = (title, hint, okText = 'Eliminar') => ask({ title, hint, input: false, okText, danger: true });

// Menú emergente pequeño (⋯)
function showMenu(anchor, items) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map(it => h('button', {
      role: 'menuitem', class: it.danger ? 'danger' : '', disabled: it.disabled,
      onclick: () => { closeMenu(); it.action(); },
    }, it.label)));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8);
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = r.bottom + 4 + 'px';
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
}
function closeMenu() { document.querySelectorAll('.menu').forEach(m => m.remove()); }

// ---------- Nombre de la persona ----------
const USER_KEY = 'kanban:usuario';
function me() {
  try { return localStorage.getItem(USER_KEY) || 'Anónimo'; } catch { return 'Anónimo'; }
}
async function askName(first = false) {
  const name = await ask({
    title: first ? '¿Cómo te llamas?' : 'Cambiar mi nombre',
    hint: 'Tu nombre aparece en el historial cuando creas o mueves tarjetas.',
    value: first ? '' : me(),
  });
  if (name) { try { localStorage.setItem(USER_KEY, name); } catch {} }
  renderUser();
}
function renderUser() {
  const chip = $('#userChip');
  chip.textContent = '';
  chip.append(h('span', { class: 'avatar', style: `--h:${hueOf(me())}` }, initials(me())), h('span', { class: 'user-name' }, me()));
}

// ---------- Almacenamiento ----------
const DEFAULT_BOARD = () => ({
  title: 'Mi tablero',
  columns: ['Por hacer', 'En proceso', 'En revisión', 'Terminado'].map(name => ({ id: uid(), name })),
  lanes: [{ id: uid(), name: 'General' }],
});

// En línea: Firebase Firestore (todos los que abren el enlace ven lo mismo, en tiempo real)
async function createFirebaseStore(cfg) {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(cfg));
  const boardRef = fs.doc(db, 'tableros', BOARD_ID);
  const cardsCol = fs.collection(db, 'tableros', BOARD_ID, 'tarjetas');
  return {
    mode: 'online',
    subscribe(onBoard, onCards, onError) {
      fs.onSnapshot(boardRef, snap => {
        if (!snap.exists()) { fs.setDoc(boardRef, DEFAULT_BOARD()).catch(onError); return; }
        onBoard(snap.data());
      }, onError);
      fs.onSnapshot(cardsCol, qs => {
        const m = new Map();
        qs.forEach(d => m.set(d.id, { ...d.data(), id: d.id }));
        onCards(m);
      }, onError);
    },
    saveBoard: patch => fs.updateDoc(boardRef, patch),
    addCard: ({ id, ...rest }) => fs.setDoc(fs.doc(cardsCol, id), rest),
    updateCard: (id, patch) => fs.updateDoc(fs.doc(cardsCol, id), patch),
    deleteCard: id => fs.deleteDoc(fs.doc(cardsCol, id)),
  };
}

// Modo de prueba: guarda en este navegador
function createLocalStore() {
  const KEY = 'kanban:datos:' + BOARD_ID;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  let data = load() || { board: DEFAULT_BOARD(), cards: {} };
  let listeners = null;
  const emit = () => {
    if (!listeners) return;
    const copy = structuredClone(data);
    listeners.onBoard(copy.board);
    listeners.onCards(new Map(Object.entries(copy.cards).map(([id, c]) => [id, { ...c, id }])));
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} emit(); };
  window.addEventListener('storage', e => { if (e.key === KEY) { data = load() || data; emit(); } });
  return {
    mode: 'local',
    subscribe(onBoard, onCards) { listeners = { onBoard, onCards }; emit(); },
    async saveBoard(patch) { Object.assign(data.board, structuredClone(patch)); persist(); },
    async addCard({ id, ...rest }) { data.cards[id] = structuredClone(rest); persist(); },
    async updateCard(id, patch) { if (data.cards[id]) Object.assign(data.cards[id], structuredClone(patch)); persist(); },
    async deleteCard(id) { delete data.cards[id]; persist(); },
  };
}

// ---------- Estado ----------
let store;
let board = null;
let cards = new Map();
let dragging = false;
let openCardId = null;
const filters = { q: '', resp: '' };

const columns = () => board?.columns || [];
const lanes = () => board?.lanes || [];
const colName = id => columns().find(c => c.id === id)?.name || '(proceso eliminado)';
const laneName = id => lanes().find(l => l.id === id)?.name || '(carril eliminado)';

// Si una tarjeta quedó en un proceso/carril que ya no existe, se muestra en el primero
function placeOf(card) {
  const col = columns().some(c => c.id === card.columnId) ? card.columnId : columns()[0]?.id;
  const lane = lanes().some(l => l.id === card.laneId) ? card.laneId : lanes()[0]?.id;
  return { col, lane };
}
function cardsIn(colId, laneId) {
  return [...cards.values()]
    .filter(c => { const p = placeOf(c); return p.col === colId && p.lane === laneId; })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
function matchesFilters(c) {
  if (filters.resp && (c.responsible || '') !== filters.resp) return false;
  if (filters.q) {
    const text = [c.title, c.description, c.responsible, ...(c.notes || []).map(n => n.text)].join(' ').toLowerCase();
    if (!text.includes(filters.q)) return false;
  }
  return true;
}
const fail = err => { console.error(err); toast('No se pudo guardar: ' + (err?.message || err)); };

function updateCard(id, patch) {
  const card = cards.get(id);
  if (card) cards.set(id, { ...card, ...patch }); // se ve el cambio al instante
  render();
  return store.updateCard(id, patch).catch(fail);
}
function saveBoard(patch) {
  board = { ...board, ...patch };
  render();
  return store.saveBoard(patch).catch(fail);
}

// ---------- Acciones de tarjetas ----------
async function newCard(colId, laneId) {
  const title = await ask({ title: 'Nueva tarjeta', hint: `${colName(colId)} · ${laneName(laneId)}`, value: '', okText: 'Crear' });
  if (!title) return;
  const now = nowIso();
  const inCell = cardsIn(colId, laneId);
  const card = {
    id: uid(),
    title,
    description: '',
    responsible: '',
    color: '',
    columnId: colId,
    laneId,
    order: inCell.length ? (inCell[inCell.length - 1].order ?? 0) + 1 : 0,
    enteredAt: now,
    createdAt: now,
    createdBy: me(),
    history: [{ columnId: colId, laneId, columnName: colName(colId), laneName: laneName(laneId), enteredAt: now, leftAt: null, by: me() }],
    checklist: [],
    notes: [],
    links: [],
  };
  cards.set(card.id, card);
  render();
  store.addCard(card).catch(fail);
  openCard(card.id);
}

// Mueve una tarjeta; si cambia de proceso o de carril, queda registrada la fecha de entrada
function moveCard(id, colId, laneId, order) {
  const card = cards.get(id);
  if (!card) return;
  const p = placeOf(card);
  if (p.col === colId && p.lane === laneId) return updateCard(id, { order });
  const now = nowIso();
  const history = [...(card.history || [])];
  const last = history[history.length - 1];
  if (last && !last.leftAt) history[history.length - 1] = { ...last, leftAt: now };
  history.push({ columnId: colId, laneId, columnName: colName(colId), laneName: laneName(laneId), enteredAt: now, leftAt: null, by: me() });
  return updateCard(id, { columnId: colId, laneId, order, enteredAt: now, history });
}

async function removeCard(id) {
  const card = cards.get(id);
  if (!card) return;
  if (!(await confirmDlg(`¿Eliminar la tarjeta "${card.title}"?`, 'Se borra para todas las personas y no se puede deshacer.'))) return;
  closeCard();
  cards.delete(id);
  render();
  store.deleteCard(id).catch(fail);
}

// ---------- Acciones de procesos (columnas) y carriles (filas) ----------
async function addColumn() {
  const name = await ask({ title: 'Nuevo proceso (columna)', hint: 'Ejemplo: Diseño, Producción, Entrega…', okText: 'Agregar' });
  if (name) saveBoard({ columns: [...columns(), { id: uid(), name }] });
}
async function addLane() {
  const name = await ask({ title: 'Nuevo carril (fila)', hint: 'Ejemplo: un equipo, un cliente o un tipo de trabajo.', okText: 'Agregar' });
  if (name) saveBoard({ lanes: [...lanes(), { id: uid(), name }] });
}
async function renameItem(kind, id) {
  const list = kind === 'columns' ? columns() : lanes();
  const item = list.find(x => x.id === id);
  const name = await ask({ title: kind === 'columns' ? 'Renombrar proceso' : 'Renombrar carril', value: item.name, okText: 'Guardar' });
  if (name) saveBoard({ [kind]: list.map(x => (x.id === id ? { ...x, name } : x)) });
}
function moveItem(kind, id, delta) {
  const list = [...(kind === 'columns' ? columns() : lanes())];
  const i = list.findIndex(x => x.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveBoard({ [kind]: list });
}
async function deleteItem(kind, id) {
  const list = kind === 'columns' ? columns() : lanes();
  const isCol = kind === 'columns';
  if (list.length <= 1) return toast(isCol ? 'El tablero necesita al menos un proceso.' : 'El tablero necesita al menos un carril.');
  const inside = [...cards.values()].filter(c => (isCol ? placeOf(c).col : placeOf(c).lane) === id).length;
  if (inside) return toast(`Primero mueve o elimina las ${inside} tarjeta(s) que tiene.`);
  const item = list.find(x => x.id === id);
  if (!(await confirmDlg(`¿Eliminar ${isCol ? 'el proceso' : 'el carril'} "${item.name}"?`, 'Está vacío; las tarjetas no se ven afectadas.'))) return;
  saveBoard({ [kind]: list.filter(x => x.id !== id) });
}

// ---------- Dibujo del tablero ----------
function render() {
  if (!board) return;
  if (dragging) return; // se redibuja al soltar
  const titleInput = $('#boardTitle');
  if (document.activeElement !== titleInput) titleInput.value = board.title || '';
  document.title = (board.title || 'Tablero') + ' · Kanban';
  renderRespFilter();

  const el = $('#board');
  const cols = columns();
  const lns = lanes();
  el.style.setProperty('--ncols', cols.length);
  el.textContent = '';

  el.append(h('div', { class: 'corner' }, h('span', {}, 'Carriles'), h('span', { class: 'muted' }, ' / Procesos')));
  cols.forEach((c, i) => {
    const count = [...cards.values()].filter(card => placeOf(card).col === c.id).length;
    el.append(h('div', { class: 'col-head' },
      h('span', { class: 'col-name', title: c.name, ondblclick: () => renameItem('columns', c.id) }, c.name),
      h('span', { class: 'count' }, count),
      h('button', {
        class: 'icon-btn', 'aria-label': `Opciones de ${c.name}`,
        onclick: e => { e.stopPropagation(); showMenu(e.currentTarget, [
          { label: '✎ Renombrar', action: () => renameItem('columns', c.id) },
          { label: '← Mover a la izquierda', disabled: i === 0, action: () => moveItem('columns', c.id, -1) },
          { label: '→ Mover a la derecha', disabled: i === cols.length - 1, action: () => moveItem('columns', c.id, 1) },
          { label: '🗑 Eliminar proceso', danger: true, action: () => deleteItem('columns', c.id) },
        ]); },
      }, '⋯')));
  });

  lns.forEach((lane, li) => {
    const count = [...cards.values()].filter(card => placeOf(card).lane === lane.id).length;
    el.append(h('div', { class: 'lane-head' },
      h('div', { class: 'lane-top' },
        h('span', { class: 'lane-name', ondblclick: () => renameItem('lanes', lane.id) }, lane.name),
        h('button', {
          class: 'icon-btn', 'aria-label': `Opciones de ${lane.name}`,
          onclick: e => { e.stopPropagation(); showMenu(e.currentTarget, [
            { label: '✎ Renombrar', action: () => renameItem('lanes', lane.id) },
            { label: '↑ Subir', disabled: li === 0, action: () => moveItem('lanes', lane.id, -1) },
            { label: '↓ Bajar', disabled: li === lns.length - 1, action: () => moveItem('lanes', lane.id, 1) },
            { label: '🗑 Eliminar carril', danger: true, action: () => deleteItem('lanes', lane.id) },
          ]); },
        }, '⋯')),
      h('span', { class: 'count' }, `${count} tarjeta${count === 1 ? '' : 's'}`)));
    cols.forEach(col => {
      const list = h('div', { class: 'cards', 'data-col': col.id, 'data-lane': lane.id },
        cardsIn(col.id, lane.id).filter(matchesFilters).map(cardEl));
      el.append(h('div', { class: 'cell' }, list,
        h('button', { class: 'add-card', onclick: () => newCard(col.id, lane.id) }, '+ Añadir tarjeta')));
    });
  });

  initDragAndDrop();
  if (openCardId) setTimeout(refreshCardDialog, 0);
}

function cardEl(c) {
  const done = (c.checklist || []).filter(i => i.done).length;
  const total = (c.checklist || []).length;
  return h('article', {
    class: 'card', 'data-id': c.id, tabindex: 0,
    style: c.color ? `--card-color:${c.color}` : '',
    onclick: () => openCard(c.id),
    onkeydown: e => { if (e.key === 'Enter') openCard(c.id); },
  },
    h('div', { class: 'card-title' }, c.title || 'Sin título'),
    c.description ? h('div', { class: 'card-desc' }, c.description) : null,
    h('div', { class: 'card-meta' },
      c.responsible
        ? h('span', { class: 'resp' }, h('span', { class: 'avatar sm', style: `--h:${hueOf(c.responsible)}` }, initials(c.responsible)), c.responsible)
        : h('span', { class: 'resp muted' }, 'Sin responsable'),
      h('span', { class: 'since', title: `Entró a esta etapa el ${fmtDateTime(c.enteredAt)}` }, `📅 ${fmtDate(c.enteredAt)} · ${durText(c.enteredAt)}`)),
    (total || c.notes?.length || c.links?.length) ? h('div', { class: 'badges' },
      total ? h('span', { class: done === total ? 'ok' : '' }, `☑ ${done}/${total}`) : null,
      c.notes?.length ? h('span', {}, `💬 ${c.notes.length}`) : null,
      c.links?.length ? h('span', {}, `🔗 ${c.links.length}`) : null) : null);
}

let sortables = [];
function initDragAndDrop() {
  sortables.forEach(s => s.destroy());
  sortables = [];
  if (!window.Sortable) return;
  document.querySelectorAll('.cards').forEach(list => {
    sortables.push(new Sortable(list, {
      group: 'tarjetas',
      animation: 150,
      delay: 180,
      delayOnTouchOnly: true,
      ghostClass: 'ghost',
      chosenClass: 'chosen',
      onStart: () => { dragging = true; },
      onEnd: evt => {
        dragging = false;
        const id = evt.item.dataset.id;
        const to = evt.to;
        if (evt.from === to && evt.oldIndex === evt.newIndex) return render();
        const ids = [...to.querySelectorAll('.card')].map(e => e.dataset.id);
        const idx = ids.indexOf(id);
        const prev = cards.get(ids[idx - 1]);
        const next = cards.get(ids[idx + 1]);
        let order = 0;
        if (prev && next) order = ((prev.order ?? 0) + (next.order ?? 0)) / 2;
        else if (prev) order = (prev.order ?? 0) + 1;
        else if (next) order = (next.order ?? 0) - 1;
        moveCard(id, to.dataset.col, to.dataset.lane, order);
        render();
      },
    }));
  });
}

function renderRespFilter() {
  const sel = $('#filterResp');
  const names = [...new Set([...cards.values()].map(c => c.responsible).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const current = filters.resp;
  sel.textContent = '';
  sel.append(h('option', { value: '' }, 'Todos los responsables'), ...names.map(n => h('option', { value: n }, n)));
  if (current && !names.includes(current)) sel.append(h('option', { value: current }, current));
  sel.value = current;
}

// ---------- Ventana de la tarjeta ----------
let dialogDirty = false;

function openCard(id) {
  openCardId = id;
  dialogDirty = false;
  buildCardDialog();
  const d = $('#cardDialog');
  if (!d.open) d.showModal();
}
function closeCard() {
  openCardId = null;
  const d = $('#cardDialog');
  if (d.open) d.close();
}
const isTyping = () => {
  const a = document.activeElement;
  return a && $('#cardDialog').contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
};
function refreshCardDialog() {
  if (!openCardId) return;
  if (!cards.has(openCardId)) { closeCard(); return; }
  if (isTyping()) { dialogDirty = true; return; } // no interrumpir a quien escribe
  buildCardDialog();
}

function buildCardDialog() {
  const c = cards.get(openCardId);
  if (!c) return closeCard();
  const body = $('#cardDialogBody');
  const scroll = $('#cardDialog').scrollTop;
  const set = patch => updateCard(c.id, patch);
  const respNames = [...new Set([...cards.values()].map(x => x.responsible).filter(Boolean))];
  const p = placeOf(c);

  const checklist = c.checklist || [];
  const notes = [...(c.notes || [])].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const links = c.links || [];
  const history = c.history || [];

  body.textContent = '';
  body.append(
    h('div', { class: 'dlg-head', style: c.color ? `--card-color:${c.color}` : '' },
      h('input', { class: 'dlg-title', value: c.title || '', maxlength: 150, 'aria-label': 'Título',
        onchange: e => set({ title: e.target.value.trim() || 'Sin título' }) }),
      h('button', { class: 'icon-btn close', 'aria-label': 'Cerrar', onclick: closeCard }, '✕')),

    h('div', { class: 'dlg-grid' },
      // Columna principal
      h('div', { class: 'dlg-main' },
        h('label', { class: 'field' }, h('span', {}, 'Descripción'),
          h('textarea', { rows: 4, placeholder: 'Describe la tarea…', value: c.description || '',
            onchange: e => set({ description: e.target.value }) })),

        h('section', {},
          h('h3', {}, `Lista de tareas ${checklist.length ? `(${checklist.filter(i => i.done).length}/${checklist.length})` : ''}`),
          h('ul', { class: 'checklist' }, checklist.map(item => h('li', {},
            h('label', {},
              h('input', { type: 'checkbox', checked: !!item.done,
                onchange: e => set({ checklist: (cards.get(c.id).checklist || []).map(i => i.id === item.id ? { ...i, done: e.target.checked } : i) }) }),
              h('span', { class: item.done ? 'done' : '' }, item.text)),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Quitar', onclick: () => set({ checklist: (cards.get(c.id).checklist || []).filter(i => i.id !== item.id) }) }, '✕')))),
          h('form', { class: 'inline-add', onsubmit: e => {
            e.preventDefault();
            const inp = e.target.elements.task;
            const text = inp.value.trim();
            if (!text) return;
            inp.value = '';
            set({ checklist: [...(cards.get(c.id).checklist || []), { id: uid(), text, done: false }] });
          } },
            h('input', { name: 'task', placeholder: 'Nueva tarea…', autocomplete: 'off' }),
            h('button', { class: 'btn' }, 'Agregar'))),

        h('section', {},
          h('h3', {}, 'Notas y avances'),
          h('form', { class: 'note-add', onsubmit: e => {
            e.preventDefault();
            const ta = e.target.elements.note;
            const text = ta.value.trim();
            if (!text) return;
            ta.value = '';
            set({ notes: [...(cards.get(c.id).notes || []), { id: uid(), text, author: me(), at: nowIso() }] });
          } },
            h('textarea', { name: 'note', rows: 2, placeholder: 'Escribe un avance, comentario o información adicional…' }),
            h('button', { class: 'btn primary' }, 'Agregar nota')),
          h('ul', { class: 'notes' }, notes.map(n => h('li', {},
            h('div', { class: 'note-meta' },
              h('span', { class: 'avatar sm', style: `--h:${hueOf(n.author)}` }, initials(n.author)),
              h('strong', {}, n.author), h('span', { class: 'muted' }, fmtDateTime(n.at)),
              h('button', { class: 'icon-btn sm', 'aria-label': 'Borrar nota', onclick: async () => {
                if (await confirmDlg('¿Borrar esta nota?', '')) set({ notes: (cards.get(c.id).notes || []).filter(x => x.id !== n.id) });
              } }, '✕')),
            h('div', { class: 'note-text' }, n.text))))),

        h('section', {},
          h('h3', {}, 'Enlaces y documentos'),
          h('ul', { class: 'links' }, links.map(l => h('li', {},
            h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label || l.url),
            h('button', { class: 'icon-btn sm', 'aria-label': 'Quitar enlace', onclick: () => set({ links: (cards.get(c.id).links || []).filter(x => x.id !== l.id) }) }, '✕')))),
          h('form', { class: 'inline-add', onsubmit: e => {
            e.preventDefault();
            const url = safeUrl(e.target.elements.url.value);
            if (!url) return toast('Escribe una dirección web válida.');
            const label = e.target.elements.label.value.trim();
            set({ links: [...(cards.get(c.id).links || []), { id: uid(), url, label }] });
          } },
            h('input', { name: 'url', placeholder: 'Pega un enlace (Drive, documento…)', autocomplete: 'off' }),
            h('input', { name: 'label', placeholder: 'Nombre (opcional)', autocomplete: 'off' }),
            h('button', { class: 'btn' }, 'Agregar')))),

      // Columna lateral
      h('aside', { class: 'dlg-side' },
        h('label', { class: 'field' }, h('span', {}, 'Responsable'),
          h('input', { list: 'respList', value: c.responsible || '', placeholder: 'Nombre del responsable',
            onchange: e => set({ responsible: e.target.value.trim() }) }),
          h('datalist', { id: 'respList' }, respNames.map(n => h('option', { value: n })))),

        h('label', { class: 'field' }, h('span', {}, 'Proceso (columna)'),
          h('select', { onchange: e => { moveCard(c.id, e.target.value, p.lane, nextOrder(e.target.value, p.lane)); } },
            columns().map(col => h('option', { value: col.id, selected: col.id === p.col }, col.name)))),
        h('label', { class: 'field' }, h('span', {}, 'Carril (fila)'),
          h('select', { onchange: e => { moveCard(c.id, p.col, e.target.value, nextOrder(p.col, e.target.value)); } },
            lanes().map(l => h('option', { value: l.id, selected: l.id === p.lane }, l.name)))),

        h('div', { class: 'since-box' },
          h('span', { class: 'muted' }, 'En esta etapa desde'),
          h('strong', {}, fmtDateTime(c.enteredAt)),
          h('span', {}, durText(c.enteredAt))),

        h('div', { class: 'field' }, h('span', {}, 'Color'),
          h('div', { class: 'colors' }, COLORS.map(col => h('button', {
            class: 'swatch' + ((c.color || '') === col ? ' on' : ''), style: col ? `background:${col}` : '',
            'aria-label': col ? `Color ${col}` : 'Sin color', title: col ? '' : 'Sin color',
            onclick: () => set({ color: col }),
          }, col ? '' : '∅')))),

        h('section', {},
          h('h3', {}, 'Historial de seguimiento'),
          h('ol', { class: 'history' }, [...history].reverse().map(e => h('li', {},
            h('div', {}, h('strong', {}, e.columnName), ' · ', e.laneName),
            h('div', { class: 'muted' }, `Entró: ${fmtDateTime(e.enteredAt)}`),
            h('div', { class: 'muted' }, e.leftAt ? `Salió: ${fmtDateTime(e.leftAt)} (${durText(e.enteredAt, e.leftAt)})` : `Sigue aquí (${durText(e.enteredAt)})`),
            e.by ? h('div', { class: 'muted' }, `Movida por ${e.by}`) : null)))),

        h('p', { class: 'muted small' }, `Creada por ${c.createdBy || '—'} el ${fmtDate(c.createdAt)}`),
        h('button', { class: 'btn danger', onclick: () => removeCard(c.id) }, 'Eliminar tarjeta'))),
  );
  $('#cardDialog').scrollTop = scroll;
}

function nextOrder(colId, laneId) {
  const list = cardsIn(colId, laneId);
  return list.length ? (list[list.length - 1].order ?? 0) + 1 : 0;
}

// ---------- Exportar a Excel (CSV) ----------
function exportCsv() {
  const rows = [['Tarjeta', 'Responsable', 'Proceso', 'Carril', 'Entró', 'Salió', 'Días en la etapa', 'Movida por', 'Proceso actual', 'Carril actual', 'Descripción']];
  for (const c of cards.values()) {
    const p = placeOf(c);
    for (const e of c.history || []) {
      const days = ((e.leftAt ? new Date(e.leftAt) : new Date()) - new Date(e.enteredAt)) / 86400000;
      rows.push([c.title, c.responsible, e.columnName, e.laneName, fmtDateTime(e.enteredAt), e.leftAt ? fmtDateTime(e.leftAt) : 'Sigue aquí',
        days.toFixed(1).replace('.', ','), e.by, colName(p.col), laneName(p.lane), c.description]);
    }
  }
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `seguimiento-${BOARD_ID}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

async function share() {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado. Envíalo a quien quieras.'); }
  catch { await ask({ title: 'Copia este enlace', value: url, okText: 'Listo' }); }
  if (store.mode === 'local') toast('Ojo: en modo de prueba los demás no verán tus cambios.');
}

// ---------- Inicio ----------
function wireUi() {
  $('#addColumn').onclick = addColumn;
  $('#addLane').onclick = addLane;
  $('#shareBtn').onclick = share;
  $('#exportBtn').onclick = exportCsv;
  $('#userChip').onclick = () => askName(false);
  $('#boardTitle').onchange = e => saveBoard({ title: e.target.value.trim() || 'Mi tablero' });
  $('#search').oninput = e => { filters.q = e.target.value.trim().toLowerCase(); render(); };
  $('#filterResp').onchange = e => { filters.resp = e.target.value; render(); };
  const d = $('#cardDialog');
  d.addEventListener('close', () => { openCardId = null; });
  d.addEventListener('click', e => { if (e.target === d) closeCard(); }); // clic fuera
  d.addEventListener('focusout', () => setTimeout(() => { if (dialogDirty && openCardId && !isTyping()) { dialogDirty = false; buildCardDialog(); } }, 0));
  // Refresca los "hace X días" cada minuto
  setInterval(() => { if (!openCardId) render(); }, 60000);
}

function showBanner(html, kind = 'warn') {
  const b = $('#banner');
  b.className = 'banner ' + kind;
  b.innerHTML = html;
  b.hidden = false;
}

async function start() {
  wireUi();
  renderUser();
  if (firebaseConfig) {
    try { store = await createFirebaseStore(firebaseConfig); }
    catch (err) {
      console.error(err);
      showBanner('No se pudo conectar con la base de datos en línea. Revisa tu conexión a internet y recarga la página.', 'error');
      return;
    }
  } else {
    store = createLocalStore();
    showBanner('<strong>Modo de prueba:</strong> los cambios solo se guardan en este navegador. Cuando se conecte la base de datos, todos los que tengan el enlace verán y moverán las mismas tarjetas.');
  }
  store.subscribe(
    b => { board = { ...DEFAULT_BOARD(), ...b }; render(); },
    m => { cards = m; render(); },
    err => {
      console.error(err);
      const denied = err?.code === 'permission-denied';
      showBanner(denied
        ? 'La base de datos no permite el acceso. Hay que publicar las reglas de Firestore (ver instrucciones del README).'
        : 'Problema de conexión con la base de datos: ' + (err?.message || err), 'error');
    });
  try { if (!localStorage.getItem(USER_KEY)) askName(true); } catch {}
}

start();
