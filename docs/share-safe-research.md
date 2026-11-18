# Share-safe hiding: what we tested, what we found, what to test next

Handover document, 18 Nov 2026. Branch: `share-safe-lab` (built on
`qr-pairing`). Read `docs/design-lessons.md` first: it explains why this
matters.

## The problem

Pigeon hides the encrypted message with **F5**, in the exact JPEG
coefficients. It only survives if the image travels as a *file*. The share
button (Web Share API) hands the image to Telegram or WhatsApp as a *photo*,
and they always re-encode photos. An invite shared to Telegram this way
arrived unreadable.

The design lesson (Gab): people need **one single way** to send everything.
If invites survive the share button but messages need "send as file", they
will use the share button for both and messages will break. If every send
means "save, then attach as a file", only people with a strong need for
privacy will bother. So the hidden message itself has to survive the apps'
re-encoding.

## What we ruled out

| Idea | Result |
|---|---|
| Pre-compress before sharing, so the app doesn't need to | Apps re-encode photos whatever their size or quality. Pre-sizing helps only with resizing: keep the long side at **1280 px** (Telegram doesn't resize below that; WhatsApp keeps ≤1600). |
| EXIF flag / PNG / WebP | No flag exists; metadata is stripped; PNG is converted to JPEG; WebP in Telegram can become a sticker. |
| Send as a video with an extra frame | Video is re-encoded even harder (WhatsApp down to 360–480p). |
| Disguise as another file type (PDF…) | Arrives as a document, not a bird photo: breaks the idea. |
| Repeat the F5 message several times | Telegram-like re-encode scrambles ~37% of F5's bits; with 15 copies ~15–18% still wrong (one wrong bit is enough to break decryption). Shrinkage also desyncs the stream. |
| "F5 is the best hiding method" | Not true: it has a known targeted attack (calibration); nsF5 and then J-UNIWARD/UERD surpassed it. All of them die on re-encoding the same way. Encryption (NaCl) is a separate layer and isn't affected by any of this. |

## What we built and measured

### Lab page
`lab/index.html` (open `…/pigeon/lab/`): pick a bird, type a text, **Make
both** → the same bird at 1280 px hidden with F5 and with brightness. Share or
save each; press-and-hold shows the original; "show changes ×10" shows where
each method touched the picture. **Check a received image** tries both
readers. Text is *not* encrypted in the lab.

### Brightness method (`lab/brightness.js`)
One bit per 8×8 block: the block's average brightness (Y) is nudged onto an
even or odd step of a 6-level grid (QIM on the DC/average). R, G and B are
shifted equally (Y moves, colour doesn't). Each bit is written 5 times in
blocks spread by a fixed shuffle; reading takes the majority. Header (magic,
length) first, CRC32 last. Only the blocks the message needs are touched.
Same idea as Phasm's Fortress mode, written from scratch (Phasm's code is
GPL-3.0, not used).

### Results

Survival (simulated re-encodes with PIL; Gab also confirmed a real Telegram
send survived):

| Re-encoded at | F5 | Brightness (±3) |
|---|---|---|
| quality 87 (Telegram-like) | broken | intact, 0% bits damaged |
| quality 80 | broken | intact, 0% |
| quality 62 (WhatsApp-like) | broken | intact, 0% (others ≤0.3%) |

**Visibility is the problem.** In the real send Gab found the changes clearly
visible, like glitches, in smooth areas (blurred backgrounds, skies). In
textured areas (feathers, stone, rust, granite) they're invisible.

**The nudge can't get smaller.** At WhatsApp-level quality, JPEG rounds each
block's average in steps of ~1.5 levels, so below ±3 the bit is erased, in
smooth and textured areas alike (`lab/experiments/03_nudge_size_by_texture.py`):
±2 → 7–20% bits wrong; ±3 → ~0%.

**Fewer blocks helps a little**: a 75-character message now touches ~16% of
blocks instead of all. Still visible specks in smooth areas.

