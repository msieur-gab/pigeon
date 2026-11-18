// Block-brightness hiding (lab). One bit per 8x8 block: the block's average
// brightness is nudged onto an even or odd step of a 6-level grid. JPEG
// re-encoding barely moves block averages, so the bits survive the
// compression of messaging apps. Each bit is written 5 times in blocks
// spread over the image; reading takes the majority. Only as many blocks as
// the message needs are touched: a short message leaves most of the picture
// untouched.
//
// Same idea as Phasm's "Fortress" mode (written from scratch here).

export const LONG_SIDE = 1280;   // Telegram and WhatsApp keep this size
const STEP = 6;                  // brightness grid (Y levels): ±3 at most, nearly invisible on smooth skies
const REPEAT = 5;                // copies of each bit
const MAGIC = 0x50;              // 'P'
const SEED = 0x9e3779b9;

// --- helpers ---------------------------------------------------------------

function crc32(bytes) {
    let c = ~0;
    for (const b of bytes) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

// Same shuffle on both sides, so copies of a bit land far apart
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

function layout(width, height) {
    const bw = width >> 3, bh = height >> 3;
    const blocks = bw * bh;
    const capacity = Math.floor(blocks / REPEAT / 8);   // bytes, incl. 7 bytes of framing
    return { bw, bh, blocks, capacity, perm: permutation(blocks) };
}

function blockMean(data, width, bx, by) {
    let sum = 0;
    for (let y = 0; y < 8; y++) {
        let i = ((by * 8 + y) * width + bx * 8) * 4;
        for (let x = 0; x < 8; x++, i += 4) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
    }
    return sum / 64;
}

/** Room for text, in bytes, for an image of this size */
export function capacityFor(width, height) {
    return layout(width, height).capacity - 7;
}

/**
 * Resize a picture so its long side is 1280 px, both sides multiples of 16.
 * @returns {ImageData}
 */
export function prepareCover(img) {
    const scale = LONG_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const w = Math.floor((img.naturalWidth || img.width) * scale / 16) * 16;
    const h = Math.floor((img.naturalHeight || img.height) * scale / 16) * 16;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

/**
 * Hide bytes in the picture (changes imageData in place).
 */
export function embed(imageData, bytes) {
    const { width, height, data } = imageData;
    const L = layout(width, height);
    if (bytes.length + 7 > L.capacity) {
        throw new Error(`Too long: ${bytes.length} bytes, room for ${L.capacity - 7}`);
    }

    // frame: magic, length (2), bytes, crc32 (4)
    const frame = new Uint8Array(bytes.length + 7);
    frame[0] = MAGIC;
    frame[1] = bytes.length >> 8;
    frame[2] = bytes.length & 0xff;
    frame.set(bytes, 3);
    const crc = crc32(bytes);
    frame.set([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], 3 + bytes.length);

    // copy k of bit i sits in block perm[i * REPEAT + k]: the header comes
    // first, so a reader can find the length before reading the rest
    const nbits = frame.length * 8;
    for (let s = 0; s < nbits * REPEAT; s++) {
        const i = (s / REPEAT) | 0;
        const bit = (frame[i >> 3] >> (7 - (i & 7))) & 1;
        const block = L.perm[s];
        const bx = block % L.bw, by = (block / L.bw) | 0;

        // nearest grid point for this bit that a block can reach
        const m = blockMean(data, width, bx, by);
        const offset = bit * STEP / 2;
        let target = Math.round((m - offset) / STEP) * STEP + offset;
        if (target > 250) target -= STEP;
        if (target < 5) target += STEP;

        // shift R, G and B equally (moves Y, leaves colour); repeat to
        // make up for pixels clipped at 0 or 255
        for (let pass = 0; pass < 4; pass++) {
            const d = target - blockMean(data, width, bx, by);
            if (Math.abs(d) < 0.25) break;
            for (let y = 0; y < 8; y++) {
                let p = ((by * 8 + y) * width + bx * 8) * 4;
                for (let x = 0; x < 8; x++, p += 4) {
                    data[p] = data[p] + d;         // Uint8ClampedArray clamps and rounds
                    data[p + 1] = data[p + 1] + d;
                    data[p + 2] = data[p + 2] + d;
                }
            }
        }
    }
    return imageData;
}

/**
 * Read hidden bytes back.
 * @returns {{ok: boolean, bytes?: Uint8Array, rawErrors: number, reason?: string}}
 *   rawErrors: share of copies that disagreed with the majority (0..1)
 */
export function extract(imageData) {
    const { width, height, data } = imageData;
    const L = layout(width, height);
    let reads = 0, disagree = 0;

    // majority vote for bytes [from, to)
    function readBytes(from, to) {
        const out = new Uint8Array(to - from);
        for (let i = from * 8; i < to * 8; i++) {
            const bits = [];
            for (let k = 0; k < REPEAT; k++) {
                const block = L.perm[i * REPEAT + k];
                const m = blockMean(data, width, block % L.bw, (block / L.bw) | 0);
                bits.push(Math.round(m / (STEP / 2)) & 1);
            }
            const ones = bits.reduce((x, y) => x + y, 0);
            const bit = ones * 2 > REPEAT ? 1 : 0;
            reads += REPEAT;
            disagree += bit ? REPEAT - ones : ones;
            if (bit) out[(i >> 3) - from] |= 1 << (7 - (i & 7));
        }
        return out;
    }

    const head = readBytes(0, 3);
    const rate = () => (reads ? disagree / reads : 0);
    if (head[0] !== MAGIC) return { ok: false, rawErrors: rate(), reason: 'no hidden message found' };
    const len = (head[1] << 8) | head[2];
    if (len + 7 > L.capacity) return { ok: false, rawErrors: rate(), reason: 'damaged (bad length)' };
    const rest = readBytes(3, 7 + len);
    const bytes = rest.slice(0, len);
    const c = rest.slice(len, len + 4);
    const crc = ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0;
    if (crc !== crc32(bytes)) return { ok: false, rawErrors: rate(), reason: 'damaged (check failed)' };
    return { ok: true, bytes, rawErrors: rate(), blocksUsed: (7 + len) * 8 * REPEAT, blocks: L.blocks };
}

export { crc32 };
