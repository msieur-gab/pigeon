// Small square pictures (avatars, stamps) as compact JPEG data URLs.
//
// JPEG only, on purpose: every browser can create it (Safari can't create
// WebP from a canvas and silently returns a ~10x bigger PNG), and the
// size cap does most of the saving anyway.

export const AVATAR_SIZE = 192;   // your own picture (shown up to 96 px)
export const CONTACT_SIZE = 96;   // a contact's picture (shown ~34 px)
export const STAMP_SIZE = 400;    // the arrival stamp (shown 170 px)

/**
 * Centre-crop to a square, scale to `size`, encode as JPEG.
 * @param {ImageData|HTMLImageElement|HTMLCanvasElement} source
 * @param {number} size - output width and height in pixels
 * @param {number} [quality=0.8]
 * @returns {string} data:image/jpeg;base64,...
 */
export function squareJpeg(source, size, quality = 0.8) {
    const src = source instanceof ImageData ? toCanvas(source) : source;
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    const side = Math.min(w, h);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
}

function toCanvas(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas;
}
