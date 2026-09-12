/* Layer Studios — site search (studios / archives / journal) */
(function () {
  'use strict';
  var box = document.getElementById('search'); if (!box) return;
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  var hint = document.getElementById('searchHint');
  var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-search-toggle]'));
  var body = document.body;
  var P = (document.querySelector('script[src$="js/search.js"]') || {}).getAttribute ? (document.querySelector('script[src$="js/search.js"]').getAttribute('src').replace('js/search.js', '')) : '';
  var INDEX = window.SEARCH_INDEX || [];
  var lastFocus = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' '); }
  function kindLabel(k) { return { studio: t('search.studio'), archive: t('search.archive'), journal: t('search.journal') }[k] || k; }

  function open() {
    if (!box.hidden) return;
    lastFocus = document.activeElement;
    box.hidden = false; body.classList.add('search-open');
    setTimeout(function () { input.focus(); }, 30);
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true; body.classList.remove('search-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  toggles.forEach(function (b) { b.addEventListener('click', function () { box.hidden ? open() : close(); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !box.hidden) close();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? open() : close(); }
  });

  function search(q) {
    q = norm(q).trim();
    if (q.length < 1) { results.innerHTML = ''; hint.hidden = false; return; }
    var terms = q.split(' ').filter(Boolean);
    var hits = INDEX.map(function (it) {
      var hay = norm(it.t + ' ' + it.s + ' ' + (it.s_ko || '') + ' ' + it.q);
      var title = norm(it.t);
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        if (hay.indexOf(terms[i]) === -1) return null;
        score += title.indexOf(terms[i]) > -1 ? 3 : 1;
        if (title.indexOf(terms[i]) === 0) score += 2;
      }
      if (it.k === 'studio') score += 2;
      return { it: it, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
    hint.hidden = true;
    if (!hits.length) { results.innerHTML = '<p class="search__empty">' + esc(t('empty')) + '</p>'; return; }
    var groups = { studio: [], archive: [], journal: [] };
    hits.forEach(function (h) { groups[h.it.k].push(h.it); });
    results.innerHTML = ['studio', 'archive', 'journal'].map(function (k) {
      if (!groups[k].length) return '';
      return '<section class="search__group"><h2 class="search__kind">' + esc(kindLabel(k)) + ' <span>' + groups[k].length + '</span></h2><ul class="search__list">' +
        groups[k].slice(0, 12).map(function (it) {
          var sub = (window.LANG === 'ko' && it.s_ko && it.s_ko.trim() !== '·') ? it.s_ko : it.s;
          return '<li><a class="search__item" href="' + P + esc(it.h) + '">' +
            (it.i ? '<span class="search__thumb"><img src="' + P + esc(it.i) + '" alt="" loading="lazy"></span>' : '<span class="search__thumb search__thumb--empty"></span>') +
            '<span class="search__text"><span class="search__title">' + esc(it.t) + '</span><span class="search__sub">' + esc(sub) + '</span></span></a></li>';
        }).join('') + '</ul></section>';
    }).join('');
  }
  var timer;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { search(input.value); }, 80); });
  document.addEventListener('langchange', function () { if (!box.hidden) search(input.value); });
  /* if a search result links to the current page with a hash (archive/journal detail), let the page handle it */
  results.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    var url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.hash) { close(); location.hash = url.hash; location.reload(); e.preventDefault(); }
  });
})();
