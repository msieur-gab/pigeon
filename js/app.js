import * as identity from './services/identity.js';
import * as contacts from './services/contacts.js';
import * as messages from './services/messages.js';
import * as sync from './services/sync.js';
import * as stego from './utils/stego.js';
import * as crypto from './utils/crypto.js';

// App state
const state = {
    screen: 'loading',
    currentContact: null,
    receivedPayload: null,
    receivedImageData: null,  // For extracting avatar thumbnail from carrier
    generatedJpegData: null,  // Raw JPEG bytes for sharing (Uint8Array)
    generatedFilename: null   // Filename for sharing
};

// Initialize app
export function init() {
    // Load theme
    const savedTheme = localStorage.getItem('pigeon_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Load server URL
    const savedServer = localStorage.getItem('pigeon_server') || '';
    if (savedServer) {
        sync.setServer(savedServer);
    }
    
    // Check identity
    if (identity.exists()) {
        navigate('home');
    } else {
        navigate('welcome');
    }
    
    // Setup event listeners
    setupEventListeners();
}

// Navigation
export function navigate(screen, data = {}) {
    state.screen = screen;
    Object.assign(state, data);
    render();
}

// Render current screen
function render() {
    const app = document.getElementById('app');
    
    switch (state.screen) {
        case 'welcome':
            app.innerHTML = renderWelcome();
            break;
        case 'setup':
            app.innerHTML = renderSetup();
            break;
        case 'setup-words':
            app.innerHTML = renderSetupWords();
            break;
        case 'restore-words':
            app.innerHTML = renderRestoreWords();
            break;
        case 'restore-image':
            app.innerHTML = renderRestoreImage();
            break;
        case 'home':
            app.innerHTML = renderHome();
            break;
        case 'settings':
            app.innerHTML = renderSettings();
            break;
        case 'create-invite':
            app.innerHTML = renderCreateInvite();
            break;
        case 'send-message':
            app.innerHTML = renderSendMessage();
            break;
        case 'received-invite':
            app.innerHTML = renderReceivedInvite();
            break;
        case 'received-claim':
            app.innerHTML = renderReceivedClaim();
            break;
        case 'received-message':
            app.innerHTML = renderReceivedMessage();
            break;
        case 'backup':
            app.innerHTML = renderBackup();
            break;
        default:
            app.innerHTML = '<p>Loading...</p>';
    }
    
    attachScreenListeners();
}

// === Screen Renderers ===

function renderHeader(title = 'pigeon', showBack = false) {
    const theme = document.documentElement.getAttribute('data-theme');
    const icon = theme === 'dark' ? '○' : '●';
    
    return `
        <header>
            <h1>${showBack ? `<a href="#" class="back" onclick="window.app.navigate('home'); return false;">←</a> ` : ''}${title}</h1>
            <button class="theme-toggle" onclick="window.app.toggleTheme()">${icon}</button>
        </header>
    `;
}

function renderWelcome() {
    return `
        ${renderHeader('pigeon')}
        <div class="card">
            <p class="mb-1">Encrypted messages hidden in bird photos.</p>
            <button class="btn btn-block mb-1" onclick="window.app.navigate('setup')">Create identity</button>
            <button class="btn btn-block btn-ghost" onclick="window.app.navigate('restore-words')">Restore from words</button>
            <button class="btn btn-block btn-ghost" onclick="window.app.navigate('restore-image')">Restore from image</button>
        </div>
    `;
}

function renderSetup() {
    return `
        ${renderHeader('create identity', true)}
        <div class="card">
            <p class="mb-1">Choose a display name others will see:</p>
            <div class="field">
                <label>your name</label>
                <input type="text" id="setup-name" placeholder="black_dove">
            </div>
            <button class="btn btn-block" onclick="window.app.createIdentity()">Continue</button>
        </div>
    `;
}

function renderSetupWords() {
    const words = identity.getRecoveryWords();
    const fp = identity.getFingerprint();
    const name = identity.getName();
    
    return `
        ${renderHeader('your identity')}
        <div class="card">
            <p class="text-muted text-small mb-1">your name</p>
            <p class="mb-1">${name || '(unnamed)'}</p>
            <p class="text-muted text-small mb-1">your fingerprint</p>
            <div class="fingerprint">${fp}</div>
        </div>
        <div class="card">
            <p class="mb-1">Write down these 16 words. They can restore your identity.</p>
            <div class="words">
                ${words.map((w, i) => `<div class="word"><span class="num">${i + 1}</span> ${w}</div>`).join('')}
            </div>
            <label class="mt-1">
                <input type="checkbox" id="words-saved"> I have saved these words
            </label>
        </div>
        <button class="btn btn-block" id="continue-btn" disabled onclick="window.app.navigate('home')">Continue</button>
    `;
}

function renderRestoreWords() {
    return `
        ${renderHeader('restore', true)}
        <div class="card">
            <p class="mb-1">Enter your 16 recovery words, separated by spaces:</p>
            <div class="field">
                <textarea id="restore-words" placeholder="dawn river oak nest..."></textarea>
            </div>
            <button class="btn btn-block" onclick="window.app.restoreFromWords()">Restore identity</button>
        </div>
    `;
}

function renderRestoreImage() {
    return `
        ${renderHeader('restore', true)}
        <div class="card">
            <p class="mb-1">Select your soul bird image:</p>
            <button class="btn btn-block" onclick="document.getElementById('restore-image-input').click()">Choose image</button>
            <input type="file" id="restore-image-input" accept="image/*">
            <div id="restore-status"></div>
        </div>
    `;
}

function renderHome() {
    const fp = identity.getFingerprint();
    const name = identity.getName();
    const avatar = identity.getAvatar();
    const allContacts = contacts.getAll();
    const pending = contacts.getPending();
    
    const avatarHtml = avatar 
        ? `<img src="${avatar}" class="avatar" alt="">` 
        : `<div class="avatar avatar-placeholder">?</div>`;
    
    let contactsHtml = '';
    if (allContacts.length === 0 && pending.length === 0) {
        contactsHtml = '<div class="empty">No contacts yet</div>';
    } else {
        contactsHtml = '<ul class="contact-list">';
        for (const c of allContacts) {
            const contactAvatar = c.avatar 
                ? `<img src="${c.avatar}" class="avatar-small" alt="">` 
                : `<div class="avatar-small avatar-placeholder">?</div>`;
            const displayLine = c.displayName 
                ? `<span class="display-name">${c.displayName}</span>` 
                : '';
            contactsHtml += `
                <li class="contact-item" onclick="window.app.selectContact('${c.publicKey}')">
                    ${contactAvatar}
                    <div class="contact-info">
                        <span class="name">${c.name}</span>
                        ${displayLine}
                    </div>
                    <span class="fp">${c.fingerprint}</span>
                </li>
            `;
        }
        for (const p of pending) {
            contactsHtml += `
                <li class="contact-item pending">
                    <div class="avatar-small avatar-placeholder">?</div>
                    <span class="name">${p.name}</span>
                    <span class="fp">awaiting</span>
                </li>
            `;
        }
        contactsHtml += '</ul>';
    }
    
    return `
        ${renderHeader('pigeon')}
        <div class="card">
            <div class="identity-row">
                ${avatarHtml}
                <div class="identity-info">
                    <p class="text-muted text-small">${name || 'unnamed'}</p>
                    <div class="fingerprint">${fp}</div>
                </div>
                <button class="btn btn-ghost" onclick="window.app.navigate('settings')">⚙</button>
            </div>
        </div>
        <div class="actions mb-1">
            <button class="btn" onclick="window.app.navigate('create-invite')">+ invite</button>
            <button class="btn" onclick="document.getElementById('open-image-input').click()">↓ open</button>
            <input type="file" id="open-image-input" accept="image/*">
        </div>
        <div class="card">
            <h2>contacts</h2>
            ${contactsHtml}
        </div>
    `;
}

function renderSettings() {
    const name = identity.getName();
    const avatar = identity.getAvatar();
    const server = sync.getServer();
    const syncStatus = sync.isConfigured() ? 'configured' : 'not configured';
    
    const avatarHtml = avatar 
        ? `<img src="${avatar}" class="avatar-large" alt="">` 
        : `<div class="avatar-large avatar-placeholder">?</div>`;
    
    return `
        ${renderHeader('settings', true)}
        <div class="card">
            <h2>profile</h2>
            <div class="avatar-setting">
                ${avatarHtml}
                <button class="btn btn-ghost text-small" onclick="document.getElementById('avatar-input').click()">Change</button>
                <input type="file" id="avatar-input" accept="image/*">
            </div>
            <div class="field">
                <label>your display name</label>
                <input type="text" id="settings-name" value="${name}" placeholder="black_dove">
            </div>
            <button class="btn btn-block" onclick="window.app.saveName()">Save name</button>
        </div>
        <div class="card">
            <h2>sync server</h2>
            <p class="text-small text-muted mb-1">Status: ${syncStatus}</p>
            <div class="field">
                <label>server URL</label>
                <input type="text" id="settings-server" value="${server}" placeholder="https://example.com">
            </div>
            <div class="actions">
                <button class="btn" onclick="window.app.saveServer()">Save</button>
                <button class="btn btn-ghost" onclick="window.app.syncNow()">Sync now</button>
            </div>
        </div>
        <div class="card">
            <h2>backup</h2>
            <button class="btn btn-block mb-1" onclick="window.app.navigate('backup')">View recovery words</button>
        </div>
    `;
}

function renderCreateInvite() {
    return `
        ${renderHeader('new invite', true)}
        <div class="card">
            <div class="field">
                <label>contact name (for you)</label>
                <input type="text" id="invite-name" placeholder="Alice">
            </div>
            <div class="field">
                <label>first message</label>
                <textarea id="invite-message" placeholder="Hey! Use this to contact me securely..."></textarea>
            </div>
            <button class="btn btn-block mb-1" onclick="document.getElementById('invite-image-input').click()">Choose carrier image</button>
            <input type="file" id="invite-image-input" accept="image/*">
            <canvas id="invite-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-invite-btn" onclick="window.app.generateInvite()">Generate invite image</button>
            <img id="invite-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="invite-actions">
                <a id="invite-download" class="btn" download="pigeon-invite.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-invite.jpg', true)">Share</button>
            </div>
        </div>
    `;
}

function renderSendMessage() {
    const contact = state.currentContact;
    if (!contact) return renderHome();

    const displayInfo = contact.displayName
        ? `${contact.name} (${contact.displayName})`
        : contact.name;

    return `
        ${renderHeader('send to ' + contact.name, true)}
        <div class="card">
            <p class="text-muted text-small">${displayInfo}</p>
            <div class="fingerprint mb-1">${contact.fingerprint}</div>
            <div class="field">
                <label>message</label>
                <textarea id="send-message" placeholder="Your message..."></textarea>
            </div>
            <button class="btn btn-block mb-1" onclick="document.getElementById('send-image-input').click()">Choose carrier image</button>
            <input type="file" id="send-image-input" accept="image/*">
            <canvas id="send-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-send-btn" onclick="window.app.generateMessage()">Generate message image</button>
            <img id="send-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="send-actions">
                <a id="send-download" class="btn" download="pigeon-message.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-message.jpg', true)">Share</button>
            </div>
        </div>
    `;
}

function renderReceivedInvite() {
    const p = state.receivedPayload;
    if (!p) return renderHome();
    
    // Generate thumbnail from carrier image for visual recognition
    const carrierThumb = state.receivedImageData 
        ? stego.toThumbnail(state.receivedImageData) 
        : null;
    const avatarHtml = carrierThumb 
        ? `<img src="${carrierThumb}" class="avatar-large" alt="">` 
        : `<div class="avatar-large avatar-placeholder">?</div>`;
    
    return `
        ${renderHeader('invite received', true)}
        <div class="card">
            <div class="sender-info">
                ${avatarHtml}
                <div>
                    <p class="mb-1">${p.fromName || 'unnamed'}</p>
                    <div class="fingerprint">${p.fromFingerprint}</div>
                </div>
            </div>
            <div class="message-preview message-text">"${p.message}"</div>
            <div class="field">
                <label>save contact as</label>
                <input type="text" id="accept-name" value="${p.fromName || ''}" placeholder="Bob">
            </div>
            <div class="field">
                <label>reply message</label>
                <textarea id="accept-reply" placeholder="Got your invite!"></textarea>
            </div>
            <button class="btn btn-block mb-1" onclick="document.getElementById('accept-image-input').click()">Choose carrier image</button>
            <input type="file" id="accept-image-input" accept="image/*">
            <canvas id="accept-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-accept-btn" onclick="window.app.generateAccept()">Accept & generate reply</button>
            <img id="accept-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="accept-actions">
                <a id="accept-download" class="btn" download="pigeon-accept.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-accept.jpg', true)">Share</button>
            </div>
        </div>
    `;
}

function renderReceivedClaim() {
    const p = state.receivedPayload;
    if (!p) return renderHome();
    
    // Generate thumbnail from carrier image
    const carrierThumb = state.receivedImageData 
        ? stego.toThumbnail(state.receivedImageData) 
        : null;
    const avatarHtml = carrierThumb 
        ? `<img src="${carrierThumb}" class="avatar-large" alt="">` 
        : `<div class="avatar-large avatar-placeholder">?</div>`;
    
    return `
        ${renderHeader('invite accepted', true)}
        <div class="card">
            <div class="sender-info">
                ${avatarHtml}
                <div>
                    <p>${p.pendingInvite.name} has responded!</p>
                    <p class="text-muted text-small">${p.fromName || '(unnamed)'}</p>
                    <div class="fingerprint">${p.fromFingerprint}</div>
                </div>
            </div>
            <div class="message-preview message-text">"${p.message}"</div>
            <div class="status info">Verify this fingerprint matches what they see on their device.</div>
            <div class="actions">
                <button class="btn" onclick="window.app.confirmClaim()">Confirm</button>
                <button class="btn btn-ghost" onclick="window.app.rejectClaim()">Reject</button>
            </div>
        </div>
    `;
}

function renderReceivedMessage() {
    const p = state.receivedPayload;
    if (!p) return renderHome();
    
    const fromInfo = p.from.displayName 
        ? `${p.from.name} (${p.from.displayName})` 
        : p.from.name;
    
    return `
        ${renderHeader('message from ' + p.from.name, true)}
        <div class="card">
            <p class="text-muted text-small">${fromInfo}</p>
            <div class="fingerprint mb-1">${p.from.fingerprint}</div>
            <div class="message-preview message-text">"${p.message}"</div>
            <button class="btn btn-block mt-1" onclick="window.app.replyTo('${p.from.publicKey}')">Reply</button>
        </div>
    `;
}

function renderBackup() {
    const words = identity.getRecoveryWords();

    return `
        ${renderHeader('backup', true)}
        <div class="card">
            <h2>recovery words</h2>
            <div class="words">
                ${words.map((w, i) => `<div class="word"><span class="num">${i + 1}</span> ${w}</div>`).join('')}
            </div>
        </div>
        <div class="card">
            <h2>soul bird</h2>
            <p class="mb-1">Create an image that contains your identity.</p>
            <button class="btn btn-block mb-1" onclick="document.getElementById('backup-image-input').click()">Choose image</button>
            <input type="file" id="backup-image-input" accept="image/*">
            <canvas id="backup-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-backup-btn" onclick="window.app.generateBackup()">Generate soul bird</button>
            <img id="backup-output" class="hidden output-image" alt="Soul bird">
            <a id="backup-download" class="btn btn-block hidden" download="soul-bird.jpg">Save soul bird</a>
        </div>
    `;
}

// === Event Listeners ===

function setupEventListeners() {
    window.app = {
        init,
        navigate,
        toggleTheme,
        createIdentity,
        restoreFromWords,
        selectContact,
        generateInvite,
        generateMessage,
        generateAccept,
        generateBackup,
        confirmClaim,
        rejectClaim,
        replyTo,
        saveName,
        saveServer,
        syncNow,
        shareImage
    };
}

function attachScreenListeners() {
    // Setup checkbox enables continue button
    const checkbox = document.getElementById('words-saved');
    const continueBtn = document.getElementById('continue-btn');
    if (checkbox && continueBtn) {
        checkbox.addEventListener('change', () => {
            continueBtn.disabled = !checkbox.checked;
        });
    }
    
    // Image input handlers
    const imageInputs = [
        { input: 'invite-image-input', canvas: 'invite-canvas', btn: 'generate-invite-btn' },
        { input: 'send-image-input', canvas: 'send-canvas', btn: 'generate-send-btn' },
        { input: 'accept-image-input', canvas: 'accept-canvas', btn: 'generate-accept-btn' },
        { input: 'backup-image-input', canvas: 'backup-canvas', btn: 'generate-backup-btn' },
        { input: 'open-image-input', handler: handleOpenImage },
        { input: 'restore-image-input', handler: handleRestoreImage },
        { input: 'avatar-input', handler: handleAvatarChange }
    ];
    
    for (const cfg of imageInputs) {
        const input = document.getElementById(cfg.input);
        if (input) {
            input.addEventListener('change', (e) => {
                if (cfg.handler) {
                    cfg.handler(e);
                } else {
                    loadImageToCanvas(e, cfg.canvas, cfg.btn);
                }
            });
        }
    }
}

// === Actions ===

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pigeon_theme', next);
    render();
}

