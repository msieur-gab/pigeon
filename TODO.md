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

## UI/UX Improvements

- [ ] Show carrier image capacity vs message length before encoding
  - Analyze JPEG capacity after carrier is selected
  - Display remaining space as user types message
  - Warn if message too long for carrier

## Completed

- [x] Implement XSalsa20-Poly1305 encryption for sync data
- [x] Use random 24-byte nonces
- [x] Create PHP sync API with GET/PUT endpoints
- [x] Test sync functionality between UI and server
- [x] F5 steganography for compression-resistant encoding (survives Telegram/WhatsApp)
