import * as storage from '../utils/storage.js';
import * as crypto from '../utils/crypto.js';

const CONTACTS_KEY = 'contacts';
const PENDING_KEY = 'pending_invites';
const PROCESSED_KEY = 'processed_payloads';

// Get all confirmed contacts
export function getAll() {
    return storage.get(CONTACTS_KEY) || [];
}

// Get contact by public key
export function getByPublicKey(publicKey) {
    return getAll().find(c => c.publicKey === publicKey) || null;
}

// Get contact by fingerprint
export function getByFingerprint(fp) {
    return getAll().find(c => crypto.fingerprint(c.publicKey) === fp) || null;
}

// Add new contact
export function add(name, publicKey, displayName = '', avatar = null) {
    const contacts = getAll();
    
    // Check if already exists
    if (contacts.some(c => c.publicKey === publicKey)) {
        throw new Error('Contact already exists');
    }
    
    const contact = {
        id: crypto.encodeBase64(crypto.generateSeed()).slice(0, 8),
        name,
        displayName,
        publicKey,
        fingerprint: crypto.fingerprint(publicKey),
        avatar,
        addedAt: Date.now()
    };
    
    contacts.push(contact);
    storage.set(CONTACTS_KEY, contacts);
    return contact;
}

// Update contact
export function update(publicKey, updates) {
    const contacts = getAll();
    const idx = contacts.findIndex(c => c.publicKey === publicKey);
    
    if (idx === -1) throw new Error('Contact not found');
    
    Object.assign(contacts[idx], updates);
    storage.set(CONTACTS_KEY, contacts);
    return contacts[idx];
}

// Update contact name
export function rename(publicKey, newName) {
    return update(publicKey, { name: newName });
}

// Update contact display name (from them)
export function setDisplayName(publicKey, displayName) {
    return update(publicKey, { displayName });
}

// Update contact avatar
export function setAvatar(publicKey, avatar) {
    return update(publicKey, { avatar });
}

// Remove contact
export function remove(publicKey) {
    const contacts = getAll().filter(c => c.publicKey !== publicKey);
    storage.set(CONTACTS_KEY, contacts);
}

// === Pending Invites ===

// Get all pending invites (invites we created, awaiting response)
export function getPending() {
    return storage.get(PENDING_KEY) || [];
}

// Add pending invite
export function addPending(name, tempKey) {
    const pending = getPending();
    
    const invite = {
        id: crypto.encodeBase64(crypto.generateSeed()).slice(0, 8),
        name,
        tempKey,
        createdAt: Date.now()
    };
    
    pending.push(invite);
    storage.set(PENDING_KEY, pending);
    return invite;
}

// Find pending invite by temp key (for matching claims)
export function findPendingByTempKey(tempKey) {
    return getPending().find(p => p.tempKey === tempKey) || null;
}

// Remove pending invite (after confirmed or rejected)
export function removePending(id) {
    const pending = getPending().filter(p => p.id !== id);
    storage.set(PENDING_KEY, pending);
}

// Confirm pending invite → becomes contact
export function confirmPending(id, publicKey, displayName = '', avatar = null) {
    const pending = getPending();
    const invite = pending.find(p => p.id === id);
    
    if (!invite) throw new Error('Pending invite not found');
    
    // Add as contact
    const contact = add(invite.name, publicKey, displayName, avatar);
    
    // Remove from pending
    removePending(id);
    
    return contact;
}

// === Processed Payloads (duplicate detection) ===

export function getProcessed() {
    return storage.get(PROCESSED_KEY) || [];
}

export function isProcessed(hash) {
    return getProcessed().includes(hash);
}

export function markProcessed(hash) {
    const processed = getProcessed();
    if (!processed.includes(hash)) {
        processed.push(hash);
        // Keep only last 100 to prevent unbounded growth
        if (processed.length > 100) {
            processed.shift();
        }
        storage.set(PROCESSED_KEY, processed);
    }
}

// === Sync data (for backup/restore) ===

export function exportAll() {
    return {
        contacts: getAll(),
        pending: getPending(),
        processed: getProcessed()
    };
}

export function importAll(data) {
    if (data.contacts) storage.set(CONTACTS_KEY, data.contacts);
    if (data.pending) storage.set(PENDING_KEY, data.pending);
    if (data.processed) storage.set(PROCESSED_KEY, data.processed);
}

// Clear all data
export function clearAll() {
    storage.remove(CONTACTS_KEY);
    storage.remove(PENDING_KEY);
    storage.remove(PROCESSED_KEY);
}
