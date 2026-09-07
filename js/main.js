/* Layer Studios — homepage prototype behaviour */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var slides = Array.prototype.slice.call(hero.querySelectorAll('.slide'));
  var counter = document.getElementById('counter');
  var arrow = document.getElementById('arrow');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.sidenav__link'));
  var menu = document.getElementById('menu');
  var menuToggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  var body = document.body;

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var total = slides.length;
  var current = 0;

  /* ---- Active slide tracking (inside the hero scroll container) ---- */
  function setActive(index) {
    if (index === current && slides[index].classList.contains('is-active')) return;
    current = index;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
    counter.textContent = pad(index + 1) + ' / ' + pad(total);

    var key = slides[index].getAttribute('data-nav');
    navLinks.forEach(function (a) {
      a.classList.toggle('is-current', a.getAttribute('data-nav') === key);
    });
    arrow.style.visibility = index === total - 1 ? 'hidden' : 'visible';
  }

  var slideObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        setActive(slides.indexOf(e.target));
      }
    });
  }, { root: hero, threshold: [0.6] });
  slides.forEach(function (s) { slideObserver.observe(s); });

  /* ---- Hero in/out of viewport → header colour, side nav, hero UI ---- */
  var heroObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      body.classList.toggle('past-hero', e.intersectionRatio < 0.15);
    });
  }, { threshold: [0, 0.15, 0.5, 1] });
  heroObserver.observe(hero);

  /* ---- Arrow: go to next slide ---- */
  function goTo(index) {
    index = Math.max(0, Math.min(total - 1, index));
    hero.scrollTo({ top: slides[index].offsetTop, behavior: 'smooth' });
  }
  arrow.addEventListener('click', function () { goTo(current + 1); });

  /* ---- Keyboard: arrows / page keys move slides while hero is in view ---- */
  document.addEventListener('keydown', function (ev) {
    if (body.classList.contains('past-hero') || body.classList.contains('menu-open')) return;
    if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowDown' || ev.key === 'PageDown' || ev.key === ' ') {
      if (current < total - 1) { ev.preventDefault(); goTo(current + 1); }
    } else if (ev.key === 'ArrowUp' || ev.key === 'PageUp') {
      if (current > 0) { ev.preventDefault(); goTo(current - 1); }
    }
  });

  /* ---- Side nav → jump to matching slide when one exists ---- */
  navLinks.forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var key = a.getAttribute('data-nav');
      var idx = slides.findIndex(function (s) { return s.getAttribute('data-nav') === key; });
      if (idx > -1 && a.getAttribute('href') === '#') {
        ev.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        goTo(idx);
      }
    });
  });

  /* ---- Full-screen menu ---- */
  function toggleMenu(force) {
    var open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    body.classList.toggle('menu-open', open);
    menuToggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
  }
  menuToggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !menu.hidden) toggleMenu(false);
  });

  /* ---- Initial state ---- */
  setActive(0);
})();
