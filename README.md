# Express Diary

A server-rendered personal diary built with Express, EJS and MongoDB. You can write, read and edit dated entries.

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![EJS](https://img.shields.io/badge/views-EJS-B4CA65)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)

## Overview

Express Diary is a small backend-focused project for keeping a personal record of thoughts, feelings and events. Express renders every page on the server with EJS templates, and Mongoose stores the entries in MongoDB. HTML forms send `PUT` requests through `method-override`.

## Features

- Add a diary entry with a title, a description and a date.
- List all entries, then open a single entry on its own page.
- Edit an existing entry.
- Home and About pages, a shared header, navbar and footer, and a custom stylesheet.

## Tech stack

- Node.js, Express 4
- EJS templates
- MongoDB with Mongoose 6
- body-parser, method-override, nodemon

## Project structure

```
diary/
├── app.js            # Express app, routes and the MongoDB connection
├── models/Diary.js   # title, description, date
├── public/style.css
└── views/            # Home, about, Diary (list), page (detail), add, edit, layout/ partials
```

## Getting started

### Prerequisites

- Node.js 16 or later and npm
- A MongoDB database (local or MongoDB Atlas)

### Install and run

```bash
git clone https://github.com/VamsiKrishnaThota03/diary.git
cd diary
npm install
node app.js            # or: npx nodemon app.js
```

Open http://localhost:3000.

### Configuration

The connection string is hard-coded in `app.js`. Replace it with your own, ideally read from an environment variable:

| Setting     | File     | Example placeholder                                        |
| ----------- | -------- | ---------------------------------------------------------- |
| `MONGO_URI` | `app.js` | `mongodb+srv://<user>:<password>@<cluster>/Diary`          |
| Port        | `app.js` | `3000`                                                     |

## Routes

| Method | Path               | Purpose                                         |
| ------ | ------------------ | ----------------------------------------------- |
| GET    | `/`                | Home page                                       |
| GET    | `/about`           | About page                                      |
| GET    | `/diary`           | List all entries                                |
| GET    | `/add`             | Form to add an entry                            |
| POST   | `/add-to-diary`    | Save a new entry, then redirect to `/diary`     |
| GET    | `/diary/:id`       | View a single entry                             |
| GET    | `/diary/edit/:id`  | Edit form                                       |
| PUT    | `/diary/edit/:id`  | Update an entry (sent as `POST ?_method=PUT`)   |
