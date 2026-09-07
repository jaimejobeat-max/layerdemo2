/* Layer Studios — Journal page */
(function () {
  'use strict';

  var DATA = window.JOURNAL_DATA || [];
  var grid = document.getElementById('grid');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.archive__tab'));
  var yearBtn = document.getElementById('yearBtn');
  var yearMenu = document.getElementById('yearMenu');
  var yearLabel = document.getElementById('yearLabel');
  var body = document.body;

  var state = { kind: '', year: '', list: [] };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function kindLabel(d) { return d.kinds.indexOf('event') > -1 && d.kinds.length === 1 ? 'Layer Events' : 'Journal'; }

  /* ---------- year menu (built from data) ---------- */
  var years = DATA.map(function (d) { return d.year; }).filter(function (y, i, a) { return y && a.indexOf(y) === i; }).sort().reverse();
  yearMenu.innerHTML = '<li><button type="button" data-year="" class="is-active">All Years</button></li>' +
    years.map(function (y) { return '<li><button type="button" data-year="' + y + '">' + y + '</button></li>'; }).join('');
  var yearItems = Array.prototype.slice.call(yearMenu.querySelectorAll('button'));

  /* ---------- filtering + rendering ---------- */
  function filter() {
    state.list = DATA.filter(function (d) {
      if (state.kind && d.kinds.indexOf(state.kind) === -1) return false;
      if (state.year && d.year !== state.year) return false;
      return true;
    });
    grid.innerHTML = state.list.map(card).join('');
    countEl.textContent = state.list.length + (state.list.length === 1 ? ' Entry' : ' Entries');
    emptyEl.hidden = state.list.length > 0;
  }

  function card(d) {
    return '<li class="jcard">' +
      '<a href="#item-' + d.id + '" class="jcard__link" data-id="' + d.id + '">' +
        '<span class="jcard__img"><img src="' + esc(d.cover) + '" alt="' + esc(d.title) + '" loading="lazy"></span>' +
        '<span class="jcard__meta">' +
          '<span class="jcard__date">' + esc(d.date || '') + '</span>' +
          '<span class="jcard__title">' + esc(d.title) + '</span>' +
          '<span class="jcard__sub">' + esc(d.meta || kindLabel(d)) + '</span>' +
        '</span>' +
      '</a></li>';
  }

  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      state.kind = b.getAttribute('data-kind');
      filter();
    });
  });

  function toggleYear(force) {
    var open = typeof force === 'boolean' ? force : yearMenu.hidden;
    yearMenu.hidden = !open;
    yearBtn.setAttribute('aria-expanded', String(open));
  }
  yearBtn.addEventListener('click', function () { toggleYear(); });
  document.addEventListener('click', function (e) {
    if (!yearMenu.hidden && !e.target.closest('.archive__filter')) toggleYear(false);
  });
  yearItems.forEach(function (b) {
    b.addEventListener('click', function () {
      yearItems.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      state.year = b.getAttribute('data-year');
      yearLabel.textContent = b.textContent;
      toggleYear(false);
      filter();
    });
  });

  /* ---------- detail overlay ---------- */
  var detail = document.getElementById('detail');
  var dScroll = document.getElementById('detailScroll');
  var dMeta = document.getElementById('detailMeta');
  var dTitle = document.getElementById('detailTitle');
  var dStudio = document.getElementById('detailStudio');
  var dCover = document.getElementById('detailCover');
  var dBody = document.getElementById('detailBody');
  var dImages = document.getElementById('detailImages');
  var dIndex = document.getElementById('detailIndex');
  var dPrev = document.getElementById('detailPrev');
  var dNext = document.getElementById('detailNext');
  var dClose = document.getElementById('detailClose');
  var currentIdx = -1;
  var lastFocus = null;

  function openDetail(id, fromHash) {
    var idx = state.list.findIndex(function (d) { return d.id === id; });
    if (idx === -1) {
      idx = DATA.findIndex(function (d) { return d.id === id; });
      if (idx === -1) return;
      state.list = DATA.slice();
    }
    currentIdx = idx;
    var d = state.list[idx];

    dMeta.textContent = kindLabel(d) + (d.date ? ' · ' + d.date : '');
    dTitle.textContent = d.title;
    dStudio.textContent = d.meta && d.meta !== 'Layer Events' ? d.meta : '';
    dCover.innerHTML = '<img src="' + esc(d.cover) + '" alt="' + esc(d.title) + '">';
    dBody.innerHTML = d.paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      d.embeds.map(function (u) {
        return '<div class="detail__embed"><iframe src="' + esc(u) + '" title="' + esc(d.title) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
      }).join('');
    dImages.innerHTML = d.images.map(function (src) {
      return '<figure class="detail__fig"><img src="' + esc(src) + '" alt="' + esc(d.title) + '" loading="lazy"></figure>';
    }).join('');
    dIndex.textContent = pad(idx + 1) + ' / ' + pad(state.list.length);
    dPrev.disabled = idx === 0;
    dNext.disabled = idx === state.list.length - 1;

    if (detail.hidden) {
      lastFocus = document.activeElement;
      detail.hidden = false;
      body.classList.add('detail-open');
    }
    dScroll.scrollTop = 0;
    dClose.focus();
    if (!fromHash) history.replaceState(null, '', '#item-' + d.id);
  }
  function closeDetail() {
    detail.hidden = true;
    body.classList.remove('detail-open');
    dBody.innerHTML = ''; /* stop embedded players */
    history.replaceState(null, '', location.pathname);
    if (lastFocus) lastFocus.focus();
  }
  function step(dir) {
    var n = currentIdx + dir;
    if (n < 0 || n >= state.list.length) return;
    openDetail(state.list[n].id);
  }
  grid.addEventListener('click', function (e) {
    var a = e.target.closest('.jcard__link');
    if (!a) return;
    e.preventDefault();
    openDetail(Number(a.getAttribute('data-id')));
  });
  dClose.addEventListener('click', closeDetail);
  dPrev.addEventListener('click', function () { step(-1); });
  dNext.addEventListener('click', function () { step(1); });
  document.addEventListener('keydown', function (e) {
    if (detail.hidden) return;
    if (e.key === 'Escape') closeDetail();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  /* ---------- full-screen menu ---------- */
  var menu = document.getElementById('menu');
  var menuToggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  function toggleMenu(force) {
    var open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    body.classList.toggle('menu-open', open);
    menuToggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
  }
  menuToggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) toggleMenu(false);
  });

  /* ---------- init ---------- */
  filter();
  var m = location.hash.match(/^#item-(\d+)$/);
  if (m) openDetail(Number(m[1]), true);
})();
