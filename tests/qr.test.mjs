import test from 'node:test';
import assert from 'node:assert/strict';
import {qrSvg} from '../dist/js/qr.js';

function raster(svg) {
  const box = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(box, 'SVG must have a square viewBox');
  assert.equal(box[1], box[2]);
  const size = Number(box[1]);
  const matrix = Array.from({length: size}, () => Array(size).fill(false));
  const data = svg.match(/<path d="([^"]+)"/)[1];
  for (const [,xString,yString,runString,backString] of data.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, run] = [xString,yString,runString].map(Number);
    assert.equal(runString, backString);
    for (let dx = 0; dx < run; dx++) matrix[y][x + dx] = true;
  }
  return matrix;
}

test('actual QR geometry includes three finder patterns and a four-module quiet zone', () => {
  const svg = qrSvg('TIUBSS-TICKET-12345678-1234-5678-1234-123456789abc');
  assert.match(svg, /class="qr-image"/);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /fill="#fff"/);
  const matrix = raster(svg);
  const size = matrix.length;
  assert.equal((size - 8 - 17) % 4, 0, 'QR version geometry');
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (row < 4 || col < 4 || row >= size - 4 || col >= size - 4) assert.equal(matrix[row][col], false, 'quiet zone must remain white');
    }
  }
  for (const [top, left] of [[4,4], [4,size-11], [size-11,4]]) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const finderDark = row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4);
        assert.equal(matrix[top + row][left + col], finderDark, 'finder pattern must have standard 7×7 geometry');
      }
    }
  }
});

test('different event and food tokens produce distinct deterministic symbols', () => {
  const event = qrSvg('TIUBSS-DEMO-TICKET-001');
  const food = qrSvg('TIUBSS-DEMO-ORDER-001');
  assert.notEqual(event, food);
  assert.equal(event, qrSvg('TIUBSS-DEMO-TICKET-001'));
  assert.notEqual(qrSvg('Hello'), qrSvg('hello'));
});

test('QR content cannot inject SVG markup and invalid inputs are rejected', () => {
  const svg = qrSvg('<script>alert("x")</script>');
  assert.equal(svg.includes('<script>'), false);
  assert.ok(raster(qrSvg('বাংলা')).length > 0);
  assert.throws(() => qrSvg(''), /nonempty/);
  assert.throws(() => qrSvg(null), /nonempty/);
  assert.throws(() => qrSvg('x'.repeat(2001)), /too long/);
});
