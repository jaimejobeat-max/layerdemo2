#!/usr/bin/env python3
"""Layer Studios — single build script.
Assembles every page from src/partials + src/pages + data/*.json, writes
studios/<key>.html, js/search-index.js and sitemap.xml.
Run from the project root:  python3 tools/build.py
"""
import json, html, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://layerdemo2.vercel.app'
# ---- analytics: fill in to enable (empty = not injected) ----
ANALYTICS = {'ga4': '', 'naver': ''}   # e.g. 'G-XXXXXXXXXX', 'wcs account id'

DATA = json.load(open(ROOT / 'data' / 'studios.json', encoding='utf-8'))
IMAGES = json.load(open(ROOT / 'data' / 'images.json', encoding='utf-8'))
ARCHIVE = json.loads(open(ROOT / 'js' / 'archive-data.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))
JOURNAL = json.loads(open(ROOT / 'js' / 'journal-data.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))
PARTIALS = {p.stem: p.read_text(encoding='utf-8') for p in (ROOT / 'src' / 'partials').glob('*.html')}
PAGES = {p.stem: p.read_text(encoding='utf-8') for p in (ROOT / 'src' / 'pages').glob('*.html')}

def e(s): return html.escape(str(s), quote=True)
def pad(n): return f'{n:02d}'
def render(tpl, ctx):
    for k, v in ctx.items(): tpl = tpl.replace('{{' + k + '}}', str(v))
    return tpl

def img(url, alt, sizes, extra='', P=''):
    m = IMAGES.get(url)
    if not m: return f'<img src="{e(url)}" alt="{e(alt)}" decoding="async" {extra}>'
    s = m['sizes']; small = s.get('960') or s[min(s)]
    srcset = ', '.join(f"{P}{v['src']} {v['w']}w" for k, v in sorted(s.items(), key=lambda kv: int(kv[0])))
    return f'<img src="{P}{small["src"]}" srcset="{srcset}" sizes="{sizes}" width="{m["w"]}" height="{m["h"]}" alt="{e(alt)}" decoding="async" {extra}>'

def og_image(url):
    m = IMAGES.get(url)
    return SITE + '/' + m['sizes']['1920']['src'] if m and '1920' in m['sizes'] else url

def analytics_html():
    out = ''
    if ANALYTICS['ga4']:
        out += f'''
  <script async src="https://www.googletagmanager.com/gtag/js?id={ANALYTICS["ga4"]}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{ANALYTICS["ga4"]}');</script>'''
    if ANALYTICS['naver']:
        out += f'''
  <script src="//wcs.naver.net/wcslog.js"></script>
  <script>if(!wcs_add)var wcs_add={{}};wcs_add["wa"]="{ANALYTICS["naver"]}";if(window.wcs){{wcs_do();}}</script>'''
    return out

def jsonld(obj):
    return '\n  <script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + '</script>'

ORG = {"@context": "https://schema.org", "@type": "Organization", "name": "Layer Studios", "url": SITE + '/',
       "logo": SITE + '/assets/logo-white.png', "telephone": "+82-2-336-7750", "email": "contact@plusjun.com",
       "address": {"@type": "PostalAddress", "streetAddress": "743-27, Hannam-dong", "addressRegion": "Yongsan-gu", "addressLocality": "Seoul", "addressCountry": "KR"}}

# ---------------- shell ----------------
def studio_menu_items(P):
    return '\n'.join(f'        <li{" class=\"menu__gap\"" if i == 0 else ""}><a href="{P}studios/{o["key"]}.html">{e(o["title"])}</a></li>'
                     for i, o in enumerate(o for o in DATA if o['key'] != 'horizon'))

def shell(body, *, title, desc, path, og, P='', body_class='', page_label='', scripts=(), ld=None, robots=''):
    ctx = dict(P=P, title=e(title), desc=e(desc), canonical=SITE + path, og_image=e(og),
               body_class=f' class="{body_class}"' if body_class else '',
               logo_stack=' header__logo--stack' if page_label else '',
               page_label=f'\n      <span class="header__page">{e(page_label)}</span>' if page_label else '',
               studio_items=studio_menu_items(P),
               jsonld=jsonld(ld) if ld else '', analytics=analytics_html(),
               robots=f'\n  <meta name="robots" content="{robots}">' if robots else '',
               scripts='\n'.join(f'  <script src="{P}js/{s}"></script>' for s in ('common.js', 'search-index.js', 'search.js') + tuple(scripts)))
    return render(PARTIALS['head'] + PARTIALS['header'] + PARTIALS['menu'] + PARTIALS['search'] + '\n\n' + body + '\n' + PARTIALS['footer'], ctx)

# ---------------- studio pages ----------------
LINK_KO = {'Rental Fee': '견적표', 'Main Information (PDF)': '기본 안내 (PDF)', 'Parking & More Information': '주차 및 추가 안내', 'View Calendar': '캘린더 보기'}

def related_html(o):
    title = o['title']; items = []
    for d in ARCHIVE:
        if title in d['studios']:
            items.append(dict(kind='Archive', label=(d['type'] or 'Project') + (' · ' + d['date'] if d.get('date') else ''), title=d['title'], img=d['thumb'], set=d.get('thumbSet', ''), href=f"../archives.html#item-{d['id']}"))
    key = title.lower().replace(' ', '')
    for d in JOURNAL:
        if key in (d.get('meta') or '').lower().replace(' ', '') or key in d['title'].lower().replace(' ', ''):
            items.append(dict(kind='Journal', label='Journal' + (' · ' + d['date'] if d.get('date') else ''), title=d['title'], img=d['cover'], set=d.get('coverSet', ''), href=f"../journal.html#item-{d['id']}"))
    if not items: return ''
    cards = ''.join(
        f'<li class="acard"><a href="{e(i["href"])}" class="acard__link"><span class="acard__img"><img src="../{e(i["img"])}"'
        + (f' srcset="{e(", ".join("../" + p.strip() for p in i["set"].split(",")))}" sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"' if i['set'] else '')
        + f' alt="{e(i["title"])}" loading="lazy" decoding="async"></span><span class="acard__meta"><span class="acard__type">{e(i["label"])}</span><span class="acard__title">{e(i["title"])}</span><span class="acard__studio">{e(i["kind"])}</span></span></a></li>'
        for i in items[:6])
    return f'''
    <section class="related" aria-label="Related work">
      <div class="related__head">
        <h2 class="related__title"><span class="en">Shot at {e(title)}</span><span class="ko">{e(title)} 촬영 작업</span></h2>
        <a class="related__more" href="../archives.html"><span class="en">All Archives →</span><span class="ko">전체 아카이브 →</span></a>
      </div>
      <ul class="related__grid">{cards}</ul>
    </section>'''

def part_html(p, idx):
    imgs = ''.join(f'<li class="gallery__item">{img(src, f"{p["name"]} {i+1}", "(max-width: 767px) 90vw, 60vw", "loading=\"eager\"" if (idx == 0 and i < 2) else "loading=\"lazy\"", P="../")}</li>'
                   for i, src in enumerate(p['images']))
    fm = f'<a class="part__floormap" href="{e(p["floormap"][0])}" target="_blank" rel="noopener"><span class="en">Floor Map ↗</span><span class="ko">평면도 ↗</span></a>' if p.get('floormap') else ''
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

def spec_table(o):
    rows = o.get('spec_rows') or []
    if not rows: return ''
    tr = ''.join(f'<tr><th scope="row"><span class="en">{e(r["label_en"])}</span><span class="ko">{e(r["label_ko"])}</span></th><td><span class="en">{e(r["value_en"])}</span><span class="ko">{e(r["value_ko"])}</span></td></tr>' for r in rows)
    return f'''
    <section class="specs" id="specs" aria-label="Specifications">
      <div class="related__head">
        <h2 class="related__title"><span class="en">At a Glance</span><span class="ko">한눈에 보기</span></h2>
        <a class="related__more" href="../guide.html"><span class="en">Booking Guide →</span><span class="ko">예약 안내 →</span></a>
      </div>
      <table class="specs__table"><tbody>{tr}</tbody></table>
    </section>'''

def studio_page(o, prev, nxt):
    parts = ''.join(part_html(p, i) for i, p in enumerate(o['parts']))
    tabs = ''.join(f'<a href="#part-{i}" class="sparts__tab">{e(p["name"])}</a>' for i, p in enumerate(o['parts']))
    if o.get('floormaps'): tabs += '<a href="#floormap" class="sparts__tab"><span class="en">Floor Map</span><span class="ko">평면도</span></a>'
    if o.get('spec_rows'): tabs += '<a href="#specs" class="sparts__tab"><span class="en">At a Glance</span><span class="ko">한눈에 보기</span></a>'
    links = ''.join(f'<li><a href="{e(l["href"])}" target="_blank" rel="noopener"><span class="en">{e(l["label"])} ↗</span><span class="ko">{e(LINK_KO.get(l["label"], l["label"]))} ↗</span></a></li>' for l in o['links'])
    floor = ''
    if o.get('floormaps'):
        floor = '<section class="floormap" id="floormap"><h2 class="part__title"><span class="en">Floor Map</span><span class="ko">평면도</span></h2><div class="floormap__grid">' + ''.join(
            f'<a href="{e(f)}" target="_blank" rel="noopener">{img(f, o["title"] + " floor map", "(max-width: 767px) 100vw, 50vw", "loading=\"lazy\"", P="../")}</a>' for f in o['floormaps']) + '</div></section>'
    hero = img(o['hero'], o['title'], '100vw', 'class="slide__img" fetchpriority="high"', P='../') if o['hero'] else ''
    loc = ''
    if o.get('location_kr') or o.get('location_en'):
        loc = f'''<div class="sinfo__block">
            <h3 class="sinfo__h"><span class="en">Location</span><span class="ko">위치</span></h3>
            <p class="sinfo__ko">{e(o.get('location_kr',''))}</p>
            <p>{e(o.get('location_en',''))}</p>
            {f'<a class="sinfo__link" href="{e(o["map"])}" target="_blank" rel="noopener"><span class="en">View Map ↗</span><span class="ko">지도 보기 ↗</span></a>' if o.get('map') else ''}
          </div>'''
    body = f'''  <main id="main">
    <section class="shero slide is-active" id="hero">
      {hero}
      <div class="slide__overlay"></div>
      <div class="slide__caption">
        <p class="slide__eyebrow">{e(o['area'])}</p>
        <h1 class="slide__title">{e(o['title'])}</h1>
        <p class="slide__type">{e(o['tag'])}</p>
      </div>
      <a class="shero__arrow" href="#info" aria-label="Scroll down">
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
        {f'<div class="sinfo__block"><h3 class="sinfo__h"><span class="en">Information</span><span class="ko">안내</span></h3><ul class="sinfo__list">{links}</ul></div>' if links else ''}
        <a class="sinfo__cta" href="#"><span class="en">Make a Reservation</span><span class="ko">예약하기</span></a>
      </aside>
    </section>

    <nav class="sparts" id="sparts" aria-label="Parts">
      {tabs}
    </nav>

    <div class="parts">{parts}</div>
    {floor}
    {spec_table(o)}
    {related_html(o)}

    <section class="snext">
      <a class="snext__link" href="{prev['key']}.html"><span class="snext__label"><span class="en">← Previous</span><span class="ko">← 이전</span></span><span class="snext__title">{e(prev['title'])}</span></a>
      <a class="snext__link snext__link--all" href="../index.html#studios"><span class="snext__label"><span class="en">All</span><span class="ko">전체</span></span><span class="snext__title">Studios</span></a>
      <a class="snext__link snext__link--next" href="{nxt['key']}.html"><span class="snext__label"><span class="en">Next →</span><span class="ko">다음 →</span></span><span class="snext__title">{e(nxt['title'])}</span></a>
    </section>
  </main>'''
    ld = {"@context": "https://schema.org", "@type": "LocalBusiness", "name": f"Layer Studios — {o['title']}", "url": f"{SITE}/studios/{o['key']}",
          "image": og_image(o['hero']) if o['hero'] else None, "telephone": "+82-2-336-7750", "email": "contact@plusjun.com",
          "description": o.get('desc_en') or o['desc'], "parentOrganization": {"@type": "Organization", "name": "Layer Studios", "url": SITE + '/'}}
    if o.get('location_en'):
        ld["address"] = {"@type": "PostalAddress", "streetAddress": o['location_en'], "addressLocality": "Seoul", "addressCountry": "KR"}
    if o.get('map'): ld["hasMap"] = o['map']
    ld = {k: v for k, v in ld.items() if v}
    return shell(body, title=f"{o['title']} — Layer Studios", desc=(o.get('desc_en') or o['desc'])[:150], path=f"/studios/{o['key']}",
                 og=og_image(o['hero']) if o['hero'] else '', P='../', body_class='page-studio', page_label=o['title'], scripts=('studio.js',), ld=ld)

# ---------------- root pages ----------------
ROOT_PAGES = [
    dict(src='index', out='index.html', title='Layer Studios', desc='서울의 렌탈 포토 스튜디오. Layer 41, 20, 11, 26, 27, 7, 10, Hannam, Hongdae, Faust, Layer 57.', path='/', og='https://plusjun1.cafe24.com/images/mainslide/main_41_06-2.jpg', body_class='', label='', scripts=('main.js',), ld=ORG),
    dict(src='archives', out='archives.html', title='Archives — Layer Studios', desc='Layer Studios에서 촬영된 매거진, 룩북, 영상 아카이브.', path='/archives', og='https://plusjun1.cafe24.com/images/mainslide/main_ys_01.jpg', body_class='page-light', label='Archives', scripts=('archive-data.js', 'archive.js')),
    dict(src='journal', out='journal.html', title='Journal — Layer Studios', desc='Layer Studios의 전시, 이벤트, 공간 소식을 담은 저널.', path='/journal', og='https://plusjun1.cafe24.com/images/mainslide/main_26_01.jpg', body_class='page-light', label='Journal', scripts=('journal-data.js', 'journal.js')),
    dict(src='about', out='about.html', title='About — Layer Studios', desc='2009년 포토그래퍼의 작은 촬영 공간에서 시작된 레이어 스튜디오 소개.', path='/about', og='https://plusjun1.cafe24.com/images/mainslide/main_41_06-2.jpg', body_class='page-light', label='About', scripts=('page.js',)),
    dict(src='guide', out='guide.html', title='Guide — Layer Studios', desc='레이어 스튜디오 예약 방법, 이용 안내, 예약금과 환불 기준.', path='/guide', og='https://plusjun1.cafe24.com/images/mainslide/main_41_06-2.jpg', body_class='page-light', label='Guide', scripts=('page.js',)),
    dict(src='qna', out='qna.html', title='Q&A — Layer Studios', desc='레이어 스튜디오 자주 묻는 질문과 문의 양식.', path='/qna', og='https://plusjun1.cafe24.com/images/mainslide/main_41_06-2.jpg', body_class='page-light', label='Q&A', scripts=('page.js',)),
    dict(src='404', out='404.html', title='Page Not Found — Layer Studios', desc='Page not found.', path='/404', og='https://plusjun1.cafe24.com/images/mainslide/main_41_06-2.jpg', body_class='page-light', label='', scripts=('page.js',), robots='noindex', P='/'),
]

def search_index():
    items = []
    for o in DATA:
        items.append(dict(k='studio', t=o['title'], s=f"{o['area']} · {o['tag']}", s_ko=f"{o.get('area_ko','')} · {o.get('tag_ko','')}", q=' '.join([o['title'], o['area'], o['tag'], o.get('area_ko',''), o.get('tag_ko',''), o['desc'][:200], (o.get('desc_en') or '')[:200], o.get('location_kr',''), o.get('location_en','')]), h=f"studios/{o['key']}.html", i=(IMAGES.get(o['hero'], {}).get('sizes', {}).get('960', {}).get('src', ''))))
    for d in ARCHIVE:
        items.append(dict(k='archive', t=d['title'], s=(d['type'] or 'Project') + (' · ' + d['date'] if d.get('date') else '') + (' · ' + ' / '.join(d['studios']) if d['studios'] else ''), q=' '.join([d['title'], d['type'], ' '.join(d['studios']), ' '.join(d.get('credits', []))]), h=f"archives.html#item-{d['id']}", i=d['thumb']))
    for d in JOURNAL:
        items.append(dict(k='journal', t=d['title'], s=(d.get('date') or '') + (' · ' + d['meta'] if d.get('meta') else ''), q=' '.join([d['title'], d.get('meta') or '', ' '.join(d.get('paras', [])[:3])[:300]]), h=f"journal.html#item-{d['id']}", i=d['cover']))
    return '/* Generated by tools/build.py — search index */\nwindow.SEARCH_INDEX = ' + json.dumps(items, ensure_ascii=False, separators=(',', ':')) + ';\n'

def main():
    n = len(DATA)
    for i, o in enumerate(DATA):
        (ROOT / 'studios' / f"{o['key']}.html").write_text(studio_page(o, DATA[(i - 1) % n], DATA[(i + 1) % n]), encoding='utf-8')
    for pg in ROOT_PAGES:
        body = PAGES[pg['src']]
        (ROOT / pg['out']).write_text(shell(body, title=pg['title'], desc=pg['desc'], path=pg['path'], og=og_image(pg['og']), P=pg.get('P', ''), body_class=pg['body_class'], page_label=pg['label'], scripts=pg['scripts'], ld=pg.get('ld'), robots=pg.get('robots', '')), encoding='utf-8')
    (ROOT / 'js' / 'search-index.js').write_text(search_index(), encoding='utf-8')
    today = datetime.date.today().isoformat()
    urls = ['/', '/archives', '/journal', '/about', '/guide', '/qna'] + [f"/studios/{o['key']}" for o in DATA]
    (ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>\n' for u in urls) + '</urlset>\n', encoding='utf-8')
    print(f'built {n} studio pages, {len(ROOT_PAGES)} root pages, search index, sitemap')

if __name__ == '__main__':
    main()
