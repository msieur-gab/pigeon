// Dither-modulation hiding, version 2 (used by the app and the lab). In each textured 8x8 block, five
// mid-frequency DCT coefficients of the brightness (Y) are each moved to the
// nearest step of a grid whose parity is the bit. Smooth blocks (skies,
// blurred backgrounds) are never touched, which keeps the changes invisible.
//
// Version 2 (18 Nov 2026), after testing v1 at qualities between 62 and 87:
// - The grid is COARSER than the app's JPEG steps (grid quality 62, "faint",
//   chosen after real sends: WhatsApp re-encodes at ~69, Telegram at ~80;
//   the lab can also make 50 and 40), no longer "matched" to the app's quality. A matched grid only survives that exact
//   quality with the standard tables; at q64-70 the app's rounding moved values
//   by almost half a step and most messages broke.
// - The reader is stricter than the writer about texture (3.6 vs 3.0): a block
//   counted but never written is pure noise; a written block skipped only
//   loses one copy.
// - Soft votes: each copy votes with its confidence (how close it sits to an
//   even or odd step), so a copy half-way between steps counts for nothing.
// - Reed-Solomon check bytes repair wrong bytes left after the vote.
// - After writing, the pixels are rounded and clipped; two correction passes
//   bring the coefficients back onto the grid.
//
// Same family as DMAS / GMAS in the research literature; written from scratch.

import * as rs from './rs.js';

export const LONG_SIDE = 1280;                         // Telegram and WhatsApp keep this size
export const DEFAULT_GRID = 62;                        // JPEG quality whose steps form the grid ("faint")
const POS = [[0, 2], [1, 1], [2, 0], [1, 2], [2, 1]];  // (row, col) frequencies used
const T_WRITE = 3.0;                                   // Y std: write only above this
const T_READ = 3.6;                                    // ... read only above this (stricter)
const MAGIC = 0xd2;                                    // v2 (v1 was 0xd1)
const HEADER_BYTES = 5;                                // magic, copies, grid, length (2 bytes)
const HEADER_NSYM = 6;                                 // + RS check bytes (repairs 3)
const HEADER_CODED = HEADER_BYTES + HEADER_NSYM;
const HEADER_COPIES = 31;                              // fixed: the reader needs it before anything else
export const MIN_COPIES = 7;                           // default floor of copies per bit
const READ_MIN = 3;                                    // the reader accepts headers down to this
const NSYM = 16;                                       // RS check bytes per codeword (repairs 8)
const CHUNK = 255 - NSYM;
const SEED = 0x85ebca6b;

