// /api/admin — reservation approval console backend. Password-protected (ADMIN_PASSWORD, header x-admin-password).
//   GET  ?action=login                         → { ok }
//   GET  ?action=list&status=pending           → { rows, counts }   (+ &from=YYYY-MM-DD&to=YYYY-MM-DD for a date range, e.g. the calendar)
//   GET  ?action=detail&id=12                  → { row, events, siblings, board: { labels | error } }
//   POST ?action=decide  { id, decision, note, fixedLabel, actor }
//        decision: approved (board: new ++(Wn) post) | confirmed (board: confirmed label — relabels the ++ post or writes one)
//                | cancelled (board: label → '-', cancel line in the body) | hold | rejected | pending.  See FLOW for allowed moves.
//        Board writes happen first; if they fail the request stays as it was.
//   POST ?action=note    { id, note, actor }   → adds a log line only
//   POST ?action=edit    { id, fields: { part, date, start, end, purpose, people, vehicles, note, company, contact, phone, email }, boardLabel, resolve, actor }
//        updates the request; for an approved request with a board post the post is rewritten too, merging line by line
//        with what staff may have edited by hand (api/_merge.js). Conflicts come back as 409 { conflicts } until the
//        caller resends with resolve: { [key]: 'board' | 'console' }. A date change moves the post (write new, delete old).
//        Every board write stores a 'board_snapshot' event (label + body) — the base for the next merge.
const crypto = require('crypto');
const supa = require('./_supabase');
const { login, writePost, modifyPost, deletePost, readPost, findPost, dayLabels, monthLabels } = require('./_zeroboard');
const { fromBoard } = require('./availability');
const { buildPost, provisionalRank, marker, BOARDS, NAMES, hm, WEEKDAYS } = require('./reserve');
const { merge, keyOf } = require('./_merge');

const T = 'reservation_requests', E = 'reservation_events';
const DECISIONS = new Set(['approved', 'confirmed', 'hold', 'rejected', 'pending', 'cancelled']);
// which decisions a request in each status accepts
const FLOW = { pending: ['approved', 'confirmed', 'hold', 'rejected'], hold: ['approved', 'confirmed', 'pending', 'rejected'], approved: ['confirmed', 'cancelled'], confirmed: ['cancelled'], rejected: ['pending'], cancelled: [] };
const kstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);

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
  return { id: row.id, studio: row.studio, part: row.part || '-', date: toDate(row.date), start: toHours(row.start_at), end: toHours(row.end_at),
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
    '', `* 접수 : 홈페이지 예약 폼 → 승인 콘솔 (${actor}), ${new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)} KST${r.id ? ' · ' + marker(r.id) : ''}`,
  ].join('\n');
  return { label, memo };
}

async function boardLabels(studio, dateIso) {
  const boardId = BOARDS[studio];
  if (!boardId) return { boardId: null, labels: [] };
  if (!process.env.RAYSODA_ID || !process.env.RAYSODA_PW) return { boardId, labels: [], error: 'board-credentials' };
  try {
    const cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW);
    const d = toDate(dateIso); const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const month = await monthLabels({ cookie, boardId, y, m });
    const labels = month[d.getUTCDate()] || [];
    // blocks: multi-day ranges expanded, "ALL"/aliases resolved, names kept in `raw` (staff only) — same parser as the customer calendar
    const blocks = (fromBoard(month, studio, y, m)[dateIso] || []);
    return { boardId, labels, blocks, cookie };
  } catch (e) { return { boardId, labels: [], error: e.message }; }
}

