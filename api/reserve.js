// POST /api/reserve — reservation request from the homepage form.
// 1) validates, 2) writes a provisional (++) post to the studio's Zeroboard schedule,
// 3) pings Slack. Env: RAYSODA_ID, RAYSODA_PW, SLACK_WEBHOOK_URL (optional), RESERVE_DRY_RUN=1 (skip the board).
const { login, writePost } = require('./_zeroboard');

const BOARDS = {
  'layer-41': 'Layer41', 'layer-20': 'Layer20', 'layer-11': 'Layer11', 'layer-26': 'Layer26', 'layer-27': 'Layer27',
  'layer-7': 'layer7', 'layer-10': null, 'layer-hannam': 'Layerhannam', 'hongdae': 'hong_schedule', 'faust': null, 'layer-57': 'layer57',
};
const NAMES = {
  'layer-41': 'LAYER 41', 'layer-20': 'LAYER 20', 'layer-11': 'LAYER 11', 'layer-26': 'LAYER 26', 'layer-27': 'LAYER 27',
  'layer-7': 'LAYER 7', 'layer-10': 'LAYER 10', 'layer-hannam': 'LAYER HANNAM', 'hongdae': 'HONGDAE', 'faust': 'FAUST', 'layer-57': 'LAYER 57',
};
const MIN_HOURS = { hongdae: 2 };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function bad(res, msg, code = 400) { res.status(code).json({ ok: false, error: msg }); }
function pad2(n) { return String(n).padStart(2, '0'); }
function clean(s, max = 200) { return String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }

function validate(b) {
  const studio = clean(b.studio, 30);
  if (!(studio in BOARDS)) return 'studio';
  const part = clean(b.part, 20) || '-';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return 'date';
  const date = new Date(b.date + 'T00:00:00+09:00');
  if (Number.isNaN(date.getTime())) return 'date';
  const todayKst = new Date(Date.now() + 9 * 3600e3); todayKst.setUTCHours(0, 0, 0, 0);
  if (date.getTime() < todayKst.getTime() - 9 * 3600e3) return 'date-past';
  const start = parseInt(b.start, 10), end = parseInt(b.end, 10);
  if (!(start >= 0 && start <= 23 && end >= 1 && end <= 24 && end > start)) return 'time';
  if (end - start < (MIN_HOURS[studio] || 4)) return 'min-hours';
  const company = clean(b.company, 60); if (company.length < 1) return 'company';
  const contact = clean(b.contact, 60); if (contact.length < 1) return 'contact';
  const phone = clean(b.phone, 40); if (!/[\d]{7,}/.test(phone.replace(/\D/g, ''))) return 'phone';
  const email = clean(b.email, 100); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'email';
  return { studio, part, date, start, end, company, contact, phone, email,
    purpose: clean(b.purpose, 200), people: clean(b.people, 20), vehicles: clean(b.vehicles, 20), note: clean(b.note, 1000), lang: b.lang === 'en' ? 'en' : 'ko' };
}

function buildPost(r) {
  const d = r.date; const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const initial = r.company.replace(/\s+/g, '')[0] || '?';
  const label = `${r.part === '-' ? '' : r.part + ' '}${pad2(r.start)}-${pad2(r.end)} ${initial}* ++`;
  const memo = [
    `* ${r.part === '-' ? '' : r.part + ' '}${pad2(r.start)}-${pad2(r.end)} 홈페이지 예약 신청 (미확정)`,
    '',
    '====',
    `* 대관 날짜 : ${y}년 ${m}월 ${day}일(${WEEKDAYS[d.getDay()]})`,
    `* 대관 지점 : ${NAMES[r.studio]}`,
    `* 대관 파트 : ${r.part}`,
    `* 대관 시간 : ${pad2(r.start)}:00 - ${pad2(r.end)}:00 (${r.end - r.start}h)`,
    `* 대관 내용 : ${r.purpose || '-'}`,
    `* 이용 인원수 : ${r.people || '-'}`,
    `* 방문 차량수 : ${r.vehicles || '-'}`,
    `* 업체명(예약자명) : ${r.company}`,
    `* 담당자 : ${r.contact}`,
    `* 연락처 : ${r.phone}`,
    `* 이메일 : ${r.email || '-'}`,
    `* 요청사항 : ${r.note || '-'}`,
    '',
    `* 접수 : 홈페이지 예약 폼, ${new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)} KST`,
  ].join('\n');
  return { label, memo };
}

async function slack(r, post, boardId, boardResult) {
  const url = process.env.SLACK_WEBHOOK_URL; if (!url) return;
  const d = r.date;
  const text = [
    `:inbox_tray: *홈페이지 예약 신청* — ${NAMES[r.studio]}${r.part !== '-' ? ' ' + r.part : ''}`,
    `• ${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}(${WEEKDAYS[d.getDay()]}) ${pad2(r.start)}:00–${pad2(r.end)}:00 · ${r.purpose || '-'} · ${r.people || '-'}명 · 차량 ${r.vehicles || '-'}`,
    `• ${r.company} / ${r.contact} / ${r.phone}${r.email ? ' / ' + r.email : ''}`,
    r.note ? `• 요청: ${r.note}` : null,
    boardId ? (boardResult && boardResult.ok ? `• 스케줄표에 가부킹으로 기록됨 → \`${post.label}\`` : `• :warning: 게시판 기록 실패 — 수동 등록 필요`) : `• :warning: 이 지점은 스케줄 게시판이 없어 수동 등록 필요`,
    `<https://schedule-nu-taupe.vercel.app/?filter=%EA%B0%80%EB%B6%80%ED%82%B9|스케줄표에서 확인>`,
  ].filter(Boolean).join('\n');
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); } catch (e) { console.error('slack failed', e.message); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return bad(res, 'method', 405);
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot
  const r = validate(b);
  if (typeof r === 'string') return bad(res, r);
  const post = buildPost(r);
  const boardId = BOARDS[r.studio];
  let boardResult = null;
  if (boardId && process.env.RESERVE_DRY_RUN !== '1') {
    if (!process.env.RAYSODA_ID || !process.env.RAYSODA_PW) return bad(res, 'server-config', 500);
    try {
      const cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW);
      boardResult = await writePost({ cookie, boardId, date: r.date, label: post.label, memo: post.memo, name: process.env.RESERVE_AUTHOR || '홈페이지', password: process.env.RESERVE_POST_PW || 'layer' });
      if (!boardResult.ok) console.error('board write failed', boardResult);
    } catch (e) { console.error('board error', e.message); boardResult = { ok: false, error: e.message }; }
  }
  await slack(r, post, boardId, boardResult);
  res.status(200).json({ ok: true, recorded: !!(boardResult && boardResult.ok), label: post.label });
};
module.exports.buildPost = buildPost; module.exports.validate = validate;