function crc32(bytes) {
    let c = ~0;
    for (const b of bytes) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

// Postcard shapes: every bird is a landscape between 4:3 and 16:9
export const MIN_RATIO = 4 / 3, MAX_RATIO = 16 / 9;

// Where the postcard crop goes. A first version picked the busiest window
// (most texture, so most room), but on real photos texture is not the
// subject: it cut a pigeon's head to keep its plumage and a ledge, and kept
// autumn leaves instead of the dog lying on them. The crop now sits where
// photographers put the subject: centred 45% down a portrait (a little above
// the middle, rule of thirds), in the middle of a panorama.
function postcardWindow(W, H, winW, winH) {
    if (winH < H) return { x: 0, y: Math.min(H - winH, Math.max(0, 0.45 * H - winH / 2)), w: winW, h: winH };
    return { x: (W - winW) / 2, y: 0, w: winW, h: winH };
}

/**
 * The cover for a bird: drawn at 1280 px on its long side, sides rounded down
 * to multiples of 16 so the 8x8 JPEG blocks line up, after an optional random
 * crop of up to `crop` per side (two images from the same photo then never
 * share the same pixels). With `postcard`, a photo outside the landscape
 * shapes 4:3 to 16:9 (portrait, square, panorama) is first cropped to the
 * nearest of the two, a little above the middle (see postcardWindow).
 * @param {HTMLImageElement|ImageBitmap} img
 * @returns {ImageData}
 */
export function prepareCover(img, { crop = 0, postcard = false } = {}) {
    let W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    let ox = 0, oy = 0;
    if (postcard) {
        const r = W / H;
        let win = null;
        if (r < MIN_RATIO) win = postcardWindow(W, H, W, W / MIN_RATIO);
        else if (r > MAX_RATIO) win = postcardWindow(W, H, H * MAX_RATIO, H);
        if (win) { ox = win.x; oy = win.y; W = win.w; H = win.h; }
    }
    const cut = size => Math.floor(Math.random() * size * crop);
    const sx = ox + cut(W), sy = oy + cut(H);
    const sw = W - (sx - ox) - cut(W), sh = H - (sy - oy) - cut(H);
    const scale = LONG_SIDE / Math.max(sw, sh);
    const w = Math.max(16, Math.floor(sw * scale / 16) * 16);
    const h = Math.max(16, Math.floor(sh * scale / 16) * 16);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

/** Grid qualities the reader tries (the lab can make all three) */
export const GRIDS = [62, 50, 40];

const BASE = [
    [16, 11, 10, 16, 24, 40, 51, 61], [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56], [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77], [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101], [72, 92, 95, 98, 112, 100, 103, 99]];
function stepsFor(q) {
    const scale = q < 50 ? 5000 / q : 200 - 2 * q;
    return POS.map(([u, v]) => Math.max(1, Math.floor((BASE[u][v] * scale + 50) / 100)));
}

// Orthonormal 8-point DCT basis (same as JPEG's DCT)
const C = Array.from({ length: 8 }, (_, k) =>
    Array.from({ length: 8 }, (_, n) => (k ? Math.sqrt(2 / 8) : Math.sqrt(1 / 8)) * Math.cos((2 * n + 1) * k * Math.PI / 16)));
const BASIS = POS.map(([u, v]) => {
    const b = new Float64Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = C[u][y] * C[v][x];
    return b;
});

function permutation(n) {
    const p = new Uint32Array(n);
    for (let i = 0; i < n; i++) p[i] = i;
    let s = SEED;
    for (let i = n - 1; i > 0; i--) {
        s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
        const j = s % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
}

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// The 5 coefficients of one block, written into out[o..o+4]
function blockCoef(imageData, b, bw, out, o) {
    const { width, data } = imageData;
    const bx = b % bw, by = (b / bw) | 0;
    for (let p = 0; p < POS.length; p++) out[o + p] = 0;
    for (let y = 0; y < 8; y++) {
        let i = ((by * 8 + y) * width + bx * 8) * 4;
        for (let x = 0; x < 8; x++, i += 4) {
            const Y = lum(data, i), k = y * 8 + x;
            for (let p = 0; p < POS.length; p++) out[o + p] += BASIS[p][k] * Y;
        }
    }
}

// Per block: texture (std of Y) and the 5 coefficients
function analyse(imageData) {
    const { width, height, data } = imageData;
    const bw = width >> 3, bh = height >> 3, n = bw * bh;
    const std = new Float32Array(n);
    const coef = new Float64Array(n * POS.length);
    for (let b = 0; b < n; b++) {
        const bx = b % bw, by = (b / bw) | 0;
        let sum = 0, sq = 0;
        for (let y = 0; y < 8; y++) {
            let i = ((by * 8 + y) * width + bx * 8) * 4;
            for (let x = 0; x < 8; x++, i += 4) { const Y = lum(data, i); sum += Y; sq += Y * Y; }
        }
        const mean = sum / 64;
        std[b] = Math.sqrt(Math.max(0, sq / 64 - mean * mean));
        blockCoef(imageData, b, bw, coef, b * POS.length);
    }
    return { bw, bh, n, std, coef };
}

// slot s -> [block, position]: a shuffled block order, one position per pass,
// so consecutive slots (the copies of one bit) sit in different blocks
const slot = (perm, n, s) => [perm[s % n], (s / n) | 0];

// Share of blocks a copy is likely lost in: smooth to the writer, or close
// enough to the reader's threshold to drop below it after compression
function lostShare(A) {
    let lost = 0;
    for (let b = 0; b < A.n; b++) if (A.std[b] < T_READ * 1.1) lost++;
    return lost / A.n;
}

const codedLength = len => { const body = len + 4; return body + Math.ceil(body / CHUNK) * NSYM; };

function chooseCopies(nbits, lost, slots, min = MIN_COPIES) {
    for (let r = min; r < 64; r++) {
        // expected bits with every copy lost < 0.05; RS repairs the rare one
        if (nbits * Math.pow(lost, r) < 0.05 && HEADER_CODED * 8 * HEADER_COPIES + nbits * r <= slots) return r;
    }
    return 0;
}

/** Room for text, in bytes, in this picture (depends on its texture) */
export function capacityFor(imageData, { minCopies = MIN_COPIES } = {}) {
    const A = analyse(imageData);
    const lost = lostShare(A), slots = A.n * POS.length;
    let lo = 0, hi = 4000;
    while (lo < hi) {                                   // largest length that still fits
        const mid = (lo + hi + 1) >> 1;
        if (chooseCopies(codedLength(mid) * 8, lost, slots, minCopies)) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/** Hide bytes in the picture (changes imageData in place) */
export function embed(imageData, bytes, { grid = DEFAULT_GRID, minCopies = MIN_COPIES } = {}) {
    const A = analyse(imageData);
    const STEPS = stepsFor(grid);

    // body: bytes + CRC32, cut into Reed-Solomon codewords
    const body = new Uint8Array(bytes.length + 4);
    body.set(bytes);
    const crc = crc32(bytes);
    body.set([crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255], bytes.length);
    const coded = new Uint8Array(codedLength(bytes.length));
    for (let i = 0, o = 0; i < body.length; i += CHUNK) {
        const cw = rs.encode(body.subarray(i, i + CHUNK), NSYM);
        coded.set(cw, o); o += cw.length;
    }

    const r = chooseCopies(coded.length * 8, lostShare(A), A.n * POS.length, minCopies);
    if (!r) throw new Error(`Too long for this bird: ${bytes.length} bytes, room for ${capacityFor(imageData, { minCopies })}`);

    const head = rs.encode(new Uint8Array([MAGIC, r, grid, bytes.length >> 8, bytes.length & 255]), HEADER_NSYM);
    const bitAt = (arr, i) => (arr[i >> 3] >> (7 - (i & 7))) & 1;
    const perm = permutation(A.n);
    const target = new Float64Array(A.n * POS.length).fill(NaN);

    let s = 0;
    const write = (bit, copies) => {
        for (let k = 0; k < copies; k++, s++) {
            const [b, p] = slot(perm, A.n, s);
            if (A.std[b] < T_WRITE) continue;            // smooth: never touched
            const q = STEPS[p], c = A.coef[b * POS.length + p];
            let m = Math.round(c / q);
            if ((m & 1) !== bit) m += c / q > m ? 1 : -1;
            target[b * POS.length + p] = m * q;
        }
    };
    for (let i = 0; i < HEADER_CODED * 8; i++) write(bitAt(head, i), HEADER_COPIES);
    for (let i = 0; i < coded.length * 8; i++) write(bitAt(coded, i), r);

    // Move each written block's coefficients to their targets, adding the
    // change to R, G and B equally (moves brightness, not colour). Pixels are
    // rounded and clipped, so measure again and correct, twice.
    const blocks = [];
    for (let b = 0; b < A.n; b++) {
        for (let p = 0; p < POS.length; p++) if (!Number.isNaN(target[b * POS.length + p])) { blocks.push(b); break; }
    }
    const { width, data } = imageData;
    const now = new Float64Array(POS.length), delta = new Float64Array(POS.length);
    for (let pass = 0; pass < 3; pass++) {
        for (const b of blocks) {
            const o = b * POS.length;
            if (pass) blockCoef(imageData, b, A.bw, now, 0);
            else for (let p = 0; p < POS.length; p++) now[p] = A.coef[o + p];
            for (let p = 0; p < POS.length; p++) {
                const t = target[o + p];
                delta[p] = Number.isNaN(t) ? 0 : t - now[p];
            }
            const bx = b % A.bw, by = (b / A.bw) | 0;
            for (let y = 0; y < 8; y++) {
                let i = ((by * 8 + y) * width + bx * 8) * 4;
                for (let x = 0; x < 8; x++, i += 4) {
                    let d = 0;
                    for (let p = 0; p < POS.length; p++) d += delta[p] * BASIS[p][y * 8 + x];
                    data[i] += d; data[i + 1] += d; data[i + 2] += d;   // clamped and rounded
                }
            }
        }
    }
    return { copies: r, grid, touched: blocks.length / A.n };
}

/** Read hidden bytes back: {ok, bytes?, rawErrors, fixed?, copies?, grid?, reason?} */
export function extract(imageData) {
    const A = analyse(imageData);
    const perm = permutation(A.n);
    let s = 0, reads = 0, disagree = 0, STEPS = stepsFor(DEFAULT_GRID);

    // Soft vote: cos(pi * c/step) is +1 on an even step, -1 on an odd one,
    // 0 half-way between. Sum the copies; the sign is the bit.
    const readBit = copies => {
        let sum = 0, n = 0, neg = 0;
        for (let k = 0; k < copies; k++, s++) {
            const [b, p] = slot(perm, A.n, s);
            if (A.std[b] < T_READ) continue;
            const v = Math.cos(Math.PI * A.coef[b * POS.length + p] / STEPS[p]);
            sum += v; n++; if (v < 0) neg++;
        }
        const bit = sum < 0 ? 1 : 0;
        reads += n;
        disagree += bit ? n - neg : neg;
        return bit;
    };
    const readBytes = (count, copies) => {
        const out = new Uint8Array(count);
        for (let i = 0; i < count * 8; i++) if (readBit(copies)) out[i >> 3] |= 1 << (7 - (i & 7));
        return out;
    };
    const rate = () => (reads ? disagree / reads : 0);

    // The grid is in the header, which is itself on the grid: try each grid
    // the lab offers until the header reads back with that grid in it
    let head = null;
    for (const g of [DEFAULT_GRID, ...GRIDS.filter(g => g !== DEFAULT_GRID)]) {
        s = 0; reads = 0; disagree = 0; STEPS = stepsFor(g);
        const h = rs.decode(readBytes(HEADER_CODED, HEADER_COPIES), HEADER_NSYM)?.data;
        if (h && h[0] === MAGIC && h[2] === g) { head = h; break; }
    }
    if (!head) return { ok: false, rawErrors: rate(), reason: 'no hidden message found' };
    const r = head[1], grid = head[2], len = (head[3] << 8) | head[4];
    const n = codedLength(len);
    if (r < READ_MIN || HEADER_CODED * 8 * HEADER_COPIES + n * 8 * r > A.n * POS.length) {
        return { ok: false, rawErrors: rate(), reason: 'damaged (bad header)' };
    }
    const coded = readBytes(n, r);
    const body = new Uint8Array(len + 4);
    let fixed = 0;
    for (let i = 0, o = 0; i < body.length; i += CHUNK) {
        const k = Math.min(CHUNK, body.length - i);
        const d = rs.decode(coded.subarray(o, o + k + NSYM), NSYM);
        o += k + NSYM;
        if (!d) return { ok: false, rawErrors: rate(), reason: 'damaged (too many errors to repair)' };
        body.set(d.data, i); fixed += d.fixed;
    }
    const bytes = body.slice(0, len), c = body.slice(len);
    const crc = ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0;
    if (crc !== crc32(bytes)) return { ok: false, rawErrors: rate(), reason: 'damaged (check failed)' };
    return { ok: true, bytes, rawErrors: rate(), fixed, copies: r, grid };
}
