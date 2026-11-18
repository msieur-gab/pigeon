# Usage: python3 05_dither_vs_brightness.py folder-of-birds/
#
# Compares two robust hiding methods on the same birds (1280 px), both hiding
# only in textured 8x8 blocks:
#   brightness: one bit per block, on the block's average brightness (QIM, ±3)
#   dither:     several bits per block, on mid-frequency DCT coefficients
#               (dither modulation, like DMAS): each chosen coefficient is set
#               to a multiple of the channel's quantization step whose parity
#               is the bit. Re-encoding at that quality (or better) keeps it.
# For each: room, survival of a 120-character message through quality 87 /
# 62 / 55 re-encodes, and how much the picture changed.
import io, glob, os, sys, numpy as np
from PIL import Image
from scipy.fft import dctn, idctn

T_SEND = float(os.environ.get('T_SEND', '3.0'))   # texture threshold (Y std) to write
T_READ = float(os.environ.get('T_READ', '3.0'))   # ... and to read. The reader must be STRICTER (higher), not lower: a block read but never written is noise (see lab/dither.js v2)
DESIGN_Q = 62                        # quality the dither steps are matched to
POS = [(0, 2), (1, 1), (2, 0), (1, 2), (2, 1)]   # mid-frequency positions used
HEADER = 32                          # header bits, written with HR copies
HR = 25
MSG = 120
MIN_R = {'brightness': 3, 'dither': 9}   # dither copies flip more often (~2% vs 0.1%)
GATE = {'brightness': 0.5, 'dither': float(os.environ.get('GATE', '0.5'))}  # dither: only count values close to the grid (written ones are)
PASSES = int(os.environ.get('PASSES', '4'))

BASE = np.array([
    [16, 11, 10, 16, 24, 40, 51, 61], [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56], [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77], [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101], [72, 92, 95, 98, 112, 100, 103, 99]], float)

def qtable(q):
    s = 5000 / q if q < 50 else 200 - 2 * q
    return np.maximum(1, np.floor((BASE * s + 50) / 100))

QD = qtable(DESIGN_Q)

def jpg(a, q):
    b = io.BytesIO(); Image.fromarray(a).save(b, 'JPEG', quality=q); return b.getvalue()
def dec(b): return np.array(Image.open(io.BytesIO(b)).convert('RGB'))
def Y(a): return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
def tiles(y):
    h, w = y.shape; return y.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3)
def untiles(t):
    bh, bw = t.shape[:2]; return t.transpose(0, 2, 1, 3).reshape(bh * 8, bw * 8)

def cover(path):
    im = Image.open(path).convert('RGB'); s = 1280 / max(im.size)
    w, h = int(im.size[0] * s) // 16 * 16, int(im.size[1] * s) // 16 * 16
    return np.array(im.resize((w, h), Image.LANCZOS))

def choose_r(nbits, smooth, slots, per_block, min_r=3):
    # copies of one bit are in different blocks; P(all copies in smooth blocks)
    for r in range(min_r, 64, 2):
        if nbits * smooth ** r < 1e-3 and HEADER * HR + nbits * r <= slots: return r
    return None

def room(smooth, slots, per_block, min_r=3):
    best = 0
    for n in range(1, 4000, 2):
        if choose_r((n + 7) * 8, smooth, slots, per_block, min_r) is None: break
        best = n
    return best

# --- slot layout: slot s -> (block, position). Spread so copies of a bit land
# in different blocks: walk a shuffled block order, one position per pass.
def slots_for(nblocks, per_block, rng):
    order = rng.permutation(nblocks)
    return [(b, p) for p in range(per_block) for b in order]

