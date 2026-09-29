// GET /api/availability?studio=layer-41&y=2026&m=10
// Month availability for the reservation calendar. Combines two sources:
//   1) the studio's Zeroboard schedule month (staff labels such as "A 10-19 고*", "$$$ 10/05~08 웜* --->", "++(W1)")
//   2) homepage requests waiting in Supabase (pending / hold / approved)
// Response: { ok, studio, y, m, parts, days: { 'YYYY-MM-DD': [block, …] }, source: { board, queue }, fetchedAt }
//   block = { parts: ['A'] | all parts, all: bool, start: 9 | null, end: 18 | null, kind: 'fixed' | 'prov' | 'pending', label }
//   start/end are hours (13.5 = 13:30); null means the label had no time, i.e. treat as the whole day.
// The customer never sees staff names: labels are reduced to part + time before they leave the server.
// Results are cached in the function instance for 60 s and at the CDN for 60 s.
const { login, monthLabels } = require('./_zeroboard');
const supa = require('./_supabase');
const { BOARDS } = require('./reserve');

const PARTS = {
  'layer-41': ['A', 'B', 'C'], 'layer-20': ['1F', '2F', '3F', 'Caravan'], 'layer-11': ['A', 'B', 'Cafe'], 'layer-26': ['A', 'B'],
  'layer-27': ['A', 'Office'], 'layer-7': ['A', 'B', 'C'], 'layer-hannam': ['1F', '2F'], hongdae: ['A', 'B', 'D', 'Back Garden', 'Greenhouse', 'Garden'],
};
// staff shorthand for multi-word parts
const ALIAS = { hongdae: { BG: 'Back Garden', GH: 'Greenhouse', GARDEN: 'Garden', G: 'Garden' } };
// labels that are not bookings: cancelled ('-'), notes ('**'), empty-room placeholders (a bare part name)
const SKIP = new Set(['-', '--', '**', '*']);
const TTL = 60e3;
const cache = new Map(); // key → { at, data }
let cookieCache = null;  // { at, cookie }

const pad2 = (n) => String(n).padStart(2, '0');
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const toHours = (t) => { const [h, m] = String(t).split(':').map(Number); return h + (m >= 30 ? 0.5 : 0); };

/** "13", "13:30", "8.5" → hours */
function hourOf(s) {
  if (s.includes(':')) { const [h, m] = s.split(':').map(Number); return h + (m >= 30 ? 0.5 : 0); }
  return parseFloat(s);
}

/**
 * One board label → block(s). Returns { block, range } where range (optional) is { m1, d1, m2, d2 } for multi-day labels.
 * Unknown shapes are treated conservatively as the whole studio for the whole day.
 */
