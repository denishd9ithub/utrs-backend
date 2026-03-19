import { supabase } from '../config/supabase.js';
import { config } from '../config/index.js';

/**
 * POST /auth/login
 * Body: { email, password }
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Invalid credentials', message: error.message });
    }

    res.json({
      user: data.user,
      session: data.session,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/signup
 * Body: { email, password, full_name? }
 */
export async function signup(req, res, next) {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });

    if (error) {
      return res.status(400).json({ error: 'Signup failed', message: error.message });
    }

    res.status(201).json({
      user: data.user,
      session: data.session,
      message: data.user?.identities?.length === 0 ? 'User already exists' : 'Signup successful',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Requires: Authorization: Bearer <token>
 * Use requireAuth middleware - returns user with role
 */
export async function me(req, res, next) {
  try {
    const user = { ...req.user };
    user.role = req.role;
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Sends password reset email via Supabase
 */
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email required' });
    }

    const redirectTo = `${config.app?.url || 'http://localhost:3000'}${config.app?.resetPasswordPath || '/reset-password'}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      return res.status(400).json({ error: 'Failed to send reset email', message: error.message });
    }

    res.json({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/reset-password
 * Body: { newPassword }
 * Requires: Authorization: Bearer <token> (recovery token from reset email link)
 */
export async function resetPassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Reset token required. Use the link from your email.' });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired reset token. Please request a new link.' });
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: 'Failed to reset password', message: error.message });
    }

    res.json({ message: 'Password updated successfully. You can now login with your new password.' });
  } catch (err) {
    next(err);
  }
}  

/**
 * POST /auth/change-password
 * Body: { currentPassword, newPassword }
 * Requires: Authorization: Bearer <token> (logged-in user)
 */
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });

    if (signInError) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const { error } = await supabase.auth.admin.updateUserById(req.user.id, {
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: 'Failed to update password', message: error.message });
    }

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
}
