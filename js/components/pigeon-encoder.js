import { LitElement, html, css } from 'https://esm.sh/lit@3';

/**
 * Encoder component for the carrier → encode → share flow.
 *
 * Usage:
 *   <pigeon-encoder
 *     button-label="Choose carrier image"
 *     generate-label="Generate invite image"
 *     filename="pigeon-invite.jpg"
 *     @generate=${this._handleGenerate}>
 *     <!-- Optional form fields in default slot -->
 *   </pigeon-encoder>
 *
 * After encoding, call: encoder.setResult(dataURL, jpegData)
 */
class PigeonEncoder extends LitElement {
  static properties = {
    buttonLabel: { type: String, attribute: 'button-label' },
    generateLabel: { type: String, attribute: 'generate-label' },
    filename: { type: String },
    _hasImage: { type: Boolean, state: true },
    _resultUrl: { type: String, state: true },
    _jpegData: { type: Object, state: true }
  };

  static styles = css`
    :host {
      display: block;
    }

    .hidden {
      display: none !important;
    }

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

    .btn-block {
      display: block;
      width: 100%;
    }

    .mb-1 {
      margin-bottom: 1rem;
    }

    input[type="file"] {
      display: none;
    }

    canvas, .output-image {
      max-width: 100%;
      border: 1px solid var(--border, #ccc);
      border-radius: var(--radius, 4px);
      margin: 1rem 0;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .actions > * {
      flex: 1;
    }
  `;

  constructor() {
    super();
    this.buttonLabel = 'Choose carrier image';
    this.generateLabel = 'Generate image';
    this.filename = 'pigeon-image.jpg';
    this._hasImage = false;
    this._resultUrl = null;
    this._jpegData = null;
  }

  get canvas() {
    return this.renderRoot.querySelector('canvas');
  }

  getImageData() {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  setResult(dataURL, jpegData) {
    this._resultUrl = dataURL;
    this._jpegData = jpegData;
  }

  reset() {
    this._hasImage = false;
    this._resultUrl = null;
    this._jpegData = null;
  }

  _handleFileClick() {
    this.renderRoot.querySelector('input[type="file"]').click();
  }

  _handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = this.canvas;
      const ctx = canvas.getContext('2d');

      // Resize if needed
      let w = img.width, h = img.height;
      const maxW = 800, maxH = 600;
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      if (h > maxH) { w = w * maxH / h; h = maxH; }

      canvas.width = Math.floor(w);
      canvas.height = Math.floor(h);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      this._hasImage = true;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  _handleGenerate() {
    const imageData = this.getImageData();
    this.dispatchEvent(new CustomEvent('generate', {
      detail: { imageData },
      bubbles: true,
      composed: true
    }));
  }

  async _handleShare() {
    if (!this._jpegData) {
      alert('No image to share');
      return;
    }

    const blob = new Blob([this._jpegData], { type: 'image/jpeg' });
    const file = new File([blob], this.filename, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    if (!navigator.canShare) {
      alert('Sharing not supported. Please save the image and share from your gallery.');
      return;
    }

    if (!navigator.canShare({ files: [file] })) {
      alert('File sharing not supported on this browser. Please save the image and share from your gallery.');
      return;
    }

    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Share failed:', err.name, err.message);
      alert('Share failed due to browser restrictions.\n\nWorkaround: Save the image first, then share it from your gallery or file manager.');
    }
  }

  render() {
    return html`
      <slot></slot>

      <button class="btn btn-block mb-1" @click=${this._handleFileClick}>
        ${this.buttonLabel}
      </button>
      <input type="file" accept="image/*" @change=${this._handleFileChange}>

      <canvas class="${this._hasImage ? '' : 'hidden'}"></canvas>

      <button
        class="btn btn-block ${this._hasImage && !this._resultUrl ? '' : 'hidden'}"
        @click=${this._handleGenerate}>
        ${this.generateLabel}
      </button>

      ${this._resultUrl ? html`
        <img class="output-image" src=${this._resultUrl} alt="Encoded image">
        <div class="actions">
          <a class="btn" href=${this._resultUrl} download=${this.filename}>Save</a>
          <button class="btn" @click=${this._handleShare}>Share</button>
        </div>
      ` : null}
    `;
  }
}

customElements.define('pigeon-encoder', PigeonEncoder);