function createIdentity() {
    const name = document.getElementById('setup-name').value.trim();
    identity.create(name);
    sync.scheduleSync();
    navigate('setup-words');
}

function restoreFromWords() {
    const textarea = document.getElementById('restore-words');
    const words = textarea.value.trim().split(/\s+/);
    
    try {
        identity.restoreFromWords(words);
        
        // Try to restore from server
        if (sync.isConfigured()) {
            sync.restore().then(restored => {
                if (restored) {
                    alert('Contacts restored from server');
                    render();
                }
            }).catch(e => {
                console.error('Restore failed:', e);
            });
        }
        
        navigate('home');
    } catch (e) {
        alert('Invalid recovery words: ' + e.message);
    }
}

async function handleRestoreImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // Decode payload (F5 first, LSB fallback)
        const payload = await stego.decodeFile(file);
        identity.restoreFromPayload(payload);

        // Use the soul bird image as avatar
        const { imageData } = await stego.loadImage(file);
        const avatar = stego.toThumbnail(imageData);
        identity.setAvatar(avatar);

        navigate('home');
    } catch (err) {
        document.getElementById('restore-status').innerHTML =
            `<div class="status error">${err.message}</div>`;
    }
}

async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    
    try {
        const { imageData } = await stego.loadImage(file);
        const avatar = stego.toThumbnail(imageData);
        identity.setAvatar(avatar);
        sync.scheduleSync();
        render();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function loadImageToCanvas(e, canvasId, btnId) {
    const file = e.target.files[0];
    if (!file) return;
    
    const img = new Image();
    img.onload = () => {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        
        // Resize if needed
        let w = img.width, h = img.height;
        const maxW = 800, maxH = 600;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        if (h > maxH) { w = w * maxH / h; h = maxH; }
        
        canvas.width = Math.floor(w);
        canvas.height = Math.floor(h);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.classList.remove('hidden');
        document.getElementById(btnId).classList.remove('hidden');
    };
    img.src = URL.createObjectURL(file);
}

async function handleOpenImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    try {
        // decodeFile tries F5 (JPEG) first, then LSB (PNG) for backward compatibility
        const payload = await stego.decodeFile(file);
        const parsed = messages.parse(payload);

        if (parsed.type === 'duplicate') {
            alert('This image has already been processed.');
            return;
        }

        // Load imageData for avatar extraction
        const { imageData } = await stego.loadImage(file);
        state.receivedPayload = parsed;
        state.receivedImageData = imageData;

        switch (parsed.type) {
            case messages.TYPE.INVITE:
                navigate('received-invite');
                break;
            case messages.TYPE.CLAIM:
                navigate('received-claim');
                break;
            case messages.TYPE.MESSAGE:
                navigate('received-message');
                break;
            case 'soul':
                if (confirm('This image contains an identity. Restore it?')) {
                    identity.restoreFromPayload(parsed.payload);
                    // Use the soul bird image as avatar
                    const soulAvatar = stego.toThumbnail(imageData);
                    identity.setAvatar(soulAvatar);
                    navigate('home');
                }
                break;
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function selectContact(publicKey) {
    const contact = contacts.getByPublicKey(publicKey);
    if (contact) {
        state.currentContact = contact;
        navigate('send-message');
    }
}

async function generateInvite() {
    const name = document.getElementById('invite-name').value.trim();
    const message = document.getElementById('invite-message').value.trim();

    if (!name) { alert('Please enter a contact name'); return; }
    if (!message) { alert('Please enter a message'); return; }

    const canvas = document.getElementById('invite-canvas');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        const { payload, tempKey } = messages.createInvite(message);

        // Save pending invite
        contacts.addPending(name, tempKey);
        sync.scheduleSync();

        // F5 encoding (JPEG output - compression resistant)
        const result = await stego.encodeRobust(imageData, payload);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-invite.jpg';

        const output = document.getElementById('invite-output');
        output.src = result.dataURL;
        output.classList.remove('hidden');

        const download = document.getElementById('invite-download');
        download.href = result.dataURL;
        document.getElementById('invite-actions').classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function generateMessage() {
    const message = document.getElementById('send-message').value.trim();

    if (!message) { alert('Please enter a message'); return; }

    const canvas = document.getElementById('send-canvas');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        const payload = messages.createMessage(message, state.currentContact.publicKey);

        // F5 encoding (JPEG output - compression resistant)
        const result = await stego.encodeRobust(imageData, payload);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-message.jpg';

        const output = document.getElementById('send-output');
        output.src = result.dataURL;
        output.classList.remove('hidden');

        const download = document.getElementById('send-download');
        download.href = result.dataURL;
        document.getElementById('send-actions').classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function generateAccept() {
    const name = document.getElementById('accept-name').value.trim();
    const reply = document.getElementById('accept-reply').value.trim();

    if (!name) { alert('Please enter a name'); return; }
    if (!reply) { alert('Please enter a reply'); return; }

    const canvas = document.getElementById('accept-canvas');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        const payload = messages.createClaim(reply, state.receivedPayload.tempKey);

        // Extract avatar from the carrier image they sent us
        const avatar = state.receivedImageData
            ? stego.toThumbnail(state.receivedImageData)
            : null;

        // Save contact with their display name and avatar
        contacts.add(name, state.receivedPayload.fromPublicKey, state.receivedPayload.fromName, avatar);

        // Mark as processed
        messages.markProcessed(state.receivedPayload.hash);
        sync.scheduleSync();

        // F5 encoding (JPEG output - compression resistant)
        const result = await stego.encodeRobust(imageData, payload);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-accept.jpg';

        const output = document.getElementById('accept-output');
        output.src = result.dataURL;
        output.classList.remove('hidden');

        const download = document.getElementById('accept-download');
        download.href = result.dataURL;
        document.getElementById('accept-actions').classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function generateBackup() {
    const canvas = document.getElementById('backup-canvas');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
        // F5 encoding (JPEG output - compression resistant)
        const result = await identity.backupToImage(imageData);

        const output = document.getElementById('backup-output');
        output.src = result.dataURL;
        output.classList.remove('hidden');

        const download = document.getElementById('backup-download');
        download.href = result.dataURL;
        download.classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function confirmClaim() {
    const p = state.receivedPayload;
    
    // Extract avatar from the carrier image they sent
    const avatar = state.receivedImageData 
        ? stego.toThumbnail(state.receivedImageData) 
        : null;
    
    contacts.confirmPending(p.pendingInvite.id, p.fromPublicKey, p.fromName, avatar);
    messages.markProcessed(p.hash);
    sync.scheduleSync();
    navigate('home');
}

function rejectClaim() {
    navigate('home');
}

function replyTo(publicKey) {
    selectContact(publicKey);
}

async function shareImage(filename, asFile = false) {
    if (!state.generatedJpegData) {
        alert('No image to share');
        return;
    }

    // Create Blob and File fresh within user gesture context
    // This avoids permission issues on some Android browsers
    const mimeType = asFile ? 'application/octet-stream' : 'image/jpeg';
    const blob = new Blob([state.generatedJpegData], { type: mimeType });
    const file = new File([blob], filename || state.generatedFilename, {
        type: mimeType
    });

    // Check if Web Share API with files is supported
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Pigeon'
            });
        } catch (err) {
            // User cancelled or share failed
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
                alert('Share failed: ' + err.message);
            }
        }
    } else {
        // Fallback: try to share URL or alert
        alert('Sharing files is not supported on this device. Please use Save instead.');
    }
}

function saveName() {
    const name = document.getElementById('settings-name').value.trim();
    identity.setName(name);
    sync.scheduleSync();
    alert('Name saved');
    render();
}

function saveServer() {
    const server = document.getElementById('settings-server').value.trim();
    sync.setServer(server);
    localStorage.setItem('pigeon_server', server);
    alert('Server saved');
    render();
}

async function syncNow() {
    if (!sync.isConfigured()) {
        alert('No server configured');
        return;
    }

    try {
        // If no contacts locally, try to restore from server first
        if (contacts.getAll().length === 0 && contacts.getPending().length === 0) {
            const restored = await sync.restore();
            if (restored) {
                alert('Contacts restored from server');
                render();
                return;
            }
        }

        // Otherwise push local data
        await sync.push();
        alert('Sync completed');
    } catch (e) {
        alert('Sync failed: ' + e.message);
    }
}

// Start
init();
