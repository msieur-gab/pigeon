# Usage: python3 01_f5_vs_brightness.py   (uses scikit-image sample photos)
# How much hidden data survives messaging-app style recompression?
# A) F5-like: parity of non-zero AC coefficients (where F5 hides its bits)
# B) Fortress-like: QIM on the average brightness of each 8x8 block
import io, numpy as np, jpeglib
from PIL import Image
from skimage import data
from math import comb

rng = np.random.default_rng(1)

def to_jpeg(rgb, q):
    b = io.BytesIO(); Image.fromarray(rgb).save(b, 'JPEG', quality=q); return b.getvalue()

def decode(jpg):
    return np.array(Image.open(io.BytesIO(jpg)).convert('RGB'))

def y_coeffs(jpg):
    import tempfile, os; p = os.path.join(tempfile.gettempdir(), 'pigeon-t.jpg'); open(p, 'wb').write(jpg)
    return jpeglib.read_dct(p).Y.copy()   # (bh, bw, 8, 8) quantized

def majority_fail(ber, r):
    # probability a bit is wrong after majority vote over r copies
    return sum(comb(r, k) * ber**k * (1-ber)**(r-k) for k in range(r//2 + 1, r + 1))

APPS = [('re-save same quality (92)', 92), ('Telegram-like (~87)', 87), ('quality 80', 80), ('WhatsApp-like (~62)', 62)]

def f5_test(rgb):
    stego = to_jpeg(rgb, 92)                 # what Pigeon sends (browser, 0.92)
    c0 = y_coeffs(stego)
    ac = np.ones((8, 8), bool); ac[0, 0] = False
    mask0 = (c0 != 0) & ac
    print(f"  F5 carrier: {mask0.sum()} non-zero AC coefficients")
    for name, q in APPS:
        c1 = y_coeffs(to_jpeg(decode(stego), q))
        same_zero_pattern = ((c1 != 0) & ac) == mask0
        desync = 1 - same_zero_pattern[ac[None, None].repeat(c0.shape[0], 0).repeat(c0.shape[1], 1)].mean()
        par0 = np.abs(c0[mask0]) % 2
        par1 = np.abs(c1[mask0]) % 2
        ber = (par0 != par1).mean()
        print(f"  {name:28s} bit errors {ber*100:5.1f}%   zero/non-zero flips {desync*100:5.1f}%   "
              f"with 15 copies: {majority_fail(ber, 15)*100:5.1f}% wrong")

def fortress_test(rgb, step=12.0):
    h, w = (rgb.shape[0] // 8) * 8, (rgb.shape[1] // 8) * 8
    img = rgb[:h, :w].astype(float)
    bh, bw = h // 8, w // 8
    bits = rng.integers(0, 2, (bh, bw))
    ycc = np.array(Image.fromarray(rgb[:h, :w]).convert('YCbCr')).astype(float)
    Y = ycc[..., 0]
    means = Y.reshape(bh, 8, bw, 8).mean(axis=(1, 3))
    # QIM: move each block mean to the nearest lattice point for its bit
    d = step
    target = np.round((means - bits * d / 2) / d) * d + bits * d / 2
    shift = np.repeat(np.repeat(target - means, 8, 0), 8, 1)
    ycc[..., 0] = np.clip(Y + shift, 0, 255)
    out = np.array(Image.fromarray(ycc.round().astype(np.uint8), 'YCbCr').convert('RGB'))
    psnr = 10 * np.log10(255**2 / ((out.astype(float) - img)**2).mean())
    stego = to_jpeg(out, 92)
    print(f"  Fortress-like: {bh*bw} blocks = {bh*bw} raw bits; image change PSNR {psnr:.1f} dB")
    for name, q in APPS:
        y1 = np.array(Image.open(io.BytesIO(to_jpeg(decode(stego), q))).convert('YCbCr')).astype(float)[..., 0]
        m1 = y1.reshape(bh, 8, bw, 8).mean(axis=(1, 3))
        got = (np.round(m1 / (d / 2)).astype(int)) % 2
        ber = (got != bits).mean()
        r = 15
        print(f"  {name:28s} bit errors {ber*100:5.1f}%   with 15 copies: {majority_fail(ber, r)*100:7.3f}% wrong"
              f"  -> ~{bh*bw//r//8 - 4} bytes usable")

for label, img in [('coffee 600x400', data.coffee()), ('astronaut 512x512', data.astronaut()), ('chelsea 451x300', data.chelsea())]:
    print(f"\n== {label}")
    f5_test(img)
    fortress_test(img)
