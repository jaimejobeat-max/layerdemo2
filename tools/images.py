#!/usr/bin/env python3
"""Download remote images, convert to WebP at 1920/960 widths, write data/images.json.
Usage: python3 tools/images.py <urls.json>   (list of URLs)
Cache of originals: $SCRATCH/imgcache
"""
import sys, json, hashlib, pathlib, subprocess, concurrent.futures as cf
from PIL import Image, ImageOps
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'img'; OUT.mkdir(parents=True, exist_ok=True)
MAP = ROOT / 'data' / 'images.json'
CACHE = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path('/tmp/imgcache'); CACHE.mkdir(parents=True, exist_ok=True)
WIDTHS = [1920, 960]
QUALITY = 78
urls = json.load(open(sys.argv[1]))
mapping = json.load(open(MAP)) if MAP.exists() else {}

def key(u): return hashlib.sha1(u.encode()).hexdigest()[:10]
def fetch(u):
    p = CACHE / key(u)
    if p.exists() and p.stat().st_size > 0: return p
    r = subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', '--max-time', '120', '-o', str(p), u])
    return p if p.exists() and p.stat().st_size > 0 else None
def convert(u):
    if u in mapping and all((ROOT / v['src']).exists() for v in mapping[u]['sizes'].values()): return u, mapping[u]
    p = fetch(u)
    if not p: return u, None
    try:
        im = Image.open(p); im = ImageOps.exif_transpose(im).convert('RGB')
    except Exception as e:
        return u, None
    w, h = im.size; k = key(u); sizes = {}
    for tw in WIDTHS:
        if w < tw and tw != min(WIDTHS): continue  # never upscale, but always emit the smallest
        r = min(1, tw / w); out = im.resize((round(w * r), round(h * r)), Image.LANCZOS) if r < 1 else im
        f = OUT / f'{k}-{tw}.webp'; out.save(f, 'WEBP', quality=QUALITY, method=4)
        sizes[str(tw)] = {'src': f'assets/img/{f.name}', 'w': out.size[0], 'h': out.size[1]}
    return u, {'w': w, 'h': h, 'sizes': sizes}
done = 0; fail = []
with cf.ThreadPoolExecutor(10) as ex:
    for u, m in ex.map(convert, urls):
        done += 1
        if m: mapping[u] = m
        else: fail.append(u)
        if done % 50 == 0: print(f'{done}/{len(urls)}', flush=True)
json.dump(mapping, open(MAP, 'w'), indent=0)
print('done', len(mapping), 'failed', len(fail)); [print('  FAIL', f) for f in fail]
