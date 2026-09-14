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

module.exports = { login, writePost, probeLogin, rawRequest, BASE, HOST };