def run(method, img, rng):
    h, w = img.shape[:2]
    y0 = Y(img.astype(float))
    t0 = tiles(y0)
    nblocks = t0.shape[0] * t0.shape[1]
    sd0 = t0.std(axis=(2, 3)).ravel()
    smooth = np.mean(sd0 < T_SEND)
    per_block = 1 if method == 'brightness' else len(POS)
    nslots = nblocks * per_block
    cap = room(smooth, nslots, per_block, MIN_R[method])
    nbits = (MSG + 7) * 8
    r = choose_r(nbits, smooth, nslots, per_block, MIN_R[method])
    if r is None: return cap, None, None
    layout = slots_for(nblocks, per_block, rng)
    bits = rng.integers(0, 2, HEADER + nbits)
    # slot index list per bit
    owners = []
    s = 0
    for i in range(HEADER + nbits):
        k = HR if i < HEADER else r
        owners.append(list(range(s, s + k))); s += k

    D = dctn(t0 - 128, axes=(2, 3), norm='ortho').reshape(nblocks, 8, 8)
    delta = np.zeros_like(D)
    mean = t0.mean(axis=(2, 3)).ravel()
    for i, sl in enumerate(owners):
        for si in sl:
            b, p = layout[si]
            if sd0[b] < T_SEND: continue
            if method == 'brightness':
                step, off = 6, bits[i] * 3
                t = round((mean[b] - off) / step) * step + off
                if t > 250: t -= step
                if t < 5: t += step
                delta[b, 0, 0] += (t - mean[b]) * 8        # DC = 8 x mean (ortho)
            else:
                u, v = POS[p]; q = QD[u, v]; c = D[b, u, v]
                k = int(np.round(c / q))
                if (k & 1) != bits[i]: k += 1 if c / q > k else -1
                delta[b, u, v] = k * q - c
    dy = untiles(idctn(delta.reshape(t0.shape[0], t0.shape[1], 8, 8), axes=(2, 3), norm='ortho'))
    st = np.clip(np.round(img.astype(float) + dy[..., None]), 0, 255).astype(np.uint8)
    # Pixels clipped at 0 or 255 can't move, so the targets are missed in very
    # dark or bright spots: measure again and correct a few times
    targets = {}
    for i, sl in enumerate(owners):
        for si in sl:
            b, p = layout[si]
            if sd0[b] < T_SEND or method == 'brightness': continue
            u, v = POS[p]; targets[(b, u, v)] = D[b, u, v] + delta[b, u, v]
    for _ in range(PASSES if method == 'dither' else 0):
        t = tiles(Y(st.astype(float)))
        Dn = dctn(t - 128, axes=(2, 3), norm='ortho').reshape(nblocks, 8, 8)
        fix = np.zeros_like(Dn)
        for (b, u, v), tv in targets.items():
            fix[b, u, v] = tv - Dn[b, u, v]
        if np.abs(fix).max() < 0.5: break
        dy = untiles(idctn(fix.reshape(t0.shape[0], t0.shape[1], 8, 8), axes=(2, 3), norm='ortho'))
        st = np.clip(np.round(st.astype(float) + dy[..., None]), 0, 255).astype(np.uint8)
    sent = jpg(st, 92)                                      # what Pigeon would share
    if os.environ.get('DEBUG') and method == 'dither':
        tp = tiles(Y(st.astype(float)))
        Dp = dctn(tp - 128, axes=(2, 3), norm='ortho').reshape(nblocks, 8, 8)
        bad = 0; total = 0
        for i, sl in enumerate(owners):
            for si in sl:
                b, p = layout[si]
                if sd0[b] < T_SEND: continue
                u, v = POS[p]; total += 1
                if (int(np.round(Dp[b, u, v] / QD[u, v])) & 1) != bits[i]:
                    bad += 1
                    if bad < 4: print('   pixel-stage miss', i, (b, p), D[b, u, v], delta[b, u, v], Dp[b, u, v], QD[u, v], bits[i])
        print(f'   pixel stage: {bad}/{total} copies wrong')

    out = {}
    for q in (87, 62, 55):
        rec = dec(jpg(dec(sent), q))
        t1 = tiles(Y(rec.astype(float)))
        sd1 = t1.std(axis=(2, 3)).ravel()
        D1 = dctn(t1 - 128, axes=(2, 3), norm='ortho').reshape(nblocks, 8, 8)
        m1 = t1.mean(axis=(2, 3)).ravel()
        wrong = lost = 0
        for i, sl in enumerate(owners):
            votes = []
            for si in sl:
                b, p = layout[si]
                if sd1[b] < T_READ: continue
                x = m1[b] / 3 if method == 'brightness' else D1[b, POS[p][0], POS[p][1]] / QD[POS[p][0], POS[p][1]]
                if abs(x - np.round(x)) > GATE[method]: continue      # not on the grid: probably not written
                votes.append(int(np.round(x)) & 1)
            if not votes: lost += 1
            elif (sum(votes) * 2 > len(votes)) != bits[i]:
                wrong += 1
                if os.environ.get('DEBUG'):
                    print('   wrong bit', i, 'header' if i < HEADER else '', 'votes', votes, 'want', bits[i],
                          [(layout[si], round(float(sd0[layout[si][0]]), 1)) for si in sl][:4])
        if os.environ.get('DEBUG'):
            cw = ct = 0
            for i, sl in enumerate(owners):
                for si in sl:
                    b, p = layout[si]
                    if sd1[b] < T_READ: continue
                    ct += 1
                    if method == 'brightness': got = int(round(m1[b] / 3)) & 1
                    else:
                        u, v = POS[p]; got = int(np.round(D1[b, u, v] / QD[u, v])) & 1
                    cw += got != bits[i]
            print(f'   {method} q{q}: {cw}/{ct} copies wrong')
        out[q] = 'OK' if wrong == lost == 0 else f'{wrong}w/{lost}l'
    change = np.abs(st.astype(float) - img.astype(float)).mean()
    return cap, out, (r, change, st)

if __name__ == '__main__':
    folder = sys.argv[1]
    print(f"{'bird':18s} {'method':10s} {'room':>6s}  120 chars: copies, q87 / q62 / q55, mean change")
    for path in sorted(glob.glob(os.path.join(folder, '*.jpg'))):
        img = cover(path)
        name = os.path.basename(path)
        for method in os.environ.get('METHODS', 'brightness dither').split():
            cap, res, extra = run(method, img, np.random.default_rng(1))
            if res is None:
                print(f"{name:18s} {method:10s} {cap:6d}  (120 chars don't fit)")
                continue
            r, change, st = extra
            print(f"{name:18s} {method:10s} {cap:6d}  {r:2d} copies, {res[87]:>6s} / {res[62]:>6s} / {res[55]:>6s}, {change:.2f} levels")
            Image.fromarray(st).save(os.path.join(folder, f"cmp-{method}-{name.replace('.jpg', '.png')}"))
