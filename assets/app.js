/* Task Board — a dot-grid board of nodes joined by connectors.
   Vanilla JS, no build step, state persisted to localStorage. */
(function () {
  'use strict';

  var KEY = 'taskboard.v1';
  var THEME_KEY = 'taskboard.theme';

  /* Board options — these mirror the props exposed by the design file. */
  var CONFIG = {
    snap: true,          // snap node positions to the dot grid
    gridSize: 24,        // dot grid pitch, in px
    connectors: 'elbow'  // 'elbow' | 'straight'
  };

  var NODE_WIDTH = 244;

  var ICON_DOTS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>';
  var ICON_GRIP = '<svg viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>';
  var ICON_UNCHECKED = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle></svg>';
  var ICON_CHECKED = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.3l2.7 2.7L16 9.7"></path></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
  var ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  var PRIORITY_LABEL = { 1: 'High', 2: 'Medium', 3: 'Low' };

  var state = {
    boards: [],
    activeId: null,
    linkMode: false,   // "Link nodes" tool is armed
    linkFrom: null     // node picked as the start of a connection
  };

  var drag = null;      // moving a node
  var linkDrag = null;  // dragging from one node to another
  var cardEls = {};     // node id -> card element

  var uid = 0;
  function nid() { return Date.now().toString(36) + (uid++).toString(36); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state.boards)); } catch (e) {}
  }

  function clampPriority(v) {
    var n = parseInt(v, 10);
    return (n === 1 || n === 2 || n === 3) ? n : 2;
  }

  /* Older boards stored "note" and "box" elements; both are now nodes. */
  function migrate(boards) {
    return boards.map(function (b) {
      return {
        id: b.id || nid(),
        name: b.name || 'Untitled project',
        priority: clampPriority(b.priority),
        items: (b.items || []).map(function (it) {
          return {
            id: it.id || nid(),
            kind: 'node',
            x: it.x || 0,
            y: it.y || 0,
            title: it.title || '',
            done: !!it.done,
            bullets: Array.isArray(it.bullets) ? it.bullets : []
          };
        }),
        links: (b.links || []).filter(function (l) { return l && l.from && l.to; })
      };
    });
  }

  function load() {
    var boards = [];
    try { boards = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { boards = []; }
    if (!Array.isArray(boards) || !boards.length) {
      boards = [{ id: nid(), name: 'Untitled project', items: [], links: [] }];
    }
    state.boards = migrate(boards);
    state.activeId = state.boards[0].id;
    save(); // normalise older stored shapes in place
  }

  function boardById(id) {
    for (var i = 0; i < state.boards.length; i++) {
      if (state.boards[i].id === id) return state.boards[i];
    }
    return null;
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
    themeToggle: document.getElementById('themeToggle'),
    form: document.getElementById('newBoardForm'),
    draft: document.getElementById('draft'),
    boardList: document.getElementById('boardList'),
    boardView: document.getElementById('boardView'),
    emptyState: document.getElementById('emptyState'),
    activeName: document.getElementById('activeName'),
    hint: document.getElementById('hint'),
    addNode: document.getElementById('addNode'),
    linkNodes: document.getElementById('linkNodes'),
    menu: document.getElementById('boardMenu'),
    menuDelete: document.getElementById('menuDelete'),
    canvas: document.getElementById('canvas'),
    linksG: document.getElementById('linksG')
  };

  document.documentElement.style.setProperty('--grid-size', CONFIG.gridSize + 'px');

  /* ------------------------------------------------------------------ */
  /* Theme                                                              */
  /* ------------------------------------------------------------------ */

  var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function currentTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return systemDark && systemDark.matches ? 'dark' : 'light';
  }

  function syncThemeButton() {
    var dark = currentTheme() === 'dark';
    el.themeToggle.innerHTML = dark ? ICON_SUN : ICON_MOON;
    var label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    el.themeToggle.title = label;
    el.themeToggle.setAttribute('aria-label', label);
  }

  el.themeToggle.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeButton();
  });

  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener('change', function () {
      if (!document.documentElement.getAttribute('data-theme')) syncThemeButton();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar                                                            */
  /* ------------------------------------------------------------------ */

  function renderSidebar() {
    closeMenu();

    var n = state.boards.length;
    el.boardCount.textContent = n ? n + (n === 1 ? ' board' : ' boards') : '';

    el.boardList.textContent = '';

    state.boards.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'board-row' + (b.id === state.activeId ? ' is-active' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      var grip = document.createElement('button');
      grip.className = 'grip';
      grip.type = 'button';
      grip.title = 'Drag to reorder the queue';
      grip.setAttribute('aria-label', 'Reorder ' + b.name);
      grip.innerHTML = ICON_GRIP;

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = b.name;
      name.title = b.name;

      var prio = document.createElement('span');
      prio.className = 'prio prio-' + b.priority;
      prio.textContent = String(b.priority);
      prio.title = PRIORITY_LABEL[b.priority] + ' priority';

      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = countLabel(b);

      var menuBtn = document.createElement('button');
      menuBtn.className = 'menu-btn';
      menuBtn.type = 'button';
      menuBtn.title = 'Board options';
      menuBtn.setAttribute('aria-label', 'Options for ' + b.name);
      menuBtn.setAttribute('aria-haspopup', 'menu');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.innerHTML = ICON_DOTS;

      row.dataset.id = b.id;
      row.appendChild(grip);
      row.appendChild(menuBtn);
      row.appendChild(name);
      row.appendChild(prio);
      row.appendChild(count);

      row.addEventListener('click', function () {
        if (swallowClick()) return;
        selectBoard(b.id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBoard(b.id); }
      });
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menuFor === b.id) closeMenu();
        else openMenu(menuBtn, b.id);
      });
      menuBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      grip.addEventListener('pointerdown', function (e) { rowPointerDown(e, row); });
      grip.addEventListener('click', function (e) { e.stopPropagation(); });

      el.boardList.appendChild(row);
    });

    if (!state.boards.length) {
      var p = document.createElement('p');
      p.className = 'sidebar-empty';
      p.textContent = 'Name a project to start a board.';
      el.boardList.appendChild(p);
    }
  }

  function countLabel(board) {
    var done = board.items.filter(function (i) { return i.done; }).length;
    return done ? done + '/' + board.items.length : String(board.items.length);
  }

  function refreshCounts() {
    var board = activeBoard();
    if (!board) return;
    var row = el.boardList.querySelector('.board-row[data-id="' + board.id + '"] .count');
    if (row) row.textContent = countLabel(board);
  }

  function selectBoard(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    state.linkFrom = null;
    linkDrag = null;
    renderSidebar();
    renderBoard();
  }

  function deleteBoard(id) {
    var board = boardById(id);
    if (!board) return;

    var n = board.items.length;
    if (n && !window.confirm('Delete "' + board.name + '" and its ' + n + (n === 1 ? ' node' : ' nodes') + '?')) return;

    state.boards = state.boards.filter(function (b) { return b.id !== id; });
    if (state.activeId === id) {
      state.activeId = state.boards.length ? state.boards[0].id : null;
      state.linkFrom = null;
      linkDrag = null;
    }
    save();
    renderSidebar();
    renderBoard();
  }

  /* ------------------------------------------------------------------ */
  /* Board menu                                                         */
  /* ------------------------------------------------------------------ */

  var menuFor = null;   // board id the open menu belongs to
  var menuBtnEl = null;
  var prioItems = [].slice.call(el.menu.querySelectorAll('.prio-item'));

  function openMenu(btn, boardId) {
    menuFor = boardId;
    menuBtnEl = btn;
    btn.setAttribute('aria-expanded', 'true');

    var board = boardById(boardId);
    prioItems.forEach(function (item) {
      var on = board && String(board.priority) === item.dataset.priority;
      item.setAttribute('aria-checked', String(!!on));
    });

    el.menu.hidden = false;
    el.menu.style.left = '0px';
    el.menu.style.top = '0px';

    var r = btn.getBoundingClientRect();
    var m = el.menu.getBoundingClientRect();
    var left = Math.min(r.left, window.innerWidth - m.width - 8);
    var top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - 6 - m.height);
    el.menu.style.left = Math.max(8, left) + 'px';
    el.menu.style.top = top + 'px';

    el.menuDelete.focus();
  }

  function closeMenu() {
    if (menuBtnEl) menuBtnEl.setAttribute('aria-expanded', 'false');
    menuFor = null;
    menuBtnEl = null;
    el.menu.hidden = true;
  }

  prioItems.forEach(function (item) {
    item.addEventListener('click', function () {
      var board = boardById(menuFor);
      closeMenu();
      if (!board) return;
      board.priority = clampPriority(item.dataset.priority);
      save();
      renderSidebar();
    });
  });

  el.menuDelete.addEventListener('click', function () {
    var id = menuFor;
    closeMenu();
    if (id) deleteBoard(id);
  });

  document.addEventListener('pointerdown', function (e) {
    if (menuFor && !el.menu.contains(e.target)) closeMenu();
  });
  el.boardList.addEventListener('scroll', function () { if (menuFor) closeMenu(); });
  window.addEventListener('resize', function () { if (menuFor) closeMenu(); });

  /* ------------------------------------------------------------------ */
  /* Queue reorder — press-and-hold drag, ported from the Router          */
  /* Department Tracking board's job queue.                               */
  /* ------------------------------------------------------------------ */

  var MOVE_START = 3;    // px of movement before the row lifts
  var pressState = null;
  var dragEndedAt = 0;

  /* A click fires right after a drag ends; the row must not also select. */
  function swallowClick() {
    return dragEndedAt && (Date.now() - dragEndedAt) < 400;
  }

  function rowPointerDown(e, row) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    endPress();
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    pressState = {
      row: row,
      container: el.boardList,
      startY: e.clientY, startX: e.clientX,
      lastY: e.clientY, lastX: e.clientX,
      pointerId: e.pointerId,
      dragging: false
    };
    window.addEventListener('pointermove', rowPointerMove);
    window.addEventListener('pointerup', rowPointerUp);
    window.addEventListener('pointercancel', rowPointerUp);
  }

  function rowPointerMove(e) {
    var st = pressState;
    if (!st) return;
    st.lastY = e.clientY;
    st.lastX = e.clientX;
    if (!st.dragging) {
      var dist = Math.abs(e.clientY - st.startY) + Math.abs(e.clientX - st.startX);
      if (dist <= MOVE_START) return;
      beginRowDrag();
    }
    e.preventDefault();
    rowDragMove(e.clientY);
  }

  function beginRowDrag() {
    var st = pressState;
    if (!st || st.dragging) return;
    st.dragging = true;
    st.baseY = st.lastY;
    st.baseX = st.lastX;
    st.row.classList.add('lifted');
    st.row.style.touchAction = 'none';
    try { st.row.setPointerCapture(st.pointerId); } catch (err) {}
    document.body.style.userSelect = 'none';
    rowDragMove(st.lastY);
  }

  function rowDragMove(y) {
    var st = pressState, row = st.row, container = st.container;
    var kids = [].slice.call(container.children).filter(function (c) {
      return c !== row && c.classList && c.classList.contains('board-row');
    });

    var after = null;
    for (var i = 0; i < kids.length; i++) {
      var box = kids[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) { after = kids[i]; break; }
    }

    var before = row.offsetTop;
    if (after == null) {
      if (container.lastElementChild !== row) container.appendChild(row);
    } else if (row.nextElementSibling !== after) {
      container.insertBefore(row, after);
    }
    st.baseY += row.offsetTop - before;   // keep the lift under the pointer after a DOM move

    var dx = Math.max(-18, Math.min(18, st.lastX - st.baseX));
    row.style.transform = 'translate(' + dx + 'px,' + (y - st.baseY) + 'px) scale(1.02)';
  }

  function rowPointerUp() {
    var st = pressState;
    if (!st) return;
    window.removeEventListener('pointermove', rowPointerMove);
    window.removeEventListener('pointerup', rowPointerUp);
    window.removeEventListener('pointercancel', rowPointerUp);
    document.body.style.userSelect = '';

    var wasDragging = st.dragging;
    var container = st.container, row = st.row;
    pressState = null;

    if (!wasDragging) return;

    row.classList.remove('lifted');
    row.style.transform = '';
    row.style.touchAction = '';
    dragEndedAt = Date.now();

    var ids = [].slice.call(container.querySelectorAll('.board-row')).map(function (r) {
      return r.dataset.id;
    });
    commitOrder(ids);
  }

  function endPress() {
    if (!pressState) return;
    window.removeEventListener('pointermove', rowPointerMove);
    window.removeEventListener('pointerup', rowPointerUp);
    window.removeEventListener('pointercancel', rowPointerUp);
    pressState = null;
  }

  /* The DOM is already in the new order, so reorder state to match and
     leave the list alone — re-rendering here would only cause a flicker. */
  function commitOrder(ids) {
    var next = [];
    ids.forEach(function (id) {
      var b = boardById(id);
      if (b) next.push(b);
    });
    state.boards.forEach(function (b) {
      if (next.indexOf(b) === -1) next.push(b);
    });
    state.boards = next;
    save();
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = el.draft.value.trim();
    if (!name) return;
    var b = { id: nid(), name: name, priority: 2, items: [], links: [] };
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

    el.activeName.textContent = board.name || 'Untitled project';
    renderHint();

    // Clear nodes, keeping the connector layer in place.
    Object.keys(cardEls).forEach(function (id) {
      if (cardEls[id].parentNode) cardEls[id].parentNode.removeChild(cardEls[id]);
    });
    cardEls = {};

    board.items.forEach(function (item) {
      mountCard(buildCard(item), item.id);
    });

    renderLinks();
  }

  function mountCard(card, id) {
    cardEls[id] = card;
    el.canvas.appendChild(card);
    fitAll(card);
    return card;
  }

  function renderHint() {
    if (state.linkFrom) el.hint.textContent = 'Now pick the node to connect it to';
    else if (state.linkMode) el.hint.textContent = 'Grab a node to start a connection';
    else el.hint.textContent = '';
  }

  function addNode() {
    var board = activeBoard();
    if (!board) return;
    setLinkMode(false);

    var g = CONFIG.gridSize;
    var n = board.items.length;
    var item = {
      id: nid(),
      kind: 'node',
      x: g * 2 + (n % 4) * g * 11,
      y: g * 2 + Math.floor(n / 4) * g * 7,
      title: '',
      done: false,
      bullets: ['']
    };
    board.items.push(item);
    save();

    var card = mountCard(buildCard(item), item.id);
    refreshCounts();
    renderLinks();

    var title = card.querySelector('.card-title');
    if (title) title.focus();
  }

  el.addNode.addEventListener('click', addNode);
  el.linkNodes.addEventListener('click', function () { setLinkMode(!state.linkMode); });

  /* ------------------------------------------------------------------ */
  /* Nodes                                                              */
  /* ------------------------------------------------------------------ */

  /* Grow a textarea to fit its content, so text wraps to the next line
     rather than running off the side. */
  function fit(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function fitAll(root) {
    var list = root.querySelectorAll('textarea');
    for (var i = 0; i < list.length; i++) fit(list[i]);
  }

  function buildCard(item) {
    var card = document.createElement('div');
    card.className = 'card'
      + (state.linkFrom === item.id ? ' is-linking' : '')
      + (item.done ? ' is-done' : '');
    card.dataset.id = item.id;
    card.style.left = item.x + 'px';
    card.style.top = item.y + 'px';
    card.style.width = NODE_WIDTH + 'px';

    /* head */
    var head = document.createElement('div');
    head.className = 'card-head';

    var check = document.createElement('button');
    check.className = 'card-check';
    check.type = 'button';
    check.innerHTML = item.done ? ICON_CHECKED : ICON_UNCHECKED;
    check.title = item.done ? 'Mark as not complete' : 'Mark complete';
    check.setAttribute('aria-pressed', String(!!item.done));
    check.setAttribute('aria-label', 'Mark node complete');
    check.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDone(item, card, check);
    });

    var kind = document.createElement('span');
    kind.className = 'card-kind';
    kind.textContent = item.done ? 'Node · Done' : 'Node';

    var del = document.createElement('button');
    del.className = 'card-act del';
    del.type = 'button';
    del.title = 'Delete node';
    del.setAttribute('aria-label', 'Delete node');
    del.innerHTML = ICON_CLOSE;
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteItem(item.id);
    });

    head.appendChild(check);
    head.appendChild(kind);
    head.appendChild(del);

    /* body */
    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('textarea');
    title.className = 'card-title';
    title.rows = 1;
    title.value = item.title;
    title.placeholder = 'Heading';
    title.setAttribute('aria-label', 'Node heading');
    title.addEventListener('input', function () {
      item.title = title.value;
      fit(title);
      save();
      renderLinks();
    });
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!item.bullets.length) {
          item.bullets.push('');
          save();
          rebuildCard(item, 0);
        } else {
          var first = card.querySelector('.bullet textarea');
          if (first) first.focus();
        }
      }
    });
    body.appendChild(title);

    var bullets = document.createElement('div');
    bullets.className = 'bullets';
    item.bullets.forEach(function (text, i) {
      bullets.appendChild(buildBullet(item, i, text));
    });
    body.appendChild(bullets);

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

    card.appendChild(head);
    card.appendChild(body);

    card.addEventListener('pointerdown', function (e) {
      onCardPointerDown(e, item, card);
    });

    return card;
  }

  function toggleDone(item, card, check) {
    item.done = !item.done;
    save();
    card.classList.toggle('is-done', item.done);
    check.innerHTML = item.done ? ICON_CHECKED : ICON_UNCHECKED;
    check.title = item.done ? 'Mark as not complete' : 'Mark complete';
    check.setAttribute('aria-pressed', String(item.done));
    var kind = card.querySelector('.card-kind');
    if (kind) kind.textContent = item.done ? 'Node · Done' : 'Node';
    refreshCounts();
  }

  function buildBullet(item, index, text) {
    var row = document.createElement('div');
    row.className = 'bullet';

    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.textContent = '·';

    var ta = document.createElement('textarea');
    ta.rows = 1;
    ta.value = text;
    ta.placeholder = 'Note';
    ta.setAttribute('aria-label', 'Note');
    ta.dataset.index = String(index);

    ta.addEventListener('input', function () {
      item.bullets[index] = ta.value;
      fit(ta);
      save();
      renderLinks();
    });

    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        item.bullets.splice(index + 1, 0, '');
        save();
        rebuildCard(item, index + 1);
      } else if (e.key === 'Backspace' && !ta.value && item.bullets.length > 1) {
        e.preventDefault();
        item.bullets.splice(index, 1);
        save();
        rebuildCard(item, Math.max(0, index - 1));
      }
    });

    row.appendChild(dot);
    row.appendChild(ta);
    return row;
  }

  /* Rebuild one node in place — used when the bullet count changes, since
     that changes its height and therefore its connectors. */
  function rebuildCard(item, focusBullet) {
    var old = cardEls[item.id];
    var next = buildCard(item);
    cardEls[item.id] = next;
    if (old && old.parentNode) old.parentNode.replaceChild(next, old);
    else el.canvas.appendChild(next);
    fitAll(next);

    if (typeof focusBullet === 'number') {
      var target = next.querySelector('.bullet textarea[data-index="' + focusBullet + '"]');
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
    if (linkDrag && linkDrag.fromId === id) linkDrag = null;
    save();

    var card = cardEls[id];
    if (card && card.parentNode) card.parentNode.removeChild(card);
    delete cardEls[id];

    refreshCounts();
    renderHint();
    renderLinks();
  }

  /* ------------------------------------------------------------------ */
  /* Link mode                                                          */
  /* ------------------------------------------------------------------ */

  function setLinkMode(on) {
    state.linkMode = !!on;
    state.linkFrom = null;
    linkDrag = null;
    el.linkNodes.classList.toggle('is-active', state.linkMode);
    el.linkNodes.setAttribute('aria-pressed', String(state.linkMode));
    el.canvas.classList.toggle('is-linking', state.linkMode);
    syncLinkClasses();
    renderHint();
    renderLinks();
  }

  function syncLinkClasses() {
    Object.keys(cardEls).forEach(function (cid) {
      cardEls[cid].classList.toggle('is-linking', state.linkFrom === cid);
    });
  }

  function connect(fromId, toId) {
    var board = activeBoard();
    if (!board || fromId === toId) return;
    var exists = board.links.some(function (l) { return l.from === fromId && l.to === toId; });
    board.links = exists
      ? board.links.filter(function (l) { return !(l.from === fromId && l.to === toId); })
      : board.links.concat([{ from: fromId, to: toId }]);
    save();
  }

  function canvasPoint(e) {
    var r = el.canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left + el.canvas.scrollLeft,
      y: e.clientY - r.top + el.canvas.scrollTop
    };
  }

  function onCardPointerDown(e, item, card) {
    if (e.button !== undefined && e.button !== 0) return;

    if (state.linkMode) {
      e.preventDefault();
      if (state.linkFrom && state.linkFrom !== item.id) {
        // Second click of a click-then-click connection.
        connect(state.linkFrom, item.id);
        state.linkFrom = null;
        linkDrag = null;
      } else if (state.linkFrom === item.id) {
        state.linkFrom = null;
        linkDrag = null;
      } else {
        state.linkFrom = item.id;
        var p = canvasPoint(e);
        linkDrag = { fromId: item.id, x: p.x, y: p.y, moved: false };
      }
      syncLinkClasses();
      renderHint();
      renderLinks();
      return;
    }

    var t = e.target;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.closest('button')) return;
    startDrag(e, item, card);
  }

  /* ------------------------------------------------------------------ */
  /* Drag                                                               */
  /* ------------------------------------------------------------------ */

  function startDrag(e, item, card) {
    var p = canvasPoint(e);
    drag = {
      id: item.id,
      item: item,
      card: card,
      dx: p.x - item.x,
      dy: p.y - item.y
    };
    card.classList.add('is-dragging');
    try { card.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  function onMove(e) {
    if (linkDrag) {
      var lp = canvasPoint(e);
      linkDrag.x = lp.x;
      linkDrag.y = lp.y;
      linkDrag.moved = true;
      renderLinks();
      return;
    }

    if (!drag) return;
    var p = canvasPoint(e);
    var x = Math.max(0, snap(p.x - drag.dx));
    var y = Math.max(0, snap(p.y - drag.dy));
    if (x === drag.item.x && y === drag.item.y) return;
    drag.item.x = x;
    drag.item.y = y;
    drag.card.style.left = x + 'px';
    drag.card.style.top = y + 'px';
    renderLinks();
  }

  function onUp(e) {
    if (linkDrag) {
      if (linkDrag.moved) {
        // Released after dragging: connect to whatever node is under the pointer.
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var target = under && under.closest ? under.closest('.card') : null;
        if (target && target.dataset.id && target.dataset.id !== linkDrag.fromId) {
          connect(linkDrag.fromId, target.dataset.id);
        }
        state.linkFrom = null;
        linkDrag = null;
        syncLinkClasses();
        renderHint();
        renderLinks();
      } else {
        // A plain click: keep the node picked, waiting for the second one.
        linkDrag = null;
        renderLinks();
      }
      return;
    }

    if (!drag) return;
    drag.card.classList.remove('is-dragging');
    drag = null;
    save();
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', function () {
    if (linkDrag) { linkDrag = null; renderLinks(); }
    if (drag) { drag.card.classList.remove('is-dragging'); drag = null; save(); }
  });

  /* ------------------------------------------------------------------ */
  /* Connectors                                                         */
  /* ------------------------------------------------------------------ */

  function boxOf(item) {
    var card = cardEls[item.id];
    var w = card ? card.offsetWidth : NODE_WIDTH;
    var h = card ? card.offsetHeight : 60 + item.bullets.length * 26;
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

  function addPath(d, opts) {
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', opts.stroke);
    path.setAttribute('stroke-width', '1.5');
    if (opts.dash) path.setAttribute('stroke-dasharray', opts.dash);
    path.setAttribute('marker-end', opts.marker);
    el.linksG.appendChild(path);
  }

  function renderLinks() {
    var board = activeBoard();
    el.linksG.textContent = '';
    if (!board) return;

    board.links.forEach(function (l) {
      var from = findItem(board, l.from);
      var to = findItem(board, l.to);
      if (!from || !to) return;
      addPath(pathFor(boxOf(from), boxOf(to)), {
        stroke: 'var(--geist-accents-3)',
        marker: 'url(#tb-arrow)'
      });
    });

    // Rubber band while dragging from one node toward another.
    if (linkDrag && linkDrag.moved) {
      var src = findItem(board, linkDrag.fromId);
      if (src) {
        addPath(pathFor(boxOf(src), { x: linkDrag.x, y: linkDrag.y, w: 1, h: 1 }), {
          stroke: 'var(--geist-success)',
          dash: '4 4',
          marker: 'url(#tb-arrow-live)'
        });
      }
    }
  }

  /* Escape leaves link mode. */
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menuFor) {
      var btn = menuBtnEl;
      closeMenu();
      if (btn) btn.focus();
    } else if (state.linkFrom) {
      state.linkFrom = null;
      linkDrag = null;
      syncLinkClasses();
      renderHint();
      renderLinks();
    } else if (state.linkMode) {
      setLinkMode(false);
    }
  });

  window.addEventListener('resize', renderLinks);

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  syncThemeButton();
  load();
  renderSidebar();
  renderBoard();
})();
