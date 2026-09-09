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
UTIL = [('Journal', '../journal.html'), ('Q&A', '#'), ('Guide', '#'), ('About', '#')]

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
        fm = f'<a class="part__floormap" href="{e(p["floormap"][0])}" target="_blank" rel="noopener">Floor Map ↗</a>'
    return f'''
      <section class="part" id="part-{idx}" data-part>
        <div class="part__head">
          <h2 class="part__title">{e(p['name'])}</h2>
          <div class="part__ui">
            {fm}
            <span class="part__counter" data-counter>01 / {pad(len(p['images']))}</span>
            <button type="button" class="part__btn" data-prev aria-label="이전 이미지">←</button>
            <button type="button" class="part__btn" data-next aria-label="다음 이미지">→</button>
          </div>
        </div>
        <ul class="gallery" data-gallery>{imgs}</ul>
      </section>'''

def page(o, prev, nxt):
    parts = ''.join(part_html(p, i) for i, p in enumerate(o['parts']))
    tabs = ''.join(f'<a href="#part-{i}" class="sparts__tab">{e(p["name"])}</a>' for i, p in enumerate(o['parts']))
    if o.get('floormaps'):
        tabs += '<a href="#floormap" class="sparts__tab">Floor Map</a>'
    links = ''.join(f'<li><a href="{e(l["href"])}" target="_blank" rel="noopener">{e(l["label"])} ↗</a></li>' for l in o['links'])
    specs = ''
    if o.get('specs'):
        specs = '<div class="sinfo__block"><h3 class="sinfo__h">Specifications</h3><ul class="sinfo__list">' + ''.join(f'<li>{e(s)}</li>' for s in o['specs']) + '</ul></div>'
    floor = ''
    if o.get('floormaps'):
        floor = '<section class="floormap" id="floormap"><h2 class="part__title">Floor Map</h2><div class="floormap__grid">' + ''.join(
            f'<a href="{e(f)}" target="_blank" rel="noopener">{img(f, o["title"] + " floor map", "(max-width: 767px) 100vw, 50vw", "loading=\"lazy\"")}</a>' for f in o['floormaps']) + '</div></section>'
    hero = img(o['hero'], o['title'], '100vw', 'class="slide__img" fetchpriority="high"') if o['hero'] else ''
    loc = ''
    if o.get('location_kr') or o.get('location_en'):
        loc = f'''<div class="sinfo__block">
            <h3 class="sinfo__h">Location</h3>
            <p class="sinfo__ko">{e(o.get('location_kr',''))}</p>
            <p>{e(o.get('location_en',''))}</p>
            {f'<a class="sinfo__link" href="{e(o["map"])}" target="_blank" rel="noopener">View Map ↗</a>' if o.get('map') else ''}
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
  <link rel="stylesheet" href="../css/style.css">
</head>
<body class="page-studio">
  <a class="skip-link" href="#main">본문으로 건너뛰기</a>

  <header class="header" id="header">
    <a class="header__logo header__logo--stack" href="../index.html" aria-label="Layer Studios 홈">
      <img src="../assets/logo-white.png" alt="Layer Studios">
      <span class="header__page">{e(o['title'])}</span>
    </a>
    <nav class="header__nav" aria-label="유틸리티 메뉴">
      <a href="#" class="header__link">Guide</a>
      <a href="#" class="header__link">About</a>
      <a href="../journal.html" class="header__link">Journal</a>
      <a href="#" class="header__link">Q&amp;A</a>
      <a href="#" class="header__link header__link--ko">로그인</a>
      <a href="#" class="header__link header__link--ko">고객 서비스</a>
      <button class="header__icon header__menu-btn" type="button" aria-label="메뉴 열기" aria-expanded="false" data-menu-toggle>
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M0 1h18M0 7h18M0 13h18"/></svg>
      </button>
    </nav>
  </header>

  <div class="menu" id="menu" hidden>
    <div class="menu__inner">
      <button class="menu__close" type="button" aria-label="메뉴 닫기" data-menu-toggle>Close</button>
      <ul class="menu__list">
        {menu_html()}
      </ul>
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
        <p>{e(o['desc'])}</p>
      </div>
      <aside class="sinfo__side">
        {loc}
        {specs}
        {f'<div class="sinfo__block"><h3 class="sinfo__h">Information</h3><ul class="sinfo__list">{links}</ul></div>' if links else ''}
        <a class="sinfo__cta" href="#">Make a Reservation</a>
      </aside>
    </section>

    <nav class="sparts" id="sparts" aria-label="공간 구성">
      {tabs}
    </nav>

    <div class="parts">{parts}</div>
    {floor}

    <section class="snext">
      <a class="snext__link" href="{prev['key']}.html"><span class="snext__label">← Previous</span><span class="snext__title">{e(prev['title'])}</span></a>
      <a class="snext__link snext__link--all" href="../index.html#studios"><span class="snext__label">All</span><span class="snext__title">Studios</span></a>
      <a class="snext__link snext__link--next" href="{nxt['key']}.html"><span class="snext__label">Next →</span><span class="snext__title">{e(nxt['title'])}</span></a>
    </section>
  </main>

  <footer class="footer">
    <div class="footer__cols">
      <div class="footer__col">
        <h3 class="footer__h">Location</h3>
        <p>743-27, Hannam-dong<br>Yongsan-gu, Seoul</p>
        <a href="../index.html#studios" class="footer__arrow-link">Find Studios</a>
      </div>
      <div class="footer__col">
        <h3 class="footer__h">Contact</h3>
        <p><a href="tel:0233567750">02.336.7750</a><br><a href="mailto:contact@plusjun.com">contact@plusjun.com</a></p>
        <a href="#" class="footer__arrow-link">Reservation</a>
      </div>
      <div class="footer__col">
        <h3 class="footer__h">Legal</h3>
        <ul class="footer__links">
          <li><a href="#">Terms</a></li>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Guide</a></li>
          <li><a href="#">Careers</a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h3 class="footer__h">Newsletter</h3>
        <form class="footer__form" onsubmit="return false">
          <label for="nl" class="visually-hidden">이메일</label>
          <input id="nl" type="email" placeholder="Email" autocomplete="off">
          <button type="submit" aria-label="구독">→</button>
        </form>
      </div>
    </div>
    <div class="footer__bottom">
      <p class="footer__legal">Layer Studios · Founder Heo Jun-sung · Business No. 837-87-01038 · Mail-order License 2018-서울성동-0310</p>
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
