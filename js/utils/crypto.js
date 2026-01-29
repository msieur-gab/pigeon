// Crypto utilities using TweetNaCl
// nacl is loaded globally from CDN

// Base64 helpers (inline to avoid nacl.util dependency issues)
export function encodeBase64(arr) {
    let binary = '';
    for (let i = 0; i < arr.length; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
}

export function decodeBase64(str) {
    const binary = atob(str);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i);
    }
    return arr;
}

// Generate random seed (16 bytes = 128 bits)
export function generateSeed() {
    return nacl.randomBytes(16);
}

// Derive keypair deterministically from seed
export function seedToKeyPair(seed) {
    // Expand 16-byte seed to 32 bytes using simple hash
    // We'll hash the seed twice with different prefixes
    const expanded = new Uint8Array(32);
    const seed1 = new Uint8Array(seed.length + 1);
    const seed2 = new Uint8Array(seed.length + 1);
    
    seed1[0] = 0x01;
    seed1.set(seed, 1);
    seed2[0] = 0x02;
    seed2.set(seed, 1);
    
    // Use nacl.hash (SHA-512) and take first 16 bytes of each
    const hash1 = nacl.hash(seed1).slice(0, 16);
    const hash2 = nacl.hash(seed2).slice(0, 16);
    
    expanded.set(hash1, 0);
    expanded.set(hash2, 16);
    
    // Generate keypair from the expanded seed
    return nacl.box.keyPair.fromSecretKey(expanded);
}

// Generate completely random keypair (no seed)
export function generateKeyPair() {
    return nacl.box.keyPair();
}

// Generate random symmetric key
export function generateSymmetricKey() {
    return nacl.randomBytes(32);
}

// Create fingerprint from public key (3 words)
const FINGERPRINT_WORDS = [
    'castle', 'river', 'forest', 'thunder', 'crystal', 'shadow',
    'mountain', 'ocean', 'meadow', 'storm', 'garden', 'ember',
    'willow', 'falcon', 'silver', 'ancient', 'wanderer', 'twilight',
    'mystic', 'lunar', 'solar', 'frost', 'bloom', 'drift',
    'harbor', 'beacon', 'hollow', 'summit', 'valley', 'bridge',
    'haven', 'grove'
];

export function fingerprint(publicKey) {
    const bytes = typeof publicKey === 'string' 
        ? decodeBase64(publicKey) 
        : publicKey;
    
    const w1 = FINGERPRINT_WORDS[bytes[0] % FINGERPRINT_WORDS.length];
    const w2 = FINGERPRINT_WORDS[bytes[1] % FINGERPRINT_WORDS.length];
    const w3 = FINGERPRINT_WORDS[bytes[2] % FINGERPRINT_WORDS.length];
    return `${w1}-${w2}-${w3}`;
}

// Symmetric encryption (for invite temp keys)
export function encryptSymmetric(message, key) {
    const keyBytes = typeof key === 'string' ? decodeBase64(key) : key;
    const nonce = nacl.randomBytes(24);
    const messageBytes = new TextEncoder().encode(message);
    const box = nacl.secretbox(messageBytes, nonce, keyBytes);
    
    return {
        cipher: encodeBase64(box),
        nonce: encodeBase64(nonce)
    };
}

export function decryptSymmetric(cipher, nonce, key) {
    const keyBytes = typeof key === 'string' ? decodeBase64(key) : key;
    const cipherBytes = decodeBase64(cipher);
    const nonceBytes = decodeBase64(nonce);
    
    const decrypted = nacl.secretbox.open(cipherBytes, nonceBytes, keyBytes);
    if (!decrypted) throw new Error('Decryption failed');
    
    return new TextDecoder().decode(decrypted);
}

// Asymmetric encryption (nacl.box for established contacts)
export function encryptBox(message, theirPublicKey, mySecretKey) {
    const theirPk = typeof theirPublicKey === 'string' 
        ? decodeBase64(theirPublicKey) 
        : theirPublicKey;
    const mySk = typeof mySecretKey === 'string' 
        ? decodeBase64(mySecretKey) 
        : mySecretKey;
    
    const nonce = nacl.randomBytes(24);
    const messageBytes = new TextEncoder().encode(message);
    const box = nacl.box(messageBytes, nonce, theirPk, mySk);
    
    return {
        cipher: encodeBase64(box),
        nonce: encodeBase64(nonce)
    };
}

export function decryptBox(cipher, nonce, theirPublicKey, mySecretKey) {
    const theirPk = typeof theirPublicKey === 'string' 
        ? decodeBase64(theirPublicKey) 
        : theirPublicKey;
    const mySk = typeof mySecretKey === 'string' 
        ? decodeBase64(mySecretKey) 
        : mySecretKey;
    
    const cipherBytes = decodeBase64(cipher);
    const nonceBytes = decodeBase64(nonce);
    
    const decrypted = nacl.box.open(cipherBytes, nonceBytes, theirPk, mySk);
    if (!decrypted) return null;
    
    return new TextDecoder().decode(decrypted);
}

// Hash payload for duplicate detection
export function hashPayload(payload) {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    // Use nacl.hash (SHA-512) - available everywhere nacl is loaded
    const hash = nacl.hash(data);
    // Take first 32 bytes and convert to hex
    return Array.from(hash.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Hash public key for sync address (deterministic, privacy-preserving)
export function hashPublicKey(publicKey) {
    const bytes = typeof publicKey === 'string' 
        ? decodeBase64(publicKey) 
        : publicKey;
    const hash = nacl.hash(bytes);
    // Take first 16 bytes as hex (32 chars) - enough uniqueness, shorter URL
    return Array.from(hash.slice(0, 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
