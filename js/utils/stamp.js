// Stamp: a carrier photo framed as a perforated postage stamp, cancelled
// with a postmark when it has travelled. Returns an SVG string.
//
// v2 (17 Nov 2026): round perforation holes, paper tone, fine frame,
// "PIGEON" printed at the bottom; the cancellation is a circular date
// stamp overlapping the bottom-left corner, with wavy lines across the
// picture and the sender's three words written between them, in worn ink.

let uid = 0;

const INK = '#1d1d1f';
const PAPER = '#fbfaf5';
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

// hole radius, hole spacing, white margin, frame, printed caption,
// whether the postmark carries text (too small to read below 96)
const PRESETS = {
    48:  { hole: 1.6, gap: 4.6,  margin: 5,  frame: false, caption: false, text: false },
    64:  { hole: 2.0, gap: 5.6,  margin: 7,  frame: true,  caption: false, text: false },
    96:  { hole: 2.6, gap: 7.2,  margin: 9,  frame: true,  caption: true,  text: true },
    200: { hole: 4.2, gap: 11.5, margin: 15, frame: true,  caption: true,  text: true }
};

// Evenly spaced holes with one on every corner, so all four edges match
function holes(size, r, gap) {
    const n = Math.max(3, Math.round(size / gap));
    const step = size / n;
    const out = [];
    for (let i = 0; i <= n; i++) {
        const p = i * step;
        out.push([p, 0], [p, size]);
        if (i > 0 && i < n) out.push([0, p], [size, p]);
    }
    return out.map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}"/>`).join('');
}

