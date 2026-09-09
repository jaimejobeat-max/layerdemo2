#!/usr/bin/env python3
"""Rewrite remote image URLs to local WebP (srcset) using data/images.json.
Covers index.html, js/archive-data.js, js/journal-data.js. Studio pages are
handled by tools/build_studios.py which reads the same map."""
import re, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP = json.load(open(ROOT / 'data' / 'images.json'))

def srcset(url, prefix=''):
    m = MAP.get(url)
    if not m: return None
    s = m['sizes']; small = s.get('960') or s[min(s)]; parts = [f"{prefix}{v['src']} {v['w']}w" for k, v in sorted(s.items(), key=lambda kv: int(kv[0]))]
    return {'src': prefix + small['src'], 'srcset': ', '.join(parts), 'w': m['w'], 'h': m['h']}

def rewrite_img_tags(html, sizes_for):
    def rep(m):
        tag = m.group(0); url = m.group(1)
        r = srcset(url)
        if not r: return tag
        cls = re.search(r'class="([^"]*)"', tag); cls = cls.group(1) if cls else ''
        sizes = sizes_for(cls)
        tag = tag.replace(f'src="{url}"', f'src="{r["src"]}" srcset="{r["srcset"]}" sizes="{sizes}"')
        if 'width=' not in tag: tag = tag.replace('<img ', f'<img width="{r["w"]}" height="{r["h"]}" ', 1)
        return tag
    return re.sub(r'<img[^>]+src="(https?://[^"]+)"[^>]*>', rep, html)

# --- index.html ---
p = ROOT / 'index.html'; s = p.read_text()
s = rewrite_img_tags(s, lambda cls: '100vw' if 'slide__img' in cls else '(max-width: 767px) 100vw, 50vw')
# first slide: eager + high priority
s = s.replace('loading="eager"', 'loading="eager" fetchpriority="high"', 1)
p.write_text(s); print('index.html remote imgs left:', len(re.findall(r'<img[^>]+src="https?://', s)))

# --- data js: thumb/cover ---
for f, key in [('js/archive-data.js', 'thumb'), ('js/journal-data.js', 'cover')]:
    p = ROOT / f; s = p.read_text(); head = s[:s.index('=') + 1]
    data = json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))
    n = 0
    for o in data:
        r = srcset(o[key])
        if r: o[key + 'Src'] = o[key]; o[key] = r['src']; o[key + 'Set'] = r['srcset']; n += 1
    p.write_text(head + ' ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f, 'localised', n, '/', len(data))
