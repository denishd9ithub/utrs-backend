import { supabase } from '../config/supabase.js';

/**
 * Verify JWT from Authorization header and attach user + role to req
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    req.user = user;
    let role = user.app_metadata?.role;

    if (!role) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      role = profile?.role || 'user';
    }
    req.role = role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized', message: err.message });
  }
}

/**
 * Attach user if valid token present; does NOT require auth (req.user may be null)
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      req.user = null;
      return next();
    }
    req.user = user;
    let role = user.app_metadata?.role;
    if (!role) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      role = profile?.role || 'user';
    }
    req.role = role;
    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * Require one of the given roles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    next();
  };
}
