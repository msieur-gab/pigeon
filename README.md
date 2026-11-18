# Pigeon

<p align="center">
  <img src="docs/pigeon_logo.webp" alt="Pigeon" width="120">
</p>

<p align="center">
  <strong>Private messages hidden in plain sight.</strong><br>
  Encrypted communication that rides your existing channels.
</p>

---

## The Problem

People use Telegram, WhatsApp, Signal, email — not by choice, but because everyone they know is already there. Convincing an entire social circle to adopt a new app is nearly impossible.

Meanwhile, "secure" platforms still control what you say: they can delete content, filter messages, hand over metadata, or ban accounts. The encryption may be real, but the platform remains a single point of control.

## The Solution

Pigeon hides encrypted messages inside ordinary JPEG images. Send a bird photo through any channel — email, messaging apps, social media — and only the intended recipient can read what's inside.

- **No new app required** — works over platforms you already use
- **Share it like any photo** — the hidden message survives WhatsApp, Telegram and Signal compressing the picture (tested), and email or files carry it untouched
- **Plausible deniability** — "It's just a photo" is an honest answer
- **Keys never leave your device** — no server ever sees your messages

> "Communication is a fundamental human right. Yet the tools we rely on today give a handful of corporations—and, increasingly, governments—control over what we can say and who can hear us."

---

## How It Works

### The Layers

| Layer | Purpose | Technology |
|-------|---------|------------|
| **Steganography** | Hide the payload | Dither modulation in the picture's textured areas, with error correction |
| **Encryption** | Protect the content | TweetNaCl (XSalsa20-Poly1305, Curve25519) |
| **Cover traffic** | Blend in | Ordinary images over ordinary channels |

The steganography provides **covertness** — the message is invisible.
The encryption provides **security** — even if extracted, it's unreadable.

### Share it like any photo

There is one way to send every Pigeon image: the Share button, or attach it as a normal photo in WhatsApp, Telegram or Signal. The message is hidden in the fine detail of the bird's textured areas (feathers, stone, leaves), never in smooth ones such as skies or blurred backgrounds, and each bit is written several times with error correction. It survives the apps re-encoding the picture:

| App | Quality it re-encodes at (measured) | Message |
|-----|------|---------|
| WhatsApp | ≈ 69 | intact |
| Telegram | ≈ 80 | intact |
| Signal | ≈ 75 | intact |

Birds are 1280 px on their long side, a size both apps keep. Resizing, cropping, editing or a screenshot erases the message; if a picture arrives at another size, Pigeon says so. The research and measurements are in [docs/share-safe-research.md](docs/share-safe-research.md).

### Your birds (carriers)

Add your own photos in **⚙ settings → your birds**. When you write a message, Pigeon picks the bird used least recently and shows how many characters it can still carry as you type: busy photos hold more (often 300–1,000 characters), plain ones less. Every bird is a landscape postcard, between 4:3 and 16:9: a portrait (or square, or panorama) photo is cropped automatically, a little above the middle, where photographers usually put the subject. (Cropping at the busiest place was tried first: it kept plumage and leaves and cut heads.) It also applies a small random crop, so the same photo never produces two images that can be laid over each other. Tap **↻ another bird** to change it, or **use another photo** to pick any image. Photos stay on your device. Your own, unpublished photos are best: a stock photo can be compared against its online original.

### Opening images

- **Android:** install Pigeon (browser menu → *Install app* / *Add to home screen*), then share a received image straight to Pigeon — it opens and decrypts automatically.
- **Desktop Chrome:** after installing, Pigeon can be used to *Open with* on `.jpg`, `.png` and `.webp` files. Drag & drop and paste also work.
- **Everywhere:** tap **↓ open** and pick the file.

### Key Exchange

**In person:**
- Tap **+** → **Meet in person**. The sheet shows **My code** (a stamp) or **Scan theirs** (the camera), one at a time. Each of you scans the other — two scans and you have each other
- Both screens show the three words of the person scanned (like "castle-river-forest"): check they match
- The code is also a link, so a phone camera can scan it: someone without Pigeon lands on the app and adds you once they've created an identity
- A contact met this way has no picture yet; the first bird they send becomes their stamp

