// Steganography module with LSB (PNG) and F5 (JPEG) support
// F5 is compression-resistant, LSB is for lossless scenarios

import * as f5 from './stego-f5.js';

// ============================================
// LSB Encoding (Original - for PNG)
// ============================================

function textToBits(text) {
    const bytes = new TextEncoder().encode(text);
    const bits = [];
    for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }
    return bits;
}

function bitsToText(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | bits[i + j];
        }
        bytes.push(byte);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
}

function lengthToBits(length) {
    const bits = [];
    for (let i = 31; i >= 0; i--) {
        bits.push((length >> i) & 1);
    }
    return bits;
}

function bitsToLength(bits) {
    let length = 0;
    for (let i = 0; i < 32; i++) {
        length = (length << 1) | bits[i];
    }
    return length;
}

// Encode payload into image using LSB
function encodeLSB(imageData, payload) {
    const json = JSON.stringify(payload);
    const data = imageData.data;

    // SECURITY: Clear ALL LSBs first (clean slate)
    for (let i = 0; i < data.length; i++) {
        if ((i + 1) % 4 !== 0) {
            data[i] = data[i] & 0xFE;
        }
    }

    const messageBits = textToBits(json);
    const lengthBits = lengthToBits(messageBits.length);
    const allBits = [...lengthBits, ...messageBits];

    const maxBits = (data.length / 4) * 3;
    if (allBits.length > maxBits) {
        throw new Error(`Payload too large. Max ~${Math.floor(maxBits / 8)} bytes, got ${Math.ceil(allBits.length / 8)}`);
    }

    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < allBits.length; i++) {
        if ((i + 1) % 4 === 0) continue;
        data[i] = (data[i] & 0xFE) | allBits[bitIndex];
        bitIndex++;
    }

    return imageData;
}

// Decode payload from LSB-encoded image
function decodeLSB(imageData) {
    const data = imageData.data;
    const bits = [];

    for (let i = 0; i < data.length; i++) {
        if ((i + 1) % 4 === 0) continue;
        bits.push(data[i] & 1);
    }

    const length = bitsToLength(bits.slice(0, 32));

    if (length <= 0 || length > bits.length - 32) {
        throw new Error('No hidden data found');
    }

    const messageBits = bits.slice(32, 32 + length);
    const json = bitsToText(messageBits);

    try {
        return JSON.parse(json);
    } catch (e) {
        throw new Error('Invalid payload data');
    }
}

// ============================================
// Unified API with format detection
// ============================================

/**
 * Encode payload into image
 * @param {ImageData|Uint8Array} source - ImageData for LSB, JPEG Uint8Array for F5
 * @param {Object} payload - Data to encode
 * @param {Object} [options] - Encoding options
 * @param {boolean} [options.robust=false] - Use F5 for compression resistance
 * @returns {ImageData|Uint8Array} - Encoded image (same type as input)
 */
export function encode(source, payload, options = {}) {
    const { robust = false } = options;

    if (robust) {
        // F5 encoding (requires JPEG Uint8Array)
        if (!(source instanceof Uint8Array)) {
            throw new Error('F5 encoding requires JPEG Uint8Array. Use encodeRobust() or convert first.');
        }
        return f5.encode(source, payload);
    } else {
        // LSB encoding (requires ImageData)
        if (source instanceof Uint8Array) {
            throw new Error('LSB encoding requires ImageData. Use loadImage() first.');
        }
        return encodeLSB(source, payload);
    }
}

/**
 * Encode payload with F5 (compression-resistant)
 * Convenience method that handles image conversion
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
 * Decode payload from image
 * Auto-detects format (LSB from ImageData, F5 from Uint8Array)
 * @param {ImageData|Uint8Array} source - Encoded image
 * @returns {Object} - Decoded payload
 */
export function decode(source) {
    if (source instanceof Uint8Array) {
        // Try F5 first (JPEG)
        return f5.decode(source);
    } else if (source && source.data && source.width && source.height) {
        // ImageData - use LSB
        return decodeLSB(source);
    } else {
        throw new Error('Invalid source: must be ImageData or Uint8Array');
    }
}

/**
 * Smart decode - tries both formats
 * @param {File|Blob} file - Image file
 * @returns {Promise<Object>} - Decoded payload
 */
export async function decodeFile(file) {
    const isJpeg = file.type === 'image/jpeg' || file.name?.toLowerCase().endsWith('.jpg');

    // Try format based on mime type first
    if (isJpeg) {
        try {
            const jpegData = await f5.loadJpegDirect(file);
            return f5.decode(jpegData);
        } catch (e) {
            // Fall through to try LSB
        }
    }

    // Try LSB (works on any image type)
    try {
        const { imageData } = await loadImage(file);
        return decodeLSB(imageData);
    } catch (e) {
        // If that failed too, try F5 as last resort (might be JPEG saved as PNG)
        if (!isJpeg) {
            try {
                const jpegData = await f5.loadJpegDirect(file);
                return f5.decode(jpegData);
            } catch (e2) {
                // Original error is more useful
            }
        }
        throw e;
    }
}

// ============================================
// Utility functions
// ============================================

/**
 * Calculate capacity of an image for LSB encoding
 */
export function capacity(width, height) {
    const pixels = width * height;
    const bits = pixels * 3;
    const bytes = Math.floor(bits / 8);
    return bytes - 4;
}

/**
 * Analyze JPEG capacity for F5 encoding
 * @param {Uint8Array} jpegData - JPEG data
 * @returns {Object} - Capacity info
 */
export function analyzeF5Capacity(jpegData) {
    return f5.analyze(jpegData);
}

/**
 * Load image file to canvas and return imageData
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
 * Load image file as JPEG Uint8Array (for F5 encoding)
 */
export async function loadImageAsJpeg(file, quality = 0.92) {
    return f5.loadImageAsJpeg(file, quality);
}

/**
 * Convert imageData to PNG blob
 */
export function toBlob(imageData) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob(resolve, 'image/png');
    });
}

/**
 * Convert imageData to JPEG blob (for F5)
 */
export function toJpegBlob(imageData, quality = 0.92) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob(resolve, 'image/jpeg', quality);
    });
}

/**
 * Convert imageData to data URL (PNG)
 */
export function toDataURL(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
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
