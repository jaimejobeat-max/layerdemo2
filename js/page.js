/* Layer Studios — simple document pages (About / Guide / Q&A) */
(function () {
  'use strict';
  var body = document.body;
  /* section tabs highlight */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.archive__tab[href^="#"]'));
  var sections = tabs.map(function (t) { return document.querySelector(t.getAttribute('href')); }).filter(Boolean);
  if (sections.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        tabs.forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }
  /* copy account number */
  var btn = document.querySelector('[data-copy-btn]');
  if (btn) btn.addEventListener('click', function () {
    var v = document.querySelector('[data-copy]').getAttribute('data-copy');
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }, function () { window.prompt('계좌번호', v); });
  });
  /* full-screen menu */
  var menu = document.getElementById('menu');
  var toggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  function toggleMenu(force) {
    var open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open; body.classList.toggle('menu-open', open);
    toggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
  }
  toggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });
})();
