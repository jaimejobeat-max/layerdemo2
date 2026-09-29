// Zeroboard (raysoda.cafe24.com) client: login + write a schedule post.
// The board sends malformed headers that crash Node's HTTP parser, so we speak
// HTTP/1.1 over a raw TLS socket (same approach as the schedule dashboard).
// Posts are EUC-KR; the calendar label lives in `sitelink1`, `subject` is the date.
const tls = require('tls');
const iconv = require('iconv-lite');

const HOST = 'raysoda.cafe24.com';
const BASE = '/zeroboard';

function rawRequest(method, path, { body = null, cookie = null, contentType = 'application/x-www-form-urlencoded', headers: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, HOST, { rejectUnauthorized: false }, () => {
      const lines = [`${method} ${path} HTTP/1.1`, `Host: ${HOST}`, 'Connection: close',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        `Content-Type: ${contentType}`];
      if (cookie) lines.push(`Cookie: ${cookie}`);
      for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
      if (body) lines.push(`Content-Length: ${body.length}`);
      lines.push('\r\n');
      socket.write(lines.join('\r\n'));
      if (body) socket.write(body);
    });
    const chunks = [];
    socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('timeout')); });
    socket.on('data', (d) => chunks.push(d));
    socket.on('end', () => {
      const full = Buffer.concat(chunks);
      const i = full.indexOf('\r\n\r\n');
      if (i === -1) return reject(new Error('invalid response'));
      const headers = full.subarray(0, i).toString();
      let body = full.subarray(i + 4);
      if (/transfer-encoding:\s*chunked/i.test(headers)) body = dechunk(body);
      resolve({ headers, body });
    });
    socket.on('error', reject);
  });
}

function dechunk(buf) {
  const out = []; let p = 0;
  while (p < buf.length) {
    const nl = buf.indexOf('\r\n', p); if (nl === -1) break;
    const size = parseInt(buf.subarray(p, nl).toString(), 16);
    if (!size) break;
    out.push(buf.subarray(nl + 2, nl + 2 + size)); p = nl + 2 + size + 2;
  }
  return Buffer.concat(out);
}

async function login(userId, password) {
  const form = new URLSearchParams();
  form.append('user_id', userId); form.append('password', password);
  form.append('id', 'hong_schedule'); form.append('auto_login', '1');
  const { headers, body } = await rawRequest('POST', `${BASE}/login_check.php`, { body: Buffer.from(form.toString()) });
  const cookie = headers.split('\n').filter((l) => /^set-cookie:/i.test(l)).map((l) => l.split(':')[1].trim().split(';')[0]).join('; ');
  const ok = /zbsessionid=/i.test(cookie) && body.toString('latin1').includes('url=zboard.php');
  if (!ok) throw new Error('zeroboard login failed');
  return cookie;
}

// Diagnostic login: reports what the board answered without throwing.
async function probeLogin(userId, password) {
  const form = new URLSearchParams();
  form.append('user_id', userId); form.append('password', password);
  form.append('id', 'hong_schedule'); form.append('auto_login', '1');
  const { headers, body } = await rawRequest('POST', `${BASE}/login_check.php`, { body: Buffer.from(form.toString()) });
  const cookieNames = headers.split('\n').filter((l) => /^set-cookie:/i.test(l)).map((l) => l.split(':')[1].trim().split('=')[0]);
  const text = iconv.decode(body, 'EUC-KR');
  return { status: headers.split('\r\n')[0], cookieNames, hasBoardRedirect: text.includes('url=zboard.php'), bodyLen: body.length, bodyHint: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) };
}

/**
 * Labels (sitelink1) posted on every day of one board month → { [day]: [label, …] }.
 * The month grid marks each day cell with a write.php link whose subject is
 * "Y/M/D"; everything up to the next day's link belongs to that day.
 */
