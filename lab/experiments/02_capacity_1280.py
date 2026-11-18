# Usage: python3 02_capacity_1280.py   (uses scikit-image sample photos)
# Brightness layer at 1280 px: error rate through Telegram/WhatsApp-like
# re-encoding, then usable capacity with light repetition + error correction.
# Also: does changing AC coefficients (what F5 does) disturb it?
import io, numpy as np
from PIL import Image
from skimage import data
from math import comb
rng = np.random.default_rng(7)

def jpg(rgb, q):
    b = io.BytesIO(); Image.fromarray(rgb).save(b, 'JPEG', quality=q); return b.getvalue()
def dec(b): return np.array(Image.open(io.BytesIO(b)).convert('RGB'))

def embed(rgb, bits, step=12.0):
    h, w = rgb.shape[:2]; bh, bw = h // 8, w // 8
    ycc = np.array(Image.fromarray(rgb).convert('YCbCr')).astype(float)
    Y = ycc[..., 0]; m = Y.reshape(bh, 8, bw, 8).mean(axis=(1, 3))
    t = np.round((m - bits * step / 2) / step) * step + bits * step / 2
    ycc[..., 0] = np.clip(Y + np.repeat(np.repeat(t - m, 8, 0), 8, 1), 0, 255)
    return np.array(Image.fromarray(ycc.round().astype(np.uint8), 'YCbCr').convert('RGB'))

def read(rgb, step=12.0):
    h, w = rgb.shape[:2]; bh, bw = h // 8, w // 8
    Y = np.array(Image.fromarray(rgb).convert('YCbCr')).astype(float)[..., 0]
    return (np.round(Y.reshape(bh, 8, bw, 8).mean(axis=(1, 3)) / (step / 2)).astype(int)) % 2

def maj(ber, r): return sum(comb(r, k) * ber**k * (1-ber)**(r-k) for k in range(r//2+1, r+1))

for name, src in [('coffee', data.coffee()), ('astronaut', data.astronaut()), ('chelsea', data.chelsea())]:
    img = np.array(Image.fromarray(src).resize((1280, 960), Image.LANCZOS))
    bits = rng.integers(0, 2, (120, 160))
    stego = jpg(embed(img, bits), 92)
    out = [name]
    worst = 0
    for q in (87, 80, 62):
        ber = (read(dec(jpg(dec(stego), q))) != bits).mean(); worst = max(worst, ber)
        out.append(f"q{q}: {ber*100:.2f}%")
    # F5-like disturbance: nudge 10% of non-zero AC coefficients by +/-1 in the DCT domain
    # (simulated in pixels: add an AC-only pattern to random blocks)
    pix = dec(stego).astype(float)
    k = np.zeros((8, 8)); k[:4] = 1; k[4:] = -1          # zero-mean pattern = AC only
    noisy = pix.copy()
    for by in range(120):
        for bx in range(160):
            if rng.random() < 0.5:
                noisy[by*8:by*8+8, bx*8:bx*8+8, :] += k[..., None] * rng.choice([-2, 2])
    f5ber = (read(np.clip(noisy, 0, 255).astype(np.uint8)) != bits).mean()
    out.append(f"after AC (F5-like) changes: {f5ber*100:.2f}%")
    print('  '.join(out))
    blocks = 120 * 160
    for r in (3, 5):
        p = maj(worst, r)
        byte_err = 1 - (1 - p) ** 8
        print(f"     repeat x{r}: bit error {p:.1e}, byte error {byte_err*100:.2f}%  -> raw {blocks//r//8} bytes, "
              f"with Reed-Solomon (~15% spare) ~{int(blocks//r//8*0.85)} bytes")
