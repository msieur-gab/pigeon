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

## Completed

- [x] Implement XSalsa20-Poly1305 encryption for sync data
- [x] Use random 24-byte nonces
- [x] Create PHP sync API with GET/PUT endpoints
- [x] Test sync functionality between UI and server
