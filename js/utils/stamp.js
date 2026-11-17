// Stamp: a carrier photo framed as a perforated postage stamp, with an
// optional postmark. Ported from the February stamp-avatar prototype.
// Returns an SVG string; the image is cropped to fill the square.

function perforationPath(size, teethPerSide, toothRadius) {
    const seg = [];
    const step = (size - toothRadius * 2) / teethPerSide;
    const r = toothRadius;

    seg.push(`M ${r} 0`);
    for (let i = 0; i < teethPerSide; i++) {               // top
        const c = r + i * step + step / 2;
        seg.push(`L ${c - r} 0`, `A ${r} ${r} 0 0 0 ${c + r} 0`);
    }
    seg.push(`L ${size - r} 0`, `A ${r} ${r} 0 0 1 ${size} ${r}`);
    for (let i = 0; i < teethPerSide; i++) {               // right
        const c = r + i * step + step / 2;
        seg.push(`L ${size} ${c - r}`, `A ${r} ${r} 0 0 0 ${size} ${c + r}`);
    }
    seg.push(`L ${size} ${size - r}`, `A ${r} ${r} 0 0 1 ${size - r} ${size}`);
    for (let i = teethPerSide - 1; i >= 0; i--) {          // bottom
        const c = r + i * step + step / 2;
        seg.push(`L ${c + r} ${size}`, `A ${r} ${r} 0 0 0 ${c - r} ${size}`);
    }
    seg.push(`L ${r} ${size}`, `A ${r} ${r} 0 0 1 0 ${size - r}`);
    for (let i = teethPerSide - 1; i >= 0; i--) {          // left
        const c = r + i * step + step / 2;
        seg.push(`L 0 ${c + r}`, `A ${r} ${r} 0 0 0 0 ${c - r}`);
    }
    seg.push(`L 0 ${r}`, `A ${r} ${r} 0 0 1 ${r} 0`, 'Z');
    return seg.join(' ');
}

// Size presets: teeth, tooth radius, white margin, border, postmark detail
const PRESETS = {
    48:  { teeth: 5,  tooth: 2.5, margin: 7,  border: 0.75, circle: true,  text: false, stroke: 1 },
    64:  { teeth: 6,  tooth: 3,   margin: 10, border: 1,    circle: true,  text: true,  stroke: 1.25 },
    96:  { teeth: 8,  tooth: 4,   margin: 12, border: 1.25, circle: true,  text: true,  stroke: 1.75 },
    200: { teeth: 14, tooth: 6,   margin: 22, border: 1.5,  circle: true,  text: true,  stroke: 2.5 }
};
const PATHS = {};

function postmark(size, p, label) {
    const k = size / 100;
    const ink = '#111';
    const waves = [[50, 40], [45, 55], [40, 70]].map(([x, y]) =>
        `<path d="M ${x * k} ${y * k} Q ${(x + 15) * k} ${(y - 10) * k} ${(x + 30) * k} ${y * k} T ${(x + 60) * k} ${y * k}"/>`
    ).join('');
    const cx = 25 * k, cy = 75 * k, r = 18 * k;
    const circle = p.circle ? `<circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="${p.stroke * 0.75}"/>` : '';
    const text = p.text
        ? `<text x="${cx}" y="${cy}" font-size="${(label.length > 4 ? 7 : 10) * k}" font-family="ui-monospace, monospace"
              font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="${ink}" stroke="none"
              transform="rotate(-15 ${cx} ${cy})">${label}</text>`
        : '';
    return `
        <g style="mix-blend-mode: multiply" opacity="0.75">
            <g transform="rotate(-15 ${size * 0.6} ${size * 0.6})" fill="none" stroke="${ink}"
               stroke-width="${p.stroke}" stroke-linecap="round">${waves}</g>
            <g fill="none" stroke="${ink}">${circle}${text}</g>
        </g>`;
}

/**
 * @param {number} size - 48, 64 or 200
 * @param {string} [src] - image URL (data: or blob:); empty draws a blank stamp
 * @param {Object} [opts]
 * @param {boolean} [opts.marked] - draw a postmark
 * @param {string} [opts.label] - postmark text (short, e.g. "17 NOV")
 * @param {number} [opts.rotation] - degrees, a slight tilt looks hand-placed
 */
export function render(size, src, { marked = false, label = 'MAIL', rotation = 0 } = {}) {
    const p = PRESETS[size] || PRESETS[64];
    const path = PATHS[size] || (PATHS[size] = perforationPath(size, p.teeth, p.tooth));
    const inner = size - p.margin * 2;
    const safeSrc = String(src).replace(/"/g, '%22');

    return `
        <svg class="stamp" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
             style="transform: rotate(${rotation}deg)" aria-hidden="true">
            <path d="${path}" fill="#fff"/>
            ${src
                ? `<image x="${p.margin}" y="${p.margin}" width="${inner}" height="${inner}"
                          href="${safeSrc}" preserveAspectRatio="xMidYMid slice"/>`
                : `<rect x="${p.margin}" y="${p.margin}" width="${inner}" height="${inner}" fill="#ddd"/>
                   <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
                         font-family="ui-monospace, monospace" font-size="${inner * 0.4}" fill="#888">?</text>`}
            <rect x="${p.margin}" y="${p.margin}" width="${inner}" height="${inner}"
                  fill="none" stroke="#999" stroke-width="${p.border}" stroke-opacity="0.6"/>
            ${marked ? postmark(size, p, label) : ''}
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
