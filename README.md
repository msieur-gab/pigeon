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
- **Survives compression** — F5 steganography in DCT coefficients survives Telegram, WhatsApp, and email
- **Plausible deniability** — "It's just a photo" is an honest answer
- **Keys never leave your device** — no server ever sees your messages

> "Communication is a fundamental human right. Yet the tools we rely on today give a handful of corporations—and, increasingly, governments—control over what we can say and who can hear us."

---

## How It Works

### The Layers

| Layer | Purpose | Technology |
|-------|---------|------------|
| **Steganography** | Hide the payload | F5 algorithm in JPEG DCT coefficients |
| **Encryption** | Protect the content | TweetNaCl (XSalsa20-Poly1305, Curve25519) |
| **Cover traffic** | Blend in | Ordinary images over ordinary channels |

The steganography provides **covertness** — the message is invisible.
The encryption provides **security** — even if extracted, it's unreadable.

### Key Exchange

**In person:**
- Scan QR codes to exchange public keys
- Verify fingerprints (human-readable 3-word phrases like "castle-river-forest")

**Remote:**
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
- F5stegojs for steganography
- Minimal PHP backend (optional, only for encrypted sync)

**Constraints:**
- Payload capacity: ~1-2KB (depends on carrier image)
- All processing happens client-side
- Works offline after initial load

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

- **[TRIST: Circumventing Censorship with Transcoding-Resistant Image Steganography](https://www.usenix.org/conference/foci14/workshop-program/presentation/connolly)** (USENIX FOCI '14, SRI International) — Proves DCT coefficient embedding survives social media transcoding

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
