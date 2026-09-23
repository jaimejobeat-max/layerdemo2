#!/usr/bin/env node
// Delete a homepage-made provisional (++) post from a Zeroboard schedule board.
// Usage: RAYSODA_ID=… RAYSODA_PW=… node tools/delete_post.js <boardId> <YYYY-MM-DD> [--yes]
//   e.g. RAYSODA_ID=… RAYSODA_PW=… node tools/delete_post.js Layer41 2026-09-24 --yes
// Without --yes it only lists the candidate posts for that day.
// Only posts whose body says "홈페이지 예약 신청" are ever touched.
const iconv = require('iconv-lite');
const { login, rawRequest, BASE } = require('../api/_zeroboard');

const [boardId, day, flag] = process.argv.slice(2);
if (!boardId || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) { console.error('usage: node tools/delete_post.js <boardId> <YYYY-MM-DD> [--yes]'); process.exit(1); }
const id = process.env.RAYSODA_ID, pw = process.env.RAYSODA_PW, postPw = process.env.RESERVE_POST_PW || 'layer';
if (!id || !pw) { console.error('set RAYSODA_ID and RAYSODA_PW'); process.exit(1); }
const [y, m, d] = day.split('-').map(Number);

function text(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

(async () => {
  const cookie = await login(id, pw);
  const month = iconv.decode((await rawRequest('GET', `${BASE}/zboard.php?id=${boardId}&year=${y}&month=${m}`, { cookie })).body, 'EUC-KR');
  const start = month.indexOf(`subject=${y}/${m}/${d}'`);
  if (start === -1) { console.log('no posts on', day); return; }
  const rest = month.slice(start + 10);
  const next = rest.search(/subject=\d{4}\/\d{1,2}\/\d{1,2}'/);
  const cell = next === -1 ? rest : rest.slice(0, next);
  const nos = [...new Set([...cell.matchAll(/[?&]no=(\d+)/g)].map((x) => x[1]))];
  console.log(`${day} on ${boardId}: ${nos.length} post(s)`, nos);

  const targets = [];
  for (const no of nos) {
    const view = iconv.decode((await rawRequest('GET', `${BASE}/view.php?id=${boardId}&no=${no}`, { cookie })).body, 'EUC-KR');
    const t = text(view);
    const mine = t.includes('홈페이지 예약 신청');
    console.log(`- no=${no} ${mine ? '[homepage]' : '[other]'} ${t.slice(t.indexOf('====') > -1 ? t.indexOf('====') : 0, 160)}`);
    if (mine) targets.push(no);
  }
  if (!targets.length) { console.log('nothing from the homepage form on this day'); return; }
  if (flag !== '--yes') { console.log(`\nre-run with --yes to delete post(s): ${targets.join(', ')}`); return; }

  for (const no of targets) {
    // Zeroboard: delete.php deletes outright for the owner/admin; otherwise it shows a password form that posts to delete_ok.php.
    let res = iconv.decode((await rawRequest('GET', `${BASE}/delete.php?id=${boardId}&no=${no}&page=1`, { cookie })).body, 'EUC-KR');
    if (/name=['"]?password/i.test(res)) {
      const form = new URLSearchParams({ id: boardId, no, page: '1', password: postPw, select_arrange: '', desc: '', page_num: '', keyword: '', category: '', sn: '', ss: '', sc: '' });
      res = iconv.decode((await rawRequest('POST', `${BASE}/delete_ok.php`, { cookie, body: Buffer.from(form.toString()) })).body, 'EUC-KR');
    }
    const ok = /삭제|zboard\.php/.test(res) && !/비밀번호가 틀|권한이 없/.test(res);
    console.log(`delete no=${no}: ${ok ? 'ok' : 'FAILED'} — ${text(res).slice(0, 120)}`);
  }
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
