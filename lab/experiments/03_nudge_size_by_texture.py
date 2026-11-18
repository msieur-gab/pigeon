# Usage: python3 03_nudge_size_by_texture.py photo.jpg
# Per-block survival by texture: how small can the nudge be in smooth blocks?
import io, sys, numpy as np
from PIL import Image
from skimage import data
def jpg(a, q): b = io.BytesIO(); Image.fromarray(a).save(b, 'JPEG', quality=q); return b.getvalue()
def dec(b): return np.array(Image.open(io.BytesIO(b)).convert('RGB'))
def Y(a): return 0.299*a[...,0] + 0.587*a[...,1] + 0.114*a[...,2]
def blocks(y, bh, bw): return y.reshape(bh, 8, bw, 8)
rng = np.random.default_rng(11)
imgs = [('pigeon', np.array(Image.open(sys.argv[1]).convert('RGB').resize((1280, 1024), Image.LANCZOS)))]
imgs += [(n, np.array(Image.fromarray(s).resize((1280, 960), Image.LANCZOS))) for n, s in [('coffee', data.coffee()), ('astronaut', data.astronaut())]]
for name, img in imgs:
    h, w = img.shape[:2]; bh, bw = h // 8, w // 8
    sd = blocks(Y(img.astype(float)), bh, bw).std(axis=(1, 3))
    print(f"\n{name}: smooth blocks (std<2) {np.mean(sd<2)*100:.0f}%, mid (2-6) {np.mean((sd>=2)&(sd<6))*100:.0f}%, textured (>=6) {np.mean(sd>=6)*100:.0f}%")
    bits = rng.integers(0, 2, (bh, bw))
    for step in (2, 3, 4, 6, 8):
        a = img.astype(float); m = blocks(Y(a), bh, bw).mean(axis=(1, 3)); off = bits*step/2
        t = np.round((m-off)/step)*step+off; t = np.where(t > 250, t-step, t); t = np.where(t < 5, t+step, t)
        a += np.repeat(np.repeat(t-m, 8, 0), 8, 1)[..., None]
        st = jpg(np.clip(np.round(a), 0, 255).astype(np.uint8), 92)
        r = dec(jpg(dec(st), 62))
        got = np.round(blocks(Y(r.astype(float)), bh, bw).mean(axis=(1, 3))/(step/2)).astype(int) % 2
        err = got != bits
        print(f"  ±{step/2:<3} errors after q62: smooth {err[sd<2].mean()*100:5.1f}%   mid {err[(sd>=2)&(sd<6)].mean()*100:5.1f}%   textured {err[sd>=6].mean()*100:5.1f}%")
