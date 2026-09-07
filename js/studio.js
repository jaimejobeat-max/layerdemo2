/* Layer Studios — studio detail page */
(function () {
  'use strict';
  var body = document.body;

  /* ---- hero in/out → header colour ---- */
  var hero = document.getElementById('hero');
  function updateHero() {
    body.classList.toggle('past-hero', window.scrollY > hero.offsetHeight * 0.85);
  }
  window.addEventListener('scroll', updateHero, { passive: true });
  window.addEventListener('resize', updateHero);
  updateHero();

  /* ---- part galleries: horizontal snap scroll + counter + buttons ---- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  Array.prototype.slice.call(document.querySelectorAll('[data-part]')).forEach(function (part) {
    var gal = part.querySelector('[data-gallery]');
    var items = Array.prototype.slice.call(gal.children);
    var counter = part.querySelector('[data-counter]');
    var total = items.length;
    var current = 0;

    function padLeft() { return parseFloat(getComputedStyle(gal).paddingLeft) || 0; }
    function itemLeft(i) { return items[i].offsetLeft - gal.offsetLeft - padLeft(); }
    function updateCounter() {
      var x = gal.scrollLeft, best = 0, bestDist = Infinity;
      for (var i = 0; i < total; i++) {
        var d = Math.abs(itemLeft(i) - x);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      current = best;
      counter.textContent = pad(current + 1) + ' / ' + pad(total);
    }
    var ticking = false;
    gal.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { updateCounter(); ticking = false; });
    }, { passive: true });
    updateCounter();

    function go(i) {
      i = Math.max(0, Math.min(total - 1, i));
      gal.scrollTo({ left: itemLeft(i), behavior: 'smooth' });
    }
    part.querySelector('[data-prev]').addEventListener('click', function () { go(current - 1); });
    part.querySelector('[data-next]').addEventListener('click', function () { go(current + 1); });
    gal.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    });
    gal.setAttribute('tabindex', '0');
  });

  /* ---- sticky part tabs: highlight current section ---- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.sparts__tab'));
  var sections = tabs.map(function (t) { return document.querySelector(t.getAttribute('href')); }).filter(Boolean);
  var secObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      tabs.forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('href') === '#' + e.target.id); });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(function (s) { secObserver.observe(s); });

  /* ---- full-screen menu ---- */
  var menu = document.getElementById('menu');
  var menuToggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  function toggleMenu(force) {
    var open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    body.classList.toggle('menu-open', open);
    menuToggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
  }
  menuToggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });
})();
