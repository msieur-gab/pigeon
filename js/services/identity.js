import * as storage from '../utils/storage.js';
import * as crypto from '../utils/crypto.js';
import * as wordlist from '../utils/wordlist.js';
import * as stego from '../utils/stego.js';

const IDENTITY_KEY = 'identity';

// Get current identity (or null if none)
export function get() {
    return storage.get(IDENTITY_KEY);
}

// Check if identity exists
export function exists() {
    return get() !== null;
}

// Create new identity from random seed
export function create(name = '') {
    const seed = crypto.generateSeed();
    return createFromSeed(seed, name);
}

// Create identity from existing seed
export function createFromSeed(seed, name = '') {
    const keyPair = crypto.seedToKeyPair(seed);
    const words = wordlist.bytesToWords(seed);
    const publicKey = crypto.encodeBase64(keyPair.publicKey);
    
    const identity = {
        seed: crypto.encodeBase64(seed),
        publicKey: publicKey,
        secretKey: crypto.encodeBase64(keyPair.secretKey),
        words: words,
        name: name,
        address: crypto.hashPublicKey(publicKey),
        createdAt: Date.now()
    };
    
    storage.set(IDENTITY_KEY, identity);
    return identity;
}

// Update profile name
export function setName(name) {
    const identity = get();
    if (!identity) throw new Error('No identity');
    identity.name = name;
    storage.set(IDENTITY_KEY, identity);
    return identity;
}

// Update avatar
export function setAvatar(avatarDataUrl) {
    const identity = get();
    if (!identity) throw new Error('No identity');
    identity.avatar = avatarDataUrl;
    storage.set(IDENTITY_KEY, identity);
    return identity;
}

// Get profile name
export function getName() {
    const identity = get();
    return identity?.name || '';
}

// Get avatar
export function getAvatar() {
    const identity = get();
    return identity?.avatar || null;
}

// Get recovery words for current identity
export function getRecoveryWords() {
    const identity = get();
    if (!identity) return null;
    return identity.words;
}

// Get fingerprint for current identity
export function getFingerprint() {
    const identity = get();
    if (!identity) return null;
    return crypto.fingerprint(identity.publicKey);
}

// Get sync address
export function getAddress() {
    const identity = get();
    return identity?.address || null;
}

// Restore identity from recovery words
export function restoreFromWords(words, name = '') {
    // Normalize input
    const normalized = words
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length > 0);
    
    if (!wordlist.validateWords(normalized)) {
        throw new Error('Invalid recovery words');
    }
    
    const seed = wordlist.wordsToBytes(normalized);
    return createFromSeed(seed, name);
}

// Backup identity to image (soul bird)
export function backupToImage(imageData) {
    const identity = get();
    if (!identity) throw new Error('No identity to backup');
    
    const payload = {
        t: 'soul',
        seed: identity.seed,
        name: identity.name,
        avatar: identity.avatar || null,
        v: 1
    };
    
    return stego.encode(imageData, payload);
}

// Restore identity from image (soul bird)
export function restoreFromImage(imageData) {
    const payload = stego.decode(imageData);
    
    if (payload.t !== 'soul') {
        throw new Error('Image does not contain identity backup');
    }
    
    const seed = crypto.decodeBase64(payload.seed);
    const identity = createFromSeed(seed, payload.name || '');
    
    // Restore avatar if present
    if (payload.avatar) {
        setAvatar(payload.avatar);
    }
    
    return identity;
}

// Clear identity (dangerous!)
export function clear() {
    storage.remove(IDENTITY_KEY);
}

// Export for external use
export function getPublicKey() {
    const identity = get();
    return identity?.publicKey || null;
}

export function getSecretKey() {
    const identity = get();
    return identity?.secretKey || null;
}
