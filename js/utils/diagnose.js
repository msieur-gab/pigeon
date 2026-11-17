// Explain why an image didn't open.
//
// Hidden messages live in the exact JPEG data. When a messaging app sends a
// picture "as a photo", it re-encodes it and the message is gone. We can't
// recover it, but we can usually tell the user what happened, so they know
// to ask for the image again as a file.

// Standard JPEG luminance quantisation table (IJG / Annex K). Only the sum
// is used, so zigzag vs natural order doesn't matter.
const STD_LUMA_SUM = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99
].reduce((a, b) => a + b, 0);

// Pigeon writes JPEGs at quality 0.92; anything clearly below that was
// re-encoded by something else.
const COMPRESSED_BELOW = 90;

// Filenames messaging apps give to images they have compressed
const APP_PATTERNS = [
    { app: 'WhatsApp', re: /-WA\d+/i },
    { app: 'Telegram', re: /^photo_\d{4}-\d{2}-\d{2}/i },
    { app: 'Signal', re: /^signal-\d{4}-\d{2}-\d{2}/i }
];

/**
 * Estimate JPEG quality (1-100) from the first quantisation table.
 * Returns null if the file isn't a readable JPEG.
 * @param {Uint8Array} bytes
 */
export function estimateJpegQuality(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

    let i = 2;
    while (i + 4 <= bytes.length) {
        if (bytes[i] !== 0xFF) return null;
        const marker = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (marker === 0xDA) return null; // start of scan, no DQT found

        if (marker === 0xDB) {
            // DQT segment: first table in it
            const pq = bytes[i + 4] >> 4; // 0 = 8-bit, 1 = 16-bit values
            let sum = 0;
            for (let k = 0; k < 64; k++) {
                sum += pq
                    ? (bytes[i + 5 + 2 * k] << 8) | bytes[i + 6 + 2 * k]
                    : bytes[i + 5 + k];
            }
            const scale = (sum / STD_LUMA_SUM) * 100;
            const q = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
            return Math.max(1, Math.min(100, Math.round(q)));
        }
        i += 2 + len;
    }
    return null;
}

/**
 * Work out the most likely reason an image held no readable message.
 * @param {File} file
 * @returns {Promise<{kind: 'not-jpeg'|'compressed'|'no-message', app?: string, quality?: number}>}
 */
export async function diagnose(file) {
    const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    const isJpeg = head[0] === 0xFF && head[1] === 0xD8;
    if (!isJpeg) return { kind: 'not-jpeg' };

    const quality = estimateJpegQuality(head);
    const match = APP_PATTERNS.find(p => p.re.test(file.name || ''));

    if (match || (quality !== null && quality < COMPRESSED_BELOW)) {
        return { kind: 'compressed', app: match?.app, quality };
    }
    return { kind: 'no-message', quality };
}
