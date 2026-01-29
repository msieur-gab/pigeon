import * as crypto from '../utils/crypto.js';
import * as identity from './identity.js';
import * as contacts from './contacts.js';

// Payload types
export const TYPE = {
    INVITE: 'invite',  // Initial invite with temp key
    CLAIM: 'claim',    // Response to invite
    MESSAGE: 'msg',    // Normal encrypted message
    SOUL: 'soul'       // Identity backup (handled by identity service)
};

// Create invite payload
export function createInvite(message, avatar = null) {
    const myPublicKey = identity.getPublicKey();
    const myName = identity.getName();
    const myAvatar = avatar || identity.getAvatar();
    if (!myPublicKey) throw new Error('No identity');
    
    // Generate temporary symmetric key for this invite
    const tempKey = crypto.generateSymmetricKey();
    const tempKeyBase64 = crypto.encodeBase64(tempKey);
    
    // Encrypt message with temp key
    const encrypted = crypto.encryptSymmetric(message, tempKey);
    
    return {
        payload: {
            t: TYPE.INVITE,
            from: myPublicKey,
            name: myName,
            avatar: myAvatar,
            temp: tempKeyBase64,
            msg: encrypted.cipher,
            nonce: encrypted.nonce
        },
        tempKey: tempKeyBase64 // Return for storage in pending invites
    };
}

// Create claim payload (response to invite)
export function createClaim(message, tempKey, avatar = null) {
    const myPublicKey = identity.getPublicKey();
    const myName = identity.getName();
    const myAvatar = avatar || identity.getAvatar();
    if (!myPublicKey) throw new Error('No identity');
    
    // Encrypt reply with temp key
    const encrypted = crypto.encryptSymmetric(message, tempKey);
    
    return {
        t: TYPE.CLAIM,
        from: myPublicKey,
        name: myName,
        avatar: myAvatar,
        msg: encrypted.cipher,
        nonce: encrypted.nonce
    };
}

// Create message payload (for established contact)
export function createMessage(message, contactPublicKey) {
    const mySecretKey = identity.getSecretKey();
    if (!mySecretKey) throw new Error('No identity');
    
    // Encrypt with nacl.box
    const encrypted = crypto.encryptBox(message, contactPublicKey, mySecretKey);
    
    return {
        t: TYPE.MESSAGE,
        msg: encrypted.cipher,
        nonce: encrypted.nonce
    };
}

// Parse incoming payload
export function parse(payload) {
    // Check for duplicate
    const hash = crypto.hashPayload(payload);
    if (contacts.isProcessed(hash)) {
        return {
            type: 'duplicate',
            hash
        };
    }
    
    switch (payload.t) {
        case TYPE.INVITE:
            return parseInvite(payload, hash);
        
        case TYPE.CLAIM:
            return parseClaim(payload, hash);
        
        case TYPE.MESSAGE:
            return parseMessage(payload, hash);
        
        case TYPE.SOUL:
            return { type: 'soul', payload, hash };
        
        default:
            throw new Error('Unknown payload type');
    }
}

// Parse invite payload
function parseInvite(payload, hash) {
    try {
        const message = crypto.decryptSymmetric(
            payload.msg,
            payload.nonce,
            payload.temp
        );
        
        return {
            type: TYPE.INVITE,
            fromPublicKey: payload.from,
            fromFingerprint: crypto.fingerprint(payload.from),
            fromName: payload.name || '',
            fromAvatar: payload.avatar || null,
            tempKey: payload.temp,
            message,
            hash
        };
    } catch (e) {
        throw new Error('Failed to decrypt invite');
    }
}

// Parse claim payload
function parseClaim(payload, hash) {
    // Try to match with pending invites
    const pendingInvites = contacts.getPending();
    
    for (const invite of pendingInvites) {
        try {
            const message = crypto.decryptSymmetric(
                payload.msg,
                payload.nonce,
                invite.tempKey
            );
            
            return {
                type: TYPE.CLAIM,
                fromPublicKey: payload.from,
                fromFingerprint: crypto.fingerprint(payload.from),
                fromName: payload.name || '',
                fromAvatar: payload.avatar || null,
                message,
                pendingInvite: invite,
                hash
            };
        } catch (e) {
            // Not this invite, try next
        }
    }
    
    throw new Error('No matching pending invite found');
}

// Parse message payload
function parseMessage(payload, hash) {
    const mySecretKey = identity.getSecretKey();
    if (!mySecretKey) throw new Error('No identity');
    
    // Try each contact
    const allContacts = contacts.getAll();
    
    for (const contact of allContacts) {
        const decrypted = crypto.decryptBox(
            payload.msg,
            payload.nonce,
            contact.publicKey,
            mySecretKey
        );
        
        if (decrypted) {
            return {
                type: TYPE.MESSAGE,
                from: contact,
                message: decrypted,
                hash
            };
        }
    }
    
    throw new Error('Could not decrypt message - unknown sender');
}

// Mark payload as processed
export function markProcessed(hash) {
    contacts.markProcessed(hash);
}
