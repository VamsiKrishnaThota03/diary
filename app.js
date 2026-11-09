const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const config = require('./lib/config');
const { basicAuth, sameOriginWrites } = require('./lib/auth');
const Diary = require('./models/Diary');

function createApp({ username, password }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');

  app.use(basicAuth({ username, password }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false }));
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

  createApp({ username, password }).listen(config.port, config.host, () => {
    console.log(`Listening on http://${config.host}:${config.port}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { createApp };
