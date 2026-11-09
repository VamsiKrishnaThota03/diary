require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

module.exports = {
  required,
  port: Number(process.env.PORT) || 3000,
  // Loopback by default. Set HOST=0.0.0.0 only on a hosting platform (e.g. Render) that requires it.
  host: process.env.HOST || '127.0.0.1',
};
