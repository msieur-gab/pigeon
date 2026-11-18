// Estimate the JPEG quality an image was saved at (used by the lab's checker
// to show how hard WhatsApp or Telegram compressed a received bird).

// Standard JPEG luminance quantisation table (IJG / Annex K). Only the sum
// is used, so zigzag vs natural order doesn't matter.
const STD_LUMA_SUM = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99
].reduce((a, b) => a + b, 0);

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
