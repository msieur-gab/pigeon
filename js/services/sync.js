import * as crypto from '../utils/crypto.js';
import * as identity from './identity.js';
import * as contacts from './contacts.js';

// Server configuration
let serverUrl = '';

export function setServer(url) {
    serverUrl = url.replace(/\/$/, ''); // Remove trailing slash
}

export function getServer() {
    return serverUrl;
}

// Build sync data object
function buildSyncData() {
    return {
        profile: {
            name: identity.getName(),
            avatar: identity.getAvatar()
        },
        contacts: contacts.getAll(),
        pending: contacts.getPending(),
        v: 1
    };
}

// Encrypt sync data with secret key
function encryptSyncData(data) {
    const secretKey = identity.getSecretKey();
    if (!secretKey) throw new Error('No identity');
    
    const json = JSON.stringify(data);
    return crypto.encryptSymmetric(json, secretKey);
}

// Decrypt sync data with secret key
function decryptSyncData(cipher, nonce) {
    const secretKey = identity.getSecretKey();
    if (!secretKey) throw new Error('No identity');
    
    const json = crypto.decryptSymmetric(cipher, nonce, secretKey);
    return JSON.parse(json);
}

// Push local data to server
export async function push() {
    if (!serverUrl) throw new Error('No server configured');
    
    const address = identity.getAddress();
    if (!address) throw new Error('No identity');
    
    const data = buildSyncData();
    const encrypted = encryptSyncData(data);
    
    const response = await fetch(`${serverUrl}/api/sync.php`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            address,
            cipher: encrypted.cipher,
            nonce: encrypted.nonce
        })
    });
    
    if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
    }
    
    return true;
}

// Pull data from server
export async function pull() {
    if (!serverUrl) throw new Error('No server configured');
    
    const address = identity.getAddress();
    if (!address) throw new Error('No identity');
    
    const response = await fetch(`${serverUrl}/api/sync.php?address=${address}`);
    
    if (response.status === 404) {
        // No data on server yet
        return null;
    }
    
    if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.cipher || !result.nonce) {
        return null;
    }
    
    const data = decryptSyncData(result.cipher, result.nonce);
    return data;
}

// Restore from server (after identity recovery)
export async function restore() {
    const data = await pull();
    
    if (!data) {
        return false;
    }
    
    // Restore profile
    if (data.profile?.name) {
        identity.setName(data.profile.name);
    }
    if (data.profile?.avatar) {
        identity.setAvatar(data.profile.avatar);
    }
    
    // Restore contacts
    contacts.importAll({
        contacts: data.contacts || [],
        pending: data.pending || []
    });
    
    return true;
}

// Sync on changes (debounced push)
let syncTimeout = null;

export function scheduleSync() {
    if (!serverUrl) return;
    
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    
    // Debounce: wait 2 seconds after last change before syncing
    syncTimeout = setTimeout(async () => {
        try {
            await push();
            console.log('Sync completed');
        } catch (e) {
            console.error('Sync failed:', e);
        }
    }, 2000);
}

// Check if sync is available
export function isConfigured() {
    return serverUrl !== '';
}
