/* Layer Studios — reservation request form */
(function () {
  'use strict';
  var form = document.getElementById('rform'); if (!form) return;
  var studios = window.RESERVE_STUDIOS || [];
  var sStudio = document.getElementById('rStudio'), sPart = document.getElementById('rPart'), dDate = document.getElementById('rDate');
  var sStart = document.getElementById('rStart'), sEnd = document.getElementById('rEnd');
  var err = document.getElementById('rError'), done = document.getElementById('rDone'), doneMeta = document.getElementById('rDoneMeta'), submit = document.getElementById('rSubmit');
  var MSG = {
    ko: { studio: '지점을 선택해 주세요.', purpose: '촬영 내용을 선택해 주세요.', part: '파트를 선택해 주세요.', date: '날짜를 확인해 주세요.', 'date-past': '지난 날짜는 신청할 수 없습니다.', time: '시작 시간이 종료 시간보다 앞서야 합니다.', 'min-hours': '최소 대관 시간보다 짧습니다.', company: '업체명(예약자명)을 입력해 주세요.', contact: '담당자를 입력해 주세요.', phone: '연락 가능한 전화번호를 입력해 주세요.', email: '이메일 형식을 확인해 주세요.', consent: '정보 수집에 동의해 주세요.', network: '전송에 실패했습니다. 잠시 후 다시 시도하거나 02-336-7750으로 연락해 주세요.', sending: '보내는 중…' },
    en: { studio: 'Please choose a studio.', purpose: 'Please choose the type of use.', part: 'Please choose a part.', date: 'Please check the date.', 'date-past': 'The date has already passed.', time: 'Start must be before end.', 'min-hours': 'Shorter than the minimum booking.', company: 'Please enter your company or name.', contact: 'Please enter a contact person.', phone: 'Please enter a phone number.', email: 'Please check the email address.', consent: 'Please agree to the data use.', network: 'Could not send. Please try again or call +82-2-336-7750.', sending: 'Sending…' }
  };
  function t(k) { return (MSG[window.LANG] || MSG.ko)[k] || k; }

  /* parts per studio + prefill from ?studio= */
  /* option labels follow the language: <option data-ko data-en> */
  function relabel() {
    Array.prototype.slice.call(form.querySelectorAll('option[data-ko]')).forEach(function (o) { o.textContent = window.LANG === 'en' ? o.getAttribute('data-en') : o.getAttribute('data-ko'); });
  }
  var PLACEHOLDER = '<option value="" data-ko="선택" data-en="Select">선택</option>';
  var notices = Array.prototype.slice.call(document.querySelectorAll('.rform__notice[data-for]'));
  var NO_ONLINE = { faust: true, 'layer-10': true };
  function fillParts(key) {
    var s = studios.filter(function (x) { return x.key === key; })[0];
    sPart.innerHTML = '';
    if (!s) { sPart.innerHTML = PLACEHOLDER; relabel(); return; }
    var parts = s.parts.length ? s.parts : ['-'];
    if (parts.length > 1) sPart.insertAdjacentHTML('beforeend', PLACEHOLDER);
    parts.forEach(function (p) { sPart.insertAdjacentHTML('beforeend', '<option value="' + p + '">' + p + '</option>'); });
    sPart.disabled = false; relabel();
  }
  function applyStudioRules(key) {
    var blocked = !!NO_ONLINE[key];
    notices.forEach(function (n) { n.hidden = n.getAttribute('data-for') !== key; });
    submit.disabled = blocked;
    if (blocked) err.hidden = true;
  }
  sStudio.addEventListener('change', function () { fillParts(sStudio.value); applyStudioRules(sStudio.value); });
  var pre = new URLSearchParams(location.search).get('studio');
  if (pre && studios.some(function (s) { return s.key === pre; })) { sStudio.value = pre; }
  fillParts(sStudio.value); applyStudioRules(sStudio.value); relabel();
  var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); dDate.min = today;
  sStart.value = '9'; sEnd.value = '18';
  document.addEventListener('langchange', function () { relabel(); document.getElementById('rLang').value = window.LANG; });
  document.getElementById('rLang').value = window.LANG;

  function showError(code) { err.textContent = t(code); err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  form.addEventListener('submit', function (e) {
    e.preventDefault(); err.hidden = true;
    var fd = new FormData(form); var data = {}; fd.forEach(function (v, k) { data[k] = v; });
    var s = studios.filter(function (x) { return x.key === data.studio; })[0];
    if (!s) return showError('studio');
    if (NO_ONLINE[s.key]) return;
    if (!data.purpose) return showError('purpose');
    if (s.parts.length > 1 && !data.part) return showError('part');
    if (!data.date) return showError('date');
    if (data.date < today) return showError('date-past');
    if (+data.end <= +data.start) return showError('time');
    if (+data.end - +data.start < s.min) return showError('min-hours');
    if (!data.company.trim()) return showError('company');
    if (!data.contact.trim()) return showError('contact');
    if (data.phone.replace(/\D/g, '').length < 7) return showError('phone');
    if (!form.consent.checked) return showError('consent');
    if (!data.part) data.part = s.parts[0] || '-';
    submit.disabled = true; var label = submit.innerHTML; submit.textContent = t('sending');
    fetch('/api/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.body || !res.body.ok) throw new Error(res.body && res.body.error || 'network');
        form.hidden = true; done.hidden = false;
        doneMeta.textContent = s.title + ' · ' + data.date + ' · ' + String(data.start).padStart(2, '0') + ':00–' + String(data.end).padStart(2, '0') + ':00';
        done.scrollIntoView({ block: 'start', behavior: 'smooth' });
      })
      .catch(function (e) { showError(MSG.ko[e.message] ? e.message : 'network'); submit.disabled = false; submit.innerHTML = label; });
  });

  /* menu */
  var menu = document.getElementById('menu'), toggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  function toggleMenu(force) { var open = typeof force === 'boolean' ? force : menu.hidden; menu.hidden = !open; document.body.classList.toggle('menu-open', open); toggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); }); }
  toggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });
})();
