/*
 * plusjun.com 뉴예약 (board_no=4) write form — the customer fills fields, the post body is built from them.
 *
 * Pasted into the Cafe24 skin board/reservation/write.html, right after the branch guard script.
 * The form is regrouped into four numbered sections (일정 / 대관 정보 / 예약자 정보 / 요청 사항):
 * Cafe24's own 스튜디오 예약, 예약자/업체명, 이메일 and 비밀번호 inputs are moved into them (still
 * inside the form, so Cafe24 posts them as before; a logged-in member has no 예약자/업체명 or 이메일
 * input, so the form adds its own, which only fill the body lines), and every "* 항목 :" line of the branch template
 * gets a field, plus a free "요청 사항" box written after 입금자명. The Froala editor stays in the
 * page but hidden: the fields write into it, and on 예약하기 the customer reviews a summary in a
 * confirm dialog before Cafe24 posts it. Cafe24 still stores one ordinary post (title = branch,
 * body = template), so notifications and staff reading are unchanged. The branch's notice lines
 * (주차·위약금) are shown as a card since the body is hidden.
 * Date/time/part output matches the schedule-board post format (api/reserve.js buildPost):
 * "2026년 11월 8일(일)", "10:00 - 15:00 (5시간)", "A+C".
 * Required: name, date, part, time (each with a 미정 escape), phone, password, consent.
 * Moving inputs and hiding the editor is the very last step, so if anything fails before it the
 * old form stays usable. Plain ES5 on purpose: in-app browsers (KakaoTalk, Instagram) open this page too.
 */
