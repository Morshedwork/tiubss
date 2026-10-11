import QRCode from './qr-vendor/index.js';
import QRErrorCorrectLevel from './qr-vendor/QRErrorCorrectLevel.js';

/** Encode the exact token locally as a printable QR symbol with a 4-module quiet zone. */
export function qrSvg(text) {
  if (typeof text !== 'string' || !text.length) throw new Error('A nonempty QR token is required.');
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 2000) throw new Error('The QR token is too long.');
  // The vendored byte encoder accepts a binary string. Converting explicitly
  // preserves UTF-8 bytes rather than truncating JavaScript Unicode characters.
  const data = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  const code = new QRCode(-1, QRErrorCorrectLevel.M);
  code.addData(data);
  code.make();
  const count = code.getModuleCount();
  const quietZone = 4;
  const size = count + quietZone * 2;
  const segments = [];
  for (let row = 0; row < count; row++) {
    let col = 0;
    while (col < count) {
      if (!code.isDark(row, col)) { col++; continue; }
      const start = col;
      while (col < count && code.isDark(row, col)) col++;
      const length = col - start;
      segments.push(`M${start + quietZone} ${row + quietZone}h${length}v1h-${length}z`);
    }
  }
  return `<svg class="qr-image" xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scannable ticket or food pickup code" shape-rendering="crispEdges"><title>QR code</title><rect width="${size}" height="${size}" fill="#fff"/><path d="${segments.join('')}" fill="#000"/></svg>`;
}
