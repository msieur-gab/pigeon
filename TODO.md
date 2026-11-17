# Pigeon Sync API - Security TODO

## High Priority

- [ ] Add request signing for PUT requests (prove ownership of private key)
- [ ] Implement rate limiting on API endpoints
- [ ] Add signature verification before allowing data overwrites

## Medium Priority

- [ ] Add versioning/conflict resolution (prevent accidental overwrites)
- [ ] Implement nonce tracking to prevent replay attacks
- [ ] Add request timestamp validation (reject old requests)

## Low Priority

- [ ] Add API logging for security auditing
- [ ] Consider adding optional server-side backup versioning
- [ ] Document security model for users

## Security

- [ ] Invite text is readable by anyone with the image: the one-time key travels in the same image and the F5 key is public. Keep invite text minimal, or move the key to a second channel
- [ ] Secret key and seed are stored in plain localStorage

## UI/UX Improvements

- [ ] Experimental compression-proof mode (robust embedding + error correction, short messages only)

- [ ] Show carrier image capacity vs message length before encoding
  - Analyze JPEG capacity after carrier is selected
  - Display remaining space as user types message
  - Warn if message too long for carrier

## Completed

- [x] Implement XSalsa20-Poly1305 encryption for sync data
- [x] Use random 24-byte nonces
- [x] Create PHP sync API with GET/PUT endpoints
- [x] Test sync functionality between UI and server
- [x] F5 steganography (requires images sent as files; does not survive re-encoding)
- [x] Compact binary payload format
- [x] Installable PWA: share target (Android), file handler (desktop), offline
- [x] Open by drag & drop and paste
- [x] Send-as-file guidance and compressed-image diagnosis
- [x] Escape names/messages in UI (HTML injection)
- [x] Last exchange per contact (time and direction only)
- [x] Flock of carrier photos with least-recently-used pick and random crop
