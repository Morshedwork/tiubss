/** Ticket payloads are untrusted input. Staff authority is always checked by the server. */
export function parseFoodTicketCode(value, {manual = false} = {}) {
  const code = String(value ?? '').trim();
  if (!code || code.length > 1000) throw new Error('Enter a valid food ticket code.');
  if (manual) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(code)) throw new Error('Use the order number or reference for manual lookup.');
    return {code, manual:true};
  }
  if (code.startsWith('{')) {
    let payload; try { payload = JSON.parse(code); } catch { throw new Error('This food QR code is incomplete. Scan or paste it again.'); }
    if (payload?.type !== 'food' || typeof payload.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.id) || typeof payload.token !== 'string' || !/^[a-zA-Z0-9_-]{16,256}$/.test(payload.token)) throw new Error('Use a food pickup QR, not an event entry ticket.');
    return {orderId:payload.id, token:payload.token};
  }
  if (!/^[a-zA-Z0-9_-]{16,256}$/.test(code) || code.startsWith('BSS-')) throw new Error('Scan the pickup QR or choose manual lookup for an order number.');
  return {code}; // Existing tickets used a raw pickup token.
}
