import * as identity from './services/identity.js';
import * as contacts from './services/contacts.js';
import * as messages from './services/messages.js';
import * as sync from './services/sync.js';
import * as stego from './utils/stego.js';
import * as crypto from './utils/crypto.js';
import { diagnose } from './utils/diagnose.js';
import * as flock from './services/flock.js';

// App state
const state = {
    screen: 'loading',
    currentContact: null,
    receivedPayload: null,
    receivedImageData: null,  // For extracting avatar thumbnail from carrier
    generatedJpegData: null,  // Raw JPEG bytes for sharing (Uint8Array)
    generatedFilename: null,  // Filename for sharing
    openStatus: null,         // HTML shown on home after an open attempt
    pendingFile: null,        // Image received before an identity existed
    currentBirdId: null       // Flock bird shown as the current carrier
};

// Screens where a dropped/pasted image becomes the carrier
const CARRIER_SCREENS = {
    'create-invite': { prefix: 'invite', canvas: 'invite-canvas', btn: 'generate-invite-btn' },
    'send-message': { prefix: 'send', canvas: 'send-canvas', btn: 'generate-send-btn' },
    'received-invite': { prefix: 'accept', canvas: 'accept-canvas', btn: 'generate-accept-btn' },
    'backup': { prefix: 'backup', canvas: 'backup-canvas', btn: 'generate-backup-btn' }
};

// Show "name (display name)" only when the two differ
function withDisplayName(name, displayName) {
    const same = !displayName || displayName.trim().toLowerCase() === (name || '').trim().toLowerCase();
    return same ? esc(name) : `${esc(name)} (${esc(displayName)})`;
}

// Last exchange per contact: direction + time only, never the content.
// Decrypted text is never stored; the images themselves are the archive.
function recordExchange(publicKey, dir) {
    try {
        contacts.update(publicKey, { lastExchange: { dir, at: Date.now() } });
        sync.scheduleSync();
    } catch {
        // Unknown contact: nothing to record
    }
}

function formatWhen(ts) {
    const d = new Date(ts);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= startOfToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (ts >= startOfToday - 86400000) return 'yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function renderLastExchange(c) {
    if (!c.lastExchange) return '';
    const { dir, at } = c.lastExchange;
    const label = dir === 'in' ? '↓ received' : '↑ sent';
    return `<span class="last-exchange">${label} ${esc(formatWhen(at))}</span>`;
}

// Escape text that came from other people (names, messages) before it
// goes into innerHTML
function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

    registerServiceWorker();
    receiveSharedImage();
    receiveLaunchedFile();
}

// Navigation
export function navigate(screen, data = {}) {
    state.screen = screen;
    state.openStatus = null;
    Object.assign(state, data);
    render();

    // An image arrived (share sheet / file open) before setup finished
    if (screen === 'home' && state.pendingFile) {
        const file = state.pendingFile;
        state.pendingFile = null;
        openImageFile(file);
    }
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
    if (CARRIER_SCREENS[state.screen]) autoPickCarrier();
    if (state.screen === 'settings') renderFlock();
}

// === Screen Renderers ===

function renderHeader(title = 'pigeon', showBack = false) {
    const theme = document.documentElement.getAttribute('data-theme');
    const icon = theme === 'dark' ? '○' : '●';
    
    return `
        <header>
            <h1>${showBack ? `<a href="#" class="back" onclick="window.app.navigate('home'); return false;">←</a> ` : ''}${esc(title)}</h1>
            <button class="theme-toggle" onclick="window.app.toggleTheme()">${icon}</button>
        </header>
    `;
}

