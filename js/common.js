/* Layer Studios — shared UI polish (image fade-in) */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  function reveal(img) { img.classList.add('is-loaded'); }
  function watch(img) {
    if (img.complete && img.naturalWidth > 0) { reveal(img); return; }
    img.addEventListener('load', function () { reveal(img); }, { once: true });
    img.addEventListener('error', function () { reveal(img); }, { once: true });
  }
  Array.prototype.slice.call(document.images).forEach(watch);
  /* images inserted later (archive/journal grids, overlays) */
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.slice.call(m.addedNodes).forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'IMG') watch(n);
        else Array.prototype.slice.call(n.querySelectorAll ? n.querySelectorAll('img') : []).forEach(watch);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