**Remote** (**+** → **Send an invite**):
1. **Invite** — Generate a temporary key, embed it in an image, send via any channel
2. **Claim** — Recipient extracts the invite, responds with their public key
3. **Verify** — Confirm fingerprints over a different channel (voice call, video, etc.)
4. **Message** — All subsequent messages use asymmetric encryption (nacl.box)

### Identity & Recovery

- **16-word mnemonic** — Your identity seed as a recovery phrase
- **Soul bird** — An image that stores your identity; scan it to restore on any device
- **Server sync** — Optional encrypted backup of contacts (server never sees plaintext)

---

## The Metaphor

The homing pigeon is historically remembered as a reliable wartime messenger. In Pigeon, the carrier image becomes your avatar — linking you to the message it conceals.

The cover story isn't decoration. It's operational security:
- Bird enthusiasts share bird photos constantly
- The traffic pattern is expected behavior
- "Why did you send me a pigeon photo?" has a better answer than "Why are you using Signal?"

---

## Who This Is For

**Good fit:**
- Journalists protecting sources
- Activists in moderate-risk environments
- Privacy-conscious individuals
- Anyone who wants "something more private" without forcing contacts to switch apps

**Not designed for:**
- Nation-state adversaries (steganography is detectable with forensic tools)
- High-risk dissidents (use Tor, Tails, airgapped machines)
- Compliance/enterprise use cases (no audit trails)

---

## Technical Details

**Stack:**
- Vanilla JavaScript (no framework, no build step)
- TweetNaCl for cryptography
- Dither modulation and Reed-Solomon error correction, written for Pigeon (`js/utils/dither.js`, `js/utils/rs.js`)
- Minimal PHP backend (optional, only for encrypted sync)

**Constraints:**
- Room per bird: ~150–1,150 bytes depending on its texture; payloads use a compact binary format (a 75-character message takes 121 bytes, an invite ~190)
- The picture must keep its size: resizing, cropping or a screenshot erases the message (compression doesn't)
- All processing happens client-side
- Installable PWA, works offline after initial load (all libraries bundled, no CDN)

**Security model:**
- Keys generated from 128-bit seed (16 bytes → 16 words)
- Same primitives as Signal (Curve25519, XSalsa20-Poly1305)
- Server stores only encrypted blobs keyed by address hash

For detailed security analysis, see [code-assesment.md](code-assesment.md).

---

## Development

```bash
# Serve locally
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in your browser.

The sync API requires a PHP server with write access to `../data/users/` relative to `api/`.

---

## Academic Precedent

Pigeon's approach is validated by peer-reviewed research:

- **[TRIST: Circumventing Censorship with Transcoding-Resistant Image Steganography](https://www.usenix.org/conference/foci14/workshop-program/presentation/connolly)** (USENIX FOCI '14, SRI International) — Shows transcoding-resistant DCT embedding is possible with dedicated robust techniques. Pigeon now uses one of this family (dither modulation, see [docs/share-safe-research.md](docs/share-safe-research.md))

- **[A Survey of Internet Censorship and its Measurement](https://arxiv.org/abs/2502.14945)** — Lists steganographic covert channels as viable censorship circumvention alongside Tor and traffic obfuscation

- **[ARTICLE 19](https://www.article19.org/)** — Article 19 of the Universal Declaration of Human Rights protects freedom of expression and the right to receive information

---

## Philosophy

> "Security that people actually use beats perfect security they ignore."

Pigeon makes a deliberate trade-off: it won't protect you from the NSA, but it will protect your messages from your employer, your ISP, casual snoops, and governments that monitor messaging apps. That's the actual threat model for most humans.

The pigeons are doing real work here.

---

## License

MIT

---

<p align="center">
  <sub>Built with care for those who need to speak freely.</sub>
</p>
