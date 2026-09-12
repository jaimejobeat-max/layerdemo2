#!/usr/bin/env python3
"""Generate studios/<key>.html from data/studios.json.
Run from the project root:  python3 tools/build_studios.py
"""
import json, html, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.load(open(ROOT / 'data' / 'studios.json', encoding='utf-8'))
OUT = ROOT / 'studios'
OUT.mkdir(exist_ok=True)
IMAGES = json.load(open(ROOT / 'data' / 'images.json', encoding='utf-8')) if (ROOT / 'data' / 'images.json').exists() else {}
SITE = 'https://layerdemo2.vercel.app'

def img(url, alt, sizes, extra=''):
    """<img> tag using local WebP srcset when available, remote URL otherwise."""
    m = IMAGES.get(url)
    if not m:
        return f'<img src="{e(url)}" alt="{e(alt)}" {extra}>'
    s = m['sizes']; small = s.get('960') or s[min(s)]
    srcset = ', '.join(f"../{v['src']} {v['w']}w" for k, v in sorted(s.items(), key=lambda kv: int(kv[0])))
    return f'<img src="../{small["src"]}" srcset="{srcset}" sizes="{sizes}" width="{m["w"]}" height="{m["h"]}" alt="{e(alt)}" {extra}>'

def og_image(url):
    m = IMAGES.get(url)
    return SITE + '/' + m['sizes']['1920']['src'] if m and '1920' in m['sizes'] else url

def e(s): return html.escape(str(s), quote=True)
def pad(n): return f'{n:02d}'