function wave(x0, y, len, amp) {
    const seg = len / 4;
    let d = `M ${x0.toFixed(2)} ${y.toFixed(2)}`;
    for (let i = 0; i < 4; i++) {
        const xs = x0 + i * seg;
        d += ` Q ${(xs + seg / 2).toFixed(2)} ${(y + (i % 2 ? amp : -amp)).toFixed(2)} ${(xs + seg).toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
}

function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Same composition at every size, drawn on a 200-unit grid and scaled
function cancellation(size, id, p, { label, words }) {
    const k = size / 200;
    const sw = Math.max(0.8, 1.6 * k);
    const cx = 44 * k, cy = 158 * k, R = 38 * k, r2 = 31 * k;

    let ringText = '';
    if (p.text) {
        const rr = r2 - 4 * k;
        const ring = `M ${cx - rr} ${cy} a ${rr} ${rr} 0 1 1 ${2 * rr} 0`;
        ringText = `
            <path id="${id}-ring" d="${ring}" fill="none" stroke="none"/>
            <text font-size="${8.5 * k}" letter-spacing="${1.6 * k}" fill="${INK}" stroke="none"
                  font-family="${MONO}" font-weight="700">
                <textPath href="#${id}-ring" startOffset="50%" text-anchor="middle">PIGEON POST</textPath>
            </text>
            <text x="${cx}" y="${cy + 6 * k}" text-anchor="middle" font-size="${13 * k}" font-weight="700"
                  fill="${INK}" stroke="none" font-family="${MONO}">${escapeXml(label)}</text>
            <line x1="${cx - 20 * k}" y1="${cy + 13 * k}" x2="${cx + 20 * k}" y2="${cy + 13 * k}" stroke-width="${sw * 0.6}"/>`;
    }

    // wavy lines across the picture, running a little past the right edge
    const x0 = 74 * k, len = 160 * k, amp = 4.5 * k;
    const ys = [70, 92, 114, 136].map(v => v * k);
    const lines = ys.map(y => `<path d="${wave(x0, y, len, amp)}" stroke-width="${sw}"/>`).join('');

    // the sender's three words, written between the lines, on the picture
    const between = p.text ? (words || []).slice(0, 3).map((w, i) => {
        const y = (ys[i] + ys[i + 1]) / 2 + 3.2 * k;
        return `<text x="${(96 + i * 7) * k}" y="${y}" font-size="${9 * k}" letter-spacing="${2 * k}"
                      fill="${INK}" stroke="none" font-weight="700" font-family="${MONO}">${escapeXml(w.toUpperCase())}</text>`;
    }).join('') : '';

    return `
        <g filter="url(#${id}-ink)" opacity="0.85" transform="rotate(-6 ${size / 2} ${size / 2})"
           fill="none" stroke="${INK}" stroke-linecap="round">
            <circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="${sw}"/>
            <circle cx="${cx}" cy="${cy}" r="${r2}" stroke-width="${sw * 0.6}"/>
            ${ringText}${lines}${between}
        </g>`;
}

/**
 * @param {number} size - 48, 64, 96 or 200
 * @param {string} [src] - image URL (data: or blob:); empty draws a blank stamp
 * @param {Object} [opts]
 * @param {boolean} [opts.marked] - cancel it with a postmark
 * @param {string} [opts.label] - date in the postmark circle, e.g. "17 NOV"
 * @param {string[]} [opts.words] - the sender's three fingerprint words
 * @param {number} [opts.rotation] - degrees; a slight tilt looks hand-placed
 * @param {boolean} [opts.contain] - show the whole picture instead of filling
 *   the frame (for a QR code, which must not be cropped)
 */
export function render(size, src, { marked = false, label = '', words = [], rotation = 0, contain = false } = {}) {
    const p = PRESETS[size] || PRESETS[64];
    const id = `stamp${++uid}`;
    const m = p.margin;
    const capH = p.caption ? size * 0.07 : 0;
    const imgW = size - 2 * m, imgH = size - 2 * m - capH;
    const safeSrc = String(src || '').replace(/"/g, '%22');

    const picture = src
        ? `<image x="${m}" y="${m}" width="${imgW}" height="${imgH}" href="${safeSrc}" preserveAspectRatio="xMidYMid ${contain ? 'meet' : 'slice'}"/>`
        : `<rect x="${m}" y="${m}" width="${imgW}" height="${imgH}" fill="#e6e4dc"/>
           <text x="${size / 2}" y="${m + imgH / 2}" text-anchor="middle" dominant-baseline="central"
                 font-family="${MONO}" font-size="${imgW * 0.35}" fill="#9a978c">?</text>`;

    const caption = p.caption
        ? `<text x="${size / 2}" y="${size - m * 0.55 - capH * 0.15}" text-anchor="middle"
                 font-size="${size * 0.05}" letter-spacing="${size * 0.012}" fill="#6b6860"
                 font-family="${MONO}">PIGEON</text>`
        : '';

    const frame = p.frame
        ? `<rect x="${m - size * 0.012}" y="${m - size * 0.012}" width="${imgW + size * 0.024}" height="${imgH + size * 0.024}"
                 fill="none" stroke="#c9c5b8" stroke-width="${Math.max(0.5, size * 0.004)}"/>`
        : '';

    // The cancellation runs past the right edge, like on an envelope; the
    // negative margin keeps the stamp itself where the layout puts it.
    const pad = marked ? Math.round(size * 0.18) : 0;

    return `
<svg class="stamp" width="${size + pad}" height="${size}" viewBox="0 0 ${size + pad} ${size}"
     style="transform: rotate(${rotation}deg); margin-right: -${pad}px; overflow: visible" aria-hidden="true">
  <defs>
    <mask id="${id}-holes">
      <rect width="${size}" height="${size}" fill="#fff"/>
      <g fill="#000">${holes(size, p.hole, p.gap)}</g>
    </mask>
    <filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${uid % 7}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.2" result="speckle"/>
      <feComposite in="SourceGraphic" in2="speckle" operator="in"/>
    </filter>
    <filter id="${id}-shadow" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="0.6" dy="1.4" stdDeviation="1.6" flood-opacity="0.22"/>
    </filter>
  </defs>
  <g filter="url(#${id}-shadow)">
    <g mask="url(#${id}-holes)">
      <rect width="${size}" height="${size}" fill="${PAPER}"/>
      ${picture}${frame}${caption}
    </g>
  </g>
  ${marked ? cancellation(size, id, p, { label, words }) : ''}
</svg>`;
}

/** Stable small tilt (-3..3 degrees) from any string, so a stamp keeps its angle */
export function tiltFor(seed) {
    let h = 0;
    for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 61) - 30) / 10;
}

/** Postmark date label, e.g. "17 NOV" */
export function dateLabel(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' }).toUpperCase()}`;
}