async function monthLabels({ cookie, boardId, y, m }) {
  const res = await rawRequest('GET', `${BASE}/zboard.php?id=${boardId}&year=${y}&month=${m}`, { cookie });
  const html = iconv.decode(res.body, 'EUC-KR');
  if (html.includes('사용권한이 없습니다')) throw new Error('zeroboard session rejected');
  const marks = [...html.matchAll(/subject=(\d{4})\/(\d{1,2})\/(\d{1,2})'/g)].map((x) => ({ y: +x[1], m: +x[2], d: +x[3], at: x.index }));
  const out = {};
  marks.forEach((c, i) => {
    if (c.y !== y || c.m !== m) return;
    const cell = html.slice(c.at, i + 1 < marks.length ? marks[i + 1].at : undefined);
    const labels = [...cell.matchAll(/short_msg_show\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].trim()).filter(Boolean);
    if (labels.length) out[c.d] = labels;
  });
  return out;
}

/** Labels (sitelink1) already posted on one calendar day of a board. */
async function dayLabels({ cookie, boardId, y, m, d }) {
  const month = await monthLabels({ cookie, boardId, y, m });
  return month[d] || [];
}

// Build a multipart/form-data body with EUC-KR encoded values.
function multipart(fields) {
  const boundary = '----LayerForm' + Date.now().toString(16);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`, 'latin1'));
    parts.push(iconv.encode(String(value ?? ''), 'EUC-KR'));
    parts.push(Buffer.from('\r\n', 'latin1'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'latin1'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Write a post to a schedule board.
 * @param {object} p
 * @param {string} p.cookie   session cookie from login()
 * @param {string} p.boardId  e.g. 'Layer41'
 * @param {Date}   p.date     booking calendar day as Date.UTC(y, m-1, d)
 * @param {string} p.label    calendar label shown on the month grid (sitelink1)
 * @param {string} p.memo     post body
 * @param {string} p.name     author name shown on the post
 * @param {string} p.password post password (needed to edit/delete without login)
 */
async function writePost({ cookie, boardId, date, label, memo, name, password }) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate(); // date is a UTC calendar day
  const fields = {
    page: '', id: boardId, no: '', select_arrange: '', desc: '', page_num: '', keyword: '', category: '', sn: '', ss: '', sc: '',
    mode: 'write', name, password, email: '', homepage: '', subject: `${y}/${m}/${d}`, sitelink1: label, memo, sitelink2: '',
  };
  const { body, contentType } = multipart(fields);
  const res = await rawRequest('POST', `${BASE}/write_ok.php?year=${y}&month=${m}`, { body, cookie, contentType });
  const html = iconv.decode(res.body, 'EUC-KR');
  const ok = /zboard\.php/i.test(html) && !/사용권한이 없습니다|error|오류/i.test(html.replace(/zboard\.php[^"']*/g, ''));
  return { ok, status: res.headers.split('\r\n')[0], snippet: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
}

const decodeEntities = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripTags = (h) => decodeEntities(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Post numbers linked from one day's cell of the month grid (newest first). */
async function dayPostNos({ cookie, boardId, y, m, d }) {
  const res = await rawRequest('GET', `${BASE}/zboard.php?id=${boardId}&year=${y}&month=${m}`, { cookie });
  const html = iconv.decode(res.body, 'EUC-KR');
  const start = html.indexOf(`subject=${y}/${m}/${d}'`);
  if (start === -1) return [];
  const rest = html.slice(start + 10);
  const next = rest.search(/subject=\d{4}\/\d{1,2}\/\d{1,2}'/);
  const cell = next === -1 ? rest : rest.slice(0, next);
  return [...new Set([...cell.matchAll(/[?&]no=(\d+)/g)].map((x) => x[1]))].sort((a, b) => b - a);
}

/**
 * Find the homepage post for one request on a day: the newest post on that day whose body contains `marker`
 * (e.g. "접수번호 #12"). Returns the post number or null.
 */
async function findPost({ cookie, boardId, y, m, d, marker, limit = 6 }) {
  const nos = (await dayPostNos({ cookie, boardId, y, m, d })).slice(0, limit);
  for (const no of nos) {
    const view = iconv.decode((await rawRequest('GET', `${BASE}/view.php?id=${boardId}&no=${no}`, { cookie })).body, 'EUC-KR');
    if (stripTags(view).includes(marker)) return no;
  }
  return null;
}

/**
 * Current label + body of a post, read from its modify form (needs the staff session).
 * Returns { label, memo, name } or null when the post is gone / not editable.
 */
async function readPost({ cookie, boardId, no, y, m }) {
  const res = await rawRequest('GET', `${BASE}/write.php?id=${boardId}&no=${no}&mode=modify&year=${y}&month=${m}`, { cookie });
  const html = iconv.decode(res.body, 'EUC-KR');
  const memoM = html.match(/<textarea[^>]*name=['"]?memo['"]?[^>]*>([\s\S]*?)<\/textarea>/i);
  if (!memoM) return null;
  const attr = (name) => { const mm = html.match(new RegExp(`<input[^>]*name=['"]?${name}['"]?[^>]*>`, 'i')); if (!mm) return ''; const v = mm[0].match(/value=(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i); return v ? decodeEntities(v[1] ?? v[2] ?? v[3] ?? '') : ''; };
  return { label: attr('sitelink1').trim(), memo: decodeEntities(memoM[1]).replace(/\r\n?/g, '\n'), name: attr('name') };
}

/** Rewrite a post's label + body in place (subject/date unchanged). */
async function modifyPost({ cookie, boardId, no, date, label, memo, name, password }) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const fields = {
    page: '', id: boardId, no, select_arrange: '', desc: '', page_num: '', keyword: '', category: '', sn: '', ss: '', sc: '',
    mode: 'modify', name, password, email: '', homepage: '', is_secret: '', subject: `${y}/${m}/${d}`, sitelink1: label, memo, sitelink2: '',
  };
  const { body, contentType } = multipart(fields);
  const res = await rawRequest('POST', `${BASE}/write_ok.php?year=${y}&month=${m}`, { body, cookie, contentType });
  const html = iconv.decode(res.body, 'EUC-KR');
  const ok = /zboard\.php|view\.php/i.test(html) && !/사용권한이 없습니다|비밀번호가 틀|error|오류/i.test(html.replace(/(zboard|view)\.php[^"']*/g, ''));
  return { ok, status: res.headers.split('\r\n')[0], snippet: stripTags(html).slice(0, 300) };
}

/** Delete a post (owner/admin session deletes outright; otherwise the post password form is answered). */
async function deletePost({ cookie, boardId, no, password }) {
  let html = iconv.decode((await rawRequest('GET', `${BASE}/delete.php?id=${boardId}&no=${no}&page=1`, { cookie })).body, 'EUC-KR');
  if (/name=['"]?password/i.test(html)) {
    const form = new URLSearchParams({ id: boardId, no, page: '1', password, select_arrange: '', desc: '', page_num: '', keyword: '', category: '', sn: '', ss: '', sc: '' });
    html = iconv.decode((await rawRequest('POST', `${BASE}/delete_ok.php`, { cookie, body: Buffer.from(form.toString()) })).body, 'EUC-KR');
  }
  const ok = /삭제|zboard\.php/.test(html) && !/비밀번호가 틀|권한이 없/.test(html);
  return { ok, snippet: stripTags(html).slice(0, 200) };
}

module.exports = { login, writePost, modifyPost, deletePost, readPost, findPost, dayPostNos, probeLogin, dayLabels, monthLabels, rawRequest, BASE, HOST };
