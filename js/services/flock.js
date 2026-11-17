// Flock: the user's own carrier photos, kept on the device (IndexedDB).
// Pigeon picks the least recently used bird for each new image, so the same
// photo isn't sent over and over.

import { squareJpeg } from '../utils/image.js';

const DB_NAME = 'pigeon';
const STORE = 'flock';
const MAX_EDGE = 1200;   // stored size; carriers are drawn at max 800x600
const THUMB = 96;

let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) return reject(new Error('No storage available'));
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Could not open storage'));
        }).catch(err => {
            dbPromise = null; // allow a retry later
            throw err;
        });
    }
    return dbPromise;
}

async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Storage aborted'));
    });
}

function loadImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a readable image')); };
        img.src = url;
    });
}

function drawScaled(img, maxW, maxH) {
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/** All birds, oldest first (without blobs needing to be read separately) */
export async function getAll() {
    const birds = await tx('readonly', store => store.getAll());
    return birds.sort((a, b) => a.addedAt - b.addedAt);
}

/** Add photos to the flock. Unreadable files are skipped. Returns count added. */
export async function add(files) {
    let added = 0;
    for (const file of files) {
        try {
            const img = await loadImage(file);
            const canvas = drawScaled(img, MAX_EDGE, MAX_EDGE);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            if (!blob) continue;
            const bird = {
                id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                blob,
                thumb: squareJpeg(img, THUMB),
                addedAt: Date.now(),
                lastUsed: 0
            };
            await tx('readwrite', store => store.put(bird));
            added++;
        } catch (err) {
            console.warn('Skipped a photo:', err);
        }
    }
    return added;
}

export async function remove(id) {
    await tx('readwrite', store => store.delete(id));
}

/**
 * Pick the bird used least recently (never-used first), at random among ties.
 * @param {string} [excludeId] - skip this one ("another bird")
 * @returns {Promise<Object|null>}
 */
export async function pick(excludeId) {
    let birds;
    try {
        birds = await getAll();
    } catch {
        return null; // storage unavailable: caller falls back to manual choice
    }
    const pool = birds.length > 1 ? birds.filter(b => b.id !== excludeId) : birds;
    if (!pool.length) return null;
    const oldest = Math.min(...pool.map(b => b.lastUsed));
    const candidates = pool.filter(b => b.lastUsed === oldest);
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Record that a bird carried a message */
export async function markUsed(id) {
    if (!id) return;
    try {
        const bird = await tx('readonly', store => store.get(id));
        if (bird) {
            bird.lastUsed = Date.now();
            await tx('readwrite', store => store.put(bird));
        }
    } catch (err) {
        console.warn('Could not update bird:', err);
    }
}
