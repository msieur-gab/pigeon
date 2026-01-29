// Steganography using LSB (Least Significant Bit) encoding

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

// Encode payload into image
export function encode(imageData, payload) {
    const json = JSON.stringify(payload);
    const data = imageData.data;
    
    // SECURITY: Clear ALL LSBs first (clean slate)
    // Prevents leaking old data when reusing images
    for (let i = 0; i < data.length; i++) {
        if ((i + 1) % 4 !== 0) { // Skip alpha channel
            data[i] = data[i] & 0xFE; // Zero the LSB
        }
    }
    
    const messageBits = textToBits(json);
    const lengthBits = lengthToBits(messageBits.length);
    const allBits = [...lengthBits, ...messageBits];
    
    // Check capacity (3 bits per pixel, skip alpha)
    const maxBits = (data.length / 4) * 3;
    if (allBits.length > maxBits) {
        throw new Error(`Payload too large. Max ~${Math.floor(maxBits / 8)} bytes, got ${Math.ceil(allBits.length / 8)}`);
    }
    
    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < allBits.length; i++) {
        // Skip alpha channel (every 4th byte)
        if ((i + 1) % 4 === 0) continue;
        
        // Clear LSB and set to message bit
        data[i] = (data[i] & 0xFE) | allBits[bitIndex];
        bitIndex++;
    }
    
    return imageData;
}

// Decode payload from image
export function decode(imageData) {
    const data = imageData.data;
    const bits = [];
    
    // Extract LSBs from RGB channels
    for (let i = 0; i < data.length; i++) {
        if ((i + 1) % 4 === 0) continue; // Skip alpha
        bits.push(data[i] & 1);
    }
    
    // Read length (first 32 bits)
    const length = bitsToLength(bits.slice(0, 32));
    
    // Sanity check
    if (length <= 0 || length > bits.length - 32) {
        throw new Error('No hidden data found');
    }
    
    // Extract message bits
    const messageBits = bits.slice(32, 32 + length);
    const json = bitsToText(messageBits);
    
    try {
        return JSON.parse(json);
    } catch (e) {
        throw new Error('Invalid payload data');
    }
}

// Calculate capacity of an image
export function capacity(width, height) {
    const pixels = width * height;
    const bits = pixels * 3; // 3 bits per pixel (RGB)
    const bytes = Math.floor(bits / 8);
    return bytes - 4; // Subtract 4 bytes for length header
}

// Load image file to canvas and return imageData
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

// Convert imageData to PNG blob
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

// Convert imageData to data URL
export function toDataURL(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

// Create thumbnail from imageData (for avatars)
export function toThumbnail(imageData, size = 64) {
    // Create source canvas with original image
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    srcCanvas.getContext('2d').putImageData(imageData, 0, 0);
    
    // Create thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const ctx = thumbCanvas.getContext('2d');
    
    // Draw scaled and cropped (center crop to square)
    const srcSize = Math.min(imageData.width, imageData.height);
    const srcX = (imageData.width - srcSize) / 2;
    const srcY = (imageData.height - srcSize) / 2;
    
    ctx.drawImage(srcCanvas, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
    
    return thumbCanvas.toDataURL('image/png');
}
