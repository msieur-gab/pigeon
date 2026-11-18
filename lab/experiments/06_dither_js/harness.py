# Usage: python3 harness.py ../../dither.js 120 photo.jpg ...   (bytes; -0.9 = 90% of each photo's room)
# env: QS=87,66,62 (qualities, 'sent' = no re-encode)  OPTS='{"grid":50}'
# Sim: cover (1280 px) -> JS embed -> JPEG q92 (what Pigeon shares) -> app re-encode at q -> JS extract
import sys, io, os, json, subprocess, random, tempfile
import numpy as np
from PIL import Image, ImageOps
S = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(S, 'cli.mjs')
TMP = tempfile.mkdtemp(prefix='pigeon-dither-')

def cover(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    s = 1280 / max(im.size)
    w, h = int(im.width * s) // 16 * 16, int(im.height * s) // 16 * 16
    return np.array(im.resize((w, h), Image.LANCZOS))
def rgba(a): return np.dstack([a, np.full(a.shape[:2], 255, np.uint8)]).tobytes()
def jpg(a, q): b = io.BytesIO(); Image.fromarray(a).save(b, 'JPEG', quality=q); return b.getvalue()
def dec(b): return np.array(Image.open(io.BytesIO(b)).convert('RGB'))
def node(*args):
    out = subprocess.run(['node', CLI, *map(str, args)], capture_output=True, text=True)
    if out.returncode: return {'error': out.stderr.strip().splitlines()[-1]}
    return json.loads(out.stdout)
def blockstd(a):
    Y = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    h, w = Y.shape[0] // 8, Y.shape[1] // 8
    return Y[:h*8, :w*8].reshape(h, 8, w, 8).std(axis=(1, 3)).ravel()

def run(mod, path, nbytes, qs, opts=None, tag=''):
    a = cover(path); h, w = a.shape[:2]
    raw, out = os.path.join(TMP, 'c.raw'), os.path.join(TMP, 's.raw')
    open(raw, 'wb').write(rgba(a))
    room = node(mod, 'capacity', raw, w, h, '', '', json.dumps(opts) if opts else '').get('room')
    n = nbytes if nbytes > 0 else max(1, int(room * -nbytes))
    rnd = random.Random(n)
    msg = bytes(rnd.choice(b'abcdefghijklmnopqrstuvwxyz ,.') for _ in range(n))
    e = node(mod, 'embed', raw, w, h, msg.hex(), out, json.dumps(opts) if opts else '')
    if 'error' in e: return {'room': room, 'n': n, 'error': e['error']}
    st = np.frombuffer(open(out, 'rb').read(), np.uint8).reshape(h, w, 4)[..., :3].copy()
    change = float(np.abs(st.astype(float) - a.astype(float)).mean())
    sent = jpg(st, 92)
    res = {}
    for q in qs:
        rec = dec(sent) if q == 'sent' else dec(jpg(dec(sent), q))
        open(raw, 'wb').write(rgba(rec))
        x = node(mod, 'extract', raw, w, h)
        good = x.get('ok') and bytes.fromhex(x['bytes']) == msg
        res[q] = ("OK" if good else "xx[" + str(x.get("reason","?"))[:18] + "]") + f"{x.get('rawErrors', 0)*100:4.1f}%"
    return {'room': room, 'n': n, 'change': round(change, 3), 'res': res, 'copies': e.get('copies'), 'touched': round(e.get('touched', 0), 2)}

if __name__ == '__main__':
    mod = sys.argv[1]; nbytes = float(sys.argv[2]); photos = sys.argv[3:]
    opts = json.loads(os.environ['OPTS']) if os.environ.get('OPTS') else None
    qs = [int(q) if q != 'sent' else q for q in os.environ.get('QS', '87,75,70,66,64,62,58,55').split(',')]
    nbytes = int(nbytes) if nbytes >= 1 else nbytes
    for p in photos:
        r = run(mod, p, nbytes, qs, opts)
        name = os.path.basename(p)[:30]
        if 'error' in r: print(f"{name:30s} room {r['room']:4} n {r['n']:4}  ERROR {r['error']}"); continue
        print(f"{name:30s} room {r['room']:4} n {r['n']:4} r {r['copies']} t {r['touched']} chg {r['change']:.2f} | " + ' '.join(f"q{q}:{v}" for q, v in r['res'].items()), flush=True)