async function list(req, res) {
  const status = clean(req.query.status || 'pending', 20);
  const query = { select: 'id,created_at,studio,part,date,start_at,end_at,purpose,people,company,contact,status,board_label' };
  if (status !== 'all') query.status = `eq.${status}`;
  const from = clean(req.query.from || '', 10), to = clean(req.query.to || '', 10); // ?from=YYYY-MM-DD&to=YYYY-MM-DD → one month for the calendar view (past days included)
  const range = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST calendar day
  if (range) { query.and = `(date.gte.${from},date.lte.${to})`; query.order = 'date.asc,start_at.asc'; query.limit = '500'; }
  else {
    // the queue: past reservation days drop out; 대기·보류 oldest request first, 승인 soonest booking first, 반려 newest first
    query.date = `gte.${today}`; query.limit = '300';
    query.order = status === 'approved' ? 'date.asc,start_at.asc,created_at.asc' : status === 'rejected' ? 'created_at.desc' : 'created_at.asc';
  }
  const [rows, live] = await Promise.all([supa.select(T, query), supa.select(T, { select: 'status', date: `gte.${today}` })]);
  const counts = {}; for (const r of live) counts[r.status] = (counts[r.status] || 0) + 1;
  json(res, 200, { ok: true, rows, counts, today });
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
  json(res, 200, { ok: true, row, events, siblings, board: { boardId: board.boardId, labels: board.labels, blocks: board.blocks || [], error: board.error || null }, studioName: NAMES[row.studio] || row.studio });
}

