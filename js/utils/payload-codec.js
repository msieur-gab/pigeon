// Compact binary payload codec
//
// Packs payload objects into raw bytes instead of JSON + base64.
// Fewer embedded bits means fewer changed DCT coefficients, so images
// carry longer messages and are a little harder to detect.
//
// Layout:  'P' 'G' | version | type | fields...

import { encodeBase64, decodeBase64 } from './crypto.js';

const MAGIC_0 = 0x50; // 'P'
const MAGIC_1 = 0x47; // 'G'
const VERSION = 1;

const TYPE_CODE = { invite: 1, claim: 2, msg: 3, soul: 4 };
const CODE_TYPE = { 1: 'invite', 2: 'claim', 3: 'msg', 4: 'soul' };

const KEY_LEN = 32;
const NONCE_LEN = 24;
const SEED_LEN = 16;
const MAX_NAME_BYTES = 64;

// --- writer / reader helpers ---

class Writer {
    constructor() { this.parts = []; this.length = 0; }
    byte(b) { this.bytes(new Uint8Array([b & 0xff])); }
    u16(n) { this.bytes(new Uint8Array([(n >> 8) & 0xff, n & 0xff])); }
    bytes(arr) { this.parts.push(arr); this.length += arr.length; }
    fixed(b64, len, label) {
        const arr = decodeBase64(b64);
        if (arr.length !== len) throw new Error(`Invalid ${label}`);
        this.bytes(arr);
    }
    shortString(str) {
        const arr = truncateUtf8(str || '', MAX_NAME_BYTES);
        this.byte(arr.length);
        this.bytes(arr);
    }
    blob(b64) {
        const arr = decodeBase64(b64);
        if (arr.length > 0xffff) throw new Error('Message too long');
        this.u16(arr.length);
        this.bytes(arr);
    }
    done() {
        const out = new Uint8Array(this.length);
        let off = 0;
        for (const p of this.parts) { out.set(p, off); off += p.length; }
        return out;
    }
}

class Reader {
    constructor(bytes) { this.b = bytes; this.i = 0; }
    need(n) { if (this.i + n > this.b.length) throw new Error('Truncated payload'); }
    byte() { this.need(1); return this.b[this.i++]; }
    u16() { this.need(2); const v = (this.b[this.i] << 8) | this.b[this.i + 1]; this.i += 2; return v; }
    take(n) { this.need(n); const v = this.b.slice(this.i, this.i + n); this.i += n; return v; }
    fixed(n) { return encodeBase64(this.take(n)); }
    shortString() { return new TextDecoder().decode(this.take(this.byte())); }
    blob() { return encodeBase64(this.take(this.u16())); }
}

// Cut a string to at most maxBytes of UTF-8 without splitting a character
function truncateUtf8(str, maxBytes) {
    const enc = new TextEncoder();
    let out = enc.encode(str);
    if (out.length <= maxBytes) return out;
    let s = str;
    while (out.length > maxBytes) {
        s = Array.from(s).slice(0, -1).join('');
        out = enc.encode(s);
    }
    return out;
}

// --- public API ---

/**
 * Pack a payload object into compact bytes
 * @param {Object} payload - { t: 'invite'|'claim'|'msg'|'soul', ... }
 * @returns {Uint8Array}
 */
export function encode(payload) {
    const code = TYPE_CODE[payload.t];
    if (!code) throw new Error('Unknown payload type');

    const w = new Writer();
    w.byte(MAGIC_0); w.byte(MAGIC_1); w.byte(VERSION); w.byte(code);

    switch (payload.t) {
        case 'invite':
            w.fixed(payload.from, KEY_LEN, 'public key');
            w.fixed(payload.temp, KEY_LEN, 'invite key');
            w.fixed(payload.nonce, NONCE_LEN, 'nonce');
            w.shortString(payload.name);
            w.blob(payload.msg);
            break;
        case 'claim':
            w.fixed(payload.from, KEY_LEN, 'public key');
            w.fixed(payload.nonce, NONCE_LEN, 'nonce');
            w.shortString(payload.name);
            w.blob(payload.msg);
            break;
        case 'msg':
            w.fixed(payload.nonce, NONCE_LEN, 'nonce');
            w.blob(payload.msg);
            break;
        case 'soul':
            w.fixed(payload.seed, SEED_LEN, 'seed');
            w.byte(payload.v || 1);
            w.shortString(payload.name);
            break;
    }
    return w.done();
}

/**
 * Unpack bytes into a payload object.
 * Field order matches the objects created in messages.js / identity.js.
 * @param {Uint8Array} bytes
 * @returns {Object}
 */
export function decode(bytes) {
    if (bytes.length < 4 || bytes[0] !== MAGIC_0 || bytes[1] !== MAGIC_1) {
        throw new Error('No hidden data found');
    }
    return decodeBinary(bytes);
}

function decodeBinary(bytes) {
    const r = new Reader(bytes);
    r.take(2); // magic
    const version = r.byte();
    if (version !== VERSION) throw new Error('Made with a newer version of Pigeon');
    const t = CODE_TYPE[r.byte()];

    switch (t) {
        case 'invite': {
            const from = r.fixed(KEY_LEN);
            const temp = r.fixed(KEY_LEN);
            const nonce = r.fixed(NONCE_LEN);
            const name = r.shortString();
            const msg = r.blob();
            return { t, from, name, temp, msg, nonce };
        }
        case 'claim': {
            const from = r.fixed(KEY_LEN);
            const nonce = r.fixed(NONCE_LEN);
            const name = r.shortString();
            const msg = r.blob();
            return { t, from, name, msg, nonce };
        }
        case 'msg': {
            const nonce = r.fixed(NONCE_LEN);
            const msg = r.blob();
            return { t, msg, nonce };
        }
        case 'soul': {
            const seed = r.fixed(SEED_LEN);
            const v = r.byte();
            const name = r.shortString();
            return { t, seed, name, v };
        }
        default:
            throw new Error('Unknown payload type');
    }
}
