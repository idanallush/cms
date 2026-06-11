import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 12;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. The server cannot start without it.');
}
const JWT_SECRET = process.env.JWT_SECRET;

const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
let ownerPasswordHash = null;

async function getOwnerPasswordHash() {
  if (!OWNER_PASSWORD) throw new Error('OWNER_PASSWORD not set in environment');
  if (!ownerPasswordHash) {
    ownerPasswordHash = await bcrypt.hash(OWNER_PASSWORD, SALT_ROUNDS);
  }
  return ownerPasswordHash;
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function verifyOwnerPassword(plain) {
  const hash = await getOwnerPasswordHash();
  return bcrypt.compare(plain, hash);
}

export function createToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('cms_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('cms_token', { path: '/' });
}
