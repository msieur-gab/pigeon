import { LitElement, html, css } from 'https://esm.sh/lit@3';

class PigeonHeader extends LitElement {
  static properties = {
    title: { type: String },
    back: { type: Boolean }
  };

  static styles = css`
    :host {
      display: block;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0;
      border-bottom: 1px solid var(--border, #ccc);
      margin-bottom: 1rem;
    }

    h1 {
      font-size: 1rem;
      font-weight: normal;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .back {
      color: var(--muted, #666);
      text-decoration: none;
      cursor: pointer;
    }

    .back:hover {
      color: var(--fg, #000);
    }

    .theme-toggle {
      background: none;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      padding: 0.25rem;
      color: var(--fg, #000);
    }

    .theme-toggle:hover {
      opacity: 0.7;
    }
  `;

  constructor() {
    super();
    this.title = 'pigeon';
    this.back = false;
  }

  _getThemeIcon() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '\u25CB' : '\u25CF';
  }

  _handleBack(e) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'home' },
      bubbles: true,
      composed: true
    }));
  }

  _handleThemeToggle() {
    this.dispatchEvent(new CustomEvent('theme-toggle', {
      bubbles: true,
      composed: true
    }));
    this.requestUpdate();
  }

  render() {
    return html`
      <header>
        <h1>
          ${this.back ? html`
            <a class="back" @click=${this._handleBack}>\u2190</a>
          ` : null}
          ${this.title}
        </h1>
        <button class="theme-toggle" @click=${this._handleThemeToggle}>
          ${this._getThemeIcon()}
        </button>
      </header>
    `;
  }
}

customElements.define('pigeon-header', PigeonHeader);
