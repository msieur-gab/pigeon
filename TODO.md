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

- [ ] **Invite text is readable** by anyone who has the invite image: the one-time key travels inside the same image, and the F5 key is public. Options:
  - a hint in the invite screen to keep the first message neutral (simplest)
  - a short code (e.g. 3 words) said by voice, which unlocks the invite (stronger)
- [ ] **Fixed F5 key** (`"pigeon-key"` in `js/utils/stego-f5.js`): anyone with the app can extract the hidden bytes (still encrypted). An earlier review proposed deriving the F5 key per pair of contacts from their shared secret, with the fixed key kept only for invites. Not in this code yet
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

## Design & experience

- [ ] **Stamp**: check the sender's words stay readable on dark photos
- [ ] **Contacts as a grid of stamps** (February idea: a collectible grid, fingerprint shown on tap) — not started
- [ ] **Telegram style** for messages (February idea: STOP between sentences, dimmed) — not started
- [ ] **Carrier capacity**: show how much text fits the chosen bird while typing; warn before it's too long
- [ ] **Deciphering effect**: confirm the pace on the phone (now ~2 s; `MIN_MS` in `js/utils/decipher.js`)
- [ ] **iPhone flow**: no share-sheet entry on iOS; check opening from Files and saving as a file
- [ ] **Signal**: confirm "send as file" keeps the image intact

## Research

- [ ] Experimental compression-proof mode: robust embedding + error correction, short messages only, tested against real Telegram and WhatsApp sends (see `docs/messaging-apps-compression.md`)

## Decided not to

- Old images (JSON payload) are not supported: the app hasn't been released
- Invites and replies to invites can't be edited after generating (they store a pending invite / add a contact); messages can
- No message history: only the time and direction of the last exchange per contact, never the text

## Done

- [x] XSalsa20-Poly1305 encryption for sync data, random 24-byte nonces
- [x] PHP sync API with GET/PUT, tested with the app
- [x] F5 steganography (images must travel as files; any re-encode erases the message)
- [x] Compact binary payload format (~35% smaller)
- [x] Installable PWA: share target (Android), file handler (desktop), offline; updates show on next load
- [x] Open by share sheet, drag & drop and paste
- [x] Send-as-file guidance and compressed-image diagnosis
- [x] Names and messages escaped in the UI (HTML injection)
- [x] TweetNaCl bundled (no CDN)
- [x] Last exchange per contact (time and direction only)
- [x] Your birds: carrier photos, least-recently-used pick, random crop
- [x] Generated image replaces the preview; Edit / Save / Share for messages
- [x] Stamps: received birds, contacts and your avatar; postmark with date and the sender's three words
- [x] Message reveal with deciphering effect (revertible: `ENABLED` flag)
- [x] Version shown in Settings
- [x] Pictures stored as small JPEG (contacts 96 px, your avatar 192 px): ~2–5 KB each instead of ~40 KB, so the backup fits a few hundred contacts (WebP left out: Safari can't create it)
