/*
 * Preview harness for reservation-fields.js — try the form on the LIVE write page without posting.
 * On https://plusjun.com/board/reservation/write.html?board_no=4 open DevTools → Console, paste
 * reservation-fields.js, then this file. "예약하기" then shows the body that would be stored
 * instead of submitting. Reload the page to get rid of both.
 */
(function () {
  var form = document.getElementById('boardWriteForm');
  if (!form || document.getElementById('lr-preview')) return;

  function isButton(el) {
    while (el && el !== document) {
      if (el.id === 'reserv-button') return true;
      el = el.parentNode;
    }
    return false;
  }

  function bodyText() {
    var ed = window.EC_FROALA_INSTANCE;
    var html = ed && ed.el ? ed.el.innerHTML : document.getElementById('content').value;
    return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  var panel = document.createElement('div');
  panel.id = 'lr-preview';
  panel.innerHTML = '<div style="position:fixed;left:0;right:0;top:0;z-index:99999;background:#000;color:#fff;font:13px/1.4 sans-serif;padding:8px 16px;text-align:center">미리보기 모드 · 예약하기를 눌러도 실제로 등록되지 않아요 (새로고침하면 원래대로)</div>' +
    '<div id="lr-preview-out" hidden style="position:fixed;right:16px;bottom:16px;z-index:99999;width:min(420px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fff;border:2px solid #000;box-shadow:0 8px 24px rgba(0,0,0,.2);font:13px/1.6 sans-serif;color:#000">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #ddd"><b>등록될 본문</b><button type="button" id="lr-preview-close" style="border:0;background:none;font-size:18px;cursor:pointer">×</button></div>' +
    '<pre id="lr-preview-text" style="margin:0;padding:12px;white-space:pre-wrap;font:inherit"></pre></div>';
  document.body.appendChild(panel);
  document.getElementById('lr-preview-close').onclick = function () { document.getElementById('lr-preview-out').hidden = true; };

  function show() {
    document.getElementById('lr-preview-text').textContent = '[제목] ' + document.getElementById('subject').value + '\n\n' + bodyText();
    document.getElementById('lr-preview-out').hidden = false;
  }

  // registered after reservation-fields.js, so its validation still runs first
  document.addEventListener('click', function (e) {
    if (!isButton(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    show();
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); show(); }, true);
  form.submit = function () { show(); return false; };
})();
