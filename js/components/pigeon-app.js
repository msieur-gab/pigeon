import { LitElement, html, css } from 'https://esm.sh/lit@3';
import './pigeon-header.js';
import './pigeon-encoder.js';
import * as identity from '../services/identity.js';
import * as contacts from '../services/contacts.js';
import * as messages from '../services/messages.js';
import * as sync from '../services/sync.js';
import * as stego from '../utils/stego.js';

class PigeonApp extends LitElement {
  static properties = {
    screen: { type: String },
    currentContact: { type: Object },
    receivedPayload: { type: Object },
    receivedImageData: { type: Object }
  };

  static styles = css`
    :host {
      display: block;
    }

    /* Card */
    .card {
      border: 1px solid var(--border, #ccc);
      border-radius: var(--radius, 4px);
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .card h2 {
      font-size: 1rem;
      font-weight: normal;
      margin: 0 0 0.5rem 0;
    }

    /* Buttons */
    .btn {
      display: inline-block;
      padding: 0.5rem 1rem;
      font-family: inherit;
      font-size: 1rem;
      background: var(--bg, #fff);
      color: var(--fg, #000);
      border: 1px solid var(--fg, #000);
      border-radius: var(--radius, 4px);
      cursor: pointer;
      text-decoration: none;
      text-align: center;
    }

    .btn:hover {
      background: var(--fg, #000);
      color: var(--bg, #fff);
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn:disabled:hover {
      background: var(--bg, #fff);
      color: var(--fg, #000);
    }

    .btn-block { display: block; width: 100%; }

    .btn-ghost {
      border-color: transparent;
    }

    .btn-ghost:hover {
      background: transparent;
      color: var(--fg, #000);
      text-decoration: underline;
    }

    /* Forms */
    .field {
      margin-bottom: 1rem;
    }

    .field label {
      display: block;
      font-size: 0.875rem;
      color: var(--muted, #666);
      margin-bottom: 0.25rem;
    }

    input, textarea {
      width: 100%;
      padding: 0.5rem;
      font-family: inherit;
      font-size: 1rem;
      background: var(--bg, #fff);
      color: var(--fg, #000);
      border: 1px solid var(--border, #ccc);
      border-radius: var(--radius, 4px);
      box-sizing: border-box;
    }

    input:focus, textarea:focus {
      outline: none;
      border-color: var(--fg, #000);
    }

    textarea {
      min-height: 6rem;
      resize: vertical;
    }

    input[type="file"] { display: none; }
    input[type="checkbox"] { width: auto; }

    /* Fingerprint */
    .fingerprint {
      font-size: 1rem;
      padding: 0.5rem;
      background: var(--fg, #000);
      color: var(--bg, #fff);
      border-radius: var(--radius, 4px);
      text-align: center;
      letter-spacing: 0.1em;
    }

    /* Words grid */
    .words {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin: 1rem 0;
    }

    .word {
      padding: 0.5rem;
      background: var(--fg, #000);
      color: var(--bg, #fff);
      border-radius: var(--radius, 4px);
      text-align: center;
      font-size: 0.875rem;
    }

    .word .num {
      font-size: 0.625rem;
      opacity: 0.5;
    }

    /* Avatars */
    .avatar, .avatar-small, .avatar-large {
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .avatar { width: 48px; height: 48px; }
    .avatar-small { width: 32px; height: 32px; }
    .avatar-large { width: 64px; height: 64px; }

    .avatar-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--border, #ccc);
      color: var(--muted, #666);
      font-size: 0.875rem;
    }

    /* Layouts */
    .identity-row, .sender-info, .avatar-setting {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .identity-info { flex: 1; }
    .sender-info { margin-bottom: 1rem; }
    .avatar-setting { margin-bottom: 1rem; }

    /* Contact list */
    .contact-list { list-style: none; padding: 0; margin: 0; }

    .contact-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--border, #ccc);
      border-radius: var(--radius, 4px);
      margin-bottom: 0.5rem;
      cursor: pointer;
    }

    .contact-item:hover {
      border-color: var(--fg, #000);
    }

    .contact-info { flex: 1; min-width: 0; }
    .contact-item .name { font-weight: normal; }
    .contact-item .display-name { font-size: 0.75rem; color: var(--muted, #666); }
    .contact-item .fp { font-size: 0.75rem; color: var(--muted, #666); flex-shrink: 0; }
    .contact-item.pending { opacity: 0.5; cursor: default; }

    /* Message */
    .message-preview {
      font-family: Georgia, 'Times New Roman', serif;
      padding: 1rem;
      border-left: 2px solid var(--border, #ccc);
      margin: 1rem 0;
      font-style: italic;
    }

    /* Status */
    .status {
      padding: 0.5rem;
      border-radius: var(--radius, 4px);
      margin: 1rem 0;
      font-size: 0.875rem;
    }

    .status.info { border: 1px solid var(--border, #ccc); }
    .status.error { border: 1px solid var(--fg, #000); }

    /* Actions */
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .actions > * { flex: 1; }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 2rem;
      color: var(--muted, #666);
    }

    /* Utilities */
    .mb-1 { margin-bottom: 1rem; }
    .mt-1 { margin-top: 1rem; }
    .text-muted { color: var(--muted, #666); }
    .text-small { font-size: 0.875rem; }
  `;