function renderWelcome() {
    return `
        ${renderHeader('pigeon')}
        ${state.pendingFile ? `<div class="status info">An image is waiting. Create or restore your identity first, then it opens automatically.</div>` : ''}
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
            <p class="mb-1">${esc(name) || '(unnamed)'}</p>
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
            const showDisplay = c.displayName &&
                c.displayName.trim().toLowerCase() !== (c.name || '').trim().toLowerCase();
            const displayLine = showDisplay
                ? `<span class="display-name">${esc(c.displayName)}</span>`
                : '';
            contactsHtml += `
                <li class="contact-item" onclick="window.app.selectContact('${c.publicKey}')">
                    ${contactAvatar}
                    <div class="contact-info">
                        <span class="name">${esc(c.name)}</span>
                        ${displayLine}
                        ${renderLastExchange(c)}
                    </div>
                    <span class="fp">${c.fingerprint}</span>
                </li>
            `;
        }
        for (const p of pending) {
            contactsHtml += `
                <li class="contact-item pending">
                    <div class="avatar-small avatar-placeholder">?</div>
                    <span class="name">${esc(p.name)}</span>
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
                    <p class="text-muted text-small">${esc(name) || 'unnamed'}</p>
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
        ${state.openStatus || ''}
        <p class="text-muted text-small mb-1 drop-hint">Open a pigeon image: tap ↓ open, share it to Pigeon, or drop / paste it here.</p>
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
                <input type="text" id="settings-name" value="${esc(name)}" placeholder="black_dove">
            </div>
            <button class="btn btn-block" onclick="window.app.saveName()">Save name</button>
        </div>
        <div class="card">
            <h2>your birds</h2>
            <p class="text-small text-muted mb-1">Photos Pigeon uses to carry your messages. It picks the one used least recently, with a small random crop each time. Your own photos, not ones posted online, are best.</p>
            <div class="flock-grid" id="flock-grid"></div>
            <button class="btn btn-block" onclick="document.getElementById('flock-input').click()">+ add birds</button>
            <input type="file" id="flock-input" accept="image/*" multiple>
        </div>
        <div class="card">
            <h2>sync server</h2>
            <p class="text-small text-muted mb-1">Status: ${syncStatus}</p>
            <div class="field">
                <label>server URL</label>
                <input type="text" id="settings-server" value="${esc(server)}" placeholder="https://example.com">
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
            ${renderCarrierChooser('invite')}
            <input type="file" id="invite-image-input" accept="image/*">
            <canvas id="invite-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-invite-btn" onclick="window.app.generateInvite()">Generate invite image</button>
            <img id="invite-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="invite-actions">
                <a id="invite-download" class="btn" download="pigeon-invite.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-invite.jpg')">Share</button>
            </div>
            ${renderSendTip()}
        </div>
    `;
}

function renderSendMessage() {
    const contact = state.currentContact;
    if (!contact) return renderHome();

    const displayInfo = withDisplayName(contact.name, contact.displayName);

    return `
        ${renderHeader('send to ' + contact.name, true)}
        <div class="card">
            <p class="text-muted text-small">${displayInfo}</p>
            <div class="fingerprint mb-1">${contact.fingerprint}</div>
            <div class="field">
                <label>message</label>
                <textarea id="send-message" placeholder="Your message..."></textarea>
            </div>
            ${renderCarrierChooser('send')}
            <input type="file" id="send-image-input" accept="image/*">
            <canvas id="send-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-send-btn" onclick="window.app.generateMessage()">Generate message image</button>
            <img id="send-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="send-actions">
                <a id="send-download" class="btn" download="pigeon-message.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-message.jpg')">Share</button>
            </div>
            ${renderSendTip()}
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
                    <p class="mb-1">${esc(p.fromName) || 'unnamed'}</p>
                    <div class="fingerprint">${p.fromFingerprint}</div>
                </div>
            </div>
            <div class="message-preview message-text">"${esc(p.message)}"</div>
            <div class="field">
                <label>save contact as</label>
                <input type="text" id="accept-name" value="${esc(p.fromName)}" placeholder="Bob">
            </div>
            <div class="field">
                <label>reply message</label>
                <textarea id="accept-reply" placeholder="Got your invite!"></textarea>
            </div>
            ${renderCarrierChooser('accept')}
            <input type="file" id="accept-image-input" accept="image/*">
            <canvas id="accept-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-accept-btn" onclick="window.app.generateAccept()">Accept & generate reply</button>
            <img id="accept-output" class="hidden output-image" alt="Encoded image">
            <div class="actions hidden" id="accept-actions">
                <a id="accept-download" class="btn" download="pigeon-accept.jpg">Save</a>
                <button class="btn" onclick="window.app.shareImage('pigeon-accept.jpg')">Share</button>
            </div>
            ${renderSendTip()}
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
                    <p>${esc(p.pendingInvite.name)} has responded!</p>
                    <p class="text-muted text-small">${esc(p.fromName) || '(unnamed)'}</p>
                    <div class="fingerprint">${p.fromFingerprint}</div>
                </div>
            </div>
            <div class="message-preview message-text">"${esc(p.message)}"</div>
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
    
    const fromInfo = withDisplayName(p.from.name, p.from.displayName);
    
    return `
        ${renderHeader('message from ' + p.from.name, true)}
        <div class="card">
            <p class="text-muted text-small">${fromInfo}</p>
            <div class="fingerprint mb-1">${p.from.fingerprint}</div>
            <div class="message-preview message-text">"${esc(p.message)}"</div>
            <button class="btn btn-block mt-1" onclick="window.app.replyTo('${p.from.publicKey}')">Reply</button>
        </div>
    `;
}

