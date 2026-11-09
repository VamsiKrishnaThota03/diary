const { test, before, after } = require('node:test');
const assert = require('node:assert');
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

test('rejects requests without credentials', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /Basic/);
});

test('rejects wrong credentials', async () => {
  const bad = 'Basic ' + Buffer.from('me:nope').toString('base64');
  const res = await fetch(`${base}/`, { headers: { Authorization: bad } });
  assert.strictEqual(res.status, 401);
});

test('serves pages with valid credentials', async () => {
  const res = await fetch(`${base}/about`, { headers: { Authorization: auth } });
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /Express Diary/);
});

test('rejects every request when no credentials are configured', async () => {
  const open = createApp({ username: '', password: '' }).listen(0, '127.0.0.1');
  await new Promise((r) => open.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${open.address().port}/`, {
    headers: { Authorization: 'Basic ' + Buffer.from(':').toString('base64') },
  });
  open.close();
  assert.strictEqual(res.status, 401);
});

test('blocks cross-site form posts', async () => {
  const res = await fetch(`${base}/add-to-diary`, {
    method: 'POST',
    headers: { Authorization: auth, Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'title=x&description=y&date=2024-01-01',
  });
  assert.strictEqual(res.status, 403);
});

test('re-renders the form with errors for an invalid entry', async () => {
  const res = await fetch(`${base}/add-to-diary`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'title=&description=&date=',
  });
  assert.strictEqual(res.status, 400);
  assert.match(await res.text(), /Title is required/);
});

test('returns 404 for an invalid id', async () => {
  const res = await fetch(`${base}/diary/not-an-id`, { headers: { Authorization: auth } });
  assert.strictEqual(res.status, 404);
});
