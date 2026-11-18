# Pigeon — to do

Open proposals and known issues, grouped. Each item says what it is and,
where there were options, what they are. Tick it, or move it to "Decided not
to" with the reason, when it's settled.

## Repository

- [x] Merge PR #1 (`ux-improvements` → `master`)
- [ ] Settings → General: make `master` the default branch
- [ ] Settings → Pages: deploy from `master` (same address)
- [ ] Delete `feature/f5-steganography` and `feature/pwa` (GitHub offers *Restore* right after; `ux-improvements` is already gone)

## Security

- [ ] **Invite text is readable** by anyone who has the invite image: the one-time key travels inside the same image, and the hiding order is public. Options:
  - a hint in the invite screen to keep the first message neutral (simplest)
  - a short code (e.g. 3 words) said by voice, which unlocks the invite (stronger)
- [ ] **A Pigeon bird can be recognised**: the hiding order (`SEED` in `js/utils/dither.js`) and the header mark are fixed and public, so anyone with the code can tell a picture carries a Pigeon message and extract its hidden bytes (still encrypted). Option: derive the order per pair of contacts from their shared secret, keeping a fixed one only for invites. Even then, statistics can hint that values sit on a grid
- [ ] **The soul bird is not encrypted**: it carries the identity seed as is, so anyone who has the picture can restore the identity with the public code (same as with F5 before). Options:
  - a password or short code that encrypts the seed inside the soul bird
  - keep it, and say clearly that the picture is as secret as the 16 words (the tip says so now)
- [ ] **Keys stored in plain text** on the device (`localStorage`: seed and secret key). Options:
  - an optional PIN that encrypts them at rest
  - accept for now, since the phone lock already protects them
- [ ] **Sync uses the secret key directly** as its encryption key; derive a separate key from the seed instead (one key, one purpose)

## Recovery server (sync)

Works today: a fresh phone restored from the 16 words gets back name, contacts and pending invites (tested against `api/sync.php`).

- [ ] **Server address on the restore screens**: on a new phone the server must be set before restoring, and the restore screens don't ask for it
- [ ] **Signed uploads**: anyone with your public key (everyone you invited) can compute your backup address and overwrite or erase it (they can't read it)
  - [ ] Add request signing for PUT requests (prove ownership of the key)
  - [ ] Verify the signature before allowing overwrites
  - [ ] Request timestamp validation and nonce tracking (replays)
- [ ] **Two phones**: the last one to sync wins; no merge of contacts
- [ ] Processed-image list isn't synced (an already-opened invite could be opened again on a second phone)
- [ ] Rate limiting on the API
- [ ] Hosting: GitHub Pages can't run PHP; the API needs a PHP host (e.g. OVH shared hosting)
- [ ] Lower priority: API logging, optional server-side backup versions, a short note explaining the security model to users

## Meet in person (QR)

- [ ] **iPhone**: test scanning with the in-app camera (uses jsQR there) and with the iPhone camera (opens Safari, which doesn't share storage with the installed app)
- [ ] **Android**: check whether scanning with the phone camera opens the installed app or a browser tab
- [ ] One-sided camera: if only one phone can scan, the other still needs an invite to reach them. Option: after scanning, send a first image that carries your key

## Design & experience

- [ ] **Opening a message as a side panel**: the decrypted message slides in from the side like a panel, and a swipe from right to left closes it (lock the other gestures while it's open). Idea to think through: an animation that feels like receiving a new letter
- [ ] **+ sheet**: redesign pass later (layout approved as a first version)

- [ ] **Stamp**: check the sender's words stay readable on dark photos
- [ ] **Contacts as a grid of stamps** (February idea: a collectible grid, fingerprint shown on tap) — not started
- [ ] **Telegram style** for messages (February idea: STOP between sentences, dimmed) — not started
- [ ] **Deciphering effect**: confirm the pace on the phone (now ~2 s; `MIN_MS` in `js/utils/decipher.js`)
- [ ] **iPhone flow**: no share-sheet entry on iOS; check opening from Photos and Files
- [ ] **Signal**: test that a bird shared as a photo survives (only WhatsApp and Telegram are tested)
- [ ] **Forwarding inside one app**: check that a WhatsApp or Telegram forward keeps the bird readable (simulated: compressed twice in the same app survives)
- [ ] **Small, plain birds** hold little (a small photo enlarged to 1280 px: ~210 bytes, the text cut short). Options: the flock skips birds with little room when picking; warn when adding a small photo

## Research

- [ ] If ever needed: fewer changes per message by placing copies only in textured blocks (see round 4 in `docs/share-safe-research.md`)

## Decided not to

- Old images (JSON payload) are not supported: the app hasn't been released
- Old F5 images are not supported (18 Nov 2026): no one uses the app yet; the soul bird is made with dither too, so identities can be restored
- No choice of hiding strength in the app: fixed at faint (62), the least visible one that survived WhatsApp and Telegram
- No letters split across several birds for now: the text is limited to the room of the chosen bird, shown while typing
- WeChat is not a target for now: the app is unlikely to be available in China
- Not designed for a bird passed from one app to another (Telegram then WhatsApp breaks faint in simulation; sturdy would survive at twice the change). Gab, 18 Nov: "People are always using the same communication app"
- Invites and replies to invites can't be edited after generating (they store a pending invite / add a contact); messages can
- No message history: only the time and direction of the last exchange per contact, never the text

## Done

- [x] XSalsa20-Poly1305 encryption for sync data, random 24-byte nonces
- [x] PHP sync API with GET/PUT, tested with the app
- [x] F5 steganography (images had to travel as files) — replaced by dither on 18 Nov 2026
- [x] Compact binary payload format (~35% smaller)
- [x] Installable PWA: share target (Android), file handler (desktop), offline; updates show on next load
- [x] Open by share sheet, drag & drop and paste
- [x] ~~Send-as-file guidance~~ replaced by "share it like any photo"; a picture that arrives at another size is explained
- [x] Names and messages escaped in the UI (HTML injection)
- [x] TweetNaCl bundled (no CDN)
- [x] Last exchange per contact (time and direction only)
- [x] Your birds: carrier photos, least-recently-used pick, random crop
- [x] Generated image replaces the preview; Edit / Save / Share for messages
- [x] Stamps: received birds, contacts and your avatar; postmark with date and the sender's three words
- [x] Message reveal with deciphering effect (revertible: `ENABLED` flag)
- [x] Version shown in Settings
- [x] Meet in person: QR code on a stamp, in-app scanner (native on Android, jsQR elsewhere), camera link with `#meet=`
- [x] Cancel a waiting invite (tap it in the list) and remove a contact (contact screen); a backup server, if set, gets the change on the next sync
- [x] Add a contact from a **+** button and a bottom sheet (meet in person / send an invite); ↓ open is a quiet button under your identity
- [x] Pictures stored as small JPEG (contacts 96 px, your avatar 192 px): ~2–5 KB each instead of ~40 KB, so the backup fits a few hundred contacts (WebP left out: Safari can't create it)
- [x] **One way to send everything** (18 Nov 2026): messages hidden with dither modulation and Reed-Solomon in the bird's textured areas, survive WhatsApp (q≈69) and Telegram (q≈80) sending it as a photo; real sends on three birds, no repair needed (`docs/share-safe-research.md`)
- [x] Room shown while typing ("N characters left in this bird"); too long is refused before anything is saved
- [x] Invites and replies save the pending invite or contact only once the bird carries the message