// Carrier controls: Pigeon picks a bird from the flock; the user can ask
// for another one or choose any photo instead.
function renderCarrierChooser(prefix) {
    return `
        <div class="actions mb-1" id="${prefix}-chooser">
            <button class="btn hidden" id="${prefix}-another-bird" onclick="window.app.anotherBird()">↻ another bird</button>
            <button class="btn" id="${prefix}-choose-btn" onclick="document.getElementById('${prefix}-image-input').click()">Choose carrier image</button>
        </div>
        <p class="text-muted text-small mb-1 hidden" id="${prefix}-flock-hint">Tip: add your own bird photos in ⚙ settings and Pigeon will pick one for you.</p>
    `;
}

async function autoPickCarrier(excludeId) {
    const carrier = CARRIER_SCREENS[state.screen];
    if (!carrier) return;
    const screen = state.screen;
    const bird = await flock.pick(excludeId);
    if (state.screen !== screen) return; // user navigated away meanwhile

    const another = document.getElementById(`${carrier.prefix}-another-bird`);
    const choose = document.getElementById(`${carrier.prefix}-choose-btn`);
    const hint = document.getElementById(`${carrier.prefix}-flock-hint`);
    if (!choose) return;

    if (!bird) {
        state.currentBirdId = null;
        hint?.classList.remove('hidden');
        return;
    }
    state.currentBirdId = bird.id;
    choose.textContent = 'Use another photo';
    const all = await flock.getAll().catch(() => []);
    another.classList.toggle('hidden', all.length < 2);
    await loadFileToCanvas(bird.blob, carrier.canvas, carrier.btn);
}

// Once the image is made, it replaces the preview: hide the carrier
// controls and the source photo, freeze the text that went into it, and
// show the result with Save / Share. To change anything, start a new one.
function showResult(prefix, dataURL) {
    for (const id of [`${prefix}-chooser`, `${prefix}-flock-hint`, `${prefix}-canvas`, `generate-${prefix}-btn`]) {
        document.getElementById(id)?.classList.add('hidden');
    }
    document.querySelectorAll('#app .card input:not([type="file"]), #app .card textarea')
        .forEach(el => { el.disabled = true; });

    const output = document.getElementById(`${prefix}-output`);
    output.src = dataURL;
    output.classList.remove('hidden');
}

function anotherBird() {
    autoPickCarrier(state.currentBirdId);
}