(function () {
  // keys must equal the skin's <option value> strings exactly; parts = what the schedule boards use.
  // park: hint shown beside 차량 (text) and the count above which it turns into a warning (max);
  // days overrides max by weekday (getDay(): 5 = 금, 6 = 토). Numbers follow each branch template's 주차 line.
  var BRANCHES = {
    'LAYER 57': { parts: ['1F', '2F', '3F', '4F', '5F'], min: 4, park: { text: '주차 5대 가능', max: 5 } },
    'LAYER 7': { parts: ['A', 'B', 'C'], min: 4, park: { text: '주차 최대 6대 (차고지 3~4대 · 옆 교회 2대, 금·토는 교회 주차 불가)', max: 6, days: { 5: 4, 6: 4 } } },
    'LAYER 11': { parts: ['A', 'B', 'Cafe'], min: 4, park: { text: '주차 팀당 2대 · 추가 차량은 유료주차장 이용', max: 2 } },
    'LAYER 41': { parts: ['A', 'B', 'C'], min: 4, park: { text: '주차 최대 5대 (차고지 2대 · 200m 밖 야외 3대)', max: 5 } },
    'LAYER 26': { parts: ['A', 'B'], min: 4, park: { text: '주차 2대 (지점 앞 전용 라인)', max: 2 } },
    'LAYER 27': { parts: ['A', 'Office'], min: 4, park: { text: '주차 2대 (지점 앞 전용 라인)', max: 2 } },
    'LAYER 20': { parts: ['1F', '2F', '3F', 'Caravan'], min: 4, park: { text: '주차 5~8대 (스튜디오 차고지)', max: 8 } },
    'LAYER HANNAM': { parts: ['1F', '2F'], min: 4, park: { text: '주차 2~3대 (스튜디오 차고지)', max: 3 } },
    '홍대': { parts: ['A', 'B', 'D', 'Back Garden', 'Greenhouse', 'Garden'], min: 2, park: { text: '주차 팀당 1대 · 추가 차량은 유료주차장 이용', max: 1 } }
  };
  var PURPOSES = ['사진 촬영', '영상 촬영', '행사'];
  var PART_ALL = '전체 대관';
  var PART_TBD = '미정 (상담 후 결정)';
  var TBD = '미정 (협의)';
  // the free-text line's name in the body, the confirm dialog and the #예약-알림 alert ("* 요청 사항 :")
  var NOTE_LABEL = '요청 사항';
  // #예약-알림으로 보내는 곳 (schedule 앱, cal/schedule/app/api/reservation-alert)
  var ALERT_URL = 'https://schedule-nu-taupe.vercel.app/api/reservation-alert';
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var FIRST_MIN = 6 * 60, LAST_MIN = 24 * 60, STEP = 30;

  var form = document.getElementById('boardWriteForm');
  var select = document.getElementById('subject');
  if (!form || !select || document.getElementById('lr-fields')) return;
  // edit / reply open this form with the post's own body (Cafe24 skips the template swap when #no exists);
  // syncing empty fields there would blank the existing lines
  if (document.getElementById('no') || /[?&]board_act=(edit|reply)\b/.test(location.search)) return;

  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? String(el.value || '').replace(/\s+/g, ' ').replace(/^ | $/g, '') : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function branch() { return select.selectedIndex > 0 ? BRANCHES[select.value] || null : null; }
  function boxOf(el) {
    while (el && el !== form) {
      if (/(^|\s)reserv_box(\s|$)/.test(el.className || '')) return el;
      el = el.parentNode;
    }
    return null;
  }
  // source newlines are layout-only in HTML (the templates put one after every <br>), so drop them first
  function htmlText(html) {
    return String(html).replace(/[\r\n]+/g, '').replace(/<br[^>]*>/gi, '\n').replace(/<\/(p|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  // Cafe24's own inputs that move into the new sections. A logged-in member gets no 예약자/업체명, 이메일
  // or consent inputs (Cafe24 posts under the member's name), so the form shows its own name and email
  // inputs instead; those only fill the body lines and are never posted as fields.
  var cafe = { writer: $('writer'), email1: $('email1'), email2: $('email2'), email3: $('email3'), password: $('password') };
  var ownWriter = !cafe.writer, ownEmail = !(cafe.email1 && cafe.email2 && cafe.email3);
  var regroup = !!boxOf(select);

  /* ---------- markup ---------- */

  function timeOptions(placeholder, from, to) {
    var html = '<option value="">' + placeholder + '</option>';
    for (var m = from; m <= to; m += STEP) html += '<option value="' + m + '">' + hm(m) + '</option>';
    return html;
  }

  // no name attributes anywhere: these inputs sit inside the Cafe24 form and must not be posted with it
  function chip(value, soft) {
    return '<label class="lr-chip' + (soft ? ' lr-chip--soft' : '') + '"><input type="checkbox" value="' + esc(value) + '"><span>' + esc(value) + '</span></label>';
  }

  function row(label, inner, id, extra) {
    return '<div class="lr-row' + (extra ? ' ' + extra : '') + '"><span class="lr-label">' + label + '</span><div class="lr-value"' + (id ? ' id="' + id + '"' : '') + '>' + inner + '</div></div>';
  }

  function section(num, title, body, note) {
    return '<section class="lr-sec"><div class="lr-sec-head"><span class="lr-sec-num">' + num + '</span><span class="lr-sec-title">' + title + '</span>' +
      (note ? '<span class="lr-sec-note">' + note + '</span>' : '') + '</div>' + body + '</section>';
  }

  var C = '#lr-fields ';
  var css = '' +
    '#lr-fields{clear:both;padding:6px 0 8px;color:#111;font-size:14px}' +
    C + '.lr-sec{margin:0 0 40px}' +
    C + '.lr-sec:first-of-type{margin-top:28px}' +
    C + '.lr-sec-head{display:flex;align-items:baseline;gap:10px;padding:0 0 10px;margin:0 0 22px;border-bottom:1px solid #000}' +
    C + '.lr-sec-num{font-size:12px;letter-spacing:.1em;color:#000}' +
    C + '.lr-sec-title{font-size:16px;font-weight:500;letter-spacing:-.01em}' +
    C + '.lr-sec-note{margin-left:auto;font-size:12px;color:#999}' +
    C + '.lr-row{display:flex;flex-wrap:wrap;align-items:flex-start;padding:0 0 14px}' +
    C + '.lr-label{flex:0 0 140px;box-sizing:border-box;padding-right:12px;font-size:14px;line-height:40px;color:#333}' +
    C + '.lr-label em{font-style:normal;color:#000;margin-left:2px}' +
    C + '.lr-value{flex:1 1 300px;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
    // one field style for everything typed or picked from a list: grey fill, black edge on focus
    C + 'input[type=text],' + C + 'input[type=tel],' + C + 'input[type=number],' + C + 'input[type=password],' + C + 'input[type=date],' + C + 'select,' + C + 'textarea{' +
      // width:auto because the skin stretches every select to 100%; the lr-w-* classes size each field
      'box-sizing:border-box;width:auto;height:40px;margin:0;padding:0 12px;border:1px solid transparent;border-radius:0;background:#f3f3f3;color:#111;font:inherit;font-size:14px;outline:none;-webkit-appearance:none;appearance:none;box-shadow:none}' +
    C + 'select{padding-right:30px;background:#f3f3f3 url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%276%27%3E%3Cpath d=%27M0 0l5 6 5-6z%27 fill=%27%23111%27/%3E%3C/svg%3E") no-repeat right 12px center}' +
    C + 'input:focus,' + C + 'select:focus,' + C + 'textarea:focus{border-color:#000;background-color:#fff}' +
    C + 'input:disabled,' + C + 'select:disabled{color:#bbb}' +
    C + 'input[readonly]{color:#555}' +
    C + '.lr-w-full{flex:1 1 260px;min-width:0;max-width:420px}' +
    C + '.lr-w-select{flex:0 1 auto;min-width:240px}' +
    C + '.lr-w-date{flex:0 0 auto;min-width:168px}' +
    C + '.lr-w-time{flex:0 0 auto;min-width:104px}' +
    C + '.lr-w-num{flex:0 0 80px;width:80px}' +
    C + '.lr-w-mail{flex:1 1 120px;min-width:0;max-width:170px}' +
    // the skin forces textarea min-height:320px !important below 880px; ours wins on specificity
    C + 'textarea{flex:1 1 100%;height:120px;min-height:96px!important;padding:12px;line-height:1.6;resize:vertical}' +
    C + '.lr-dash,' + C + '.lr-unit{color:#888;font-size:13px}' +
    C + '.lr-unit--pre{margin-left:6px}' +
    C + '.lr-unit--pre:first-child{margin-left:0}' +
    C + '.lr-hours{margin-left:4px;font-size:13px;color:#000;font-weight:500}' +
    C + '.lr-park{margin-left:10px;font-size:12px;line-height:1.5;color:#999}' +
    C + '.lr-park.is-over{color:#000;font-weight:500}' +
    C + '.lr-chip{position:relative;display:inline-block;cursor:pointer}' +
    C + '.lr-chip input{position:absolute;opacity:0;width:1px;height:1px;margin:0}' +
    C + '.lr-chip span{display:inline-block;box-sizing:border-box;min-width:48px;height:40px;line-height:38px;padding:0 16px;border:1px solid #ccc;background:#fff;color:#111;font-size:14px;text-align:center;user-select:none;transition:border-color .15s,background-color .15s}' +
    C + '.lr-chip:hover span{border-color:#000}' +
    C + '.lr-chip input:checked+span{background:#000;border-color:#000;color:#fff}' +
    C + '.lr-chip input:checked+span:before{content:"✓";margin-right:6px;font-size:12px}' +
    C + '.lr-chip input:focus-visible+span{outline:2px solid #000;outline-offset:2px}' +
    C + '.lr-chip--soft span{color:#777}' +
    C + '.lr-check{display:inline-flex;align-items:center;gap:6px;margin-left:6px;font-size:13px;color:#555;cursor:pointer;white-space:nowrap}' +
    C + '.lr-check input{margin:0;width:16px;height:16px;accent-color:#000}' +
    C + '.lr-hint,' + C + '.lr-warn{flex-basis:100%;margin:2px 0 0;font-size:12px;line-height:1.6}' +
    C + '.lr-hint{color:#999}' +
    C + '.lr-warn{color:#000;font-weight:500}' +
    C + '.lr-summary{margin:6px 0 0 140px;padding:12px 16px;border-left:3px solid #000;background:#f5f5f5}' +
    C + '.lr-summary small{display:block;font-size:11px;letter-spacing:.06em;color:#666}' +
    C + '.lr-summary b{display:block;margin-top:2px;font-size:15px;font-weight:500}' +
    C + '.lr-summary.is-empty b{font-weight:400;font-size:13px;color:#999}' +
    // 04 asks a question over a full-width box instead of a label column
    C + '.lr-ask-q{display:block;margin:0;font-size:15px;font-weight:500;line-height:1.5;color:#111;cursor:pointer}' +
    C + '.lr-ask-q span{margin-left:4px;font-size:13px;font-weight:400;color:#999}' +
    C + '.lr-ask-help{margin:4px 0 12px;font-size:13px;line-height:1.6;color:#888}' +
    C + '.lr-ask textarea{display:block;width:100%}' +
    C + '.lr-guide{margin:20px 0 0;padding:16px 18px;background:#f7f7f7}' +
    C + '.lr-guide strong,#lr-confirm .lr-guide strong{display:block;margin-bottom:6px;font-size:13px;font-weight:500}' +
    // the skin removes list bullets, so draw our own
    '#lr-fields .lr-guide ul,#lr-confirm .lr-guide ul{margin:0;padding:0;list-style:none}' +
    '#lr-fields .lr-guide li,#lr-confirm .lr-guide li{position:relative;margin:0 0 4px;padding-left:12px;font-size:13px;line-height:1.6;color:#444;list-style:none}' +
    '#lr-fields .lr-guide li:before,#lr-confirm .lr-guide li:before{content:"";position:absolute;left:0;top:.75em;width:4px;height:4px;border-radius:50%;background:#000}' +
    '#lr-fields .lr-guide li span,#lr-confirm .lr-guide li span{display:block;color:#888;font-size:12px}' +
    C + '[hidden]{display:none!important}' +
    '@media (max-width:640px){' +
      C + '.lr-sec{margin-bottom:32px}' +
      C + '.lr-label{flex-basis:100%;line-height:1.5;margin-bottom:8px}' +
      C + '.lr-value{flex-basis:100%}' +
      C + '.lr-w-full,' + C + '.lr-w-select,' + C + '.lr-w-date{flex:1 1 100%;max-width:none;min-width:0}' +
      C + '.lr-w-time{flex:1 1 0;min-width:112px}' +
      C + '.lr-w-mail{flex:1 1 0;max-width:none}' +
      C + '#email3{flex:1 1 100%}' +
      C + '.lr-check{margin-left:0;margin-right:10px}' +
      C + '.lr-park{flex-basis:100%;margin-left:0}' +
      C + '.lr-summary,' + C + '.lr-guide{margin-left:0}' +
    '}' +
    '#lr-confirm{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.5)}' +
    '#lr-confirm[hidden]{display:none}' +
    '#lr-confirm .lr-panel{box-sizing:border-box;display:flex;flex-direction:column;width:100%;max-width:520px;max-height:calc(100vh - 32px);background:#fff;color:#111}' +
    '#lr-confirm .lr-head{padding:22px 24px 16px;border-bottom:1px solid #000}' +
    '#lr-confirm .lr-head small{display:block;font-size:11px;letter-spacing:.1em;color:#000}' +
    '#lr-confirm .lr-head b{display:block;margin-top:4px;font-size:19px;font-weight:500}' +
    '#lr-confirm .lr-head span{display:block;margin-top:4px;font-size:13px;color:#888}' +
    '#lr-confirm .lr-body{flex:1 1 auto;overflow:auto;padding:8px 24px 20px}' +
    '#lr-confirm dl{display:grid;grid-template-columns:96px 1fr;margin:0}' +
    '#lr-confirm dt,#lr-confirm dd{margin:0;padding:10px 0;border-bottom:1px solid #eee;font-size:14px;line-height:1.5}' +
    '#lr-confirm dt{color:#888}' +
    '#lr-confirm dd{white-space:pre-wrap;word-break:break-word}' +
    '#lr-confirm .lr-guide{margin-top:16px;padding:14px 16px;background:#f7f7f7}' +
    '#lr-confirm details{margin-top:14px;font-size:12px;color:#888}' +
    '#lr-confirm summary{cursor:pointer}' +
    '#lr-confirm pre{margin:8px 0 0;padding:12px;background:#f7f7f7;white-space:pre-wrap;word-break:break-word;font:inherit;font-size:12px;line-height:1.6;color:#555}' +
    '#lr-confirm .lr-actions{display:flex;gap:8px;padding:14px 24px 20px;border-top:1px solid #eee}' +
    '#lr-confirm button{flex:1 1 0;height:48px;border:1px solid #000;border-radius:0;background:#fff;color:#111;font:inherit;font-size:15px;cursor:pointer}' +
    '#lr-confirm button.lr-ok{flex-grow:1.4;background:#000;color:#fff}';

  var purposeChips = '';
  for (var pi = 0; pi < PURPOSES.length; pi++) purposeChips += chip(PURPOSES[pi]);

  var box = document.createElement('div');
  box.id = 'lr-fields';
  box.innerHTML = '<style>' + css + '</style>' +
    section('01', '일정',
      (regroup ? row('스튜디오 예약<em>*</em>', '', 'lr-slot-branch') : '') +
      row('대관 날짜<em>*</em>',
        '<input type="date" class="lr-w-date" id="lr-date" aria-label="대관 날짜">' +
        '<span id="lr-end-wrap" hidden style="display:contents"><span class="lr-dash">~</span><input type="date" class="lr-w-date" id="lr-date-end" aria-label="마지막 날짜"></span>' +
        '<label class="lr-check"><input type="checkbox" id="lr-multi">여러 날</label>' +
        '<label class="lr-check"><input type="checkbox" id="lr-date-tbd">날짜 미정</label>') +
      row('대관 파트<em>*</em>', '', 'lr-parts') +
      row('대관 시간<em>*</em>',
        '<select class="lr-w-time" id="lr-start" aria-label="시작 시간">' + timeOptions('시작', FIRST_MIN, LAST_MIN - STEP) + '</select>' +
        '<span class="lr-dash">~</span>' +
        '<select class="lr-w-time" id="lr-end" aria-label="종료 시간">' + timeOptions('종료', FIRST_MIN + STEP, LAST_MIN) + '</select>' +
        '<span class="lr-hours" id="lr-hours"></span>' +
        '<label class="lr-check"><input type="checkbox" id="lr-time-tbd">시간 미정·협의</label>' +
        '<p class="lr-warn" id="lr-min-warn" hidden></p>' +
        '<p class="lr-hint">세팅·철수를 포함한 입실~퇴실 시간이에요. 파트마다 시간이 다르면 \'' + NOTE_LABEL + '\'에 적어 주세요.</p>') +
      '<div class="lr-summary is-empty" id="lr-summary"><small>선택한 일정</small><b id="lr-summary-text"></b></div>',
      '<em style="font-style:normal;color:#000">*</em> 필수') +
    section('02', '대관 정보',
      row('대관 내용',
        '<span id="lr-purpose" style="display:contents">' + purposeChips + '</span>' +
        '<input type="text" class="lr-w-full" id="lr-purpose-note" maxlength="100" placeholder="촬영·행사 내용 (예: 의류 화보, 뮤직비디오, 브랜드 팝업)" aria-label="대관 내용" style="max-width:none;flex-basis:100%">') +
      row('인원 · 차량',
        '<span class="lr-unit lr-unit--pre">인원</span><input type="number" class="lr-w-num" id="lr-people" min="1" max="999" inputmode="numeric" aria-label="이용 인원수"><span class="lr-unit">명</span>' +
        '<span class="lr-unit lr-unit--pre" style="margin-left:18px">차량</span><input type="number" class="lr-w-num" id="lr-cars" min="0" max="99" inputmode="numeric" aria-label="방문 차량수"><span class="lr-unit">대</span>' +
        '<span class="lr-park" id="lr-park" aria-live="polite"></span>')) +
    section('03', '예약자 정보',
      (regroup || ownWriter ? row('예약자/업체명<em>*</em>', ownWriter ? '<input type="text" class="lr-w-full" id="lr-writer" maxlength="50" placeholder="예약자 성함 또는 업체명" aria-label="예약자/업체명">' : '', 'lr-slot-writer') : '') +
      row('담당자명', '<input type="text" class="lr-w-full" id="lr-manager" maxlength="30" autocomplete="name" aria-label="담당자명">') +
      row('연락처<em>*</em>', '<input type="tel" class="lr-w-full" id="lr-phone" maxlength="30" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" aria-label="연락처">') +
      (regroup || ownEmail ? row('이메일', ownEmail ? '<input type="text" class="lr-w-full" id="lr-email" maxlength="100" inputmode="email" autocomplete="email" aria-label="이메일">' : '', 'lr-slot-email') : '') +
      row('입금자명', '<input type="text" class="lr-w-full" id="lr-payer" maxlength="30" placeholder="예약자와 다를 때만 적어 주세요" aria-label="입금자명">') +
      (regroup && cafe.password ? row('글 비밀번호<em>*</em>', '<p class="lr-hint">신청 글을 다시 확인할 때 필요해요.</p>', 'lr-slot-password') : '')) +
    section('04', '요청 사항',
      '<div class="lr-ask"><label class="lr-ask-q" for="lr-note">더 알려 주실 내용이 있나요?<span>(선택)</span></label>' +
        '<p class="lr-ask-help" id="lr-note-help">파트별 시간이 다르거나 주차·장비 문의가 있다면 적어 주세요.</p>' +
        '<textarea id="lr-note" maxlength="1000" rows="4" aria-describedby="lr-note-help"></textarea></div>' +
      '<div class="lr-guide" id="lr-guide" hidden></div>');

  var editorBox = document.querySelector('.reserv_content') || (document.getElementById('content') || {}).parentNode;
  if (editorBox && editorBox.parentNode) editorBox.parentNode.insertBefore(box, editorBox);
  else select.parentNode.parentNode.appendChild(box);

  // outside the form so its buttons can never submit it
  var dialog = document.createElement('div');
  dialog.id = 'lr-confirm';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'lr-confirm-title');
  dialog.innerHTML = '<div class="lr-panel"><div class="lr-head"><small>RESERVATION</small><b id="lr-confirm-title">신청 내용을 확인해 주세요</b><span id="lr-confirm-sub"></span></div>' +
    '<div class="lr-body" id="lr-confirm-body"><dl id="lr-confirm-list"></dl><div class="lr-guide" id="lr-confirm-guide" hidden></div>' +
    '<details><summary>등록될 글 원문 보기</summary><pre id="lr-confirm-text"></pre></details></div>' +
    '<div class="lr-actions"><button type="button" id="lr-confirm-back">수정하기</button><button type="button" class="lr-ok" id="lr-confirm-ok">이대로 예약하기</button></div></div>';
  document.body.appendChild(dialog);

  var today = new Date();
  $('lr-date').min = $('lr-date-end').min = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

  /* ---------- branch-dependent parts ---------- */

  function renderParts() {
    var b = branch();
    var html = '';
    if (!b) html = '<p class="lr-hint" style="margin:0;line-height:40px">스튜디오를 먼저 선택해 주세요.</p>';
    else {
      for (var i = 0; i < b.parts.length; i++) html += chip(b.parts[i]);
      html += chip(PART_ALL) + chip(PART_TBD, true);
    }
    $('lr-parts').innerHTML = html;
  }

  // the branch template's lines after the 항목 block (주차·위약금 …), read from Cafe24's own template input;
  // "* …" starts an item, a following "(…)" line belongs to it
  function guideItems() {
    var src = $('fix_content_' + select.selectedIndex);
    var chunks = branch() && src ? String(src.value).split(/<\/h3>/i) : [];
    var lines = chunks.length > 1 ? htmlText(chunks[chunks.length - 1]).split('\n') : [];
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (!line) continue;
      if (/^\*/.test(line) || !items.length) items.push({ text: line.replace(/^\*\s*/, ''), sub: [] });
      else items[items.length - 1].sub.push(line);
    }
    return items;
  }

  function fillGuide(el) {
    var items = guideItems();
    el.innerHTML = '';
    el.hidden = !items.length;
    if (!items.length) return;
    var title = document.createElement('strong');
    title.textContent = select.value + ' 이용 안내';
    var list = document.createElement('ul');
    for (var i = 0; i < items.length; i++) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(items[i].text));
      for (var j = 0; j < items[i].sub.length; j++) {
        var sub = document.createElement('span');
        sub.textContent = items[i].sub[j];
        li.appendChild(sub);
      }
      list.appendChild(li);
    }
    el.appendChild(title);
    el.appendChild(list);
  }

  function checked(id) {
    var out = [], inputs = $(id).getElementsByTagName('input');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].type === 'checkbox' && inputs[i].checked) out.push(inputs[i].value);
    return out;
  }

  // 전체 대관 / 미정 exclude every other choice; picking a part clears them
  $('lr-parts').addEventListener('change', function (e) {
    var t = e.target, inputs = $('lr-parts').getElementsByTagName('input');
    if (!t.checked) return;
    var exclusive = t.value === PART_ALL || t.value === PART_TBD;
    for (var i = 0; i < inputs.length; i++) {
      var other = inputs[i];
      if (other === t) continue;
      if (exclusive || other.value === PART_ALL || other.value === PART_TBD) other.checked = false;
    }
  });

  /* ---------- values ---------- */

  function dateLabel(iso) {
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + WEEKDAYS[d.getDay()] + ')';
  }

  function dayCount(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 864e5) + 1;
  }

  function multi() { return $('lr-multi').checked && !$('lr-date-tbd').checked; }

  function dateText() {
    if ($('lr-date-tbd').checked) return TBD;
    var a = $('lr-date').value, b = $('lr-date-end').value;
    if (!a) return '';
    if (multi() && b && b > a) return dateLabel(a) + ' ~ ' + dateLabel(b) + ' (' + dayCount(a, b) + '일)';
    return dateLabel(a);
  }

  function duration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + '시간' : '') + (h && m ? ' ' : '') + (m ? m + '분' : '');
  }

  function times() { return { s: parseInt($('lr-start').value, 10), e: parseInt($('lr-end').value, 10) }; }

  function timeText() {
    if ($('lr-time-tbd').checked) return TBD;
    var t = times();
    if (isNaN(t.s) || isNaN(t.e) || t.e <= t.s) return '';
    return hm(t.s) + ' - ' + hm(t.e) + ' (' + duration(t.e - t.s) + ')';
  }

  function purposeText() {
    var kinds = checked('lr-purpose').join(', '), note = val('lr-purpose-note');
    return kinds && note ? kinds + ' / ' + note : kinds || note;
  }

  function count(id, unit, zero) {
    var n = parseInt(val(id), 10);
    if (isNaN(n) || n < 0) return '';
    return n === 0 && zero ? zero : n + unit;
  }

  function writerText() { return ownWriter ? val('lr-writer') : val('writer'); }

  function emailText() {
    if (ownEmail) return val('lr-email');
    var a = val('email1'), b = val('email2');
    if (a.indexOf('@') > 0) return a;
    return a && b ? a + '@' + b : '';
  }

  function noteText() { return String($('lr-note').value || '').replace(/\r/g, '').replace(/^\s+|\s+$/g, ''); }

  // template line → value; order = template order, used when a line has to be re-added.
  // Regex literals on purpose: saving the skin turns a doubled backslash into a single one and
  // HTML-escapes a question mark followed by ">", so this file must contain neither
  // (no RegExp built from strings). The README has the grep that checks this.
  var LINES = [
    [/(\*\s*대관\s*날짜\s*:)([^<\n]*)/, '대관 날짜', dateText],
    [/(\*\s*대관\s*파트\s*:)([^<\n]*)/, '대관 파트', function () { return checked('lr-parts').join('+'); }],
    [/(\*\s*대관\s*시간\s*:)([^<\n]*)/, '대관 시간', timeText],
    [/(\*\s*대관\s*내용\s*:)([^<\n]*)/, '대관 내용', purposeText],
    [/(\*\s*이용\s*인원수\s*:)([^<\n]*)/, '이용 인원수', function () { return count('lr-people', '명'); }],
    [/(\*\s*방문\s*차량수\s*:)([^<\n]*)/, '방문 차량수', function () { return count('lr-cars', '대', '없음'); }],
    [/(\*\s*업체명\s*:)([^<\n]*)/, '업체명', writerText],
    [/(\*\s*담당자명\s*:)([^<\n]*)/, '담당자명', function () { return val('lr-manager'); }],
    [/(\*\s*연락처\s*:)([^<\n]*)/, '연락처', function () { return val('lr-phone'); }],
    [/(\*\s*이메일\s*:)([^<\n]*)/, '이메일', emailText],
    [/(\*\s*입금자명\s*:)([^<\n]*)/, '입금자명', function () { return val('lr-payer'); }]
  ];
  var PAYER_LINE = LINES[LINES.length - 1][0];

  /* ---------- editor sync ---------- */

  function editor() {
    var ed = window.EC_FROALA_INSTANCE;
    return ed && ed.el ? ed : null;
  }

  function bodyHtml() {
    var ed = editor(), area = document.getElementById('content');
    return ed ? ed.el.innerHTML : (area ? area.value : '');
  }

  function lineValue(raw) { return raw.replace(/&nbsp;/g, ' ').replace(/^\s+|\s+$/g, ''); }

  // 요청 사항 is several lines, so it lives in its own marked span right after the 입금자명 line
  var NOTE_RE = /<span class="lr-note">[\s\S]*?<\/span>/;
  function noteHtml() {
    var text = noteText();
    return text ? '<span class="lr-note"><br>* ' + NOTE_LABEL + ' : ' + esc(text).replace(/\n/g, '<br>') + '</span>' : '';
  }

  // what this script last wrote per line, so an emptied field clears only its own text
  var written = {};

  // A field with a value always wins. An empty field leaves the line alone unless the text there is
  // what this script wrote before — so anything already in the body is never wiped.
  function sync() {
    if (!branch()) return;
    var ed = editor(), area = document.getElementById('content');
    var html = ed ? ed.el.innerHTML : (area ? area.value : null);
    if (html === null) return;
    var next = html.replace(NOTE_RE, ''), missing = [];
    for (var i = 0; i < LINES.length; i++) {
      var key = LINES[i][1], want = esc(LINES[i][2]()), re = LINES[i][0], m = re.exec(next);
      if (!m) {
        if (want) { missing.push('* ' + key + ' : ' + want); written[key] = want; }
        continue;
      }
      var have = lineValue(m[2]);
      if (want ? have !== want : have && have === written[key]) {
        next = next.replace(re, function (all, head) { return head + (want ? ' ' + want : ''); });
      }
      if (want || have === written[key]) written[key] = want;
    }
    if (missing.length) next = missing.join('<br>') + '<br>' + next;
    var note = noteHtml();
    if (note) {
      var last = PAYER_LINE.exec(next);
      var at = last ? last.index + last[0].length : next.length;
      next = next.slice(0, at) + note + next.slice(at);
    }
    if (next === html) return;
    if (ed) { ed.el.innerHTML = next; ed.undo.saveStep(); } else area.value = next;
  }

  function bodyLine(key) {
    for (var i = 0; i < LINES.length; i++) {
      if (LINES[i][1] !== key) continue;
      var m = LINES[i][0].exec(bodyHtml());
      return m ? lineValue(m[2]).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
    }
    return '';
  }

  /* ---------- UI state ---------- */

  function refresh() {
    var dateTbd = $('lr-date-tbd').checked, timeTbd = $('lr-time-tbd').checked;
    $('lr-date').disabled = dateTbd;
    $('lr-multi').disabled = dateTbd;
    $('lr-end-wrap').hidden = !multi();
    if ($('lr-date').value) $('lr-date-end').min = $('lr-date').value;
    $('lr-start').disabled = $('lr-end').disabled = timeTbd;

    var t = times(), b = branch(), span = !timeTbd && !isNaN(t.s) && !isNaN(t.e) && t.e > t.s ? t.e - t.s : 0;
    $('lr-hours').textContent = span ? duration(span) : '';
    var short = span && b && span < b.min * 60;
    $('lr-min-warn').hidden = !short;
    if (short) $('lr-min-warn').textContent = select.value + ' 최소 대관 시간은 ' + b.min + '시간이에요. 짧게 이용하실 경우 \'' + NOTE_LABEL + '\'에 적어 주시면 확인해 드릴게요.';

    // parking hint for this branch; over the limit (per weekday where it differs) it becomes the warning
    var park = b && b.park, cars = parseInt(val('lr-cars'), 10), limit = park ? park.max : 0, dayName = '';
    if (park && park.days && $('lr-date').value && !$('lr-date-tbd').checked) {
      var dp = $('lr-date').value.split('-'), wd = new Date(+dp[0], +dp[1] - 1, +dp[2]).getDay();
      if (park.days[wd] !== undefined) { limit = park.days[wd]; dayName = WEEKDAYS[wd] + '요일에는 '; }
    }
    var over = park && !isNaN(cars) && cars > limit;
    $('lr-park').className = 'lr-park' + (over ? ' is-over' : '');
    $('lr-park').textContent = !park ? '' : over
      ? (dayName ? dayName + '주차가 ' : '주차는 ') + limit + '대까지 가능해요. 나머지 차량은 인근 유료주차장을 이용해 주세요.'
      : park.text;

    var bits = [], parts = checked('lr-parts').join('+');
    if (b) bits.push(select.value);
    if (dateText()) bits.push(dateText());
    if (parts) bits.push(parts);
    if (timeText()) bits.push(timeText());
    var empty = bits.length < 2;
    $('lr-summary').className = 'lr-summary' + (empty ? ' is-empty' : '');
    $('lr-summary-text').textContent = empty ? '스튜디오·날짜·파트·시간을 고르면 여기에 정리돼요.' : bits.join('  ·  ');
    sync();
  }

  box.addEventListener('change', refresh);
  box.addEventListener('input', refresh);

  // 업체명 / 이메일 come from Cafe24's own inputs; Cafe24 fills email2 from the domain select on change
  form.addEventListener('input', function (e) { if (/^(writer|email1|email2)$/.test(e.target.id)) refresh(); });
  form.addEventListener('change', function (e) { if (/^(writer|email1|email2|email3)$/.test(e.target.id)) setTimeout(refresh, 0); });

  // Cafe24 swaps the whole template on branch change (after this listener), so re-fill once it has run
  select.addEventListener('change', function () {
    renderParts();
    fillGuide($('lr-guide'));
    written = {};
    setTimeout(refresh, 0);
  });

  /* ---------- validation ---------- */

  // in the order the customer meets the fields; writer / password / consent repeat Cafe24's own checks
  // so the confirm dialog only opens when the post will actually go through
  function problem() {
    if (!branch()) return null; // the branch guard above handles this case
    if (!$('lr-date-tbd').checked) {
      if (!$('lr-date').value) return { el: $('lr-date'), msg: '대관 날짜를 선택해 주세요.\n아직 정하지 않았다면 \'날짜 미정\'에 체크해 주세요.' };
      if (multi() && !$('lr-date-end').value) return { el: $('lr-date-end'), msg: '여러 날 대관은 마지막 날짜도 선택해 주세요.' };
      if (multi() && $('lr-date-end').value <= $('lr-date').value) return { el: $('lr-date-end'), msg: '마지막 날짜는 첫 날짜보다 뒤여야 해요.' };
    }
    if (!checked('lr-parts').length) return { el: $('lr-parts'), msg: '대관 파트를 선택해 주세요.\n아직 정하지 않았다면 \'미정\'을 선택해 주세요.' };
    if (!$('lr-time-tbd').checked) {
      var t = times();
      if (isNaN(t.s) || isNaN(t.e)) return { el: $('lr-start'), msg: '시작 시간과 종료 시간을 선택해 주세요.\n아직 정하지 않았다면 \'시간 미정·협의\'에 체크해 주세요.' };
      if (t.e <= t.s) return { el: $('lr-end'), msg: '종료 시간은 시작 시간보다 늦어야 해요.' };
    }
    if (!writerText()) return { el: $('writer') || $('lr-writer'), msg: '예약자명 또는 업체명을 적어 주세요.' };
    if ((val('lr-phone') || bodyLine('연락처')).replace(/\D/g, '').length < 9) return { el: $('lr-phone'), msg: '예약 안내를 받으실 연락처를 적어 주세요.' };
    if ($('password') && !$('password').value) return { el: $('password'), msg: '글 비밀번호를 적어 주세요.\n나중에 신청 글을 확인할 때 필요해요.' };
    var consent = $('privacy_agreement_radio0');
    if (consent && !consent.checked) return { el: consent, msg: '개인정보처리방침과 위약금·환불규정에 동의해 주세요.' };
    return null;
  }

  function warn(p) {
    alert(p.msg);
    if (p.el.scrollIntoView) p.el.scrollIntoView({ block: 'center' });
    if (p.el.focus) p.el.focus();
  }

  function halt(e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.stopPropagation) e.stopPropagation();
    return false;
  }

  /* ---------- confirm dialog ---------- */

  var confirmed = false;

  // what the post will say, read back from the body so the dialog shows exactly what Cafe24 stores
  function openConfirm() {
    sync();
    var rows = [['스튜디오', select.value]];
    var labels = { '대관 날짜': '날짜', '대관 파트': '파트', '대관 시간': '시간', '대관 내용': '대관 내용', '이용 인원수': '인원', '방문 차량수': '차량',
      '업체명': '예약자/업체명', '담당자명': '담당자명', '연락처': '연락처', '이메일': '이메일', '입금자명': '입금자명' };
    for (var i = 0; i < LINES.length; i++) {
      var v = bodyLine(LINES[i][1]);
      if (v) rows.push([labels[LINES[i][1]], v]);
    }
    if (noteText()) rows.push([NOTE_LABEL, noteText()]);
    var list = $('lr-confirm-list');
    list.innerHTML = '';
    for (var r = 0; r < rows.length; r++) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = rows[r][0];
      dd.textContent = rows[r][1];
      list.appendChild(dt);
      list.appendChild(dd);
    }
    fillGuide($('lr-confirm-guide'));
    var lines = htmlText(bodyHtml()).split('\n');
    for (var k = 0; k < lines.length; k++) lines[k] = lines[k].replace(/^\s+|\s+$/g, ''); // \s also covers nbsp
    $('lr-confirm-text').textContent = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    $('lr-confirm-sub').textContent = '아래 내용으로 예약 글이 등록돼요.';
    dialog.hidden = false;
    $('lr-confirm-body').scrollTop = 0;
    $('lr-confirm-ok').focus();
  }

  function closeConfirm() {
    dialog.hidden = true;
    var button = $('reserv-button');
    if (button && button.focus) button.focus();
  }

  $('lr-confirm-back').addEventListener('click', closeConfirm);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeConfirm(); });
  document.addEventListener('keydown', function (e) { if (!dialog.hidden && (e.key === 'Escape' || e.keyCode === 27)) closeConfirm(); });
  // Tells #예약-알림 what was requested; the server finds the post on the board before pinging the channel.
  // text/plain so the beacon needs no preflight; never awaited and never allowed to block the real submit.
  // Contact details are not sent. Skipped on the preview harness, where nothing is actually posted.
  function notifyStaff() {
    if ($('lr-preview')) return;
    try {
      var body = JSON.stringify({
        branch: select.value, writer: writerText(), note: noteText(),
        date: bodyLine('대관 날짜'), part: bodyLine('대관 파트'), time: bodyLine('대관 시간'), purpose: bodyLine('대관 내용'),
        people: bodyLine('이용 인원수'), cars: bodyLine('방문 차량수'), manager: bodyLine('담당자명'), payer: bodyLine('입금자명')
      });
      if (navigator.sendBeacon && navigator.sendBeacon(ALERT_URL, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
      if (window.fetch) window.fetch(ALERT_URL, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    } catch (err) { /* the post still goes through; staff just miss the detailed alert */ }
  }

  $('lr-confirm-ok').addEventListener('click', function () {
    dialog.hidden = true;
    notifyStaff();
    confirmed = true;
    try { $('reserv-button').click(); } finally { confirmed = false; }
  });

  function isButton(el) {
    while (el && el !== document) {
      if (el.id === 'reserv-button') return true;
      el = el.parentNode;
    }
    return false;
  }

  // 예약하기: validate, then show the summary; only the dialog's 이대로 예약하기 lets the click through to Cafe24
  document.addEventListener('click', function (e) {
    if (!isButton(e.target) || !branch()) return;
    var p = problem();
    if (p) { halt(e); warn(p); return; }
    sync();
    if (!confirmed) { halt(e); openConfirm(); }
  }, true);
  document.addEventListener('submit', function (e) {
    if (confirmed || !branch()) return;
    halt(e);
    var p = problem();
    if (p) warn(p); else openConfirm();
  }, true);
  // Never wrap form.submit: Cafe24 sends 예약자/이메일/비밀번호 to its encryption server, empties those
  // inputs and only then calls form.submit, so checking the fields there blocks every post and leaves
  // Cafe24 stuck at "처리중입니다".

  renderParts();
  fillGuide($('lr-guide'));
  refresh();

  /* ---------- last step: regroup Cafe24's inputs and hide the editor ---------- */

  if (regroup) {
    var oldBoxes = [boxOf(select)];
    select.className += ' lr-w-select';
    $('lr-slot-branch').appendChild(select);
    if (!ownWriter) {
      oldBoxes.push(boxOf(cafe.writer));
      cafe.writer.className += ' lr-w-full';
      cafe.writer.placeholder = '예약자 성함 또는 업체명';
      $('lr-slot-writer').appendChild(cafe.writer);
    }
    if (!ownEmail) {
      oldBoxes.push(boxOf(cafe.email1));
      cafe.email1.className += ' lr-w-mail';
      cafe.email2.className += ' lr-w-mail';
      var at = document.createElement('span');
      at.className = 'lr-dash';
      at.textContent = '@';
      $('lr-slot-email').appendChild(cafe.email1);
      $('lr-slot-email').appendChild(at);
      $('lr-slot-email').appendChild(cafe.email2);
      $('lr-slot-email').appendChild(cafe.email3);
    }
    if (cafe.password) {
      oldBoxes.push(boxOf(cafe.password));
      cafe.password.className += ' lr-w-full';
      $('lr-slot-password').insertBefore(cafe.password, $('lr-slot-password').firstChild);
    }
    for (var ob = 0; ob < oldBoxes.length; ob++) if (oldBoxes[ob]) oldBoxes[ob].style.display = 'none';
  }
  if (editorBox && editorBox.style) editorBox.style.display = 'none';
})();