MENU = [('Reservation', '#'), ('Archives', '../archives.html')]
STUDIO_MENU = [(o['title'], f"{o['key']}.html") for o in DATA if o['key'] != 'horizon']
UTIL = [('Journal', '../journal.html'), ('Q&A', '../qna.html'), ('Guide', '../guide.html'), ('About', '../about.html')]
ARCHIVE = json.loads(open(ROOT / 'js' / 'archive-data.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))
JOURNAL = json.loads(open(ROOT / 'js' / 'journal-data.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))

def related_html(o):
    """Archive + journal entries shot at this studio (max 6)."""
    title = o['title']
    items = []
    for d in ARCHIVE:
        if title in d['studios']:
            items.append(dict(kind='Archive', label=(d['type'] or 'Project') + (' · ' + d['date'] if d.get('date') else ''), title=d['title'], img=d['thumb'], set=d.get('thumbSet', ''), href=f"../archives.html#item-{d['id']}"))
    for d in JOURNAL:
        if title.lower().replace(' ', '') in (d.get('meta') or '').lower().replace(' ', '') or title.lower().replace(' ', '') in d['title'].lower().replace(' ', ''):
            items.append(dict(kind='Journal', label='Journal' + (' · ' + d['date'] if d.get('date') else ''), title=d['title'], img=d['cover'], set=d.get('coverSet', ''), href=f"../journal.html#item-{d['id']}"))
    if not items: return ''
    cards = ''.join(
        f'<li class="acard"><a href="{e(i["href"])}" class="acard__link">'
        f'<span class="acard__img"><img src="../{e(i["img"])}"' + (f' srcset="{e(", ".join("../" + p.strip() for p in i["set"].split(",")))}" sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"' if i['set'] else '') + f' alt="{e(i["title"])}" loading="lazy"></span>'
        f'<span class="acard__meta"><span class="acard__type">{e(i["label"])}</span><span class="acard__title">{e(i["title"])}</span><span class="acard__studio">{e(i["kind"])}</span></span></a></li>'
        for i in items[:6])
    return f'''
    <section class="related" aria-label="관련 작업">
      <div class="related__head">
        <h2 class="related__title"><span class="en">Shot at {e(title)}</span><span class="ko">{e(title)} 촬영 작업</span></h2>
        <a class="related__more" href="../archives.html"><span class="en">All Archives →</span><span class="ko">전체 아카이브 →</span></a>
      </div>
      <ul class="related__grid">{cards}</ul>
    </section>'''

def menu_html():
    items = [f'<li><a href="{h}">{e(t)}</a></li>' for t, h in MENU]
    items += [f'<li{" class=\"menu__gap\"" if i == 0 else ""}><a href="{h}">{e(t)}</a></li>' for i, (t, h) in enumerate(STUDIO_MENU)]
    items += [f'<li{" class=\"menu__gap\"" if i == 0 else ""}><a href="{h}">{e(t)}</a></li>' for i, (t, h) in enumerate(UTIL)]
    return '\n        '.join(items)

def part_html(p, idx):
    imgs = ''.join(
        f'<li class="gallery__item">{img(src, f"{p["name"]} {i+1}", "(max-width: 767px) 90vw, 60vw", "loading=\"lazy\"")}</li>'
        for i, src in enumerate(p['images']))
    fm = ''
    if p.get('floormap'):
        fm = f'<a class="part__floormap" href="{e(p["floormap"][0])}" target="_blank" rel="noopener"><span class="en">Floor Map ↗</span><span class="ko">평면도 ↗</span></a>'
    return f'''
      <section class="part" id="part-{idx}" data-part>
        <div class="part__head">
          <h2 class="part__title">{e(p['name'])}</h2>
          <div class="part__ui">
            {fm}
            <span class="part__counter" data-counter>01 / {pad(len(p['images']))}</span>
            <button type="button" class="part__btn" data-prev aria-label="Prev">←</button>
            <button type="button" class="part__btn" data-next aria-label="Next">→</button>
          </div>
        </div>
        <ul class="gallery" data-gallery>{imgs}</ul>
      </section>'''

def page(o, prev, nxt):
    parts = ''.join(part_html(p, i) for i, p in enumerate(o['parts']))
    tabs = ''.join(f'<a href="#part-{i}" class="sparts__tab">{e(p["name"])}</a>' for i, p in enumerate(o['parts']))
    if o.get('floormaps'):
        tabs += '<a href="#floormap" class="sparts__tab"><span class="en">Floor Map</span><span class="ko">평면도</span></a>'
    LINK_KO = {'Rental Fee': '견적표', 'Main Information (PDF)': '기본 안내 (PDF)', 'Parking & More Information': '주차 및 추가 안내', 'View Calendar': '캘린더 보기'}
    links = ''.join(f'<li><a href="{e(l["href"])}" target="_blank" rel="noopener"><span class="en">{e(l["label"])} ↗</span><span class="ko">{e(LINK_KO.get(l["label"], l["label"]))} ↗</span></a></li>' for l in o['links'])
    specs = ''
    if o.get('specs'):
        specs = '<div class="sinfo__block"><h3 class="sinfo__h"><span class="en">Specifications</span><span class="ko">규모</span></h3><ul class="sinfo__list">' + ''.join(f'<li>{e(s)}</li>' for s in o['specs']) + '</ul></div>'
    floor = ''
    if o.get('floormaps'):
        floor = '<section class="floormap" id="floormap"><h2 class="part__title"><span class="en">Floor Map</span><span class="ko">평면도</span></h2><div class="floormap__grid">' + ''.join(
            f'<a href="{e(f)}" target="_blank" rel="noopener">{img(f, o["title"] + " floor map", "(max-width: 767px) 100vw, 50vw", "loading=\"lazy\"")}</a>' for f in o['floormaps']) + '</div></section>'
    hero = img(o['hero'], o['title'], '100vw', 'class="slide__img" fetchpriority="high"') if o['hero'] else ''
    loc = ''
    if o.get('location_kr') or o.get('location_en'):
        loc = f'''<div class="sinfo__block">
            <h3 class="sinfo__h"><span class="en">Location</span><span class="ko">위치</span></h3>
            <p class="sinfo__ko">{e(o.get('location_kr',''))}</p>
            <p>{e(o.get('location_en',''))}</p>
            {f'<a class="sinfo__link" href="{e(o["map"])}" target="_blank" rel="noopener"><span class="en">View Map ↗</span><span class="ko">지도 보기 ↗</span></a>' if o.get('map') else ''}
          </div>'''
    return f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{e(o['title'])} — Layer Studios</title>
  <meta name="description" content="{e(o['desc'][:150])}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Layer Studios">
  <meta property="og:title" content="{e(o['title'])} — Layer Studios">
  <meta property="og:description" content="{e(o['desc'][:150])}">
  <meta property="og:image" content="{e(og_image(o['hero']))}">
  <meta property="og:url" content="{SITE}/studios/{o['key']}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#000000">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
  <script src="../js/i18n.js"></script>
  <link rel="stylesheet" href="../css/style.css">
</head>
<body class="page-studio">
  <a class="skip-link" href="#main" data-i18n="skip">본문으로 건너뛰기</a>

  <header class="header" id="header">
    <a class="header__logo header__logo--stack" href="../index.html" aria-label="Layer Studios 홈">
      <img src="../assets/logo-white.png" alt="Layer Studios">
      <span class="header__page">{e(o['title'])}</span>
    </a>
    <nav class="header__nav" aria-label="유틸리티 메뉴">
      <a href="../guide.html" class="header__link">Guide</a>
      <a href="../about.html" class="header__link">About</a>
      <a href="../journal.html" class="header__link">Journal</a>
      <a href="../qna.html" class="header__link">Q&amp;A</a>
      <a href="#" class="header__link header__link--ko"><span class="ko">로그인</span><span class="en">Login</span></a>
      <a href="#" class="header__link header__link--ko"><span class="ko">고객 서비스</span><span class="en">Client Service</span></a>
      <button type="button" class="header__lang" data-lang-toggle aria-label="KO / EN"><span data-lang-opt="ko">KO</span><span class="header__lang-sep">/</span><span data-lang-opt="en">EN</span></button>
      <button class="header__icon header__menu-btn" type="button" data-i18n-attr="aria-label:menu.open" aria-expanded="false" data-menu-toggle>
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M0 1h18M0 7h18M0 13h18"/></svg>
      </button>
    </nav>
  </header>

  <div class="menu" id="menu" hidden>
    <div class="menu__inner">
      <button class="menu__close" type="button" data-i18n-attr="aria-label:menu.close" data-menu-toggle data-i18n="close">Close</button>
      <ul class="menu__list">
        {menu_html()}
      </ul>
      <div class="menu__lang"><a href="#" data-lang-set="ko">KO</a><a href="#" data-lang-set="en">EN</a></div>
    </div>
  </div>

  <main id="main">
    <section class="shero slide is-active" id="hero">
      {hero}
      <div class="slide__overlay"></div>
      <div class="slide__caption">
        <p class="slide__eyebrow">{e(o['area'])}</p>
        <h1 class="slide__title">{e(o['title'])}</h1>
        <p class="slide__type">{e(o['tag'])}</p>
      </div>
      <a class="shero__arrow" href="#info" aria-label="아래로">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 1l5 5 5-5"/></svg>
      </a>
    </section>

    <section class="sinfo" id="info">
      <div class="sinfo__desc">
        <p class="ko">{e(o['desc'])}</p>
        <p class="en">{e(o.get('desc_en', o['desc']))}</p>
      </div>
      <aside class="sinfo__side">
        {loc}
        {specs}
        {f'<div class="sinfo__block"><h3 class="sinfo__h"><span class="en">Information</span><span class="ko">안내</span></h3><ul class="sinfo__list">{links}</ul></div>' if links else ''}
        <a class="sinfo__cta" href="#"><span class="en">Make a Reservation</span><span class="ko">예약하기</span></a>
      </aside>
    </section>

    <nav class="sparts" id="sparts" aria-label="공간 구성">
      {tabs}
    </nav>

    <div class="parts">{parts}</div>
    {floor}
    {related_html(o)}

    <section class="snext">
      <a class="snext__link" href="{prev['key']}.html"><span class="snext__label"><span class="en">← Previous</span><span class="ko">← 이전</span></span><span class="snext__title">{e(prev['title'])}</span></a>
      <a class="snext__link snext__link--all" href="../index.html#studios"><span class="snext__label"><span class="en">All</span><span class="ko">전체</span></span><span class="snext__title">Studios</span></a>
      <a class="snext__link snext__link--next" href="{nxt['key']}.html"><span class="snext__label"><span class="en">Next →</span><span class="ko">다음 →</span></span><span class="snext__title">{e(nxt['title'])}</span></a>
    </section>
  </main>

  <footer class="footer">
    <div class="footer__cols">
      <div class="footer__col">
        <h3 class="footer__h"><span class="en">Location</span><span class="ko">위치</span></h3>
        <p class="en">743-27, Hannam-dong<br>Yongsan-gu, Seoul</p><p class="ko">서울 용산구 한남동 743-27</p>
        <a href="../index.html#studios" class="footer__arrow-link"><span class="en">Find Studios</span><span class="ko">스튜디오 보기</span></a>
      </div>
      <div class="footer__col">
        <h3 class="footer__h"><span class="en">Contact</span><span class="ko">연락처</span></h3>
        <p><a href="tel:0233567750">02.336.7750</a><br><a href="mailto:contact@plusjun.com">contact@plusjun.com</a></p>
        <a href="#" class="footer__arrow-link"><span class="en">Reservation</span><span class="ko">예약</span></a>
      </div>
      <div class="footer__col">
        <h3 class="footer__h"><span class="en">Legal</span><span class="ko">법적 고지</span></h3>
        <ul class="footer__links">
          <li><a href="#"><span class="en">Terms</span><span class="ko">이용약관</span></a></li>
          <li><a href="#"><span class="en">Privacy</span><span class="ko">개인정보처리방침</span></a></li>
          <li><a href="../guide.html"><span class="en">Guide</span><span class="ko">가이드</span></a></li>
          <li><a href="#"><span class="en">Careers</span><span class="ko">채용</span></a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h3 class="footer__h"><span class="en">Newsletter</span><span class="ko">뉴스레터</span></h3>
        <form class="footer__form" onsubmit="return false">
          <label for="nl" class="visually-hidden" data-i18n="email">이메일</label>
          <input id="nl" type="email" placeholder="Email" data-i18n-attr="placeholder:email" autocomplete="off">
          <button type="submit" aria-label="구독">→</button>
        </form>
      </div>
    </div>
    <div class="footer__bottom">
      <p class="footer__legal en">Layer Studios · Founder Heo Jun-sung · Business No. 837-87-01038 · Mail-order License 2018-서울성동-0310</p><p class="footer__legal ko">주식회사 레이어스튜디오 · 대표 허준성 · 사업자등록번호 837-87-01038 · 통신판매업신고 2018-서울성동-0310</p>
      <p class="footer__copy">© 2009 — 2026 Layer Studios</p>
    </div>
  </footer>

  <script src="../js/common.js"></script>
  <script src="../js/studio.js"></script>
</body>
</html>
'''

n = len(DATA)
for i, o in enumerate(DATA):
    prev, nxt = DATA[(i - 1) % n], DATA[(i + 1) % n]
    (OUT / f"{o['key']}.html").write_text(page(o, prev, nxt), encoding='utf-8')
    print('wrote', f"studios/{o['key']}.html")