// Hidden messages only survive if the image travels untouched.
// Hidden until the actions row above it is shown (sibling rule in CSS).
function renderSendTip() {
    return `
        <div class="status info send-tip">
            <p class="mb-1"><strong>Send it as a file, not a photo.</strong> Apps compress photos, which erases the message.</p>
            <ul class="tip-list">
                <li>Telegram: 📎 → File</li>
                <li>WhatsApp: 📎 → Document</li>
                <li>Signal: 📎 → File</li>
                <li>Email: attach the image</li>
            </ul>
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
            ${renderCarrierChooser('backup')}
            <input type="file" id="backup-image-input" accept="image/*">
            <canvas id="backup-canvas" class="hidden"></canvas>
            <button class="btn btn-block hidden" id="generate-backup-btn" onclick="window.app.generateBackup()">Generate soul bird</button>
            <img id="backup-output" class="hidden output-image" alt="Soul bird">
            <a id="backup-download" class="btn btn-block hidden" download="soul-bird.jpg">Save soul bird</a>
            <div class="status info hidden" id="backup-tip">
                Keep it as an untouched file. Editing, cropping, screenshots or sending it as a photo erase the identity inside.
            </div>
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
        shareImage,
        anotherBird,
        removeBird
    };
    setupDropAndPaste();
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
        { input: 'avatar-input', handler: handleAvatarChange },
        { input: 'flock-input', handler: handleFlockAdd }
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

    let payload;
    try {
        payload = await stego.decodeFile(file);
    } catch {
        document.getElementById('restore-status').innerHTML = await explainNoMessage(file);
        return;
    }

    try {
        identity.restoreFromPayload(payload);

        // Use the soul bird image as avatar
        const { imageData } = await stego.loadImage(file);
        const avatar = stego.toThumbnail(imageData);
        identity.setAvatar(avatar);

        navigate('home');
    } catch (err) {
        document.getElementById('restore-status').innerHTML =
            `<div class="status error">${esc(err.message)}</div>`;
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
    e.target.value = '';
    state.currentBirdId = null; // a hand-picked photo, not from the flock
    loadFileToCanvas(file, canvasId, btnId);
}

// Draw the carrier, with a small random crop (up to ~6% per side) so two
// images made from the same photo never share the same pixels or JPEG
// block grid, then fit within 800x600.
function loadFileToCanvas(file, canvasId, btnId) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.getElementById(canvasId);
            if (!canvas) return resolve();
            const ctx = canvas.getContext('2d');

            const cut = (size) => Math.floor(Math.random() * size * 0.06);
            const sx = cut(img.width), sy = cut(img.height);
            const sw = img.width - sx - cut(img.width);
            const sh = img.height - sy - cut(img.height);

            const scale = Math.min(1, 800 / sw, 600 / sh);
            canvas.width = Math.max(1, Math.floor(sw * scale));
            canvas.height = Math.max(1, Math.floor(sh * scale));
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            canvas.classList.remove('hidden');
            document.getElementById(btnId)?.classList.remove('hidden');
            resolve();
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            alert('Could not read this image');
            resolve();
        };
        img.src = url;
    });
}

async function handleOpenImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    openImageFile(file);
}

// Single entry point for every way an image arrives:
// file picker, share sheet, "open with", drag & drop, paste
async function openImageFile(file) {
    if (!identity.exists()) {
        // Keep it until setup is done, then open it automatically
        state.pendingFile = file;
        if (state.screen !== 'welcome' && !state.screen.startsWith('setup') && !state.screen.startsWith('restore')) {
            navigate('welcome');
        }
        return;
    }

    let payload;
    try {
        payload = await stego.decodeFile(file);
    } catch {
        showOpenStatus(await explainNoMessage(file));
        return;
    }

    try {
        const parsed = messages.parse(payload);

        if (parsed.type === 'duplicate') {
            showOpenStatus(`<div class="status info">You've already opened this image.</div>`);
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
                recordExchange(parsed.from.publicKey, 'in');
                navigate('received-message');
                break;
            case 'soul':
                if (confirm('This image contains an identity. Restore it? It replaces your current identity.')) {
                    identity.restoreFromPayload(parsed.payload);
                    identity.setAvatar(stego.toThumbnail(imageData));
                    navigate('home');
                }
                break;
        }
    } catch (err) {
        // Found a Pigeon message, but it isn't for us (or the invite is unknown)
        showOpenStatus(`<div class="status error">${esc(err.message)}</div>`);
    }
}

function showOpenStatus(html) {
    if (state.screen !== 'home') {
        navigate('home', { openStatus: html });
    } else {
        state.openStatus = html;
        render();
    }
}

async function explainNoMessage(file) {
    const result = await diagnose(file);
    const resend = `Ask the sender to send it again <strong>as a file</strong> (Telegram: 📎 → File · WhatsApp: 📎 → Document).`;

    if (result.kind === 'not-jpeg') {
        return `<div class="status error">
            <p><strong>No message found.</strong> This image isn't a JPEG, so it was converted somewhere along the way (a screenshot, copy-paste or edit). ${resend}</p>
        </div>`;
    }
    if (result.kind === 'compressed') {
        const by = result.app ? esc(result.app) : 'a messaging app';
        const q = result.quality ? ` (quality ≈ ${result.quality})` : '';
        return `<div class="status error">
            <p><strong>No message found.</strong> This picture looks compressed by ${by}${q}, which erases hidden messages. ${resend}</p>
        </div>`;
    }
    return `<div class="status info">
        <p><strong>No Pigeon message in this image.</strong> If it came through a messaging app, it may have been compressed. ${resend}</p>
    </div>`;
}

// === Flock management (settings) ===

async function renderFlock() {
    const grid = document.getElementById('flock-grid');
    if (!grid) return;
    let birds;
    try {
        birds = await flock.getAll();
    } catch {
        grid.innerHTML = `<p class="text-small text-muted">This browser can't store photos, so choose a carrier each time.</p>`;
        return;
    }
    grid.innerHTML = birds.length
        ? birds.map(b => `
            <div class="flock-bird">
                <img src="${b.thumb}" alt="">
                <button class="flock-remove" aria-label="Remove" onclick="window.app.removeBird('${esc(b.id)}')">×</button>
            </div>`).join('')
        : `<p class="text-small text-muted">No birds yet.</p>`;
}

