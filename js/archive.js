/* Layer Studios — Archives page */
(function () {
  'use strict';

  var DATA = window.ARCHIVE_DATA || [];
  var PAGE = 24;

  var grid = document.getElementById('grid');
  var countEl = document.getElementById('count');
  var moreBtn = document.getElementById('moreBtn');
  var emptyEl = document.getElementById('empty');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.archive__tab'));
  var studioBtn = document.getElementById('studioBtn');
  var studioMenu = document.getElementById('studioMenu');
  var studioLabel = document.getElementById('studioLabel');
  var studioItems = Array.prototype.slice.call(studioMenu.querySelectorAll('button'));
  var body = document.body;

  var state = { type: '', studio: '', shown: 0, list: [] };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function typeLabel(t) { return t || 'Project'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- filtering + rendering ---------- */
  function filter() {
    state.list = DATA.filter(function (d) {
      if (state.type && d.type !== state.type) return false;
      if (state.studio && d.studios.indexOf(state.studio) === -1) return false;
      return true;
    });
    state.shown = 0;
    grid.innerHTML = '';
    renderMore();
  }

  function card(d) {
    return '<li class="acard">' +
      '<a href="#item-' + d.id + '" class="acard__link" data-id="' + d.id + '">' +
        '<span class="acard__img"><img src="' + esc(d.thumb) + '"' + (d.thumbSet ? ' srcset="' + esc(d.thumbSet) + '" sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"' : '') + ' alt="' + esc(d.title) + '" loading="lazy"></span>' +
        '<span class="acard__meta">' +
          '<span class="acard__type">' + esc(typeLabel(d.type)) + (d.date ? ' · ' + esc(d.date) : '') + '</span>' +
          '<span class="acard__title">' + esc(d.title) + '</span>' +
          '<span class="acard__studio">' + esc(d.studios.join(' · ')) + '</span>' +
        '</span>' +
      '</a></li>';
  }

  function renderMore() {
    var next = state.list.slice(state.shown, state.shown + PAGE);
    grid.insertAdjacentHTML('beforeend', next.map(card).join(''));
    state.shown += next.length;
    countEl.textContent = state.list.length + (state.list.length === 1 ? ' Project' : ' Projects');
    moreBtn.hidden = state.shown >= state.list.length;
    emptyEl.hidden = state.list.length > 0;
  }
  moreBtn.addEventListener('click', renderMore);

  /* ---------- type tabs ---------- */
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      state.type = b.getAttribute('data-type');
      filter();
    });
  });

  /* ---------- studio dropdown ---------- */
  function toggleStudio(force) {
    var open = typeof force === 'boolean' ? force : studioMenu.hidden;
    studioMenu.hidden = !open;
    studioBtn.setAttribute('aria-expanded', String(open));
  }
  studioBtn.addEventListener('click', function () { toggleStudio(); });
  document.addEventListener('click', function (e) {
    if (!studioMenu.hidden && !e.target.closest('.archive__filter')) toggleStudio(false);
  });
  studioItems.forEach(function (b) {
    b.addEventListener('click', function () {
      studioItems.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      state.studio = b.getAttribute('data-studio');
      studioLabel.textContent = b.textContent;
      toggleStudio(false);
      filter();
    });
  });

  /* ---------- detail overlay ---------- */
  var detail = document.getElementById('detail');
  var dScroll = document.getElementById('detailScroll');
  var dMeta = document.getElementById('detailMeta');
  var dTitle = document.getElementById('detailTitle');
  var dStudio = document.getElementById('detailStudio');
  var dImages = document.getElementById('detailImages');
  var dCredits = document.getElementById('detailCredits');
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
      state.list = DATA.slice(); /* fall back to full list for deep links */
    }
    currentIdx = idx;
    var d = state.list[idx];

    dMeta.textContent = typeLabel(d.type) + (d.date ? ' · ' + d.date : '');
    dTitle.textContent = d.title;
    dStudio.textContent = d.studios.length ? 'Shot at ' + d.studios.join(' · ') : '';
    var imgs = d.images.length ? d.images : [d.thumb];
    dImages.innerHTML = imgs.map(function (src, i) {
      var set = d.imagesSet && d.imagesSet[i];
      return '<figure class="detail__fig"><img src="' + esc(src) + '"' + (set ? ' srcset="' + esc(set) + '" sizes="(max-width: 1100px) 100vw, 1100px"' : '') + ' alt="' + esc(d.title) + '" loading="lazy"></figure>';
    }).join('');
    dCredits.innerHTML = d.credits.map(function (c) { return '<p>' + esc(c) + '</p>'; }).join('');
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
    history.replaceState(null, '', location.pathname);
    if (lastFocus) lastFocus.focus();
  }

  function step(dir) {
    var n = currentIdx + dir;
    if (n < 0 || n >= state.list.length) return;
    openDetail(state.list[n].id);
  }

  grid.addEventListener('click', function (e) {
    var a = e.target.closest('.acard__link');
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
