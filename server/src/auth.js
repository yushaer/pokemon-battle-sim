// Authentication: registration, login, JWT issuing/verification, and an
// Express middleware + a Socket.io helper that share the same verification.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign({ id: user._id.toString(), username: user.username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on invalid/expired
}

// Express middleware: require a valid Bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 chars (letters, digits, underscore).' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const usernameLower = username.toLowerCase();
    if (await User.findOne({ usernameLower })) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, usernameLower, passwordHash });
    return res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = await User.findOne({ usernameLower: String(username).toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    return res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user: user.toPublic() });
});
