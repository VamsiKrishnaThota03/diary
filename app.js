const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./lib/config');
const { basicAuth, sameOriginWrites } = require('./lib/auth');
const Diary = require('./models/Diary');

function createApp({ username, password }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  // One proxy hop on Render and similar hosts, so req.ip is the real client
  // address for the limiter below. Trusting every hop would let a caller spoof
  // X-Forwarded-For and bypass it.
  app.set('trust proxy', 1);

  // This app serves HTML, so unlike a JSON API it needs a CSP that permits its
  // own assets rather than denying everything. Every stylesheet and image is
  // local and there is no inline <style>, <script> or style= attribute
  // anywhere in views/, so 'self' is enough — no 'unsafe-inline' needed.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'style-src': ["'self'"],
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'object-src': ["'none'"],
        },
      },
      referrerPolicy: { policy: 'same-origin' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
    })
  );

  // Health probes are mounted *before* basicAuth on purpose: a platform health
  // check sends no credentials, so gating them would make a deploy look
  // permanently unhealthy. They expose no diary content.
  app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.get('/healthz/ready', (req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const state = states[mongoose.connection.readyState] || 'unknown';
    if (mongoose.connection.readyState === 1) {
      return res.json({ ok: true, database: state });
    }
    res.set('Retry-After', '30');
    return res.status(503).json({ ok: false, database: state });
  });

  // Basic auth is the only gate on this app, so it needs brute-force
  // protection. Keyed on IP alone, because the single username arrives in a
  // header rather than a body. Mounted before the gate so rejected attempts
  // count towards the limit too.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 60),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: 'Too many requests, please try again later.',
    })
  );

  app.use(basicAuth({ username, password }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(sameOriginWrites);
  app.use(methodOverride('_method'));

  // Formats a Date for <input type="date"> and for display.
  app.locals.toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  app.locals.formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  const readEntry = (body) => ({
    title: (body.title || '').trim(),
    description: (body.description || '').trim(),
    date: body.date,
  });

  const validate = (entry) => {
    const errors = [];
    if (!entry.title) errors.push('Title is required.');
    if (!entry.description) errors.push('Write something in the entry.');
    if (!entry.date || Number.isNaN(Date.parse(entry.date))) errors.push('Pick a valid date.');
    return errors;
  };

  // Loads the entry for :id or renders a 404.
  const findEntry = async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404');
    try {
      const entry = await Diary.findById(req.params.id);
      if (!entry) return res.status(404).render('404');
      res.locals.entry = entry;
      return next();
    } catch (err) {
      return next(err);
    }
  };

  app.get('/', (req, res) => res.render('Home', { active: 'home' }));

  app.get('/about', (req, res) => res.render('about', { active: 'about' }));

  app.get('/diary', async (req, res, next) => {
    try {
      const data = await Diary.find().sort({ date: -1, _id: -1 });
      res.render('Diary', { data, active: 'diary' });
    } catch (err) {
      next(err);
    }
  });

  app.get('/add', (req, res) => res.render('add', { active: 'add', errors: [], entry: { date: new Date() } }));

  app.post('/add-to-diary', async (req, res, next) => {
    const entry = readEntry(req.body);
    const errors = validate(entry);
    if (errors.length) return res.status(400).render('add', { active: 'add', errors, entry });
    try {
      const saved = await Diary.create(entry);
      return res.redirect(`/diary/${saved.id}`);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/diary/:id', findEntry, (req, res) => res.render('page', { data: res.locals.entry, active: 'diary' }));

  app.get('/diary/edit/:id', findEntry, (req, res) =>
    res.render('edit', { data: res.locals.entry, errors: [], active: 'diary' })
  );

  app.put('/diary/edit/:id', findEntry, async (req, res, next) => {
    const entry = readEntry(req.body);
    const errors = validate(entry);
    if (errors.length) {
      return res.status(400).render('edit', { data: { ...entry, id: req.params.id }, errors, active: 'diary' });
    }
    try {
      Object.assign(res.locals.entry, entry);
      await res.locals.entry.save();
      return res.redirect(`/diary/${req.params.id}`);
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/diary/:id', findEntry, async (req, res, next) => {
    try {
      await res.locals.entry.deleteOne();
      return res.redirect('/diary');
    } catch (err) {
      return next(err);
    }
  });

  app.use((req, res) => res.status(404).render('404'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error');
  });

  return app;
}

async function main() {
  const url = config.required('MONGO_URI');
  const username = config.required('DIARY_USERNAME');
  const password = config.required('DIARY_PASSWORD');

  mongoose.set('strictQuery', false);
  await mongoose.connect(url);
  console.log('MongoDB connected');

  const server = createApp({ username, password }).listen(config.port, config.host, () => {
    console.log(`Listening on http://${config.host}:${config.port}`);
  });

  // Drain in-flight requests and close the Mongo connection when the platform
  // replaces the container, so a deploy does not surface as 502s or leaked
  // connections.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch {
        // Already closed; nothing useful to do here.
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { createApp };
