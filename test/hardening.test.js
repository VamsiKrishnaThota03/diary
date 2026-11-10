/**
 * Covers the hardening added to the diary app.
 *
 * Two things here are easy to get wrong and worth pinning:
 *
 * 1. The health probes are mounted *before* `basicAuth`. A platform health
 *    check sends no credentials, so gating them would make a deploy look
 *    permanently unhealthy — but they must also not leak diary content.
 * 2. This app renders HTML, so its CSP has to allow its own assets. The strict
 *    `'self'` policy only works because nothing in views/ is inline; if someone
 *    adds an inline <style> or onclick handler, the page silently breaks
 *    instead of failing loudly, so the test asserts the directives directly.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { createApp } = require('../app');

let server;
let base;
const auth = 'Basic ' + Buffer.from('me:secret-pass').toString('base64');

before(async () => {
  server = createApp({ username: 'me', password: 'secret-pass' }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('the test server listens only on loopback', () => {
  assert.strictEqual(server.address().address, '127.0.0.1');
});

test('liveness is reachable without credentials', async () => {
  // No Authorization header: a platform probe has none.
  const res = await fetch(`${base}/healthz`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(typeof body.uptime, 'number');
});

test('readiness is reachable without credentials and reports 503 when Mongo is down', async () => {
  assert.strictEqual(mongoose.connection.readyState, 0);
  const res = await fetch(`${base}/healthz/ready`);
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.headers.get('retry-after'), '30');
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.database, 'disconnected');
});

test('the probes leak no diary content', async () => {
  for (const path of ['/healthz', '/healthz/ready']) {
    const text = await (await fetch(base + path)).text();
    // Only the three expected keys; nothing resembling an entry.
    assert.ok(!/title|description|entry/i.test(text), `${path} mentioned entry fields`);
  }
});

test('everything other than the probes still requires credentials', async () => {
  for (const path of ['/', '/diary', '/about', '/add', '/style.css']) {
    const res = await fetch(base + path);
    assert.strictEqual(res.status, 401, `${path} should require credentials`);
    assert.match(res.headers.get('www-authenticate'), /Basic/);
  }
});

test('the CSP allows the app\'s own assets but nothing inline or remote', async () => {
  const res = await fetch(`${base}/`, { headers: { Authorization: auth } });
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'expected a Content-Security-Policy header');

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  // The whole point of keeping views free of inline assets.
  assert.ok(!csp.includes('unsafe-inline'), 'CSP must not need unsafe-inline');
  assert.ok(!csp.includes('unsafe-eval'), 'CSP must not need unsafe-eval');
});

test('other security headers are present', async () => {
  const res = await fetch(`${base}/`, { headers: { Authorization: auth } });
  assert.strictEqual(res.headers.get('x-powered-by'), null);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('referrer-policy'), 'same-origin');
  assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
});

test('the health probes are not rate limited, but the app is', async () => {
  // The limiter is mounted after the probes and before basicAuth, so a probe
  // carries no RateLimit header while an app request does. That ordering is
  // deliberate: an uptime pinger hitting /healthz every few seconds must not
  // consume the budget that protects the credential gate.
  const probe = await fetch(`${base}/healthz`);
  assert.strictEqual(probe.headers.get('ratelimit'), null);
  assert.strictEqual(probe.headers.get('ratelimit-limit'), null);

  const app = await fetch(`${base}/`);
  assert.strictEqual(app.status, 401);
  assert.ok(
    app.headers.get('ratelimit') || app.headers.get('ratelimit-limit'),
    'expected a draft-7 RateLimit header on an app request'
  );
  // draft-7 replaces the X-RateLimit-* family.
  assert.strictEqual(app.headers.get('x-ratelimit-limit'), null);
});

test('a cross-site write is still blocked even with valid credentials', async () => {
  // Browsers attach Basic credentials automatically, so the Origin check is
  // what stands between a hostile page and a write.
  const res = await fetch(`${base}/add-to-diary`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://evil.example',
    },
    body: new URLSearchParams({ title: 'x', description: 'y', date: '2026-01-01' }).toString(),
    redirect: 'manual',
  });
  assert.strictEqual(res.status, 403);
  assert.match(await res.text(), /Cross-site request blocked/);
});

test('a same-origin write passes the Origin check', async () => {
  const host = new URL(base).host;
  const res = await fetch(`${base}/add-to-diary`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://${host}`,
    },
    // Deliberately invalid so it fails validation at 400 rather than reaching
    // Mongo, which is not connected in this suite.
    body: new URLSearchParams({ title: '', description: '', date: '' }).toString(),
    redirect: 'manual',
  });
  assert.strictEqual(res.status, 400, 'expected validation to run, not a 403');
});

test('an unknown id is a 404, not a cast error', async () => {
  const res = await fetch(`${base}/diary/not-an-objectid`, {
    headers: { Authorization: auth },
  });
  assert.strictEqual(res.status, 404);
});
