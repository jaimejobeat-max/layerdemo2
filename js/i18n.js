/* Layer Studios — KO / EN toggle
   - Long content: markup carries both <.ko> and <.en>; CSS shows the active one.
   - Short labels: [data-i18n="key"] elements and t(key) for JS-rendered text.
   Loaded in <head> so the language is set before first paint. */
(function () {
  'use strict';
  var KEY = 'layer-lang';
  var DICT = {
    'tab.all':        { en: 'All',            ko: '전체' },
    'tab.magazine':   { en: 'Magazine',       ko: '매거진' },
    'tab.lookbook':   { en: 'Lookbook',       ko: '룩북' },
    'tab.video':      { en: 'Video',          ko: '영상' },
    'tab.journal':    { en: 'Journal',        ko: '저널' },
    'tab.events':     { en: 'Layer Events',   ko: '레이어 이벤트' },
    'filter.studios': { en: 'All Studios',    ko: '전체 스튜디오' },
    'filter.years':   { en: 'All Years',      ko: '전체 연도' },
    'archive.count':  { en: '{n} Projects',   ko: '{n}개 프로젝트' },
    'archive.count1': { en: '1 Project',      ko: '1개 프로젝트' },
    'journal.count':  { en: '{n} Entries',    ko: '{n}개 글' },
    'journal.count1': { en: '1 Entry',        ko: '1개 글' },
    'more':           { en: 'Load More',      ko: '더 보기' },
    'empty':          { en: 'No results.',    ko: '결과가 없습니다.' },
    'type.project':   { en: 'Project',        ko: '프로젝트' },
    'type.magazine':  { en: 'Magazine',       ko: '매거진' },
    'type.lookbook':  { en: 'Lookbook',       ko: '룩북' },
    'type.video':     { en: 'Video',          ko: '영상' },
    'type.onlineshop':{ en: 'Online Shop',    ko: '온라인 숍' },
    'kind.journal':   { en: 'Journal',        ko: '저널' },
    'kind.events':    { en: 'Layer Events',   ko: '레이어 이벤트' },
    'shotat':         { en: 'Shot at',        ko: '촬영 장소' },
    'prev':           { en: '← Prev',         ko: '← 이전' },
    'next':           { en: 'Next →',         ko: '다음 →' },
    'close':          { en: 'Close',          ko: '닫기' },
    'skip':           { en: 'Skip to content', ko: '본문으로 건너뛰기' },
    'search':         { en: 'Search',         ko: '검색' },
    'menu.open':      { en: 'Open menu',      ko: '메뉴 열기' },
    'menu.close':     { en: 'Close menu',     ko: '메뉴 닫기' },
    'email':          { en: 'Email',          ko: '이메일' },
    'search.placeholder': { en: 'Search studios, archives, journal', ko: '스튜디오, 아카이브, 저널 검색' },
    'search.hint':    { en: 'Type to search. Press Esc to close.', ko: '검색어를 입력하세요. Esc로 닫습니다.' },
    'search.studio':  { en: 'Studios',        ko: '스튜디오' },
    'search.archive': { en: 'Archives',       ko: '아카이브' },
    'search.journal': { en: 'Journal',        ko: '저널' }
  };
  function detect() {
    try { var v = localStorage.getItem(KEY); if (v === 'ko' || v === 'en') return v; } catch (e) {}
    return (navigator.language || '').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  }
  function t(key, vars) {
    var row = DICT[key]; var s = row ? (row[window.LANG] || row.en) : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function typeKey(type) {
    var k = 'type.' + String(type || '').toLowerCase().replace(/\s+/g, '');
    return DICT[k] ? t(k) : (type || t('type.project'));
  }
  function apply() {
    var root = document.documentElement;
    root.setAttribute('lang', window.LANG);
    root.setAttribute('data-lang', window.LANG);
    Array.prototype.slice.call(document.querySelectorAll('[data-i18n]')).forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-i18n-attr]')).forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var p = pair.split(':'); el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
  }
  function setLang(l) {
    if (l !== 'ko' && l !== 'en') return;
    window.LANG = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
  }
  window.LANG = detect();
  window.t = t; window.typeKey = typeKey; window.setLang = setLang;
  document.documentElement.setAttribute('lang', window.LANG);
  document.documentElement.setAttribute('data-lang', window.LANG);
  document.addEventListener('DOMContentLoaded', function () {
    apply();
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang-toggle]');
      if (b) setLang(window.LANG === 'ko' ? 'en' : 'ko');
      var o = e.target.closest('[data-lang-set]');
      if (o) { e.preventDefault(); setLang(o.getAttribute('data-lang-set')); }
    });
  });
})();
