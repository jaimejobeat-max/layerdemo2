/* Layer Studios — reservation request (stepper UI, two steps) */
(function () {
  'use strict';
  var form = document.getElementById('rform'); if (!form) return;
  var studios = window.RESERVE_STUDIOS || [];
  var NO_ONLINE = { faust: true, 'layer-10': true };
  var $ = function (id) { return document.getElementById(id); };
  var hidden = { studio: $('rStudio'), part: $('rPart'), start: $('rStart'), end: $('rEnd'), purpose: $('rPurpose'), people: $('rPeople'), vehicles: $('rVehicles') };
  var dateInput = $('rDate'), partsBox = $('rParts'), step1 = $('step1'), step2 = $('step2'), err1 = $('rError1'), err = $('rError'), done = $('rDone');
  var MSG = {
    ko: { studio: '지점을 선택해 주세요.', part: '파트를 선택해 주세요.', date: '날짜를 선택해 주세요.', 'date-past': '지난 날짜는 신청할 수 없습니다.', time: '시작 시간이 종료 시간보다 앞서야 합니다.', 'min-hours': '최소 대관 시간보다 짧습니다.', company: '업체명(예약자명)을 입력해 주세요.', contact: '담당자를 입력해 주세요.', phone: '연락 가능한 전화번호를 입력해 주세요.', email: '이메일 형식을 확인해 주세요.', consent: '정보 수집에 동의해 주세요.', network: '전송에 실패했습니다. 잠시 후 다시 시도하거나 02-336-7750으로 연락해 주세요.', sending: '보내는 중…', offline: '이 지점은 온라인 신청을 받지 않습니다.' },
    en: { studio: 'Please choose a studio.', part: 'Please choose a part.', date: 'Please choose a date.', 'date-past': 'The date has already passed.', time: 'Start must be before end.', 'min-hours': 'Shorter than the minimum booking.', company: 'Please enter your company or name.', contact: 'Please enter a contact person.', phone: 'Please enter a phone number.', email: 'Please check the email address.', consent: 'Please agree to the data use.', network: 'Could not send. Please try again or call +82-2-336-7750.', sending: 'Sending…', offline: 'This studio is not bookable online.' }
  };
  var PURPOSE = { photo: { ko: '사진', en: 'Photography' }, video: { ko: '영상', en: 'Filming' }, event: { ko: '행사', en: 'Event' } };
  var DAYS = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
  var MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function L() { return window.LANG === 'en' ? 'en' : 'ko'; }
  function t(k) { return MSG[L()][k] || k; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(h) { return pad(Math.floor(h)) + ':' + (h % 1 ? '30' : '00'); } // 9.5 → 09:30

  /* ---------- state ---------- */
  var todayKst = new Date(Date.now() + 9 * 3600e3); var today = todayKst.toISOString().slice(0, 10);
  var state = { studioIdx: -1, date: '', start: 9, end: 18, purpose: 'photo', people: 10, vehicles: 1 };
  var pre = new URLSearchParams(location.search).get('studio');
  var preIdx = studios.findIndex(function (s) { return s.key === pre; });
  state.studioIdx = preIdx > -1 ? preIdx : 0;
  state.date = today;

  function studio() { return studios[state.studioIdx]; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); var wd = d.getUTCDay();
    return L() === 'en' ? DAYS.en[wd] + ', ' + p[2] + ' ' + MONTHS_EN[p[1] - 1] : p[1] + '월 ' + p[2] + '일 (' + DAYS.ko[wd] + ')';
  }
  function shiftDate(iso, n) { var p = iso.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); }

  /* ---------- render ---------- */
  function val(field, text) { document.querySelector('.stp[data-field="' + field + '"] [data-value]').textContent = text; }
  function renderParts() {
    var s = studio(); partsBox.innerHTML = '';
    if (!s.parts.length) { hidden.part.value = '-'; return; }
    var keep = hidden.part.value.split('+').filter(Boolean);
    s.parts.forEach(function (p) {
      var on = keep.indexOf(p) > -1 || (s.parts.length === 1);
      partsBox.insertAdjacentHTML('beforeend', '<label class="rform__chip"><input type="checkbox" value="' + p + '"' + (on ? ' checked' : '') + '><span>' + p + '</span></label>');
    });
    syncParts();
  }
  function syncParts() { hidden.part.value = Array.prototype.slice.call(partsBox.querySelectorAll('input:checked')).map(function (i) { return i.value; }).join('+'); }
  function render() {
    var s = studio();
    hidden.studio.value = s.key; val('studio', s.title);
    Array.prototype.slice.call(document.querySelectorAll('.rsv__notice[data-for]')).forEach(function (n) { n.hidden = n.getAttribute('data-for') !== s.key; });
    $('toStep2').disabled = !!NO_ONLINE[s.key];
    dateInput.value = state.date; dateInput.min = today; val('date', fmtDate(state.date));
    hidden.start.value = state.start; hidden.end.value = state.end; val('start', hm(state.start)); val('end', hm(state.end));
    hidden.purpose.value = state.purpose; val('purpose', PURPOSE[state.purpose][L()]);
    hidden.people.value = state.people; val('people', state.people + (L() === 'en' ? '' : '명'));
    hidden.vehicles.value = state.vehicles; val('vehicles', state.vehicles + (L() === 'en' ? '' : '대'));
    $('rLang').value = L();
  }

  /* ---------- steppers ---------- */
  var PURPOSES = ['photo', 'video', 'event'];
  function step(field, dir) {
    var s = studio();
    if (field === 'studio') { state.studioIdx = (state.studioIdx + dir + studios.length) % studios.length; hidden.part.value = ''; renderParts(); }
    else if (field === 'date') { var n = shiftDate(state.date, dir); if (n >= today) state.date = n; }
    else if (field === 'start') { state.start = Math.min(23.5, Math.max(6, state.start + dir * 0.5)); if (state.end <= state.start) state.end = Math.min(24, state.start + s.min); }
    else if (field === 'end') { state.end = Math.min(24, Math.max(6.5, state.end + dir * 0.5)); if (state.end <= state.start) state.start = Math.max(6, state.end - s.min); }
    else if (field === 'purpose') { state.purpose = PURPOSES[(PURPOSES.indexOf(state.purpose) + dir + 3) % 3]; }
    else if (field === 'people') { state.people = Math.min(300, Math.max(1, state.people + dir)); }
    else if (field === 'vehicles') { state.vehicles = Math.min(50, Math.max(0, state.vehicles + dir)); }
    err1.hidden = true; render();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.stp__btn'); if (!b) return;
    step(b.closest('.stp').getAttribute('data-field'), +b.getAttribute('data-dir'));
  });
  /* hold-to-repeat for arrows */
  var holdTimer, holdInt;
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('.stp__btn'); if (!b) return; var f = b.closest('.stp').getAttribute('data-field'), d = +b.getAttribute('data-dir');
    holdTimer = setTimeout(function () { holdInt = setInterval(function () { step(f, d); }, 90); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, function () { clearTimeout(holdTimer); clearInterval(holdInt); }); });
  /* ---------- pickers: click the value to choose directly ---------- */
  function options(field) {
    var s = studio(), L_ = L();
    if (field === 'studio') return studios.map(function (x, i) { return { v: i, t: x.title, on: i === state.studioIdx }; });
    if (field === 'start') { var a = []; for (var h = 6; h <= 23.5; h += 0.5) a.push({ v: h, t: hm(h), on: h === state.start }); return a; }
    if (field === 'end') { var b = []; for (var h2 = 6.5; h2 <= 24; h2 += 0.5) b.push({ v: h2, t: hm(h2), on: h2 === state.end }); return b; }
    if (field === 'purpose') return PURPOSES.map(function (k) { return { v: k, t: PURPOSE[k][L_], on: k === state.purpose }; });
    if (field === 'people') { var c = []; for (var n = 1; n <= 100; n++) c.push({ v: n, t: n + (L_ === 'en' ? '' : '명'), on: n === state.people }); return c; }
    return null;
  }
  function pick(field, v) {
    var s = studio();
    if (field === 'studio') { state.studioIdx = v; hidden.part.value = ''; renderParts(); }
    else if (field === 'start') { state.start = v; if (state.end <= state.start) state.end = Math.min(24, state.start + s.min); }
    else if (field === 'end') { state.end = v; if (state.end <= state.start) state.start = Math.max(6, state.end - s.min); }
    else if (field === 'purpose') state.purpose = v;
    else if (field === 'people') state.people = v;
    err1.hidden = true; render();
  }
  function closeMenus() { Array.prototype.slice.call(document.querySelectorAll('[data-menu]')).forEach(function (m) { m.hidden = true; }); }
  function openMenu(stp) {
    var field = stp.getAttribute('data-field'); var menu = stp.querySelector('[data-menu]'); if (!menu) return;
    if (field === 'date') { try { dateInput.showPicker(); } catch (e) { dateInput.focus(); } return; }
    var opts = options(field); if (!opts) return;
    var wasOpen = !menu.hidden; closeMenus(); if (wasOpen) return;
    menu.innerHTML = '<ul class="stp__list" role="listbox">' + opts.map(function (o) { return '<li><button type="button" role="option" aria-selected="' + o.on + '" data-pick="' + o.v + '"' + (o.on ? ' class="is-on"' : '') + '>' + o.t + '</button></li>'; }).join('') + '</ul>';
    menu.hidden = false;
    var on = menu.querySelector('.is-on'); if (on) on.scrollIntoView({ block: 'center' });
  }
  document.addEventListener('click', function (e) {
    var pickBtn = e.target.closest('[data-pick]');
    if (pickBtn) { var stp = pickBtn.closest('.stp'); var f = stp.getAttribute('data-field'); var raw = pickBtn.getAttribute('data-pick'); pick(f, f === 'purpose' ? raw : +raw); closeMenus(); return; }
    var valBtn = e.target.closest('.stp__value:not(.stp__value--static)');
    if (valBtn) { openMenu(valBtn.closest('.stp')); return; }
    if (!e.target.closest('[data-menu]')) closeMenus();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });
  /* date value → native picker (handled in openMenu) */
  dateInput.addEventListener('change', function () { if (dateInput.value && dateInput.value >= today) { state.date = dateInput.value; render(); } });
  partsBox.addEventListener('change', syncParts);
  document.addEventListener('langchange', render);

  /* ---------- step 1 → 2 ---------- */
  function check1() {
    var s = studio();
    if (NO_ONLINE[s.key]) return 'offline';
    syncParts(); if (s.parts.length && !hidden.part.value) return 'part';
    if (!state.date) return 'date'; if (state.date < today) return 'date-past';
    if (state.end <= state.start) return 'time'; if (state.end - state.start < s.min) return 'min-hours';
    return null;
  }
  function summary() {
    var s = studio(); var parts = hidden.part.value && hidden.part.value !== '-' ? ' · ' + hidden.part.value : '';
    return s.title + parts + ' · ' + fmtDate(state.date) + ' · ' + hm(state.start) + '–' + hm(state.end) + ' · ' + PURPOSE[state.purpose][L()];
  }
  $('toStep2').addEventListener('click', function () {
    var c = check1(); if (c) { err1.textContent = t(c); err1.hidden = false; return; }
    $('rSummary').textContent = summary(); step1.hidden = true; step2.hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(function () { form.company.focus(); }, 300);
  });
  $('toStep1').addEventListener('click', function () { step2.hidden = true; step1.hidden = false; err.hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- submit ---------- */
  function showError(code) { err.textContent = t(code); err.hidden = false; }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err.hidden = true;
    var c = check1(); if (c) { step2.hidden = true; step1.hidden = false; err1.textContent = t(c); err1.hidden = false; return; }
    var fd = new FormData(form); var data = {}; fd.forEach(function (v, k) { data[k] = v; });
    if (!data.company.trim()) return showError('company');
    if (!data.contact.trim()) return showError('contact');
    if (data.phone.replace(/\D/g, '').length < 7) return showError('phone');
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return showError('email');
    if (!form.consent.checked) return showError('consent');
    var submit = $('rSubmit'); submit.disabled = true; var label = submit.innerHTML; submit.textContent = t('sending');
    fetch('/api/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.body || !res.body.ok) throw new Error(res.body && res.body.error || 'network');
        form.hidden = true; done.hidden = false; $('rDoneMeta').textContent = summary();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (e) { showError(MSG.ko[e.message] ? e.message : 'network'); submit.disabled = false; submit.innerHTML = label; });
  });

  /* ---------- menu ---------- */
  var menu = $('menu'), toggles = Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]'));
  function toggleMenu(force) { var open = typeof force === 'boolean' ? force : menu.hidden; menu.hidden = !open; document.body.classList.toggle('menu-open', open); toggles.forEach(function (b) { b.setAttribute('aria-expanded', String(open)); }); }
  toggles.forEach(function (b) { b.addEventListener('click', function () { toggleMenu(); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) toggleMenu(false); });

  /* ---------- init ---------- */
  renderParts(); render();
})();
