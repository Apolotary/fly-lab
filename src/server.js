import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export async function startServer(controller, html, { port = 9321 } = {}) {
  const token = randomBytes(32).toString('hex');
  let authority;
  let closing = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; media-src blob:; frame-ancestors 'none'");
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (closing) return send(503, { error: 'Shutting down.' });
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) return send(403, { error: 'Local dashboard only.' });
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html.replaceAll('__FLY_TOKEN__', token));
    }
    const supplied = Buffer.from(String(req.headers['x-fly-token'] ?? ''));
    const authenticated = supplied.length === token.length && timingSafeEqual(supplied, Buffer.from(token));
    if (req.method === 'GET' && req.url === '/api/state') {
      if (authenticated) controller.heartbeat();
      return send(200, controller.snapshot());
    }
    if (req.method === 'GET' && req.url === '/api/midi') {
      if (!authenticated) return send(403, { error: 'Reload the dashboard.' });
      res.writeHead(200, { 'Content-Type': 'audio/midi', 'Content-Disposition': 'attachment; filename=fly-field-notes.mid' });
      return res.end(controller.midiFile());
    }
    if (req.method !== 'POST' || req.url !== '/api/action') return send(404, { error: 'Not found.' });
    if (!authenticated) return send(403, { error: 'Reload the dashboard.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return send(415, { error: 'JSON required.' });
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048) return send(413, { error: 'Action too large.' });
      }
      const input = JSON.parse(body);
      const state = await controller.action(input);
      return send(200, state);
    } catch (error) { return send(400, { error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { authority = `127.0.0.1:${server.address().port}`; resolve(); });
  });
  controller.startTimer();
  return { url: `http://${authority}`, server, async close() {
    closing = true;
    const stopped = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    try { await controller.close(); } finally { await stopped; }
  } };
}