async function handleFlockAdd(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try {
        const added = await flock.add(files);
        if (added < files.length) alert(`${files.length - added} photo(s) couldn't be read and were skipped.`);
    } catch (err) {
        alert('Could not save photos: ' + err.message);
    }
    renderFlock();
}

async function removeBird(id) {
    await flock.remove(id).catch(() => {});
    renderFlock();
}

// === Ways in: share sheet, "open with", drag & drop, paste ===

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    }
}

// Android: image shared to the installed app lands in a cache via sw.js
async function receiveSharedImage() {
    const params = new URLSearchParams(location.search);
    if (!params.has('shared') || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname);

    try {
        const cache = await caches.open('pigeon-shared');
        const key = new URL('shared-image', location.href).href;
        const res = await cache.match(key);
        if (!res) return;
        await cache.delete(key);

        const blob = await res.blob();
        const name = decodeURIComponent(res.headers.get('X-Filename') || 'shared.jpg');
        openImageFile(new File([blob], name, { type: blob.type || 'image/jpeg' }));
    } catch (err) {
        console.error('Could not read shared image:', err);
    }
}

// Desktop Chrome: "Open with Pigeon" on a .jpg file
function receiveLaunchedFile() {
    if (!('launchQueue' in window)) return;
    window.launchQueue.setConsumer(async (params) => {
        if (!params.files?.length) return;
        const file = await params.files[0].getFile();
        openImageFile(file);
    });
}

function routeIncomingFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    // On a "choose carrier" screen, the image becomes the carrier
    const carrier = CARRIER_SCREENS[state.screen];
    if (carrier && document.getElementById(carrier.canvas)) {
        state.currentBirdId = null;
        loadFileToCanvas(file, carrier.canvas, carrier.btn);
        return;
    }
    openImageFile(file);
}

function setupDropAndPaste() {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

    document.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        document.body.classList.add('dragging');
    });
    document.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) document.body.classList.remove('dragging');
    });
    document.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        document.body.classList.remove('dragging');
        routeIncomingFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('paste', (e) => {
        // Don't hijack pasting text into inputs
        const file = Array.from(e.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        routeIncomingFile(file);
    });
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
        flock.markUsed(state.currentBirdId);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-invite.jpg';

        showResult('invite', result.dataURL);

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
        recordExchange(state.currentContact.publicKey, 'out');
        flock.markUsed(state.currentBirdId);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-message.jpg';

        showResult('send', result.dataURL);

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
        recordExchange(state.receivedPayload.fromPublicKey, 'out');
        flock.markUsed(state.currentBirdId);

        // Store raw bytes for sharing (created fresh in share handler)
        state.generatedJpegData = result.jpegData;
        state.generatedFilename = 'pigeon-accept.jpg';

        showResult('accept', result.dataURL);

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
        flock.markUsed(state.currentBirdId);

        showResult('backup', result.dataURL);

        const download = document.getElementById('backup-download');
        download.href = result.dataURL;
        download.classList.remove('hidden');
        document.getElementById('backup-tip').classList.remove('hidden');
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
    recordExchange(p.fromPublicKey, 'in');
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

async function shareImage(filename) {
    if (!state.generatedJpegData) {
        alert('No image to share');
        return;
    }

    // Create Blob and File fresh within user gesture context
    const blob = new Blob([state.generatedJpegData], { type: 'image/jpeg' });
    const file = new File([blob], filename || state.generatedFilename, {
        type: 'image/jpeg',
        lastModified: Date.now()
    });

    // Check if Web Share API with files is supported
    if (!navigator.canShare) {
        alert('Sharing not supported. Please save the image and share from your gallery.');
        return;
    }

    if (!navigator.canShare({ files: [file] })) {
        alert('File sharing not supported on this browser. Please save the image and share from your gallery.');
        return;
    }

    try {
        await navigator.share({
            files: [file]
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            // User cancelled - do nothing
            return;
        }
        console.error('Share failed:', err.name, err.message);
        // Provide helpful guidance
        alert('Share failed due to browser restrictions.\n\nWorkaround: Save the image first, then share it from your gallery or file manager.');
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
