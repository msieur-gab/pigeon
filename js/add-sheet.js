// "Add a contact" bottom sheet, opened by the + button on home.
//
// Two ways: meet in person (QR codes) or send an invite (image). Meeting
// shows either your code or the camera, one at a time, inside the sheet.
// The sheet lives outside #app, so screen renders don't touch it.

import * as stamp from './utils/stamp.js';
import * as qr from './utils/qr.js';
import * as crypto from './utils/crypto.js';
import * as identity from './services/identity.js';
import * as contacts from './services/contacts.js';

const view = { step: 'choose', tab: 'mine', met: null, note: '' };
let stopCam = null;
let hooks = { onAdded() {}, onInvite() {} };
let sheet, backdrop, body;

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** The two choices; also used by the empty contact list on home */
export function choicesHtml() {
    return `
        <button class="btn choice" data-go="meet">
            <span class="glyph">▦</span>
            <span><strong>Meet in person</strong><small>You're together. Scan each other's codes.</small></span>
        </button>
        <button class="btn choice" data-go="invite">
            <span class="glyph">✉</span>
            <span><strong>Send an invite</strong><small>They're far away. Send them a bird image.</small></span>
        </button>`;
}

/** Wire the choice buttons found inside root */
export function bindChoices(root) {
    root.querySelectorAll('[data-go="meet"]').forEach(b => { b.onclick = () => open('meet'); });
    root.querySelectorAll('[data-go="invite"]').forEach(b => {
        b.onclick = () => { close(); hooks.onInvite(); };
    });
}

/**
 * @param {Object} opts
 * @param {Function} opts.onAdded - a contact was added (re-render home)
 * @param {Function} opts.onInvite - go to the invite screen
 */
export function init(opts) {
    hooks = { ...hooks, ...opts };
    sheet = document.getElementById('sheet');
    backdrop = document.getElementById('backdrop');
    body = document.getElementById('sheet-body');

    backdrop.onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
    bindDrag(document.getElementById('grip'));
}

export function isOpen() {
    return sheet?.classList.contains('open') || false;
}

/** step: 'choose' | 'meet' | 'confirm' (met = { publicKey, name }) */
export function open(step = 'choose', met = null) {
    Object.assign(view, { step, tab: 'mine', met, note: '' });
    render();
    sheet.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('sheet-open');
}

export function close() {
    camOff();
    if (!sheet) return;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('sheet-open');
    sheet.style.transform = '';
}

function camOff() {
    if (stopCam) {
        stopCam();
        stopCam = null;
    }
}

const HEAD = (title, back = true) => `
    <div class="sheet-head">
        ${back ? '<button class="icon-btn" data-back aria-label="Back">←</button>' : ''}
        <h2>${title}</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>`;

function render() {
    camOff();

    if (view.step === 'choose') {
        body.innerHTML = HEAD('add a contact', false) + choicesHtml();
        bindChoices(body);
    } else if (view.step === 'meet') {
        body.innerHTML = renderMeet();
        body.querySelectorAll('[data-tab]').forEach(b => {
            b.onclick = () => {
                view.tab = b.dataset.tab;
                view.note = '';
                render();
            };
        });
        if (view.tab === 'scan') camOn();
    } else if (view.step === 'confirm') {
        body.innerHTML = renderConfirm();
        const add = document.getElementById('meet-add');
        if (add) add.onclick = addContact;
    }

    body.querySelectorAll('[data-close]').forEach(b => { b.onclick = close; });
    body.querySelectorAll('[data-back]').forEach(b => {
        b.onclick = () => {
            Object.assign(view, view.step === 'confirm'
                ? { step: 'meet', tab: 'scan', met: null, note: '' }
                : { step: 'choose', note: '' });
            render();
        };
    });
}

