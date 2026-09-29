// /api/admin — reservation approval console backend. Password-protected (ADMIN_PASSWORD, header x-admin-password).
//   GET  ?action=login                         → { ok }
//   GET  ?action=list&status=pending           → { rows, counts }
//   GET  ?action=detail&id=12                  → { row, events, siblings, board: { labels | error } }
//   POST ?action=decide  { id, decision, note, label, fixedLabel, actor }
//        decision: approved | hold | rejected | pending.  label: 'prov' (++(Wn)) | 'fixed' (fixedLabel or company)
//        approved + studio has a board → writes the post first; if that fails the request stays as it was.
//   POST ?action=note    { id, note, actor }   → adds a log line only
const crypto = require('crypto');
const supa = require('./_supabase');
const { login, writePost, dayLabels } = require('./_zeroboard');
const { buildPost, provisionalRank, BOARDS, NAMES, hm, WEEKDAYS } = require('./reserve');

const T = 'reservation_requests', E = 'reservation_events';
const DECISIONS = new Set(['approved', 'hold', 'rejected', 'pending']);

function authed(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-password'] || '');
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const json = (res, code, body) => res.status(code).json(body);
const clean = (s, max = 500) => String(s ?? '').replace(/[\r\t]+/g, ' ').trim().slice(0, max);
const toHours = (t) => { const [h, m] = String(t).split(':').map(Number); return h + (m >= 30 ? 0.5 : 0); };
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

/** Row → the shape buildPost() expects */
function asRequest(row) {
  return { studio: row.studio, part: row.part || '-', date: toDate(row.date), start: toHours(row.start_at), end: toHours(row.end_at),
    purpose: row.purpose, people: row.people, vehicles: row.vehicles, note: row.note, company: row.company, contact: row.contact, phone: row.phone, email: row.email };
}

function confirmedPost(r, label, actor) {
  const d = r.date; const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const memo = [
    `* ${r.part === '-' ? '' : r.part + ' '}${hm(r.start)}-${hm(r.end)} ${r.company} (홈페이지 예약, 승인: ${actor})`,
    '', '====',
    `* 대관 날짜 : ${y}년 ${m}월 ${day}일(${WEEKDAYS[d.getUTCDay()]})`, `* 대관 지점 : ${NAMES[r.studio]}`, `* 대관 파트 : ${r.part}`,
    `* 대관 시간 : ${hm(r.start)} - ${hm(r.end)} (${r.end - r.start}h)`, `* 대관 내용 : ${r.purpose || '-'}`,
    `* 이용 인원수 : ${r.people || '-'}`, `* 방문 차량수 : ${r.vehicles || '-'}`, `* 업체명(예약자명) : ${r.company}`,
    `* 담당자 : ${r.contact}`, `* 연락처 : ${r.phone}`, `* 이메일 : ${r.email || '-'}`, `* 요청사항 : ${r.note || '-'}`,
    '', `* 접수 : 홈페이지 예약 폼 → 승인 콘솔 (${actor}), ${new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)} KST`,
  ].join('\n');
  return { label, memo };
}

async function boardLabels(studio, dateIso) {
  const boardId = BOARDS[studio];
  if (!boardId) return { boardId: null, labels: [] };
  if (!process.env.RAYSODA_ID || !process.env.RAYSODA_PW) return { boardId, labels: [], error: 'board-credentials' };
  try {
    const cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW);
    const d = toDate(dateIso);
    const labels = await dayLabels({ cookie, boardId, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
    return { boardId, labels, cookie };
  } catch (e) { return { boardId, labels: [], error: e.message }; }
}

async function list(req, res) {
  const status = clean(req.query.status || 'pending', 20);
  const query = { select: 'id,created_at,studio,part,date,start_at,end_at,purpose,people,company,contact,status,board_label', order: 'created_at.desc', limit: '200' };
  if (status !== 'all') query.status = `eq.${status}`;
  const [rows, counts] = await Promise.all([supa.select(T, query), supa.select('reservation_status_counts', { select: 'status,count' })]);
  json(res, 200, { ok: true, rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) });
}

async function detail(req, res) {
  const id = Number(req.query.id); if (!id) return json(res, 400, { ok: false, error: 'id' });
  const [row] = await supa.select(T, { id: `eq.${id}` });
  if (!row) return json(res, 404, { ok: false, error: 'not-found' });
  const [events, siblings, board] = await Promise.all([
    supa.select(E, { request_id: `eq.${id}`, order: 'created_at.asc' }),
    supa.select(T, { select: 'id,part,start_at,end_at,company,status,board_label', studio: `eq.${row.studio}`, date: `eq.${row.date}`, id: `neq.${id}`, status: 'neq.rejected' }),
    boardLabels(row.studio, row.date),
  ]);
  json(res, 200, { ok: true, row, events, siblings, board: { boardId: board.boardId, labels: board.labels, error: board.error || null }, studioName: NAMES[row.studio] || row.studio });
}

async function decide(req, res) {
  const b = req.body || {};
  const id = Number(b.id), decision = clean(b.decision, 20), note = clean(b.note, 1000), actor = clean(b.actor, 40) || 'CS';
  if (!id || !DECISIONS.has(decision)) return json(res, 400, { ok: false, error: 'input' });
  const [row] = await supa.select(T, { id: `eq.${id}` });
  if (!row) return json(res, 404, { ok: false, error: 'not-found' });
  if (row.status === 'approved' && decision === 'approved') return json(res, 409, { ok: false, error: 'already-approved' });

  const patch = { status: decision, decided_by: actor, decided_at: new Date().toISOString(), decision_note: note || null };
  let boardResult = null, post = null;

  if (decision === 'approved' && BOARDS[row.studio] && process.env.RESERVE_DRY_RUN !== '1') {
    const r = asRequest(row);
    const board = await boardLabels(row.studio, row.date);
    if (board.error) return json(res, 502, { ok: false, error: 'board-login', detail: board.error });
    if (b.label === 'fixed') post = confirmedPost(r, clean(b.fixedLabel, 40) || row.company, actor);
    else post = buildPost(r, provisionalRank(board.labels));
    try {
      boardResult = await writePost({ cookie: board.cookie, boardId: board.boardId, date: r.date, label: post.label, memo: post.memo, name: process.env.RESERVE_AUTHOR || '홈페이지', password: process.env.RESERVE_POST_PW || 'layer' });
    } catch (e) { boardResult = { ok: false, error: e.message }; }
    if (!boardResult.ok) {
      await supa.insert(E, { request_id: id, actor, action: 'board_failed', detail: (boardResult.error || boardResult.status || 'unknown') + (boardResult.snippet ? ' — ' + boardResult.snippet.slice(0, 200) : '') }).catch(() => {});
      await supa.update(T, { id: `eq.${id}` }, { board_error: boardResult.error || boardResult.status || 'unknown' }).catch(() => {});
      return json(res, 502, { ok: false, error: 'board-write', detail: boardResult });
    }
    Object.assign(patch, { board_id: board.boardId, board_label: post.label, board_error: null });
  }

  const [updated] = await supa.update(T, { id: `eq.${id}` }, patch);
  const detailTxt = [post ? `게시판 기록 · 라벨 ${post.label}` : (decision === 'approved' && !BOARDS[row.studio] ? '게시판 없는 지점 · 수기 처리' : null), note || null].filter(Boolean).join(' — ');
  await supa.insert(E, { request_id: id, actor, action: decision, detail: detailTxt || null }).catch((e) => console.error('event failed', e.message));
  json(res, 200, { ok: true, row: updated, board: post ? { label: post.label } : null });
}

async function addNote(req, res) {
  const b = req.body || {}; const id = Number(b.id), note = clean(b.note, 1000), actor = clean(b.actor, 40) || 'CS';
  if (!id || !note) return json(res, 400, { ok: false, error: 'input' });
  const ev = await supa.insert(E, { request_id: id, actor, action: 'note', detail: note });
  json(res, 200, { ok: true, event: ev });
}

module.exports = async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return json(res, 500, { ok: false, error: 'admin-not-configured' });
  if (!authed(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
  if (!supa.configured()) return json(res, 500, { ok: false, error: 'supabase-not-configured' });
  const action = clean((req.query && req.query.action) || '', 20);
  try {
    if (req.method === 'GET' && action === 'login') return json(res, 200, { ok: true });
    if (req.method === 'GET' && action === 'list') return await list(req, res);
    if (req.method === 'GET' && action === 'detail') return await detail(req, res);
    if (req.method === 'POST' && action === 'decide') return await decide(req, res);
    if (req.method === 'POST' && action === 'note') return await addNote(req, res);
    return json(res, 404, { ok: false, error: 'action' });
  } catch (e) { console.error('admin error', e); return json(res, 500, { ok: false, error: e.message }); }
};
