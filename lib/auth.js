const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// HTTP Basic authentication for a single-user diary.
// Credentials come from the environment; with no credentials configured every request is rejected.
function basicAuth({ username, password, realm = 'Express Diary' }) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (username && password && scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      // Evaluate both comparisons so timing does not reveal which part was wrong.
      const userOk = safeEqual(user, username);
      const passOk = safeEqual(pass, password);
      if (sep !== -1 && userOk && passOk) return next();
    }
    res.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    return res.status(401).send('Authentication required');
  };
}

// Browsers send Basic credentials automatically, so block cross-site form posts (CSRF).
function sameOriginWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const source = req.headers.origin || req.headers.referer;
  if (!source) return next();
  try {
    if (new URL(source).host === req.headers.host) return next();
  } catch {
    // fall through
  }
  return res.status(403).send('Cross-site request blocked');
}

module.exports = { basicAuth, sameOriginWrites };