function renderMeet() {
    const stage = view.tab === 'mine'
        ? `<div class="stage-box">${stamp.render(200, qr.qrDataUrl(qr.meetLink(identity.getPublicKey(), identity.getName())), { contain: true })}</div>
           <div class="fingerprint">${identity.getFingerprint()}</div>`
        : `<div class="stage-box"><div class="cam">
               <video id="cam-video" playsinline muted></video>
               <div class="cam-msg" id="cam-msg">starting the camera…</div>
           </div></div>
           <div class="hint" id="cam-hint">Point at the code on their phone.</div>`;

    return `
        ${HEAD('meet in person')}
        ${view.note}
        <div class="segmented" role="tablist">
            <button data-tab="mine" aria-pressed="${view.tab === 'mine'}">My code</button>
            <button data-tab="scan" aria-pressed="${view.tab === 'scan'}">Scan theirs</button>
        </div>
        <div class="stage">${stage}</div>`;
}

function renderConfirm() {
    const m = view.met;

    if (m.publicKey === identity.getPublicKey()) {
        return `${HEAD('meet in person')}
            <p class="mb-1">That's your own code. Scan the code on the other person's phone.</p>`;
    }

    const existing = contacts.getByPublicKey(m.publicKey);
    if (existing) {
        return `${HEAD('meet in person')}
            <p class="mb-1">${esc(existing.name)} is already in your contacts.</p>
            <div class="fingerprint mb-1">${existing.fingerprint}</div>`;
    }

    return `
        ${HEAD('meet in person')}
        <div class="arrival-stamp landing">${stamp.render(96, '', { rotation: stamp.tiltFor(m.publicKey) })}</div>
        <p class="mb-1">${esc(m.name) || 'unnamed'}</p>
        <div class="fingerprint">${crypto.fingerprint(m.publicKey)}</div>
        <p class="text-muted text-small mt-1 mb-1">Their screen should show the same three words.</p>
        <div class="field">
            <label>save contact as</label>
            <input type="text" id="meet-name" value="${esc(m.name)}" placeholder="Bob">
        </div>
        <button class="btn btn-block mb-1" id="meet-add">Add contact</button>`;
}

async function camOn() {
    const video = document.getElementById('cam-video');
    const msg = document.getElementById('cam-msg');
    const hint = document.getElementById('cam-hint');
    try {
        const stop = await qr.startScanner(video, (text) => {
            const met = qr.parseMeetLink(text);
            if (!met) {
                hint.textContent = "That's not a Pigeon code.";
                return false;
            }
            if (met.publicKey === identity.getPublicKey()) {
                hint.textContent = "That's your own code.";
                return false;
            }
            stopCam = null; // the scanner stops itself
            if (navigator.vibrate) navigator.vibrate(30);
            Object.assign(view, { step: 'confirm', met });
            render();
            return true;
        });
        // The tab or the sheet changed while the camera was starting
        if (!video.isConnected || !isOpen()) {
            stop();
            return;
        }
        stopCam = stop;
        msg.remove();
    } catch (err) {
        msg.textContent = {
            NotAllowedError: 'Camera access was refused. Allow it in the browser settings.',
            NotFoundError: 'No camera on this device.',
            NotReadableError: 'The camera is busy in another app.',
            NotSupportedError: "This browser can't use the camera here."
        }[err.name] || "The camera didn't start.";
        hint.innerHTML = 'They can still scan your code. To reach them, <strong>send an invite</strong> instead.';
    }
}

function addContact() {
    const m = view.met;
    const name = document.getElementById('meet-name').value.trim() || m.name;
    if (!name) {
        alert('Please enter a name');
        return;
    }
    try {
        // No picture yet: the first bird they send becomes their stamp
        contacts.add(name, m.publicKey, m.name, null);
    } catch (err) {
        alert(err.message);
        return;
    }
    Object.assign(view, {
        step: 'meet',
        tab: 'mine',
        met: null,
        note: `<div class="status info"><strong>${esc(name)}</strong> is in your contacts. If they haven't scanned you yet, let them scan this now.</div>`
    });
    render();
    hooks.onAdded();
}

// Drag the grip down to close
function bindDrag(grip) {
    let y0 = null;
    let dy = 0;
    grip.addEventListener('pointerdown', e => {
        y0 = e.clientY;
        dy = 0;
        sheet.classList.add('dragging');
        grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', e => {
        if (y0 === null) return;
        dy = Math.max(0, e.clientY - y0);
        sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
        if (y0 === null) return;
        y0 = null;
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
        if (dy > 90) close();
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
}
