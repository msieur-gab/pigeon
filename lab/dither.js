// Dither-modulation hiding (lab). In each textured 8x8 block, five
// mid-frequency DCT coefficients of the brightness (Y) are each set to the
// nearest multiple of the quality-62 JPEG step whose parity is the bit.
// Re-encoding at quality 62 or better keeps them on that grid, so the bits
// survive Telegram and WhatsApp. Smooth blocks (skies, blurred backgrounds)
// are never touched, which keeps the changes invisible.
//
// Same family as DMAS / GMAS in the research literature; written from scratch.
// Python reference and measurements: lab/experiments/05_dither_vs_brightness.py

import { crc32 } from './brightness.js';

export const LONG_SIDE = 1280;
const DESIGN_Q = 62;                                   // matched to WhatsApp-like quality
const POS = [[0, 2], [1, 1], [2, 0], [1, 2], [2, 1]];  // (row, col) frequencies used
const TEXTURE = 3.0;                                   // Y std: write and read only above this
const MAGIC = 0xd1;
const HEADER_BITS = 32;                                // magic, copies, length (2 bytes)
const HEADER_COPIES = 25;
const MIN_COPIES = 9;
const SEED = 0x85ebca6b;

const BASE = [
    [16, 11, 10, 16, 24, 40, 51, 61], [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56], [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77], [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101], [72, 92, 95, 98, 112, 100, 103, 99]];
const SCALE = DESIGN_Q < 50 ? 5000 / DESIGN_Q : 200 - 2 * DESIGN_Q;
const STEPS = POS.map(([u, v]) => Math.max(1, Math.floor((BASE[u][v] * SCALE + 50) / 100)));

// Orthonormal 8-point DCT basis (same as JPEG's DCT)
const C = Array.from({ length: 8 }, (_, k) =>
    Array.from({ length: 8 }, (_, n) => (k ? Math.sqrt(2 / 8) : Math.sqrt(1 / 8)) * Math.cos((2 * n + 1) * k * Math.PI / 16)));
// basis[p][y*8+x]: the 8x8 pattern of position p
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

// Per block: Y values (64), texture (std), and the 5 coefficients
function analyse(imageData) {
    const { width, height, data } = imageData;
    const bw = width >> 3, bh = height >> 3, n = bw * bh;
    const std = new Float32Array(n);
    const coef = new Float64Array(n * POS.length);
    const y64 = new Float64Array(64);
    for (let b = 0; b < n; b++) {
        const bx = b % bw, by = (b / bw) | 0;
        let sum = 0, sq = 0;
        for (let y = 0; y < 8; y++) {
            let i = ((by * 8 + y) * width + bx * 8) * 4;
            for (let x = 0; x < 8; x++, i += 4) {
                const Y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                y64[y * 8 + x] = Y; sum += Y; sq += Y * Y;
            }
        }
        const mean = sum / 64;
        std[b] = Math.sqrt(Math.max(0, sq / 64 - mean * mean));
        for (let p = 0; p < POS.length; p++) {
            let c = 0;
            const B = BASIS[p];
            for (let k = 0; k < 64; k++) c += B[k] * y64[k];
            coef[b * POS.length + p] = c;
        }
    }
    return { bw, bh, n, std, coef };
}

// slot s -> [block, position]: a shuffled block order, one position per pass,
// so consecutive slots (the copies of one bit) sit in different blocks
function slot(perm, n, s) {
    return [perm[s % n], (s / n) | 0];
}

function chooseCopies(nbits, smoothShare, slots) {
    for (let r = MIN_COPIES; r < 64; r += 2) {
        if (nbits * Math.pow(smoothShare, r) < 1e-3 && HEADER_BITS * HEADER_COPIES + nbits * r <= slots) return r;
    }
    return 0;
}

/** Room for text, in bytes, in this picture (needs the pixels: depends on texture) */
export function capacityFor(imageData) {
    const A = analyse(imageData);
    let smooth = 0;
    for (let b = 0; b < A.n; b++) if (A.std[b] < TEXTURE) smooth++;
    const share = smooth / A.n, slots = A.n * POS.length;
    let best = 0;
    for (let len = 1; len < 4000; len++) {
        if (!chooseCopies((len + 4) * 8, share, slots)) break;
        best = len;
    }
    return best;
}

