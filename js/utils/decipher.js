// "Deciphering" text effect: characters cycle through random glyphs and
// lock into the real text from left to right.
//
// Cheap on purpose: one requestAnimationFrame loop updating a single text
// node, capped at 3 s, then it stops. Uses textContent only (no HTML).
// Respects the system "reduce motion" setting.
//
// To turn it off, set ENABLED to false (the text then just appears).

export const ENABLED = true;

// Scramble with the message's own letters (plus a few symbols): their
// widths match the real text, so lines wrap the same and nothing jumps.
const EXTRA = '#%&*+=/';
const MIN_MS = 1500;
const MAX_MS = 3000;
const MS_PER_CHAR = 35;
const HOLD = 0.2; // first 20%: everything scrambled, then letters lock in

function glyphPool(chars) {
    const own = chars.filter(c => c.trim());
    return own.length ? own.concat(Array.from(EXTRA)) : Array.from(EXTRA);
}

/**
 * Play the effect on an element, ending with `text` as its content.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function play(el, text) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!ENABLED || reduced || !el) {
        if (el) el.textContent = text;
        return;
    }

    // Lock the final height so the card doesn't move while scrambling
    el.textContent = text;
    el.style.height = `${el.offsetHeight}px`;
    el.style.overflow = 'hidden';

    const chars = Array.from(text);
    const pool = glyphPool(chars);
    const randomGlyph = () => pool[Math.floor(Math.random() * pool.length)];
    const duration = Math.min(MAX_MS, Math.max(MIN_MS, chars.length * MS_PER_CHAR));
    const start = performance.now();
    let lastFrame = 0;

    function frame(now) {
        if (!el.isConnected) return; // screen changed: stop quietly
        const progress = Math.min(1, (now - start) / duration);

        // ~30 fps is plenty for this look and halves the work
        if (now - lastFrame >= 33 || progress === 1) {
            lastFrame = now;
            const lockProgress = Math.max(0, (progress - HOLD) / (1 - HOLD));
            const locked = Math.floor(lockProgress * chars.length);
            let out = '';
            for (let i = 0; i < chars.length; i++) {
                const c = chars[i];
                out += (i < locked || c === ' ' || c === '\n') ? c : randomGlyph();
            }
            el.textContent = out;
        }

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            el.textContent = text;
            el.style.height = '';
            el.style.overflow = '';
        }
    }
    requestAnimationFrame(frame);
}
