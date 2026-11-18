# Lab: share-safe test

`lab/index.html` makes the same bird two ways at 1280 px and checks images
you receive back:

- **F5**: what the app does today (hides in exact JPEG coefficients).
- **Brightness**: one bit per 8×8 block, by nudging the block's average
  brightness onto a 6-level grid (±3 levels at most), each bit written 5 times
  across the image (`lab/brightness.js`; same idea as Phasm's Fortress mode,
  written from scratch).

Text is not encrypted here; it's a test of survival and looks.

## Results so far (18 Nov 2026, simulated, not yet a real send)

Bird: pigeon close-up, 1280×1024, about 500 bytes of room.

| Re-encoded at | F5 | Brightness |
|---|---|---|
| quality 87 (Telegram-like) | broken | intact, 0% bits damaged |
| quality 80 | broken | intact, 0% |
| quality 62 (WhatsApp-like) | broken | intact, 0% |

On three other photos at quality 62: at most 0.3% of hidden bits damaged
(5 copies repair that easily).

Looks: identical in textured areas (feathers). In smooth, blurred
backgrounds a ±6 nudge left visible pale specks; ±3 is much fainter. ±2 is
invisible but breaks at quality 62.

## Next

1. Real send of both images through Telegram and WhatsApp with the normal
   share button, then check them here.
2. If brightness survives: decide on longer letters (several birds) and
   bring it into the app as the single way to send (see
   `docs/design-lessons.md`).
