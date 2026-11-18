// node cli.mjs <module> embed <raw> <w> <h> <hex> <outraw> [opts-json] | extract <raw> <w> <h> | capacity <raw> <w> <h>
import fs from 'fs';
const [mod, cmd, raw, w, h, hex, outRaw, opts] = process.argv.slice(2);
const m = await import(mod);
const img = { width: +w, height: +h, data: new Uint8ClampedArray(fs.readFileSync(raw)) };
const o = opts ? JSON.parse(opts) : undefined;
let r;
if (cmd === 'embed') {
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
  r = m.embed(img, bytes, o); fs.writeFileSync(outRaw, img.data);
} else if (cmd === 'extract') {
  r = m.extract(img); if (r.bytes) r.bytes = Buffer.from(r.bytes).toString('hex');
} else r = { room: m.capacityFor(img, o) };
console.log(JSON.stringify(r));
