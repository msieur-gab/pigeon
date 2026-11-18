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

## Round 2: dither modulation vs brightness (18 Nov 2026)

`lab/experiments/05_dither_vs_brightness.py` (Python only, not yet in the lab
page). Both methods hide only in textured blocks (Y std ≥ 3, same threshold
for writer and reader) and are compared on Gab's seven birds at 1280 px with a
120-character message, re-encoded at quality 87, 62 and 55.

**Dither modulation**: in each textured block, five mid-frequency DCT
coefficients of Y — (0,2), (1,1), (2,0), (1,2), (2,1) — are each set to the
nearest multiple of the quality-62 quantization step whose parity is the bit
(the change is added equally to R, G, B). Re-encoding at quality 62 or better
keeps the value on that grid. At least 9 copies per bit, majority vote.

| Bird | Brightness room | Dither room | Dither q87 / q62 / q55 |
|---|---|---|---|
| Blurred close-up | ~70 | ~375 | OK / OK / broken |
| Yellow pair | ~95 | ~470 | OK / OK / OK |
| Portrait | ~60 | ~320 | OK / OK / broken |
| Small (upscaled) | ~60 | ~310 | OK / OK / broken |
| Wall with moss | ~560 | ~980 | OK / OK / broken |
| Rust + pavement | ~330 | ~980 | OK / OK / broken |
| Flight, yellow wall | ~180 | ~980 | OK / OK / broken |