async function decide(req, res) {
  const b = req.body || {};
  const id = Number(b.id), decision = clean(b.decision, 20), note = clean(b.note, 1000), actor = clean(b.actor, 40) || 'CS';
  if (!id || !DECISIONS.has(decision)) return json(res, 400, { ok: false, error: 'input' });
  const [row] = await supa.select(T, { id: `eq.${id}` });
  if (!row) return json(res, 404, { ok: false, error: 'not-found' });
  if (!(FLOW[row.status] || []).includes(decision)) return json(res, 409, { ok: false, error: 'not-allowed', from: row.status, to: decision });

  const patch = { status: decision, decided_by: actor, decided_at: new Date().toISOString(), decision_note: note || null };
  const boardId = BOARDS[row.studio]; const touchesBoard = decision === 'approved' || decision === 'confirmed' || decision === 'cancelled';
  let boardTxt = null;
  if (boardId && touchesBoard && process.env.RESERVE_DRY_RUN !== '1') {
    if (!process.env.RAYSODA_ID || !process.env.RAYSODA_PW) return json(res, 502, { ok: false, error: 'board-login', detail: 'board-credentials' });
    let cookie; try { cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW); } catch (e) { return json(res, 502, { ok: false, error: 'board-login', detail: e.message }); }
    const r = asRequest(row); const d = r.date; const name = process.env.RESERVE_AUTHOR || '홈페이지', password = process.env.RESERVE_POST_PW || 'layer';
    const fail = async (what, result) => {
      await supa.insert(E, { request_id: id, actor, action: 'board_failed', detail: `${what} — ` + (result.error || result.status || 'unknown') + (result.snippet ? ' — ' + result.snippet.slice(0, 200) : '') }).catch(() => {});
      await supa.update(T, { id: `eq.${id}` }, { board_error: result.error || result.status || 'unknown' }).catch(() => {});
      return json(res, 502, { ok: false, error: 'board-write', detail: result });
    };
    if (decision === 'approved') {
      let labels = []; try { labels = await dayLabels({ cookie, boardId, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }); } catch (e) { console.error('rank lookup failed', e.message); }
      const post = buildPost(r, provisionalRank(labels));
      const w = await writePost({ cookie, boardId, date: d, label: post.label, memo: post.memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
      if (!w.ok) return fail('가부킹 글 작성 실패', w);
      const no = await linkPost({ cookie, boardId, date: d, id }).catch(() => null);
      await snapshot(id, { no, label: post.label, memo: post.memo });
      Object.assign(patch, { board_id: boardId, board_label: post.label, board_post_no: no || null, board_error: null });
      boardTxt = `게시판 기록 · 라벨 ${post.label}`;
    } else if (decision === 'confirmed') {
      const label = clean(b.fixedLabel, 40) || defaultConfirmedLabel(r);
      const cp = confirmedPost(r, label, actor);
      const found = await locatePost({ cookie, boardId, row });
      if (found) { // relabel the existing (++) post; only the console's summary line changes, the rest of the body stays
        const lines = found.cur.memo.split('\n'); const i = lines.findIndex((l) => keyOf(l) === 'summary'); const summary = cp.memo.split('\n')[0];
        if (i > -1) lines[i] = summary; else lines.unshift(summary);
        const memo = lines.join('\n');
        const m = await modifyPost({ cookie, boardId, no: found.no, date: d, label, memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
        if (!m.ok) return fail('확정 라벨 변경 실패', m);
        await snapshot(id, { no: found.no, label, memo });
        Object.assign(patch, { board_id: boardId, board_label: label, board_post_no: found.no, board_error: null });
        boardTxt = `게시판 라벨 ${found.cur.label || '-'} → ${label}`;
      } else { // no post yet (confirmed straight from 대기/보류, or an old approval we cannot locate)
        const w = await writePost({ cookie, boardId, date: d, label, memo: cp.memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
        if (!w.ok) return fail('확정 글 작성 실패', w);
        const no = await linkPost({ cookie, boardId, date: d, id }).catch(() => null);
        await snapshot(id, { no, label, memo: cp.memo });
        Object.assign(patch, { board_id: boardId, board_label: label, board_post_no: no || null, board_error: null });
        boardTxt = `게시판 확정 글 작성 · 라벨 ${label}` + (row.status === 'approved' ? ' · 기존 가부킹 글은 찾지 못해 그대로 있음, 직접 지워 주세요' : '');
      }
    } else if (decision === 'cancelled') {
      const found = await locatePost({ cookie, boardId, row });
      if (found) { // staff convention: a cancelled booking keeps its post with the label '-'
        const lines = found.cur.memo.split('\n'); const i = lines.findIndex((l) => keyOf(l) === 'summary');
        lines.splice(i > -1 ? i + 1 : 0, 0, `* 취소 : ${note || '-'} (${actor}, ${kstNow()})`);
        const memo = lines.join('\n');
        const m = await modifyPost({ cookie, boardId, no: found.no, date: d, label: '-', memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
        if (!m.ok) return fail('취소 라벨 변경 실패', m);
        await snapshot(id, { no: found.no, label: '-', memo });
        Object.assign(patch, { board_label: '-', board_post_no: found.no, board_error: null });
        boardTxt = `게시판 라벨 ${found.cur.label || '-'} → - (취소)`;
      } else {
        boardTxt = '게시판 글을 찾지 못해 라벨을 바꾸지 못함 · 스케줄표에서 직접 -로 바꿔 주세요';
        await supa.insert(E, { request_id: id, actor, action: 'board_failed', detail: boardTxt }).catch(() => {});
      }
    }
  } else if (boardId && touchesBoard) boardTxt = '게시판 생략 (RESERVE_DRY_RUN)';
  else if (!boardId && touchesBoard) boardTxt = '게시판 없는 지점 · 수기 처리';

  const [updated] = await supa.update(T, { id: `eq.${id}` }, patch);
  await supa.insert(E, { request_id: id, actor, action: decision, detail: [boardTxt, note || null].filter(Boolean).join(' — ') || null }).catch((e) => console.error('event failed', e.message));
  json(res, 200, { ok: true, row: updated, board: patch.board_label ? { label: patch.board_label } : null });
}

/** Confirmed label in the staff's own shorthand: "A 10-19 회사명", "AB 8.5-16.5 회사명" */
const fmtH = (h) => (h % 1 ? String(h) : String(Math.floor(h)));
function defaultConfirmedLabel(r) {
  const ps = r.part === '-' ? [] : String(r.part).split('+');
  const token = ps.length && ps.every((p) => p.length === 1) ? ps.join('') : ps.join('+');
  return [token, `${fmtH(r.start)}-${fmtH(r.end)}`, r.company].filter(Boolean).join(' ');
}
/** The request's post on the board: { no, cur: { label, memo } } or null */
async function locatePost({ cookie, boardId, row }) {
  let no = row.board_post_no || null;
  if (!no) { const snap = await latestSnapshot(row.id); no = (snap && snap.no) || null; }
  const d = toDate(row.date);
  if (!no) no = await linkPost({ cookie, boardId, date: d, id: row.id }).catch(() => null);
  if (!no) return null;
  const cur = await readPost({ cookie, boardId, no, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  return cur ? { no, cur } : null;
}

/** After writing, find our post on that day by its receipt marker → post number (null if not found) */
async function linkPost({ cookie, boardId, date, id }) {
  return findPost({ cookie, boardId, y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), marker: marker(id) });
}
/** Remember exactly what the console wrote — the base for the next merge */
function snapshot(id, { no, label, memo }) {
  return supa.insert(E, { request_id: id, actor: 'system', action: 'board_snapshot', detail: JSON.stringify({ no: no || null, label, memo }) }).catch((e) => console.error('snapshot failed', e.message));
}
async function latestSnapshot(id) {
  const rows = await supa.select(E, { request_id: `eq.${id}`, action: 'eq.board_snapshot', order: 'created_at.desc', limit: '1' });
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].detail); } catch { return null; }
}
const isProv = (label) => /\+\+/.test(label);
const rankOf = (label) => { const m = label.match(/\(W(\d)\)/); return m ? Number(m[1]) : 1; };
const FIELD_KO = { part: '파트', date: '날짜', start_at: '시작', end_at: '종료', purpose: '내용', people: '인원', vehicles: '차량', note: '요청사항', company: '업체명', contact: '담당자', phone: '연락처', email: '이메일' };

function validateEdit(f) {
  const part = clean(f.part, 40).replace(/\s*\+\s*/g, '+') || '-';
  if (!/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 \-]{0,18}(\+[A-Za-z0-9가-힣][A-Za-z0-9가-힣 \-]{0,18}){0,7}$|^-$/.test(part)) return 'part';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) return 'date';
  const d = toDate(f.date); if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(f.date.slice(5, 7)) - 1) return 'date';
  const start = parseFloat(f.start), end = parseFloat(f.end);
  if (!(start >= 0 && start <= 23.5 && end >= 0.5 && end <= 24 && end > start && start % 0.5 === 0 && end % 0.5 === 0)) return 'time';
  const company = clean(f.company, 60); if (!company) return 'company';
  const contact = clean(f.contact, 60); if (!contact) return 'contact';
  const phone = clean(f.phone, 40); if (!/\d{7,}/.test(phone.replace(/\D/g, ''))) return 'phone';
  const email = clean(f.email, 100); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'email';
  return { part, date: f.date, start_at: hm(start) + ':00', end_at: hm(end) + ':00', purpose: clean(f.purpose, 200) || null, people: clean(f.people, 20) || null, vehicles: clean(f.vehicles, 20) || null,
    note: String(f.note ?? '').replace(/[\r\t]+/g, ' ').replace(/\n+/g, ' / ').trim().slice(0, 1000) || null, company, contact, phone, email: email || null };
}

async function edit(req, res) {
  const b = req.body || {}; const id = Number(b.id), actor = clean(b.actor, 40) || 'CS';
  if (!id) return json(res, 400, { ok: false, error: 'input' });
  const [row] = await supa.select(T, { id: `eq.${id}` });
  if (!row) return json(res, 404, { ok: false, error: 'not-found' });
  const patch = validateEdit(b.fields || {});
  if (typeof patch === 'string') return json(res, 400, { ok: false, error: 'input', field: patch });
  const changes = Object.keys(patch).filter((k) => (patch[k] ?? '') !== (row[k] ?? '')).map((k) => `${FIELD_KO[k]} ${row[k] ?? '-'} → ${patch[k] ?? '-'}`);
  const wantLabel = clean(b.boardLabel, 40);
  const resolve = (b.resolve && typeof b.resolve === 'object') ? b.resolve : {};
  let board = null; // what happened on the board

  if ((row.status === 'approved' || row.status === 'confirmed') && BOARDS[row.studio] && process.env.RESERVE_DRY_RUN !== '1') {
    const boardId = BOARDS[row.studio];
    if (!process.env.RAYSODA_ID || !process.env.RAYSODA_PW) return json(res, 502, { ok: false, error: 'board-login', detail: 'board-credentials' });
    let cookie; try { cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW); } catch (e) { return json(res, 502, { ok: false, error: 'board-login', detail: e.message }); }
    const base = await latestSnapshot(id);
    const oldDate = toDate(row.date);
    let no = row.board_post_no || (base && base.no) || null;
    if (!no) no = await linkPost({ cookie, boardId, date: oldDate, id }).catch(() => null);
    const cur = no ? await readPost({ cookie, boardId, no, y: oldDate.getUTCFullYear(), m: oldDate.getUTCMonth() + 1 }) : null;
    if (!no || !cur) {
      board = { synced: false, reason: !no ? 'unlinked' : 'missing' };
      if (!resolve.__board) return json(res, 409, { ok: false, error: 'board-unlinked', reason: board.reason, changes });
    } else {
      const label = wantLabel || cur.label || row.board_label || '';
      const next = { ...row, ...patch }; const r = asRequest(next);
      const post = isProv(label) ? buildPost(r, rankOf(label)) : confirmedPost(r, label, actor);
      const m = merge(base ? { label: base.label, memo: base.memo } : null, cur, { label, memo: post.memo }, resolve);
      if (m.conflicts.length) return json(res, 409, { ok: false, error: 'conflict', hasBase: !!base, conflicts: m.conflicts, board: cur, changes });
      const name = process.env.RESERVE_AUTHOR || '홈페이지', password = process.env.RESERVE_POST_PW || 'layer';
      const newDate = toDate(patch.date);
      let result;
      if (patch.date !== row.date) {
        result = await writePost({ cookie, boardId, date: newDate, label: m.label, memo: m.memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
        if (result.ok) {
          const newNo = await linkPost({ cookie, boardId, date: newDate, id }).catch(() => null);
          const del = await deletePost({ cookie, boardId, no, password }).catch((e) => ({ ok: false, snippet: e.message }));
          if (!del.ok) await supa.insert(E, { request_id: id, actor, action: 'board_failed', detail: `날짜 이동 후 옛 글(no=${no}) 삭제 실패 — 게시판에서 직접 지워 주세요` }).catch(() => {});
          no = newNo; board = { synced: true, moved: true, oldDeleted: del.ok };
        }
      } else {
        result = await modifyPost({ cookie, boardId, no, date: oldDate, label: m.label, memo: m.memo, name, password }).catch((e) => ({ ok: false, error: e.message }));
        if (result.ok) board = { synced: true, moved: false };
      }
      if (!result.ok) {
        await supa.insert(E, { request_id: id, actor, action: 'board_failed', detail: '수정 반영 실패 — ' + (result.error || result.status || 'unknown') + (result.snippet ? ' — ' + result.snippet.slice(0, 200) : '') }).catch(() => {});
        return json(res, 502, { ok: false, error: 'board-write', detail: result });
      }
      Object.assign(board, { no, label: m.label, staffLines: m.staffLines });
      Object.assign(patch, { board_post_no: no, board_label: m.label, board_error: null });
      await snapshot(id, { no, label: m.label, memo: m.memo });
    }
  }
  const [updated] = await supa.update(T, { id: `eq.${id}` }, patch);
  const boardTxt = !board ? null : board.synced ? `게시판 반영${board.moved ? ' (날짜 이동, 새 글 작성)' : ''} · 라벨 ${board.label}${board.staffLines ? ` · 스태프 메모 ${board.staffLines}줄 유지` : ''}` : `게시판 미반영 (${board.reason === 'unlinked' ? '글을 찾지 못함' : '글이 삭제됨'})`;
  await supa.insert(E, { request_id: id, actor, action: 'edited', detail: [changes.join(', ') || '변경 없음', boardTxt].filter(Boolean).join(' — ') }).catch((e) => console.error('event failed', e.message));
  json(res, 200, { ok: true, row: updated, changes, board });
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
    if (req.method === 'POST' && action === 'edit') return await edit(req, res);
    return json(res, 404, { ok: false, error: 'action' });
  } catch (e) { console.error('admin error', e); return json(res, 500, { ok: false, error: e.message }); }
};
