// Meeting in person: each phone shows a QR code holding its public key and
// name, and the other one scans it. Two scans, and both have each other.
//
// The code is a link (…/pigeon/#meet=1.<key>.<name>), so a phone camera can
// open it too: someone without Pigeon lands on the app and the contact is
// added once their identity exists. The part after # never reaches a server.

import qrcode from '../vendor/qrcode.esm.min.js';
import { decodeBase64 } from './crypto.js';

const PREFIX = '#meet=';
const VERSION = '1';
const MAX_NAME = 40;

const INK = '#1d1d1f';    // same ink and paper as the stamps
const PAPER = '#fbfaf5';

function toUrlSafe(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    return b64 + '='.repeat((4 - b64.length % 4) % 4);
}

/** The link your code carries */
export function meetLink(publicKey, name = '') {
    const base = location.origin + location.pathname;
    const n = encodeURIComponent(String(name).slice(0, MAX_NAME));
    return `${base}${PREFIX}${VERSION}.${toUrlSafe(publicKey)}.${n}`;
}

/**
 * Read a scanned text or link. Returns { publicKey, name } (publicKey in the
 * app's usual base64), or null when it isn't a Pigeon code.
 */
export function parseMeetLink(text) {
    const at = String(text || '').indexOf(PREFIX);
    if (at === -1) return null;
    const parts = text.slice(at + PREFIX.length).split('.');
    if (parts[0] !== VERSION || parts.length < 2) return null;

    const publicKey = fromUrlSafe(parts[1]);
    try {
        if (decodeBase64(publicKey).length !== 32) return null;
    } catch {
        return null;
    }

    let name = '';
    try {
        name = decodeURIComponent(parts.slice(2).join('.'));
    } catch {
        name = '';
    }
    return { publicKey, name: name.trim().slice(0, MAX_NAME) };
}

/** QR code as an SVG data URL, ink on stamp paper, with a quiet zone */
export function qrDataUrl(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const size = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
        + `<rect width="${size}" height="${size}" fill="${PAPER}"/><path d="${d}" fill="${INK}"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// === Scanning ===

// Android Chrome (and Safari on macOS) read QR codes natively. Elsewhere
// (iPhone, desktop Chrome on Windows/Linux) jsQR does it, loaded only then.
let jsQRPromise = null;

function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (!jsQRPromise) {
        jsQRPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = new URL('../vendor/jsQR.min.js', import.meta.url).href;
            s.onload = () => resolve(window.jsQR);
            s.onerror = () => {
                jsQRPromise = null;
                reject(new Error('The scanner could not load'));
            };
            document.head.appendChild(s);
        });
    }
    return jsQRPromise;
}

async function makeDetector() {
    if ('BarcodeDetector' in window) {
        try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            if (formats.includes('qr_code')) {
                const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                return async (video) => (await detector.detect(video))[0]?.rawValue || null;
            }
        } catch {
            // fall through to jsQR
        }
    }

    const jsQR = await loadJsQR();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return async (video) => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return null;
        const scale = Math.min(1, 640 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
    };
}

/**
 * Start the back camera in a <video> and look for QR codes.
 * onText(text) is called for each code seen; return true to stop.
 * Resolves to a stop() function (safe to call more than once).
 */
export async function startScanner(video, onText) {
    if (!navigator.mediaDevices?.getUserMedia) {
        const err = new Error('no camera access');
        err.name = 'NotSupportedError';
        throw err;
    }

    const detect = await makeDetector();
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
    });

    let stopped = false;
    let timer = null;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    };

    video.setAttribute('playsinline', '');
    video.muted = true;
    video.srcObject = stream;
    try {
        await video.play();
    } catch (err) {
        stop();
        throw err;
    }

    const tick = async () => {
        if (stopped) return;
        try {
            const text = await detect(video);
            if (text && !stopped && onText(text) === true) {
                stop();
                return;
            }
        } catch {
            // a frame that can't be read; try the next one
        }
        if (!stopped) timer = setTimeout(tick, 200);
    };
    tick();

    return stop;
}
