/* Task Board — a dot-grid board of notes and wireframe steps.
   Vanilla JS, no build step, state persisted to localStorage. */
(function () {
  'use strict';

  var KEY = 'taskboard.v1';

  /* Board options — these mirror the props exposed by the design file. */
  var CONFIG = {
    snap: true,          // snap card positions to the dot grid
    gridSize: 24,        // dot grid pitch, in px
    connectors: 'elbow'  // 'elbow' | 'straight'
  };

  var WIDTH = { note: 244, box: 200 };
  var KIND_LABEL = { note: 'Note', box: 'Step' };
  var TITLE_PLACEHOLDER = { note: 'Heading', box: 'Step name' };

  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24"><path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6a5 5 0 0 1 0-10h3M8 12h8"></path></svg>';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  var state = { boards: [], activeId: null, linkFrom: null };
  var drag = null;
  var cardEls = {};   // item id -> card element

  var uid = 0;
  function nid() { return Date.now().toString(36) + (uid++).toString(36); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state.boards)); } catch (e) {}
  }

  function load() {
    var boards = [];
    try { boards = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { boards = []; }
    if (!Array.isArray(boards) || !boards.length) {
      boards = [{ id: nid(), name: 'Untitled product', items: [], links: [] }];
    }
    state.boards = boards;
    state.activeId = boards[0].id;
  }

  function activeBoard() {
    for (var i = 0; i < state.boards.length; i++) {
      if (state.boards[i].id === state.activeId) return state.boards[i];
    }
    return null;
  }

  function findItem(board, id) {
    for (var i = 0; i < board.items.length; i++) {
      if (board.items[i].id === id) return board.items[i];
    }
    return null;
  }

  function snap(v) {
    return CONFIG.snap ? Math.round(v / CONFIG.gridSize) * CONFIG.gridSize : Math.round(v);
  }

  /* ------------------------------------------------------------------ */
  /* Elements                                                           */
  /* ------------------------------------------------------------------ */

  var el = {
    boardCount: document.getElementById('boardCount'),
    form: document.getElementById('newBoardForm'),
    draft: document.getElementById('draft'),
    boardList: document.getElementById('boardList'),
    boardView: document.getElementById('boardView'),
    emptyState: document.getElementById('emptyState'),
    activeName: document.getElementById('activeName'),
    hint: document.getElementById('hint'),
    addNote: document.getElementById('addNote'),
    addBox: document.getElementById('addBox'),
    canvas: document.getElementById('canvas'),
    linksG: document.getElementById('linksG')
  };

  document.documentElement.style.setProperty('--grid-size', CONFIG.gridSize + 'px');

  /* ------------------------------------------------------------------ */
  /* Sidebar                                                            */
  /* ------------------------------------------------------------------ */

  function renderSidebar() {
    var n = state.boards.length;
    el.boardCount.textContent = n ? n + (n === 1 ? ' board' : ' boards') : '';

    el.boardList.textContent = '';

    state.boards.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'board-row' + (b.id === state.activeId ? ' is-active' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = b.name;
      name.title = b.name;

      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(b.items.length);

      var remove = document.createElement('button');
      remove.className = 'remove';
      remove.type = 'button';
      remove.title = 'Delete board';
      remove.setAttribute('aria-label', 'Delete board ' + b.name);
      remove.innerHTML = ICON_CLOSE;

      row.appendChild(name);
      row.appendChild(count);
      row.appendChild(remove);

      row.addEventListener('click', function () { selectBoard(b.id); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBoard(b.id); }
      });
      remove.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteBoard(b.id);
      });

      el.boardList.appendChild(row);
    });

    if (!state.boards.length) {
      var p = document.createElement('p');
      p.className = 'sidebar-empty';
      p.textContent = 'Name a product to start a board.';
      el.boardList.appendChild(p);
    }
  }

  function refreshCounts() {
    var rows = el.boardList.querySelectorAll('.board-row .count');
    state.boards.forEach(function (b, i) {
      if (rows[i]) rows[i].textContent = String(b.items.length);
    });
  }

  function selectBoard(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    state.linkFrom = null;
    renderSidebar();
    renderBoard();
  }

  function deleteBoard(id) {
    state.boards = state.boards.filter(function (b) { return b.id !== id; });
    if (state.activeId === id) {
      state.activeId = state.boards.length ? state.boards[0].id : null;
      state.linkFrom = null;
    }
    save();
    renderSidebar();
    renderBoard();
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = el.draft.value.trim();
    if (!name) return;
    var b = { id: nid(), name: name, items: [], links: [] };
    state.boards.push(b);
    state.activeId = b.id;
    state.linkFrom = null;
    el.draft.value = '';
    save();
    renderSidebar();
    renderBoard();
  });

  /* ------------------------------------------------------------------ */
  /* Board                                                              */
  /* ------------------------------------------------------------------ */

  function renderBoard() {
    var board = activeBoard();

    el.boardView.hidden = !board;
    el.emptyState.hidden = !!board;
    if (!board) return;

    el.activeName.textContent = board.name || 'Untitled product';
    renderHint();

    // Clear cards, keeping the connector layer in place.
    Object.keys(cardEls).forEach(function (id) {
      if (cardEls[id].parentNode) cardEls[id].parentNode.removeChild(cardEls[id]);
    });
    cardEls = {};

    board.items.forEach(function (item) {
      var card = buildCard(item);
      cardEls[item.id] = card;
      el.canvas.appendChild(card);
    });

    renderLinks();
  }

  function renderHint() {
    el.hint.textContent = state.linkFrom ? 'Pick a second element to connect' : '';
  }

  function addItem(kind) {
    var board = activeBoard();
    if (!board) return;
    var g = CONFIG.gridSize;
    var n = board.items.length;
    var item = {
      id: nid(),
      kind: kind,
      x: g * 2 + (n % 4) * g * 11,
      y: g * 2 + Math.floor(n / 4) * g * 7,
      title: '',
      bullets: kind === 'note' ? [''] : []
    };
    board.items.push(item);
    save();

    var card = buildCard(item);
    cardEls[item.id] = card;
    el.canvas.appendChild(card);
    refreshCounts();
    renderLinks();

    var titleInput = card.querySelector('.card-title');
    if (titleInput) titleInput.focus();
  }

  el.addNote.addEventListener('click', function () { addItem('note'); });
  el.addBox.addEventListener('click', function () { addItem('box'); });

  /* ------------------------------------------------------------------ */
  /* Cards                                                              */
  /* ------------------------------------------------------------------ */

  function buildCard(item) {
    var card = document.createElement('div');
    card.className = 'card' + (state.linkFrom === item.id ? ' is-linking' : '');
    card.dataset.id = item.id;
    card.style.left = item.x + 'px';
    card.style.top = item.y + 'px';
    card.style.width = WIDTH[item.kind] + 'px';

    /* head */
    var head = document.createElement('div');
    head.className = 'card-head';

    var kind = document.createElement('span');
    kind.className = 'card-kind';
    kind.textContent = KIND_LABEL[item.kind];

    var link = document.createElement('button');
    link.className = 'card-act link';
    link.type = 'button';
    link.title = 'Connect to another element';
    link.setAttribute('aria-label', 'Connect to another element');
    link.innerHTML = ICON_LINK;
    link.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleLink(item.id);
    });

    var del = document.createElement('button');
    del.className = 'card-act del';
    del.type = 'button';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete');
    del.innerHTML = ICON_CLOSE;
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteItem(item.id);
    });

    head.appendChild(kind);
    head.appendChild(link);
    head.appendChild(del);

    /* body */
    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('input');
    title.className = 'card-title';
    title.type = 'text';
    title.value = item.title;
    title.placeholder = TITLE_PLACEHOLDER[item.kind];
    title.setAttribute('aria-label', TITLE_PLACEHOLDER[item.kind]);
    title.addEventListener('input', function () {
      item.title = title.value;
      save();
    });
    body.appendChild(title);

    var bullets = document.createElement('div');
    bullets.className = 'bullets';
    item.bullets.forEach(function (text, i) {
      bullets.appendChild(buildBullet(item, i, text));
    });
    body.appendChild(bullets);

    if (item.kind === 'note') {
      var add = document.createElement('button');
      add.className = 'add-bullet';
      add.type = 'button';
      add.textContent = '+ bullet';
      add.addEventListener('click', function () {
        item.bullets.push('');
        save();
        rebuildCard(item, item.bullets.length - 1);
      });
      body.appendChild(add);
    }

    card.appendChild(head);
    card.appendChild(body);

    card.addEventListener('pointerdown', function (e) {
      startDrag(e, item, card);
    });

    return card;
  }

  function buildBullet(item, index, text) {
    var row = document.createElement('div');
    row.className = 'bullet';

    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = '·';

    var input = document.createElement('input');
    input.type = 'text';
    input.value = text;
    input.placeholder = 'Note';
    input.setAttribute('aria-label', 'Note');
    input.dataset.index = String(index);

    input.addEventListener('input', function () {
      item.bullets[index] = input.value;
      save();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        item.bullets.splice(index + 1, 0, '');
        save();
        rebuildCard(item, index + 1);
      } else if (e.key === 'Backspace' && !input.value && item.bullets.length > 1) {
        e.preventDefault();
        item.bullets.splice(index, 1);
        save();
        rebuildCard(item, Math.max(0, index - 1));
      }
    });

    row.appendChild(dot);
    row.appendChild(input);
    return row;
  }

  /* Rebuild one card in place — used when the bullet count changes, since
     that changes the card height and therefore its connectors. */
  function rebuildCard(item, focusBullet) {
    var old = cardEls[item.id];
    var next = buildCard(item);
    cardEls[item.id] = next;
    if (old && old.parentNode) old.parentNode.replaceChild(next, old);
    else el.canvas.appendChild(next);

    if (typeof focusBullet === 'number') {
      var target = next.querySelector('.bullet input[data-index="' + focusBullet + '"]');
      if (target) {
        target.focus();
        var end = target.value.length;
        try { target.setSelectionRange(end, end); } catch (e) {}
      }
    }
    renderLinks();
  }

  function deleteItem(id) {
    var board = activeBoard();
    if (!board) return;
    board.items = board.items.filter(function (i) { return i.id !== id; });
    board.links = board.links.filter(function (l) { return l.from !== id && l.to !== id; });
    if (state.linkFrom === id) state.linkFrom = null;
    save();

    var card = cardEls[id];
    if (card && card.parentNode) card.parentNode.removeChild(card);
    delete cardEls[id];

    refreshCounts();
    renderHint();
    renderLinks();
  }

  function toggleLink(id) {
    var board = activeBoard();
    if (!board) return;

    if (!state.linkFrom) {
      state.linkFrom = id;
    } else if (state.linkFrom === id) {
      state.linkFrom = null;
    } else {
      var from = state.linkFrom;
      var exists = board.links.some(function (l) { return l.from === from && l.to === id; });
      board.links = exists
        ? board.links.filter(function (l) { return !(l.from === from && l.to === id); })
        : board.links.concat([{ from: from, to: id }]);
      state.linkFrom = null;
      save();
    }

    Object.keys(cardEls).forEach(function (cid) {
      cardEls[cid].classList.toggle('is-linking', state.linkFrom === cid);
    });
    renderHint();
    renderLinks();
  }

  /* ------------------------------------------------------------------ */
  /* Drag                                                               */
  /* ------------------------------------------------------------------ */

  function startDrag(e, item, card) {
    if (e.button !== undefined && e.button !== 0) return;
    var t = e.target;
    if (t.tagName === 'INPUT' || t.closest('button')) return;

    var r = el.canvas.getBoundingClientRect();
    drag = {
      id: item.id,
      item: item,
      card: card,
      dx: e.clientX - r.left + el.canvas.scrollLeft - item.x,
      dy: e.clientY - r.top + el.canvas.scrollTop - item.y
    };
    card.classList.add('is-dragging');
    try { card.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    var r = el.canvas.getBoundingClientRect();
    var x = Math.max(0, snap(e.clientX - r.left + el.canvas.scrollLeft - drag.dx));
    var y = Math.max(0, snap(e.clientY - r.top + el.canvas.scrollTop - drag.dy));
    if (x === drag.item.x && y === drag.item.y) return;
    drag.item.x = x;
    drag.item.y = y;
    drag.card.style.left = x + 'px';
    drag.card.style.top = y + 'px';
    renderLinks();
  }

  function endDrag() {
    if (!drag) return;
    drag.card.classList.remove('is-dragging');
    drag = null;
    save();
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  /* ------------------------------------------------------------------ */
  /* Connectors                                                         */
  /* ------------------------------------------------------------------ */

  function boxOf(item) {
    var card = cardEls[item.id];
    var w = card ? card.offsetWidth : WIDTH[item.kind];
    var h = card
      ? card.offsetHeight
      : (item.kind === 'note' ? 60 + item.bullets.length * 26 : 74);
    return { x: item.x, y: item.y, w: w, h: h };
  }

  function pathFor(a, b) {
    var elbow = CONFIG.connectors === 'elbow';
    var acx = a.x + a.w / 2, acy = a.y + a.h / 2;
    var bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    var horizontal = Math.abs(bcx - acx) >= Math.abs(bcy - acy);
    var sx, sy, ex, ey;

    if (horizontal) {
      var right = bcx > acx;
      sx = right ? a.x + a.w : a.x; sy = acy;
      ex = right ? b.x : b.x + b.w; ey = bcy;
      var mx = (sx + ex) / 2;
      return elbow
        ? 'M ' + sx + ' ' + sy + ' H ' + mx + ' V ' + ey + ' H ' + ex
        : 'M ' + sx + ' ' + sy + ' L ' + ex + ' ' + ey;
    }

    var down = bcy > acy;
    sx = acx; sy = down ? a.y + a.h : a.y;
    ex = bcx; ey = down ? b.y : b.y + b.h;
    var my = (sy + ey) / 2;
    return elbow
      ? 'M ' + sx + ' ' + sy + ' V ' + my + ' H ' + ex + ' V ' + ey
      : 'M ' + sx + ' ' + sy + ' L ' + ex + ' ' + ey;
  }

  function renderLinks() {
    var board = activeBoard();
    el.linksG.textContent = '';
    if (!board) return;

    board.links.forEach(function (l) {
      var from = findItem(board, l.from);
      var to = findItem(board, l.to);
      if (!from || !to) return;

      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathFor(boxOf(from), boxOf(to)));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--geist-accents-3)');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('marker-end', 'url(#tb-arrow)');
      el.linksG.appendChild(path);
    });
  }

  /* Cancel a pending link with Escape. */
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.linkFrom) {
      state.linkFrom = null;
      Object.keys(cardEls).forEach(function (cid) {
        cardEls[cid].classList.remove('is-linking');
      });
      renderHint();
    }
  });

  window.addEventListener('resize', renderLinks);

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  load();
  renderSidebar();
  renderBoard();
})();
