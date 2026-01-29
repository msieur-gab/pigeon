// Steganography module - F5 (JPEG) encoding
// Compression-resistant, survives Telegram/WhatsApp sharing

import * as f5 from './stego-f5.js';

/**
 * Encode payload into image using F5
 * @param {File|Blob|ImageData|Uint8Array} source - Image source
 * @param {Object} payload - Data to encode
 * @param {number} [quality=0.92] - JPEG quality
 * @returns {Promise<{jpegData: Uint8Array, blob: Blob, dataURL: string}>}
 */
export async function encodeRobust(source, payload, quality = 0.92) {
    let jpegData;

    if (source instanceof Uint8Array) {
        jpegData = source;
    } else if (source instanceof ImageData) {
        jpegData = await f5.canvasToJpeg(source, quality);
    } else if (source instanceof File || source instanceof Blob) {
        const loaded = await f5.loadImageAsJpeg(source, quality);
        jpegData = loaded.jpegData;
    } else {
        throw new Error('Invalid source type');
    }

    const stegoJpeg = f5.encode(jpegData, payload);

    return {
        jpegData: stegoJpeg,
        blob: f5.jpegToBlob(stegoJpeg),
        dataURL: f5.jpegToDataURL(stegoJpeg)
    };
}

/**
 * Decode payload from image file
 * @param {File|Blob} file - Image file
 * @returns {Promise<Object>} - Decoded payload
 */
export async function decodeFile(file) {
    const jpegData = await f5.loadJpegDirect(file);
    return f5.decode(jpegData);
}

/**
 * Analyze JPEG capacity for F5 encoding
 * @param {Uint8Array} jpegData - JPEG data
 * @returns {Object} - Capacity info
 */
export function analyzeCapacity(jpegData) {
    return f5.analyze(jpegData);
}

/**
 * Load image file to canvas and return imageData
 * Used for thumbnail extraction
 */
export function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve({
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
                width: img.width,
                height: img.height
            });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Create thumbnail from imageData (for avatars)
 */
export function toThumbnail(imageData, size = 64) {
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    srcCanvas.getContext('2d').putImageData(imageData, 0, 0);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const ctx = thumbCanvas.getContext('2d');

    const srcSize = Math.min(imageData.width, imageData.height);
    const srcX = (imageData.width - srcSize) / 2;
    const srcY = (imageData.height - srcSize) / 2;

    ctx.drawImage(srcCanvas, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

    return thumbCanvas.toDataURL('image/png');
}

// Re-export F5 utilities for direct access
export { f5 };
