// Reed-Solomon error correction over GF(256) (lab). Written from scratch after
// the classic description ("Reed-Solomon codes for coders", Wikiversity).
// encode(data, nsym) appends nsym check bytes; decode(codeword, nsym) repairs
// up to nsym/2 wrong bytes anywhere in it, or returns null if it can't.

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x; LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
const pow = (a, n) => EXP[((LOG[a] * n) % 255 + 255) % 255];
const inv = a => EXP[255 - LOG[a]];

// polynomials: arrays, highest degree first
function polyMul(p, q) {
    const r = new Uint8Array(p.length + q.length - 1);
    for (let j = 0; j < q.length; j++) for (let i = 0; i < p.length; i++) r[i + j] ^= mul(p[i], q[j]);
    return r;
}
function polyEval(p, x) {
    let y = p[0];
    for (let i = 1; i < p.length; i++) y = mul(y, x) ^ p[i];
    return y;
}
const generators = new Map();
function generator(nsym) {
    if (!generators.has(nsym)) {
        let g = new Uint8Array([1]);
        for (let i = 0; i < nsym; i++) g = polyMul(g, new Uint8Array([1, EXP[i]]));
        generators.set(nsym, g);
    }
    return generators.get(nsym);
}

/** data (≤ 255 - nsym bytes) → data followed by nsym check bytes */
export function encode(data, nsym) {
    if (data.length + nsym > 255) throw new Error('RS codeword longer than 255 bytes');
    const g = generator(nsym);
    const out = new Uint8Array(data.length + nsym);
    out.set(data);
    for (let i = 0; i < data.length; i++) {
        const c = out[i];
        if (c) for (let j = 1; j < g.length; j++) out[i + j] ^= mul(g[j], c);
    }
    out.set(data);
    return out;
}

/** codeword → { data, fixed } with up to nsym/2 bytes repaired, or null */
export function decode(codeword, nsym) {
    const msg = Uint8Array.from(codeword);
    const n = msg.length;
    const synd = new Uint8Array(nsym);
    let clean = true;
    for (let i = 0; i < nsym; i++) { synd[i] = polyEval(msg, EXP[i]); if (synd[i]) clean = false; }
    if (clean) return { data: msg.slice(0, n - nsym), fixed: 0 };

    // Berlekamp-Massey: error locator (lowest degree first)
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let k = 0; k < nsym; k++) {
        let d = synd[k];
        for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, synd[k - i]);
        if (d === 0) { m++; continue; }
        const T = C.slice();
        const coef = div(d, b);
        const need = B.length + m;
        while (C.length < need) C.push(0);
        for (let i = 0; i < B.length; i++) C[i + m] ^= mul(coef, B[i]);
        if (2 * L <= k) { L = k + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    while (C.length > 1 && C[C.length - 1] === 0) C.pop();
    if (C.length - 1 !== L || L * 2 > nsym) return null;

    // Chien search: positions where the locator vanishes
    const pos = [];
    for (let i = 0; i < n; i++) {
        const xinv = pow(2, 255 - (n - 1 - i));       // X^-1 for the byte at index i
        let v = 0;
        for (let j = C.length - 1; j >= 0; j--) v = mul(v, xinv) ^ C[j];
        if (v === 0) pos.push(i);
    }
    if (pos.length !== L) return null;

    // Forney: error values. Omega = S(x) * C(x) mod x^nsym (lowest degree first)
    const omega = new Uint8Array(nsym);
    for (let i = 0; i < nsym; i++) for (let j = 0; j <= i && j < C.length; j++) omega[i] ^= mul(C[j], synd[i - j]);
    for (const i of pos) {
        const X = pow(2, n - 1 - i), Xi = inv(X);
        let num = 0;
        for (let j = nsym - 1; j >= 0; j--) num = mul(num, Xi) ^ omega[j];
        let den = 0;                                        // C'(Xi): odd terms only in GF(2^m)
        for (let j = 1; j < C.length; j += 2) den ^= mul(C[j], pow(Xi, j - 1));
        if (!den) return null;
        msg[i] ^= mul(X, div(num, den));
    }
    for (let i = 0; i < nsym; i++) if (polyEval(msg, EXP[i])) return null;
    return { data: msg.slice(0, n - nsym), fixed: pos.length };
}
