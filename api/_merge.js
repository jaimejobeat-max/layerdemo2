// Three-way, line-level merge of a schedule-board post that the console wrote and staff may have edited by hand.
//   base  = what the console last wrote (snapshot)          — may be null for posts written before snapshots existed
//   board = what is on the board right now
//   next  = what the console wants to write now
// Lines the console owns are recognised by their "* <field> :" prefix (plus the one-line summary at the top).
// Every other line is staff text and is kept verbatim. An owned line is replaced only when staff left it as
// the console wrote it; otherwise it is a conflict, unless `resolve[key]` says 'board' (keep) or 'console' (replace).
const OWN = /^\* (대관 날짜|대관 지점|대관 파트|대관 시간|대관 내용|이용 인원수|방문 차량수|업체명\(예약자명\)|담당자|연락처|이메일|요청사항|접수) :/;
const INFO = new Set(['접수']); // informational lines: replaced without asking
const TITLES = { label: '캘린더 라벨', summary: '요약 줄', '대관 날짜': '대관 날짜', '대관 지점': '대관 지점', '대관 파트': '파트', '대관 시간': '시간', '대관 내용': '내용', '이용 인원수': '인원', '방문 차량수': '차량', '업체명(예약자명)': '업체명', 담당자: '담당자', 연락처: '연락처', 이메일: '이메일', 요청사항: '요청사항', 접수: '접수 정보' };

const norm = (t) => String(t ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
function keyOf(line) {
  const m = line.match(OWN); if (m) return m[1];
  if (/^\* .*홈페이지 예약/.test(line)) return 'summary';
  return null;
}
const owned = (lines) => { const o = {}; for (const l of lines) { const k = keyOf(l); if (k && !(k in o)) o[k] = l; } return o; };

/**
 * @returns {{ label: string, memo: string, conflicts: Array<{key, title, board, console}>, staffLines: number }}
 */
function merge(base, board, next, resolve = {}) {
  const conflicts = [];
  const pick = (key, boardVal, baseVal, nextVal) => {
    if (boardVal === nextVal) return boardVal;
    if (base && baseVal === nextVal) return boardVal;            // console did not change this line → whatever staff did stays
    if (base && boardVal === baseVal) return nextVal;            // untouched by staff → take the console's new value
    if (INFO.has(key)) return nextVal;                           // bookkeeping lines never block a save
    const r = resolve[key];
    if (r === 'console') return nextVal; if (r === 'board') return boardVal;
    conflicts.push({ key, title: TITLES[key] || key, board: boardVal, console: nextVal });
    return boardVal;
  };
  const label = pick('label', String(board.label || '').trim(), base ? String(base.label || '').trim() : null, String(next.label || '').trim());

  const bl = norm(board.memo), nl = norm(next.memo), sl = base ? norm(base.memo) : null;
  const nextOwn = owned(nl), baseOwn = sl ? owned(sl) : {};
  const seen = new Set(); let staffLines = 0; let lastOwnAt = -1;
  const out = bl.map((line, i) => {
    const k = keyOf(line);
    if (!k) { if (line.trim() && !/^=+$/.test(line.trim())) staffLines++; return line; }
    lastOwnAt = i;
    if (seen.has(k)) return line; seen.add(k);
    if (!(k in nextOwn)) return line;                           // console no longer produces this line → leave it
    return pick(k, line, baseOwn[k] ?? null, nextOwn[k]);
  });
  // owned lines the console wants to add that the board lacks: skip if staff deleted them, otherwise add after the last owned line
  const adds = Object.keys(nextOwn).filter((k) => !seen.has(k) && !(k in baseOwn));
  if (adds.length) out.splice(lastOwnAt + 1, 0, ...adds.map((k) => nextOwn[k]));
  return { label, memo: out.join('\n'), conflicts, staffLines };
}

module.exports = { merge, keyOf, TITLES };
