// Steganography: hides Pigeon payloads in the bird's pixels with dither
// modulation (js/utils/dither.js). The hidden bytes survive WhatsApp and
// Telegram re-encoding the picture as a photo, as long as it isn't resized,
// cropped or edited. One way for every image: share it like any photo.

import * as dither from './dither.js';
import * as codec from './payload-codec.js';

const CROP = 0.02;          // random crop per side (up to 2%), so no two images from one photo line up
const QUALITY = 0.92;       // JPEG quality of the image Pigeon shares

function loadImg(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image')); };
        img.src = url;
    });
}

/**
 * Prepare a carrier from a photo: a landscape postcard (4:3 to 16:9; portrait,
 * square and panorama photos are cropped a little above the middle), 1280 px on
 * its long side, slightly cropped at random.
 * @param {Blob|File} blob
 * @returns {Promise<{cover: ImageData, room: number}>} room: bytes it can hide
 */
export async function prepareCarrier(blob) {
    const cover = dither.prepareCover(await loadImg(blob), { crop: CROP, postcard: true });
    return { cover, room: dither.capacityFor(cover) };
}

// Bytes a payload takes besides the message text (see payload-codec.js):
// header 4, keys 32 each, nonce 24, name 1 + its bytes (max 64),
// message length 2, encryption tag 16
const nameBytes = name => Math.min(64, new TextEncoder().encode(name || '').length);
export function overhead(type, name) {
    switch (type) {
        case 'msg': return 4 + 24 + 2 + 16;
        case 'claim': return 4 + 32 + 24 + 1 + nameBytes(name) + 2 + 16;
        case 'invite': return 4 + 32 + 32 + 24 + 1 + nameBytes(name) + 2 + 16;
        case 'soul': return 4 + 16 + 1 + 1 + nameBytes(name);
        default: throw new Error('Unknown payload type');
    }
}

/** Bytes of text left in a bird of `room` bytes (negative: too long) */
export function textLeft(room, type, name, text) {
    return room - overhead(type, name) - new TextEncoder().encode(text || '').length;
}

/**
 * Hide a payload in the cover and make the JPEG to share.
 * @param {ImageData} cover - from prepareCarrier (left untouched)
 * @param {Object} payload
 * @returns {Promise<{jpegData: Uint8Array, blob: Blob, dataURL: string}>}
 */
export async function encodeRobust(cover, payload) {
    const bytes = codec.encode(payload);
    const room = dither.capacityFor(cover);
    if (bytes.length > room) {
        throw new Error(`Too long for this bird by ${bytes.length - room} characters. Shorten it, or try another bird.`);
    }
    const pixels = new ImageData(new Uint8ClampedArray(cover.data), cover.width, cover.height);
    dither.embed(pixels, bytes);

    const canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext('2d').putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/jpeg', QUALITY));
    return {
        jpegData: new Uint8Array(await blob.arrayBuffer()),
        blob,
        dataURL: URL.createObjectURL(blob)
    };
}

/**
 * Read the payload hidden in an image.
 * Throws 'No hidden data found' when there is none (or it was destroyed);
 * other errors (e.g. made by a newer Pigeon) come from the payload codec.
 * @param {File|Blob} file
 * @returns {Promise<Object>}
 */
export async function decodeFile(file) {
    const { imageData } = await loadImage(file);
    const found = dither.extract(imageData);
    if (!found.ok) throw new Error('No hidden data found');
    return codec.decode(found.bytes);
}

/**
 * Load an image file and return its pixels at its own size.
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export async function loadImage(file) {
    const img = await loadImg(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return {
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height
    };
}

export const LONG_SIDE = dither.LONG_SIDE;