function parseLabel(raw, studio) {
  const parts = PARTS[studio] || [];
  let l = decode(raw).replace(/<-{2,}|-{2,}>/g, ' ').trim();
  if (!l || SKIP.has(l)) return null;
  const kind = l.includes('++') ? 'prov' : 'fixed';
  l = l.replace(/\+\+\s*\(W\d\)|\(W\d\)|\+\+|\$\$\$/g, ' ').trim();
  // multi-day range "10/05~08" or "10/30~11/02" (only on the first and last day's cell)
  let range = null;
  const rm = l.match(/(\d{1,2})\/(\d{1,2})\s*[~\-–]\s*(?:(\d{1,2})\/)?(\d{1,2})/);
  if (rm) { range = { m1: +rm[1], d1: +rm[2], m2: rm[3] ? +rm[3] : +rm[1], d2: +rm[4] }; l = l.replace(rm[0], ' '); }
  // time "10-19", "8.5-16.5", "13:00-15:30"
  let start = null, end = null;
  const tm = l.match(/(?:^|\s)(\d{1,2}(?:\.5|:\d{2})?)\s*[\-~–]\s*(\d{1,2}(?:\.5|:\d{2})?)(?=\s|$)/);
  if (tm) { const a = hourOf(tm[1]), b = hourOf(tm[2]); if (a >= 0 && b <= 24 && b > a) { start = a; end = b; } l = l.replace(tm[0], ' '); }
  // leading token names the part(s): "A", "ABD", "ALL", "BG", "1F", "Caravan", "A#"
  const token = (l.trim().split(/\s+/)[0] || '').replace(/[#:,.]+$/, '');
  if (!token && !start && !range) { if (kind !== 'prov') return null; /* '++(W1)' alone: provisional, whole studio, whole day */ }
  const bare = l.trim() === token; // label is only a part name → empty-room placeholder on the hongdae board
  const up = token.toUpperCase();
  let picked = null, all = false;
  if (!token || up === 'ALL' || up === '전체') all = true;
  else if (ALIAS[studio] && ALIAS[studio][up]) picked = [ALIAS[studio][up]];
  else {
    const exact = parts.find((p) => p.toUpperCase() === up);
    if (exact) picked = [exact];
    else if (/^[A-Z]{2,}$/.test(up) && [...up].every((ch) => parts.includes(ch))) picked = [...new Set([...up])];
    else all = true; // a name or something we don't recognise → whole studio
  }
  if (bare && picked && !range) return null; // "A" alone = placeholder, not a booking
  return { block: { parts: all ? parts.slice() : picked, all, start, end, kind, label: (all ? 'ALL' : picked.join('+')) + (start !== null ? ' ' + start + '–' + end : ''), raw: decode(raw).trim() }, range };
}

/** Board month → { 'YYYY-MM-DD': [block…] } */
function fromBoard(labels, studio, y, m) {
  const days = {};
  const push = (d, b) => { const k = `${y}-${pad2(m)}-${pad2(d)}`; (days[k] = days[k] || []).push(b); };
  const seenRange = new Set();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (const [dStr, list] of Object.entries(labels)) {
    for (const raw of list) {
      const p = parseLabel(raw, studio); if (!p) continue;
      if (p.range) {
        const key = JSON.stringify([p.range, p.block.label]); if (seenRange.has(key)) continue; seenRange.add(key);
        const { m1, d1, m2, d2 } = p.range;
        // walk the range, keeping only the days that fall in this month
        let cm = m1, cd = d1, guard = 0;
        while (guard++ < 62) {
          if (cm === m) push(cd, p.block);
          if (cm === m2 && cd === d2) break;
          cd++; const dim = new Date(Date.UTC(y, cm, 0)).getUTCDate(); if (cd > dim) { cd = 1; cm = cm % 12 + 1; }
        }
      } else { const d = +dStr; if (d >= 1 && d <= last) push(d, p.block); }
    }
  }
  return days;
}

/** Supabase queue → blocks (pending/hold → 'pending', approved → 'prov' (++ on the board), confirmed → 'fixed'; rejected/cancelled ignored) */
async function fromQueue(studio, y, m) {
  const first = `${y}-${pad2(m)}-01`, last = `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  const rows = await supa.select('reservation_requests', { select: 'date,part,start_at,end_at,status', studio: `eq.${studio}`, and: `(date.gte.${first},date.lte.${last})`, status: 'in.(pending,hold,approved,confirmed)' });
  const parts = PARTS[studio] || []; const days = {};
  for (const r of rows) {
    const all = !r.part || r.part === '-';
    const picked = all ? parts.slice() : r.part.split('+').map((s) => s.trim()).filter((s) => parts.includes(s));
    if (!picked.length) continue;
    const start = toHours(r.start_at), end = toHours(r.end_at);
    (days[r.date] = days[r.date] || []).push({ parts: picked, all, start, end, kind: r.status === 'confirmed' ? 'fixed' : r.status === 'approved' ? 'prov' : 'pending', label: (all ? 'ALL' : picked.join('+')) + ' ' + start + '–' + end });
  }
  return days;
}

async function boardCookie() {
  if (cookieCache && Date.now() - cookieCache.at < 10 * 60e3) return cookieCache.cookie;
  const cookie = await login(process.env.RAYSODA_ID, process.env.RAYSODA_PW);
  cookieCache = { at: Date.now(), cookie };
  return cookie;
}

async function build(studio, y, m) {
  const boardId = BOARDS[studio];
  const out = { ok: true, studio, y, m, parts: PARTS[studio], days: {}, source: { board: 'none', queue: 'none' }, fetchedAt: new Date().toISOString() };
  const merge = (src) => { for (const [k, v] of Object.entries(src)) out.days[k] = (out.days[k] || []).concat(v); };
  if (boardId && process.env.RAYSODA_ID && process.env.RAYSODA_PW) {
    try {
      let labels;
      try { labels = await monthLabels({ cookie: await boardCookie(), boardId, y, m }); }
      catch (e) { if (!/session/.test(e.message)) throw e; cookieCache = null; labels = await monthLabels({ cookie: await boardCookie(), boardId, y, m }); }
      merge(fromBoard(labels, studio, y, m)); out.source.board = 'ok';
    } catch (e) { console.error('availability board', studio, y, m, e.message); out.source.board = 'error'; }
  } else if (boardId) out.source.board = 'unconfigured';
  if (supa.configured()) {
    try { merge(await fromQueue(studio, y, m)); out.source.queue = 'ok'; }
    catch (e) { console.error('availability queue', e.message); out.source.queue = 'error'; }
  }
  for (const k of Object.keys(out.days)) out.days[k] = out.days[k].map(({ raw, ...b }) => b).sort((a, b) => (a.start ?? -1) - (b.start ?? -1)); // customers never see staff labels
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  const q = req.query || {};
  const studio = String(q.studio || ''); const y = Number(q.y), m = Number(q.m);
  if (!(studio in PARTS) || !(studio in BOARDS)) return res.status(400).json({ ok: false, error: 'studio' });
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2024 || y > 2100 || m < 1 || m > 12) return res.status(400).json({ ok: false, error: 'month' });
  const key = `${studio}:${y}-${m}`;
  const hit = cache.get(key);
  let data;
  if (hit && Date.now() - hit.at < TTL) data = hit.data;
  else { data = await build(studio, y, m); if (data.source.board !== 'error') cache.set(key, { at: Date.now(), data }); }
  res.setHeader('Cache-Control', data.source.board === 'error' ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json(data);
};
module.exports.parseLabel = parseLabel; module.exports.fromBoard = fromBoard; module.exports.PARTS = PARTS;
