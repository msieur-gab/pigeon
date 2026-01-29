// F5 Steganography wrapper for compression-resistant encoding
// Uses f5stegojs library for DCT coefficient embedding

// Default steganographic key (can be customized per-app)
const DEFAULT_KEY = [115, 112, 111, 114, 101, 45, 107, 101, 121]; // "spore-key" as bytes

/**
 * Encode payload into JPEG using F5 algorithm
 * @param {Uint8Array} jpegData - Source JPEG as Uint8Array
 * @param {Object} payload - Data to encode (will be JSON stringified)
 * @param {Array<number>} [key] - Optional steganographic key
 * @returns {Uint8Array} - JPEG with embedded data
 */
export function encode(jpegData, payload, key = DEFAULT_KEY) {
    if (typeof f5stego === 'undefined') {
        throw new Error('f5stego library not loaded');
    }

    // Serialize payload to bytes
    const json = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(json);

    // Create length prefix (4 bytes, big endian)
    const lengthPrefix = new Uint8Array(4);
    const length = messageBytes.length;
    lengthPrefix[0] = (length >> 24) & 0xFF;
    lengthPrefix[1] = (length >> 16) & 0xFF;
    lengthPrefix[2] = (length >> 8) & 0xFF;
    lengthPrefix[3] = length & 0xFF;

    // Combine length prefix + message
    const dataToEmbed = new Uint8Array(4 + messageBytes.length);
    dataToEmbed.set(lengthPrefix, 0);
    dataToEmbed.set(messageBytes, 4);

    // Initialize F5 with key
    const stegger = new f5stego(key);

    // Embed data
    try {
        const stegoJpeg = stegger.embed(jpegData, dataToEmbed);
        return stegoJpeg;
    } catch (e) {
        // f5stego may throw non-Error objects or capacity errors
        const msg = e?.message || String(e) || 'F5 encoding failed';
        if (msg.includes('capacity') || dataToEmbed.length > 2000) {
            throw new Error(`Payload too large (${dataToEmbed.length} bytes). Try a larger carrier image.`);
        }
        throw new Error(msg);
    }
}

/**
 * Decode payload from F5-encoded JPEG
 * @param {Uint8Array} jpegData - JPEG with embedded data
 * @param {Array<number>} [key] - Optional steganographic key
 * @returns {Object} - Decoded payload
 */
export function decode(jpegData, key = DEFAULT_KEY) {
    if (typeof f5stego === 'undefined') {
        throw new Error('f5stego library not loaded');
    }

    // Initialize F5 with key
    const stegger = new f5stego(key);

    // Extract data
    const extracted = stegger.extract(jpegData);

    if (!extracted || extracted.length < 4) {
        throw new Error('No hidden data found');
    }

    // Read length prefix
    const length = (extracted[0] << 24) | (extracted[1] << 16) |
                   (extracted[2] << 8) | extracted[3];

    // Sanity check
    if (length <= 0 || length > extracted.length - 4 || length > 100000) {
        throw new Error('No hidden data found');
    }

    // Extract message bytes
    const messageBytes = extracted.slice(4, 4 + length);

    // Decode to string
    const decoder = new TextDecoder();
    const json = decoder.decode(messageBytes);

    try {
        return JSON.parse(json);
    } catch (e) {
        throw new Error('Invalid payload data');
    }
}

/**
 * Analyze JPEG capacity for F5 embedding
 * @param {Uint8Array} jpegData - Source JPEG
 * @param {Array<number>} [key] - Optional steganographic key
 * @returns {Object} - Capacity info
 */
export function analyze(jpegData, key = DEFAULT_KEY) {
    if (typeof f5stego === 'undefined') {
        throw new Error('f5stego library not loaded');
    }

    const stegger = new f5stego(key);
    stegger.parse(jpegData);
    const analysis = stegger.analyze();

    // Return useful capacity info
    // analysis[k] gives capacity at encoding mode k
    // Mode 1 is most robust but lowest capacity
    // Higher modes = more capacity but less robust
    return {
        // Conservative capacity (mode 1, most robust)
        minCapacity: analysis[1] || 0,
        // Optimal capacity (typically mode 3-5)
        recommendedCapacity: analysis[4] || analysis[3] || analysis[1] || 0,
        // Maximum capacity (highest mode available)
        maxCapacity: Math.max(...analysis.filter(n => typeof n === 'number')),
        // Total usable coefficients
        coefficients: analysis.cc || 0,
        // Full analysis for debugging
        raw: analysis
    };
}

/**
 * Convert canvas/ImageData to JPEG Uint8Array
 * @param {HTMLCanvasElement|ImageData} source - Canvas or ImageData
 * @param {number} [quality=0.92] - JPEG quality (0-1)
 * @returns {Promise<Uint8Array>} - JPEG data
 */
export function canvasToJpeg(source, quality = 0.92) {
    return new Promise((resolve, reject) => {
        let canvas;

        if (source instanceof ImageData) {
            canvas = document.createElement('canvas');
            canvas.width = source.width;
            canvas.height = source.height;
            canvas.getContext('2d').putImageData(source, 0, 0);
        } else if (source instanceof HTMLCanvasElement) {
            canvas = source;
        } else {
            reject(new Error('Invalid source: must be Canvas or ImageData'));
            return;
        }

        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to create JPEG blob'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(new Uint8Array(reader.result));
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsArrayBuffer(blob);
        }, 'image/jpeg', quality);
    });
}

/**
 * Convert JPEG Uint8Array to Blob
 * @param {Uint8Array} jpegData - JPEG data
 * @returns {Blob} - JPEG Blob
 */
export function jpegToBlob(jpegData) {
    return new Blob([jpegData], { type: 'image/jpeg' });
}

/**
 * Convert JPEG Uint8Array to data URL
 * @param {Uint8Array} jpegData - JPEG data
 * @returns {string} - Data URL
 */
export function jpegToDataURL(jpegData) {
    const blob = jpegToBlob(jpegData);
    return URL.createObjectURL(blob);
}

/**
 * Load image file and return as JPEG Uint8Array
 * @param {File|Blob} file - Image file
 * @param {number} [quality=0.92] - JPEG quality if conversion needed
 * @returns {Promise<{jpegData: Uint8Array, width: number, height: number}>}
 */
export function loadImageAsJpeg(file, quality = 0.92) {
    return new Promise((resolve, reject) => {
        // If already JPEG, try to use directly
        const isJpeg = file.type === 'image/jpeg';

        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            try {
                const jpegData = await canvasToJpeg(canvas, quality);
                resolve({
                    jpegData,
                    width: img.width,
                    height: img.height
                });
            } catch (e) {
                reject(e);
            }

            URL.revokeObjectURL(img.src);
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Load existing JPEG directly as Uint8Array (preserves original quality)
 * @param {File|Blob} file - JPEG file
 * @returns {Promise<Uint8Array>}
 */
export function loadJpegDirect(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}