  constructor() {
    super();
    this.screen = 'loading';
    this.currentContact = null;
    this.receivedPayload = null;
    this.receivedImageData = null;
    this._generatedJpegData = null;
    this._generatedFilename = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  _init() {
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
      this.screen = 'home';
    } else {
      this.screen = 'welcome';
    }

    // Listen for events from child components
    this.addEventListener('navigate', (e) => this._navigate(e.detail.screen, e.detail));
    this.addEventListener('theme-toggle', () => this._toggleTheme());
  }

  _navigate(screen, data = {}) {
    this.screen = screen;
    if (data.contact) this.currentContact = data.contact;
    if (data.payload) this.receivedPayload = data.payload;
    if (data.imageData) this.receivedImageData = data.imageData;
  }

  _toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pigeon_theme', next);
    this.requestUpdate();
  }

  // === Actions ===

  _createIdentity() {
    const input = this.renderRoot.querySelector('#setup-name');
    const name = input?.value.trim() || '';
    identity.create(name);
    sync.scheduleSync();
    this.screen = 'setup-words';
  }

  _restoreFromWords() {
    const textarea = this.renderRoot.querySelector('#restore-words');
    const words = textarea.value.trim().split(/\s+/);

    try {
      identity.restoreFromWords(words);

      if (sync.isConfigured()) {
        sync.restore().then(restored => {
          if (restored) {
            alert('Contacts restored from server');
            this.requestUpdate();
          }
        }).catch(e => console.error('Restore failed:', e));
      }

      this.screen = 'home';
    } catch (e) {
      alert('Invalid recovery words: ' + e.message);
    }
  }

  async _handleRestoreImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const payload = await stego.decodeFile(file);
      identity.restoreFromPayload(payload);

      const { imageData } = await stego.loadImage(file);
      const avatar = stego.toThumbnail(imageData);
      identity.setAvatar(avatar);

      this.screen = 'home';
    } catch (err) {
      const status = this.renderRoot.querySelector('#restore-status');
      if (status) status.innerHTML = `<div class="status error">${err.message}</div>`;
    }
  }

  async _handleOpenImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    try {
      const payload = await stego.decodeFile(file);
      const parsed = messages.parse(payload);

      if (parsed.type === 'duplicate') {
        alert('This image has already been processed.');
        return;
      }

      const { imageData } = await stego.loadImage(file);
      this.receivedPayload = parsed;
      this.receivedImageData = imageData;

      switch (parsed.type) {
        case messages.TYPE.INVITE:
          this.screen = 'received-invite';
          break;
        case messages.TYPE.CLAIM:
          this.screen = 'received-claim';
          break;
        case messages.TYPE.MESSAGE:
          this.screen = 'received-message';
          break;
        case 'soul':
          if (confirm('This image contains an identity. Restore it?')) {
            identity.restoreFromPayload(parsed.payload);
            const soulAvatar = stego.toThumbnail(imageData);
            identity.setAvatar(soulAvatar);
            this.screen = 'home';
          }
          break;
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  _selectContact(publicKey) {
    const contact = contacts.getByPublicKey(publicKey);
    if (contact) {
      this.currentContact = contact;
      this.screen = 'send-message';
    }
  }

  async _handleGenerateInvite(e) {
    const nameInput = this.renderRoot.querySelector('#invite-name');
    const msgInput = this.renderRoot.querySelector('#invite-message');
    const name = nameInput?.value.trim();
    const message = msgInput?.value.trim();

    if (!name) { alert('Please enter a contact name'); return; }
    if (!message) { alert('Please enter a message'); return; }

    const encoder = this.renderRoot.querySelector('#invite-encoder');
    const imageData = e.detail.imageData;

    try {
      const { payload, tempKey } = messages.createInvite(message);
      contacts.addPending(name, tempKey);
      sync.scheduleSync();

      const result = await stego.encodeRobust(imageData, payload);
      encoder.setResult(result.dataURL, result.jpegData);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async _handleGenerateMessage(e) {
    const msgInput = this.renderRoot.querySelector('#send-message-text');
    const message = msgInput?.value.trim();

    if (!message) { alert('Please enter a message'); return; }

    const encoder = this.renderRoot.querySelector('#send-encoder');
    const imageData = e.detail.imageData;

    try {
      const payload = messages.createMessage(message, this.currentContact.publicKey);
      const result = await stego.encodeRobust(imageData, payload);
      encoder.setResult(result.dataURL, result.jpegData);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async _handleGenerateAccept(e) {
    const nameInput = this.renderRoot.querySelector('#accept-name');
    const replyInput = this.renderRoot.querySelector('#accept-reply');
    const name = nameInput?.value.trim();
    const reply = replyInput?.value.trim();

    if (!name) { alert('Please enter a name'); return; }
    if (!reply) { alert('Please enter a reply'); return; }

    const encoder = this.renderRoot.querySelector('#accept-encoder');
    const imageData = e.detail.imageData;

    try {
      const payload = messages.createClaim(reply, this.receivedPayload.tempKey);

      const avatar = this.receivedImageData
        ? stego.toThumbnail(this.receivedImageData)
        : null;

      contacts.add(name, this.receivedPayload.fromPublicKey, this.receivedPayload.fromName, avatar);
      messages.markProcessed(this.receivedPayload.hash);
      sync.scheduleSync();

      const result = await stego.encodeRobust(imageData, payload);
      encoder.setResult(result.dataURL, result.jpegData);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async _handleGenerateBackup(e) {
    const encoder = this.renderRoot.querySelector('#backup-encoder');
    const imageData = e.detail.imageData;

    try {
      const result = await identity.backupToImage(imageData);
      encoder.setResult(result.dataURL, result.jpegData);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  _confirmClaim() {
    const p = this.receivedPayload;
    const avatar = this.receivedImageData
      ? stego.toThumbnail(this.receivedImageData)
      : null;

    contacts.confirmPending(p.pendingInvite.id, p.fromPublicKey, p.fromName, avatar);
    messages.markProcessed(p.hash);
    sync.scheduleSync();
    this.screen = 'home';
  }

  _rejectClaim() {
    this.screen = 'home';
  }

  _saveName() {
    const input = this.renderRoot.querySelector('#settings-name');
    const name = input?.value.trim() || '';
    identity.setName(name);
    sync.scheduleSync();
    alert('Name saved');
    this.requestUpdate();
  }

  _saveServer() {
    const input = this.renderRoot.querySelector('#settings-server');
    const server = input?.value.trim() || '';
    sync.setServer(server);
    localStorage.setItem('pigeon_server', server);
    alert('Server saved');
    this.requestUpdate();
  }

  async _syncNow() {
    if (!sync.isConfigured()) {
      alert('No server configured');
      return;
    }

    try {
      if (contacts.getAll().length === 0 && contacts.getPending().length === 0) {
        const restored = await sync.restore();
        if (restored) {
          alert('Contacts restored from server');
          this.requestUpdate();
          return;
        }
      }

      await sync.push();
      alert('Sync completed');
    } catch (e) {
      alert('Sync failed: ' + e.message);
    }
  }

  async _handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    try {
      const { imageData } = await stego.loadImage(file);
      const avatar = stego.toThumbnail(imageData);
      identity.setAvatar(avatar);
      sync.scheduleSync();
      this.requestUpdate();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  _onWordsSavedChange(e) {
    const btn = this.renderRoot.querySelector('#continue-btn');
    if (btn) btn.disabled = !e.target.checked;
  }

  // === Screen Renderers ===

  _renderWelcome() {
    return html`
      <pigeon-header title="pigeon"></pigeon-header>
      <div class="card">
        <p class="mb-1">Encrypted messages hidden in bird photos.</p>
        <button class="btn btn-block mb-1" @click=${() => this.screen = 'setup'}>Create identity</button>
        <button class="btn btn-block btn-ghost" @click=${() => this.screen = 'restore-words'}>Restore from words</button>
        <button class="btn btn-block btn-ghost" @click=${() => this.screen = 'restore-image'}>Restore from image</button>
      </div>
    `;
  }

  _renderSetup() {
    return html`
      <pigeon-header title="create identity" back></pigeon-header>
      <div class="card">
        <p class="mb-1">Choose a display name others will see:</p>
        <div class="field">
          <label>your name</label>
          <input type="text" id="setup-name" placeholder="black_dove">
        </div>
        <button class="btn btn-block" @click=${this._createIdentity}>Continue</button>
      </div>
    `;
  }

  _renderSetupWords() {
    const words = identity.getRecoveryWords();
    const fp = identity.getFingerprint();
    const name = identity.getName();

    return html`
      <pigeon-header title="your identity"></pigeon-header>
      <div class="card">
        <p class="text-muted text-small mb-1">your name</p>
        <p class="mb-1">${name || '(unnamed)'}</p>
        <p class="text-muted text-small mb-1">your fingerprint</p>
        <div class="fingerprint">${fp}</div>
      </div>
      <div class="card">
        <p class="mb-1">Write down these 16 words. They can restore your identity.</p>
        <div class="words">
          ${words.map((w, i) => html`<div class="word"><span class="num">${i + 1}</span> ${w}</div>`)}
        </div>
        <label class="mt-1">
          <input type="checkbox" @change=${this._onWordsSavedChange}> I have saved these words
        </label>
      </div>
      <button class="btn btn-block" id="continue-btn" disabled @click=${() => this.screen = 'home'}>Continue</button>
    `;
  }

  _renderRestoreWords() {
    return html`
      <pigeon-header title="restore" back></pigeon-header>
      <div class="card">
        <p class="mb-1">Enter your 16 recovery words, separated by spaces:</p>
        <div class="field">
          <textarea id="restore-words" placeholder="dawn river oak nest..."></textarea>
        </div>
        <button class="btn btn-block" @click=${this._restoreFromWords}>Restore identity</button>
      </div>
    `;
  }

  _renderRestoreImage() {
    return html`
      <pigeon-header title="restore" back></pigeon-header>
      <div class="card">
        <p class="mb-1">Select your soul bird image:</p>
        <button class="btn btn-block" @click=${() => this.renderRoot.querySelector('#restore-image-input').click()}>Choose image</button>
        <input type="file" id="restore-image-input" accept="image/*" @change=${this._handleRestoreImage}>
        <div id="restore-status"></div>
      </div>
    `;
  }

  _renderHome() {
    const fp = identity.getFingerprint();
    const name = identity.getName();
    const avatar = identity.getAvatar();
    const allContacts = contacts.getAll();
    const pending = contacts.getPending();

    return html`
      <pigeon-header title="pigeon"></pigeon-header>
      <div class="card">
        <div class="identity-row">
          ${avatar
            ? html`<img src="${avatar}" class="avatar" alt="">`
            : html`<div class="avatar avatar-placeholder">?</div>`}
          <div class="identity-info">
            <p class="text-muted text-small">${name || 'unnamed'}</p>
            <div class="fingerprint">${fp}</div>
          </div>
          <button class="btn btn-ghost" @click=${() => this.screen = 'settings'}>&#x2699;</button>
        </div>
      </div>
      <div class="actions mb-1">
        <button class="btn" @click=${() => this.screen = 'create-invite'}>+ invite</button>
        <button class="btn" @click=${() => this.renderRoot.querySelector('#open-image-input').click()}>&darr; open</button>
        <input type="file" id="open-image-input" accept="image/*" @change=${this._handleOpenImage}>
      </div>
      <div class="card">
        <h2>contacts</h2>
        ${allContacts.length === 0 && pending.length === 0
          ? html`<div class="empty">No contacts yet</div>`
          : html`
            <ul class="contact-list">
              ${allContacts.map(c => html`
                <li class="contact-item" @click=${() => this._selectContact(c.publicKey)}>
                  ${c.avatar
                    ? html`<img src="${c.avatar}" class="avatar-small" alt="">`
                    : html`<div class="avatar-small avatar-placeholder">?</div>`}
                  <div class="contact-info">
                    <span class="name">${c.name}</span>
                    ${c.displayName ? html`<span class="display-name">${c.displayName}</span>` : null}
                  </div>
                  <span class="fp">${c.fingerprint}</span>
                </li>
              `)}
              ${pending.map(p => html`
                <li class="contact-item pending">
                  <div class="avatar-small avatar-placeholder">?</div>
                  <span class="name">${p.name}</span>
                  <span class="fp">awaiting</span>
                </li>
              `)}
            </ul>
          `}
      </div>
    `;
  }

  _renderSettings() {
    const name = identity.getName();
    const avatar = identity.getAvatar();
    const server = sync.getServer();
    const syncStatus = sync.isConfigured() ? 'configured' : 'not configured';

    return html`
      <pigeon-header title="settings" back></pigeon-header>
      <div class="card">
        <h2>profile</h2>
        <div class="avatar-setting">
          ${avatar
            ? html`<img src="${avatar}" class="avatar-large" alt="">`
            : html`<div class="avatar-large avatar-placeholder">?</div>`}
          <button class="btn btn-ghost text-small" @click=${() => this.renderRoot.querySelector('#avatar-input').click()}>Change</button>
          <input type="file" id="avatar-input" accept="image/*" @change=${this._handleAvatarChange}>
        </div>
        <div class="field">
          <label>your display name</label>
          <input type="text" id="settings-name" .value=${name} placeholder="black_dove">
        </div>
        <button class="btn btn-block" @click=${this._saveName}>Save name</button>
      </div>
      <div class="card">
        <h2>sync server</h2>
        <p class="text-small text-muted mb-1">Status: ${syncStatus}</p>
        <div class="field">
          <label>server URL</label>
          <input type="text" id="settings-server" .value=${server} placeholder="https://example.com">
        </div>
        <div class="actions">
          <button class="btn" @click=${this._saveServer}>Save</button>
          <button class="btn btn-ghost" @click=${this._syncNow}>Sync now</button>
        </div>
      </div>
      <div class="card">
        <h2>backup</h2>
        <button class="btn btn-block mb-1" @click=${() => this.screen = 'backup'}>View recovery words</button>
      </div>
    `;
  }

  _renderCreateInvite() {
    return html`
      <pigeon-header title="new invite" back></pigeon-header>
      <div class="card">
        <pigeon-encoder
          id="invite-encoder"
          button-label="Choose carrier image"
          generate-label="Generate invite image"
          filename="pigeon-invite.jpg"
          @generate=${this._handleGenerateInvite}>
          <div class="field">
            <label>contact name (for you)</label>
            <input type="text" id="invite-name" placeholder="Alice">
          </div>
          <div class="field">
            <label>first message</label>
            <textarea id="invite-message" placeholder="Hey! Use this to contact me securely..."></textarea>
          </div>
        </pigeon-encoder>
      </div>
    `;
  }

  _renderSendMessage() {
    if (!this.currentContact) return this._renderHome();

    const contact = this.currentContact;
    const displayInfo = contact.displayName
      ? `${contact.name} (${contact.displayName})`
      : contact.name;

    return html`
      <pigeon-header title="send to ${contact.name}" back></pigeon-header>
      <div class="card">
        <p class="text-muted text-small">${displayInfo}</p>
        <div class="fingerprint mb-1">${contact.fingerprint}</div>
        <pigeon-encoder
          id="send-encoder"
          button-label="Choose carrier image"
          generate-label="Generate message image"
          filename="pigeon-message.jpg"
          @generate=${this._handleGenerateMessage}>
          <div class="field">
            <label>message</label>
            <textarea id="send-message-text" placeholder="Your message..."></textarea>
          </div>
        </pigeon-encoder>
      </div>
    `;
  }

  _renderReceivedInvite() {
    if (!this.receivedPayload) return this._renderHome();

    const p = this.receivedPayload;
    const carrierThumb = this.receivedImageData
      ? stego.toThumbnail(this.receivedImageData)
      : null;

    return html`
      <pigeon-header title="invite received" back></pigeon-header>
      <div class="card">
        <div class="sender-info">
          ${carrierThumb
            ? html`<img src="${carrierThumb}" class="avatar-large" alt="">`
            : html`<div class="avatar-large avatar-placeholder">?</div>`}
          <div>
            <p class="mb-1">${p.fromName || 'unnamed'}</p>
            <div class="fingerprint">${p.fromFingerprint}</div>
          </div>
        </div>
        <div class="message-preview">"${p.message}"</div>
        <pigeon-encoder
          id="accept-encoder"
          button-label="Choose carrier image"
          generate-label="Accept & generate reply"
          filename="pigeon-accept.jpg"
          @generate=${this._handleGenerateAccept}>
          <div class="field">
            <label>save contact as</label>
            <input type="text" id="accept-name" .value=${p.fromName || ''} placeholder="Bob">
          </div>
          <div class="field">
            <label>reply message</label>
            <textarea id="accept-reply" placeholder="Got your invite!"></textarea>
          </div>
        </pigeon-encoder>
      </div>
    `;
  }

  _renderReceivedClaim() {
    if (!this.receivedPayload) return this._renderHome();

    const p = this.receivedPayload;
    const carrierThumb = this.receivedImageData
      ? stego.toThumbnail(this.receivedImageData)
      : null;

    return html`
      <pigeon-header title="invite accepted" back></pigeon-header>
      <div class="card">
        <div class="sender-info">
          ${carrierThumb
            ? html`<img src="${carrierThumb}" class="avatar-large" alt="">`
            : html`<div class="avatar-large avatar-placeholder">?</div>`}
          <div>
            <p>${p.pendingInvite.name} has responded!</p>
            <p class="text-muted text-small">${p.fromName || '(unnamed)'}</p>
            <div class="fingerprint">${p.fromFingerprint}</div>
          </div>
        </div>
        <div class="message-preview">"${p.message}"</div>
        <div class="status info">Verify this fingerprint matches what they see on their device.</div>
        <div class="actions">
          <button class="btn" @click=${this._confirmClaim}>Confirm</button>
          <button class="btn btn-ghost" @click=${this._rejectClaim}>Reject</button>
        </div>
      </div>
    `;
  }

  _renderReceivedMessage() {
    if (!this.receivedPayload) return this._renderHome();

    const p = this.receivedPayload;
    const fromInfo = p.from.displayName
      ? `${p.from.name} (${p.from.displayName})`
      : p.from.name;

    return html`
      <pigeon-header title="message from ${p.from.name}" back></pigeon-header>
      <div class="card">
        <p class="text-muted text-small">${fromInfo}</p>
        <div class="fingerprint mb-1">${p.from.fingerprint}</div>
        <div class="message-preview">"${p.message}"</div>
        <button class="btn btn-block mt-1" @click=${() => this._selectContact(p.from.publicKey)}>Reply</button>
      </div>
    `;
  }

  _renderBackup() {
    const words = identity.getRecoveryWords();

    return html`
      <pigeon-header title="backup" back></pigeon-header>
      <div class="card">
        <h2>recovery words</h2>
        <div class="words">
          ${words.map((w, i) => html`<div class="word"><span class="num">${i + 1}</span> ${w}</div>`)}
        </div>
      </div>
      <div class="card">
        <h2>soul bird</h2>
        <p class="mb-1">Create an image that contains your identity.</p>
        <pigeon-encoder
          id="backup-encoder"
          button-label="Choose image"
          generate-label="Generate soul bird"
          filename="soul-bird.jpg"
          @generate=${this._handleGenerateBackup}>
        </pigeon-encoder>
      </div>
    `;
  }

  render() {
    switch (this.screen) {
      case 'welcome': return this._renderWelcome();
      case 'setup': return this._renderSetup();
      case 'setup-words': return this._renderSetupWords();
      case 'restore-words': return this._renderRestoreWords();
      case 'restore-image': return this._renderRestoreImage();
      case 'home': return this._renderHome();
      case 'settings': return this._renderSettings();
      case 'create-invite': return this._renderCreateInvite();
      case 'send-message': return this._renderSendMessage();
      case 'received-invite': return this._renderReceivedInvite();
      case 'received-claim': return this._renderReceivedClaim();
      case 'received-message': return this._renderReceivedMessage();
      case 'backup': return this._renderBackup();
      default: return html`<p>Loading...</p>`;
    }
  }
}

customElements.define('pigeon-app', PigeonApp);
