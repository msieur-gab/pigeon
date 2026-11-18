# Usage: python3 04_texture_only.py folder-of-birds/   (writes out-*.png next to them)
# Hide only in textured blocks: smooth blocks are never touched; the reader
# ignores blocks it sees as smooth (lower threshold = safety margin).
# Copies per bit are chosen so that "all copies landed in smooth areas" is rare.
import io, glob, os, sys, numpy as np
from PIL import Image
STEP, T_SEND, T_READ, RH = 6, 4.0, 2.5, 25
def jpg(a, q): b = io.BytesIO(); Image.fromarray(a).save(b, 'JPEG', quality=q); return b.getvalue()
def dec(b): return np.array(Image.open(io.BytesIO(b)).convert('RGB'))
def Y(a): return 0.299*a[...,0] + 0.587*a[...,1] + 0.114*a[...,2]
def stats(a):
    h, w = a.shape[:2]; y = Y(a.astype(float)).reshape(h//8, 8, w//8, 8)
    return y.mean(axis=(1, 3)).ravel(), y.std(axis=(1, 3)).ravel()
def cover(path):
    im = Image.open(path).convert('RGB'); s = 1280 / max(im.size)
    w, h = int(im.size[0]*s)//16*16, int(im.size[1]*s)//16*16
    return np.array(im.resize((w, h), Image.LANCZOS))
def choose_r(nbits, smooth, blocks):
    for r in range(3, 64, 2):
        if nbits * smooth**r < 1e-3 and RH*32 + nbits*r <= blocks: return r
    return None
def capacity(smooth, blocks):
    best = 0
    for n in range(1, 2000):
        if choose_r((n+7)*8, smooth, blocks) is None: break
        best = n
    return best
rng = np.random.default_rng(0)
for path in sorted(glob.glob(os.path.join(sys.argv[1], '*.jpg'))):
    img = cover(path); h, w = img.shape[:2]; bw = w // 8; blocks = (h//8) * bw
    m0, sd0 = stats(img)
    smooth = np.mean(sd0 < T_SEND)
    cap = capacity(smooth, blocks)
    msg = 120
    nbits = (msg + 7) * 8; r = choose_r(nbits, smooth, blocks)
    line = f"{path.split('/')[-1]:18s} {w}x{h}  smooth {smooth*100:4.0f}%  room ~{cap:4d} chars"
    if r is None:
        print(line + f"   (120 chars don't fit)"); continue
    perm = rng.permutation(blocks)
    bits = rng.integers(0, 2, nbits)
    a = img.astype(float); flat = a.reshape(h//8, 8, bw, 8, 3)
    for i in range(nbits):
        for k in range(r):
            b = perm[RH*32 + i*r + k]
            if sd0[b] < T_SEND: continue
            by, bx = divmod(b, bw)
            off = bits[i]*STEP/2; t = round((m0[b]-off)/STEP)*STEP + off
            if t > 250: t -= STEP
            if t < 5: t += STEP
            flat[by, :, bx, :, :] += t - m0[b]
    st = np.clip(np.round(a), 0, 255).astype(np.uint8)
    res = []
    for q in (87, 62):
        rec = dec(jpg(dec(jpg(st, 92)), q))
        m1, sd1 = stats(rec)
        wrong = erased = 0
        for i in range(nbits):
            v = [int(round(m1[perm[RH*32 + i*r + k]]/(STEP/2))) & 1 for k in range(r) if sd1[perm[RH*32 + i*r + k]] >= T_READ]
            if not v: erased += 1; continue
            if (sum(v)*2 > len(v)) != bits[i]: wrong += 1
        res.append(f"q{q}: {'OK' if wrong == 0 and erased == 0 else f'{wrong} wrong, {erased} lost'}")
    touched = sum(1 for i in range(nbits) for k in range(r) if sd0[perm[RH*32+i*r+k]] >= T_SEND)
    print(line + f"   120 chars: {r} copies, {touched/blocks*100:.0f}% blocks touched, " + ', '.join(res))
    Image.fromarray(dec(jpg(st, 92))).save(os.path.join(os.path.dirname(path), 'out-' + os.path.basename(path).replace('.jpg', '.png')))