/** Hide bytes in the picture (changes imageData in place) */
export function embed(imageData, bytes) {
    const A = analyse(imageData);
    const { width, data } = imageData;
    let smooth = 0;
    for (let b = 0; b < A.n; b++) if (A.std[b] < TEXTURE) smooth++;

    const body = new Uint8Array(bytes.length + 4);
    body.set(bytes);
    const crc = crc32(bytes);
    body.set([crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255], bytes.length);
    const r = chooseCopies(body.length * 8, smooth / A.n, A.n * POS.length);
    if (!r) throw new Error(`Too long for this bird: ${bytes.length} bytes, room for ${capacityFor(imageData)}`);

    const head = new Uint8Array([MAGIC, r, bytes.length >> 8, bytes.length & 255]);
    const bitAt = (arr, i) => (arr[i >> 3] >> (7 - (i & 7))) & 1;
    const perm = permutation(A.n);
    const delta = new Float64Array(A.n * POS.length);

    let s = 0;
    const write = (bit, copies) => {
        for (let k = 0; k < copies; k++, s++) {
            const [b, p] = slot(perm, A.n, s);
            if (A.std[b] < TEXTURE) continue;           // smooth: never touched
            const q = STEPS[p], c = A.coef[b * POS.length + p];
            let m = Math.round(c / q);
            if ((m & 1) !== bit) m += c / q > m ? 1 : -1;
            delta[b * POS.length + p] = m * q - c;
        }
    };
    for (let i = 0; i < HEADER_BITS; i++) write(bitAt(head, i), HEADER_COPIES);
    for (let i = 0; i < body.length * 8; i++) write(bitAt(body, i), r);

    // add the changes to R, G and B equally (moves brightness, not colour)
    let touched = 0;
    for (let b = 0; b < A.n; b++) {
        let any = false;
        for (let p = 0; p < POS.length; p++) if (delta[b * POS.length + p]) { any = true; break; }
        if (!any) continue;
        touched++;
        const bx = b % A.bw, by = (b / A.bw) | 0;
        for (let y = 0; y < 8; y++) {
            let i = ((by * 8 + y) * width + bx * 8) * 4;
            for (let x = 0; x < 8; x++, i += 4) {
                let d = 0;
                for (let p = 0; p < POS.length; p++) d += delta[b * POS.length + p] * BASIS[p][y * 8 + x];
                data[i] += d; data[i + 1] += d; data[i + 2] += d;   // clamped and rounded
            }
        }
    }
    return { copies: r, touched: touched / A.n };
}

/** Read hidden bytes back: {ok, bytes?, rawErrors, reason?} */
export function extract(imageData) {
    const A = analyse(imageData);
    const perm = permutation(A.n);
    let s = 0, reads = 0, disagree = 0;

    const readBit = (copies) => {
        const votes = [];
        for (let k = 0; k < copies; k++, s++) {
            const [b, p] = slot(perm, A.n, s);
            if (A.std[b] < TEXTURE) continue;
            votes.push(Math.round(A.coef[b * POS.length + p] / STEPS[p]) & 1);
        }
        const ones = votes.reduce((x, y) => x + y, 0);
        const bit = ones * 2 > votes.length ? 1 : 0;
        reads += votes.length;
        disagree += bit ? votes.length - ones : ones;
        return bit;
    };
    const readBytes = (count, copies) => {
        const out = new Uint8Array(count);
        for (let i = 0; i < count * 8; i++) if (readBit(copies)) out[i >> 3] |= 1 << (7 - (i & 7));
        return out;
    };
    const rate = () => (reads ? disagree / reads : 0);

    const head = readBytes(4, HEADER_COPIES);
    if (head[0] !== MAGIC) return { ok: false, rawErrors: rate(), reason: 'no hidden message found' };
    const r = head[1], len = (head[2] << 8) | head[3];
    if (r < MIN_COPIES || HEADER_BITS * HEADER_COPIES + (len + 4) * 8 * r > A.n * POS.length) {
        return { ok: false, rawErrors: rate(), reason: 'damaged (bad header)' };
    }
    const body = readBytes(len + 4, r);
    const bytes = body.slice(0, len), c = body.slice(len);
    const crc = ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0;
    if (crc !== crc32(bytes)) return { ok: false, rawErrors: rate(), reason: 'damaged (check failed)' };
    return { ok: true, bytes, rawErrors: rate(), copies: r };
}
