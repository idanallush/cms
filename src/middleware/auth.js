import { verifyToken } from '../services/auth.js';

function extractUser(req) {
  const token = req.cookies?.cms_token;
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    return res.redirect('/login');
  }
  req.user = user;
  next();
}

export function requireOwner(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    return res.redirect('/login');
  }
  if (user.role !== 'owner') {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: { message: 'Owner access required' } });
    }
    return res.redirect('/login');
  }
  req.user = user;
  next();
}

export function requireSiteAccess(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    return res.redirect('/login');
  }

  const siteId = req.params.siteId;
  if (user.role === 'owner' || user.siteId === siteId) {
    req.user = user;
    return next();
  }

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({ error: { message: 'Access denied to this site' } });
  }
  return res.redirect('/login');
}

export function optionalAuth(req, res, next) {
  req.user = extractUser(req);
  next();
}
