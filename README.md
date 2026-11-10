# Express Diary

A server-rendered personal diary built with Express, EJS and MongoDB. You can write, read, edit and delete dated entries.

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![EJS](https://img.shields.io/badge/views-EJS-B4CA65)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)

[![CI](https://github.com/VamsiKrishnaThota03/express-diary/actions/workflows/ci.yml/badge.svg)](https://github.com/VamsiKrishnaThota03/express-diary/actions/workflows/ci.yml)
[![CodeQL](https://github.com/VamsiKrishnaThota03/express-diary/actions/workflows/codeql.yml/badge.svg)](https://github.com/VamsiKrishnaThota03/express-diary/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Entries](docs/screenshots/entries.png)

| Entry | Mobile |
| ----- | ------ |
| ![Entry](docs/screenshots/entry.png) | <img src="docs/screenshots/mobile.png" alt="Mobile view" width="260" /> |

## Overview

Express Diary is a small backend-focused project for keeping a personal record of thoughts, feelings and events. Express renders every page on the server with EJS templates, and Mongoose stores the entries in MongoDB. HTML forms send `PUT` and `DELETE` requests through `method-override`.

The diary is private: every page is behind HTTP Basic authentication with a username and password you set in the environment.

## Features

- Add a diary entry with a title, a date (defaults to today) and the text.
- List all entries as cards, newest first, with a short excerpt.
- Open a single entry on its own page, edit it (the form is pre-filled, including the date) or delete it after a confirmation.
- Form validation with clear error messages, an empty state when there are no entries, and friendly 404 and error pages.
- Responsive layout with a shared header, navbar and footer.

## Tech stack

- Node.js 18+, Express 4
- EJS templates
- MongoDB with Mongoose 6
- method-override, dotenv; nodemon for development
- Tests with the built-in `node:test` runner

## Project structure

```
diary/
├── app.js            # Express app (createApp), routes and startup
├── lib/
│   ├── auth.js       # HTTP Basic auth + same-origin check for form posts
│   └── config.js     # environment variables
├── models/Diary.js   # title, description, date
├── public/           # style.css, favicon.svg
├── test/             # node:test tests (no database needed)
└── views/            # Home, about, Diary (list), page (detail), add, edit, 404, error, layout/ partials
```

## Getting started

### Prerequisites

- Node.js 18 or later and npm
- A MongoDB database (local or MongoDB Atlas)

### Install and run

```bash
git clone https://github.com/VamsiKrishnaThota03/express-diary.git
cd diary
npm install
cp .env.example .env   # then set MONGO_URI, DIARY_USERNAME and DIARY_PASSWORD
npm run dev            # or: npm start
```

Open http://localhost:3000 and sign in with the username and password from `.env`.

Run the tests with `npm test`.

### Environment variables

| Variable         | Required | Description                                                         |
| ---------------- | -------- | ------------------------------------------------------------------- |
| `MONGO_URI`      | yes      | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/diary`   |
| `DIARY_USERNAME` | yes      | Username for the diary login                                         |
| `DIARY_PASSWORD` | yes      | Password for the diary login (use a long, unique one)                |
| `PORT`           | no       | Port to listen on (default `3000`)                                   |
| `HOST`           | no       | Bind address (default `127.0.0.1`; set `0.0.0.0` on Render or similar hosts) |

The app exits at startup if a required variable is missing.

## Routes

All routes require the diary login.

| Method | Path               | Purpose                                         |
| ------ | ------------------ | ----------------------------------------------- |
| GET    | `/`                | Home page                                       |
| GET    | `/about`           | About page                                      |
| GET    | `/diary`           | List all entries                                |
| GET    | `/add`             | Form to add an entry                            |
| POST   | `/add-to-diary`    | Save a new entry, then open it                  |
| GET    | `/diary/:id`       | View a single entry                             |
| GET    | `/diary/edit/:id`  | Edit form                                       |
| PUT    | `/diary/edit/:id`  | Update an entry (sent as `POST ?_method=PUT`)   |
| DELETE | `/diary/:id`       | Delete an entry (sent as `POST ?_method=DELETE`) |

## Known limitations

- Single user only: there is one login, configured through the environment, and no sign-up.
- HTTP Basic auth sends the password with every request, so only deploy behind HTTPS (Render and similar hosts provide it).
- No search or pagination on the entries list.


## Security model

This is a single-user diary, so the whole app sits behind HTTP Basic auth. Two
details make that actually safe rather than nominally safe:

**The credential comparison is timing-safe and total.** `lib/auth.js` hashes
both the submitted and expected values with SHA-256 before
`crypto.timingSafeEqual`, which sidesteps the length-mismatch throw, and it
evaluates *both* the username and password comparisons before deciding — so
response timing does not reveal which half was wrong. With no credentials
configured, every request is rejected rather than allowed.

**Writes are checked for origin.** Browsers attach Basic credentials
automatically, which is exactly what makes Basic auth CSRF-prone: a hostile page
can POST to this app and the browser helpfully authenticates it.
`sameOriginWrites` rejects any non-GET whose `Origin`/`Referer` host is not this
host. There are tests for both directions, and a CI step that posts with
`Origin: https://evil.example` and then confirms the entry was *not* saved.

### Content Security Policy

Because this app renders HTML (unlike a JSON API, which can deny everything),
the CSP has to permit its own assets:

```
default-src 'self'; style-src 'self'; script-src 'self';
img-src 'self' data:; form-action 'self';
frame-ancestors 'none'; base-uri 'none'; object-src 'none'
```

No `unsafe-inline` and no `unsafe-eval` — which only works because nothing in
`views/` uses an inline `<style>`, `<script>` or `style=` attribute. A test
asserts the directives directly, since adding an inline handler would otherwise
break a page silently rather than failing loudly.

### Health probes sit in front of the auth gate

`/healthz` and `/healthz/ready` are mounted **before** `basicAuth`, because a
platform health check sends no credentials and gating them would make a deploy
look permanently unhealthy. They are also mounted before the rate limiter, so
an uptime pinger cannot consume the budget protecting the credential gate. A
test asserts they expose no entry content.

`/healthz` is liveness and never touches Mongo. `/healthz/ready` reports
Mongoose's connection state and answers 503 with `Retry-After: 30`.

## Tests

```bash
npm test              # 18 tests, no database needed
npm run test:coverage
```

They cover the auth gate (missing, wrong and correct credentials), the CSP
directives, the other security headers, the probes being reachable unauthenticated
and leaking nothing, the probe/limiter ordering, cross-site and same-origin
writes, and a non-ObjectId id rendering 404 rather than throwing a cast error.

## Continuous integration

| Job | What it proves |
| --- | --- |
| `test` (Node 20, 22) | The 18-test suite, with coverage on 20 |
| `integration` | Against MongoDB 7: reads `ss -ltn` to confirm no `0.0.0.0` listener by default; the probes answer unauthenticated while `/diary` returns 401; a full create → redirect → render → list lifecycle; a cross-site write is refused **and** verified not to have been saved; clean `SIGTERM`; and `HOST=0.0.0.0` still honoured |
| `docker` | The image builds and refuses to start without `DIARY_USERNAME`/`DIARY_PASSWORD` |

CodeQL runs weekly and on every push; Dependabot groups weekly patch/minor bumps.

## Docker

```bash
printf 'MONGO_PASSWORD=%s\nDIARY_PASSWORD=%s\n' \
  "$(openssl rand -hex 16)" "$(openssl rand -base64 18)" > .env

docker compose up --build
open http://localhost:3000
```

MongoDB and the app both publish to `127.0.0.1` only, so neither is reachable
from your network, and Compose fails fast with a named error if either variable
is missing.

## Known limitations

- Basic auth means the browser caches credentials until it is closed; there is
  no logout.
- Rate limit counters live in process memory, so the ceiling is per instance.
- Single-user by design: there are no accounts, and every entry belongs to
  whoever holds the one password.