(Dither room is capped at ~980 by the test's search range.)

- **Room:** dither holds 3–6× more on smooth birds.
- **Looks:** average change 0.2–0.26 levels for dither vs 0.4–0.7 for
  brightness. In crops, dither is indistinguishable from the original; smooth
  backgrounds are untouched.
- **Survival:** dither is matched to quality 62. It survives 62 and above
  (Telegram-like 87 included) on all seven birds, and breaks below (55).
  Brightness also survives 55, but holds far less.
- **Lessons:** writer and reader must use the *same* texture threshold
  (blocks read but never written add random votes; that caused most early
  failures). Dither copies flip more often than brightness (~2% vs 0.1%), so
  they need more copies (or Reed-Solomon). Don't gate votes on "close to the
  grid": at quality 87 written values land slightly off the q62 grid.
- **Open risk:** if WhatsApp's real quality is below 62, dither must be
  matched lower (bigger, more visible changes). Measure the real apps first.

## Round 3: dither v2, tested between the qualities (18 Nov 2026)

Scope (Gab, 18 Nov): **WhatsApp and Telegram only; WeChat dropped for now.**
"People will need the Pigeon app to run it, and I think the app will not be
available in China anyway."

`lab/experiments/06_dither_js/` runs the **JavaScript itself** (`lab/dither.js`
through Node), not a Python copy: cover at 1280 px → embed → JPEG q92 (what
Pigeon shares) → re-encode at quality q → extract. 15 of Gab's own photos
(mostly portrait mode, blurred backgrounds), not in the repo.

**v1 broke between the tested qualities.** Round 2 tested only q87, q62 and
q55. At q64–q75, v1 failed on most photos, and one photo failed at q87 too.
The cause is the "matched to q62" grid: it survives only *exactly* q62 with
the standard tables. At any other quality the app's own rounding can move a
value by up to half of its own step, which at q64 is almost half a grid step,
so no margin is left. Real apps won't use exactly q62.

**Fixes in v2** (`lab/dither.js`):

| Problem in v1 | Fix in v2 |
|---|---|
| Grid matched to q62, so no margin at q63–q86 | Grid coarser than the app's steps: **grid quality 50** by default (62 and 40 selectable in the lab); the grid is written in the header |
| Writer and reader use the same texture threshold (3.0); after compression, up to 11% of the blocks the reader counted had never been written (pure noise) | Reader is stricter (3.6) than writer (3.0): fake votes ≤4%; a skipped block only loses one copy |
| Majority vote, ties read as 0 | Soft votes: cos(π·value/step), so a copy half-way between steps counts for nothing |
| No error correction | Reed-Solomon (`lab/rs.js`): 16 check bytes per codeword repair 8 wrong bytes; the header has its own (6 check bytes, 31 copies). Fixed the failure on a mostly smooth picture, where 25 plain header copies left only 4–5 readable |
| Rounding and clipping of pixels move values off the grid | Two correction passes after writing |

**Results, 120 bytes**: 5 photos × 11 qualities (no re-encode, then
87/80/75/70/66/64/62/58/55/50): **all intact** at grid 50 and at grid 40.
At grid 62 (≈ v1 strength) still 2 failures at q55–q50.

**Results, 90% of each photo's room, grid 50**: 15 photos × q87/75/66/64/62/58/55:
**all intact**, at most 8.6% of copies damaged (on the 77%-smooth picture).
Room: ~150 bytes (mostly smooth web picture) to ~1,150 (busy photos); most
camera photos 250–900.

| Grid | Average change (120 bytes) | Survives (simulated) |
|---|---|---|
| 62, faint | 0.20–0.27 levels | q58 and up |
| 50, normal (default) | 0.32–0.38 | q50 and up |
| 40, sturdy | 0.43–0.52 | q50 and up, fewer damaged copies |

A full message changes the picture more (1.0–1.5 levels on busy photos at
90% of room) than a short one: the eye test should include a long message.

Still only a simulation (PIL's standard tables, one re-encode). Not yet
known: the apps' real quality and tables, a second re-encode (forwarding),
resizing. The lab's checker reports quality and resizing of what arrives.

Open, not for the lab: anyone with this code can find a Pigeon bird (fixed
public shuffle seed, known header), as with F5's fixed key today. The content
stays encrypted, but being *detected* may matter to people under censorship.
A design question for when one method moves into the app.

**First real sends (Gab, 18 Nov), dither faint (62), the default 75-character
message, shared as a photo:**

| App | Arrived as | JPEG quality | Dither |
|---|---|---|---|
| WhatsApp | 1280×736, 89 KB | ≈ 69 | intact, 7.7% of copies damaged, 0 bytes repaired |
| Telegram | 1280×736, 101 KB | ≈ 80 | intact, 9.7% of copies damaged, 0 bytes repaired |
| WhatsApp, 2nd bird (portrait, 7 copies per bit) | 720×1280, 270 KB | ≈ 69 | intact, 1.6%, 0 repaired |
| Telegram, 2nd bird | 720×1280, 311 KB | ≈ 80 | intact, 1.1%, 0 repaired |
| WhatsApp, 3rd bird (close-up on a plain blurred background, ~370 characters, 28 copies per bit) | 1280×1024, 76 KB | ≈ 69 | intact, 0.4%, 0 repaired |
| Telegram, 3rd bird | 1280×1024, 90 KB | ≈ 80 | intact, 0.3%, 0 repaired |

F5 and brightness unreadable in both. Neither app resized a 1280 px bird. The same qualities on two different birds suggest
the apps use a fixed quality, not one per picture (three samples).
On a picture with a plain background, the feathers alone held ~370 characters;
the background is never touched. 28 copies per bit for 0.3% damage: far more
safety than needed, so fewer copies (fewer blocks touched) is the next lever.
Both qualities are well above where faint breaks in simulation (below ~58),
and Reed-Solomon had nothing to repair: there is margin left.

(Since 18 Nov the engine lives in `js/utils/dither.js` and `js/utils/rs.js`, used by the app;
`lab/dither.js` re-exports it, so the lab and the experiments run the same code.)

## Round 4: fewer copies, and Gab's own birds (18 Nov 2026)

**Fewer copies doesn't help.** Lowering the floor of copies per bit from 7 to
5, 4 or 3 (faint, 115 bytes = a 75-character message once encrypted) changed
the number of copies on only 2 of 14 photos. On the others, the number is set
by coverage: copies that fall in smooth blocks are skipped, so a bit needs
enough copies for some to land in texture. A first try at choosing copies
from a damage model (majority vote, 12% damaged copies) was too pessimistic
and chose *more* copies; dropped. The lab keeps a `minCopies` option for tests.

**Gab's set of 8 birds** (`birds-1-001.zip`, private, not in the repo: five
camera photos up to 3840 px, three small ones of 320–960 px enlarged to 1280),
faint (62), q87/80/75/69/66/62: **all intact**, both a 115-byte message and a
message at 90% of the room. Room: 235–1,153 bytes, the small invite images
included (235–425). Average change: 0.16–0.25 levels for a short message,
up to ~1.1 for a full one on a busy photo.

What makes the change smaller now is the message length, not the copies.
A deeper idea, if ever needed: place copies only in textured blocks (fewer
wasted, so fewer touched), which needs a placement the reader reproduces
exactly. Not needed while Gab can't see the changes.

## Next round of tests (proposed)

1. **Texture-only brightness in the lab page**, with the room shown per bird;
   real Telegram and WhatsApp sends; Gab judges by eye.
2. **Smarter placement**: put copies only in textured blocks, with a
   classification the reader reproduces exactly (e.g. coarse regions + a
   threshold chosen with a margin, written in a robust header). Target: 2–3×
   the room on smooth birds (~140–190 chars on the blurred close-up).
3. ~~Add Reed-Solomon~~ done in dither v2 (round 3), on top of copies.
4. ~~Prototype mid-frequency AC dither modulation~~ done (round 2), made
   sturdy between qualities in v2 (round 3). **Next: real WhatsApp and
   Telegram sends at strengths 50 and 40, short and long message; Gab judges
   by eye** (zoom 1:1 in the lab).
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
cd lab/experiments/06_dither_js && python3 harness.py ../../dither.js 120 photo.jpg   # the JS itself, needs node
```
