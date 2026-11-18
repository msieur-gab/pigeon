// Side-by-side viewer (lab): two pictures in two panes that zoom and move
// together. Pinch or drag on a phone; wheel or drag with a mouse; double-tap
// switches between the whole picture and 1:1. The right picture is drawn at
// the left one's size, so a received image the app resized still lines up.

export function createCompare(root) {
    root.innerHTML = `
        <div class="cmp-panes">
            <figure><figcaption data-cap="0"></figcaption><canvas data-pane="0"></canvas></figure>
            <figure><figcaption data-cap="1"></figcaption><canvas data-pane="1"></canvas></figure>
        </div>
        <div class="row cmp-zoom">
            <button class="btn" data-z="fit">whole</button>
            <button class="btn" data-z="1">1:1</button>
            <button class="btn" data-z="4">4×</button>
            <button class="btn" data-z="8">8×</button>
            <span class="mono-small" data-level></span>
        </div>`;
    const canvases = [...root.querySelectorAll('canvas')];
    const caps = [...root.querySelectorAll('figcaption')];
    const imgs = [null, null];                       // ImageBitmap per side
    const view = { scale: 0, cx: 0, cy: 0 };         // scale: screen px per picture px; centre in picture px

    const ref = () => imgs[0] || imgs[1];
    const paneSize = () => { const r = canvases[0].getBoundingClientRect(); return { w: r.width, h: r.height }; };
    const fitScale = () => {
        const im = ref(), { w, h } = paneSize();
        return im ? Math.min(w / im.width, h / im.height) : 1;
    };
    function clamp() {
        const im = ref();
        if (!im) return;
        view.scale = Math.min(16, Math.max(fitScale(), view.scale));
        const { w, h } = paneSize();
        const hw = w / 2 / view.scale, hh = h / 2 / view.scale;
        view.cx = im.width <= 2 * hw ? im.width / 2 : Math.min(im.width - hw, Math.max(hw, view.cx));
        view.cy = im.height <= 2 * hh ? im.height / 2 : Math.min(im.height - hh, Math.max(hh, view.cy));
    }
    function draw() {
        clamp();
        const im0 = ref(), dpr = window.devicePixelRatio || 1, { w, h } = paneSize();
        canvases.forEach((c, i) => {
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
            const ctx = c.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = getComputedStyle(root).getPropertyValue('--cmp-bg') || '#888';
            ctx.fillRect(0, 0, c.width, c.height);
            const im = imgs[i];
            if (!im || !im0) return;
            const s = view.scale * dpr;
            ctx.setTransform(s, 0, 0, s, dpr * w / 2 - view.cx * s, dpr * h / 2 - view.cy * s);
            ctx.imageSmoothingEnabled = view.scale < 2;  // zoomed in: show the real pixels
            ctx.drawImage(im, 0, 0, im0.width, im0.height);
        });
        const lvl = root.querySelector('[data-level]');
        lvl.textContent = ref() ? `${view.scale >= 1 ? view.scale.toFixed(view.scale < 10 ? 1 : 0) : view.scale.toFixed(2)}×` : '';
    }
    function zoomAt(factor, px, py) {                // px, py: point in the pane (screen px) that stays put
        const { w, h } = paneSize();
        const ix = view.cx + (px - w / 2) / view.scale, iy = view.cy + (py - h / 2) / view.scale;
        view.scale *= factor;
        clamp();
        view.cx = ix - (px - w / 2) / view.scale;
        view.cy = iy - (py - h / 2) / view.scale;
        draw();
    }

    // Pointers: one finger pans, two fingers pinch (on either pane)
    const pts = new Map();
    let lastTap = 0;
    canvases.forEach(c => {
        c.addEventListener('pointerdown', e => {
            c.setPointerCapture(e.pointerId);
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY, c });
            const now = Date.now();
            if (pts.size === 1 && now - lastTap < 300) {   // double-tap: whole <-> 1:1
                const r = c.getBoundingClientRect();
                zoomAt((view.scale > fitScale() * 1.01 ? fitScale() : 1) / view.scale, e.clientX - r.left, e.clientY - r.top);
            }
            lastTap = now;
        });
        c.addEventListener('pointermove', e => {
            const p = pts.get(e.pointerId);
            if (!p) return;
            if (pts.size === 1) {
                view.cx -= (e.clientX - p.x) / view.scale;
                view.cy -= (e.clientY - p.y) / view.scale;
                p.x = e.clientX; p.y = e.clientY;
                draw();
            } else if (pts.size === 2) {
                const [a, b] = [...pts.values()];
                const d0 = Math.hypot(a.x - b.x, a.y - b.y);
                p.x = e.clientX; p.y = e.clientY;
                const d1 = Math.hypot(a.x - b.x, a.y - b.y);
                const r = c.getBoundingClientRect();
                if (d0 > 0) zoomAt(d1 / d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
            }
        });
        const up = e => pts.delete(e.pointerId);
        c.addEventListener('pointerup', up);
        c.addEventListener('pointercancel', up);
        c.addEventListener('wheel', e => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });
    });
    root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
        const z = b.dataset.z;
        view.scale = z === 'fit' ? fitScale() : Number(z);
        draw();
    });
    new ResizeObserver(() => draw()).observe(canvases[0]);

    return {
        /** side 0 (left) or 1 (right): a Blob, File or URL, and a caption */
        async set(side, src, caption) {
            const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
            const first = !ref();
            imgs[side] = await createImageBitmap(blob);
            caps[side].textContent = caption;
            if (first) { view.scale = fitScale(); view.cx = imgs[side].width / 2; view.cy = imgs[side].height / 2; }
            draw();
        },
        clear() { imgs[0] = imgs[1] = null; caps.forEach(c => (c.textContent = '')); draw(); }
    };
}