**Texture-only (Python only, not yet in the lab page,
`lab/experiments/04_texture_only.py`)**: never touch blocks with Y std < 4;
the reader ignores blocks with std < 2.5 (safety margin); copies per bit chosen
so "all copies landed in smooth blocks" is rare. Invisible on busy birds.
Room depends on the bird (Gab's seven test birds, 1280 px):

| Bird | Smooth blocks | Room |
|---|---|---|
| Wall with moss | 0% | ~560 chars |
| Rust + pavement | 13% | ~235 |
| Flight, yellow wall | 22% | ~145 |
| Yellow pair | 48% | ~85 |
| Blurred close-up | 64% | ~70 |
| Portrait | 61% | ~55 |
| Small (320 px upscaled) | 70% | ~50 |

120 characters through q87 and q62: wall OK/OK, flight OK/OK, rust OK/**1 bit
wrong** (needs more margin or error correction). This version wastes room: it
scatters copies everywhere and discards those in smooth blocks.

The test birds are Gab's photos and are **not** in the repo (public). Use
your own busy and smooth photos to reproduce.

## Research: other robust methods (beyond block brightness)

All of these are **robust steganography** (a recognised research field):
hiding for secret communication, built to survive lossy channels like social
networks. Robust techniques come from watermarking, and they are generally
easier for an analyst to *detect* than F5/J-UNIWARD; the content stays
protected by encryption.

1. **Dither modulation on mid-frequency AC coefficients** (DMAS, GMAS,
   E-DMAS, 2016–2022). QIM on mid-frequency coefficients with adaptive costs,
   so it naturally lives in texture, plus error-correcting codes. Designed for
   social-network recompression; works best when the channel quality is known
   or lower than the cover's. Most promising fix for visibility.
   (Zeng et al., arXiv 2110.08697; Yin & Ke, arXiv 2007.08301.)
2. **Transport channel matching (TCM)** (Zhao et al. 2018): re-compress the
   image through the channel's quality several times until its coefficients
   stop changing, then embed. Close to Gab's "pre-compress" idea, but needs
   the app's exact quality; detectable by compression forensics.
3. **Sign of DCT coefficients** (Differential Manchester code): coefficient
   signs rarely flip under compression; reported to survive Facebook,
   Twitter, WeChat. (MDPI Symmetry 13(2):165.)
4. **Phasm "Armor"**: STDM on low-frequency AC + Reed-Solomon + a template
   for crop/scale sync. More room than block brightness, less tolerant of
   heavy compression.
5. **Deep learning** (HiDDeN 2018, StegaStamp 2020): trained encoder/decoder
   that survives JPEG (StegaStamp even print-and-photograph). Small payloads
   (~100 bits), heavy models for a PWA.
6. **Coverless steganography**: don't change the image at all; pick images
   whose robust hash equals the message bits. Undetectable, but only a few
   bits per image and needs a shared image collection. Not practical for
   messages.

## Next round of tests (proposed)

1. **Texture-only brightness in the lab page**, with the room shown per bird;
   real Telegram and WhatsApp sends; Gab judges by eye.
2. **Smarter placement**: put copies only in textured blocks, with a
   classification the reader reproduces exactly (e.g. coarse regions + a
   threshold chosen with a margin, written in a robust header). Target: 2–3×
   the room on smooth birds (~140–190 chars on the blurred close-up).
3. **Add Reed-Solomon** instead of plain repetition (more room for the same
   safety; would have fixed the rust case).
4. **Prototype mid-frequency AC dither modulation** (research item 1) and
   compare with texture-only brightness on the same birds: room, visibility,
   survival at q87 and q62.
5. **Real-app quality check**: measure the actual JPEG quality and size
   Telegram and WhatsApp deliver (the lab's checker prints both), to tune the
   margin.

Then decide with Gab: one method for everything, what happens to longer
letters (several birds shared in one tap?), and whether F5 leaves the app.

## Reproduce

```
pip install pillow numpy jpeglib scikit-image
python3 lab/experiments/01_f5_vs_brightness.py
python3 lab/experiments/02_capacity_1280.py
python3 lab/experiments/03_nudge_size_by_texture.py photo.jpg
python3 lab/experiments/04_texture_only.py folder-of-birds/
```
