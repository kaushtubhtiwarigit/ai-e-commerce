import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { logger } from './logger.js';

/**
 * Generate JWT token
 */
export const generateToken = (payload, expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Generate secure random token
 */
export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash token for storage
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Extract token from request headers
 */
export const extractTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
};

/**
 * Check password strength
 */
export const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[@$!%*?&]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password)
  };
};

/**
 * Calculate password strength score (0-100)
 */
const calculatePasswordStrength = (password) => {
  let score = 0;
  
  // Length
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 15;
  if (password.length >= 16) score += 10;
  
  // Character variety
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[@$!%*?&]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9@$!%*?&]/.test(password)) score += 5;
  
  // Patterns
  if (!/(.)\1{2,}/.test(password)) score += 5; // No repeated characters
  if (!/123|abc|qwe|password|admin/i.test(password)) score += 10; // No common patterns
  
  return Math.min(score, 100);
};

/**
 * Sanitize user data for response
 */
export const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  
  // Remove sensitive fields
  delete userObj.password;
  delete userObj.loginAttempts;
  delete userObj.lockUntil;
  delete userObj.__v;
  
  return userObj;
};

/**
 * Generate user session data
 */
export const generateSessionData = (user) => {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLogin: new Date()
  };
};

/**
 * Check if email is disposable/temporary
 */
export const isDisposableEmail = (email) => {
  const disposableDomains = [
    '10minutemail.com',
    'tempmail.org',
    'guerrillamail.com',
    'mailinator.com',
    'throwaway.email'
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
};

/**
 * Rate limiting helper for authentication endpoints
 */
export const getAuthRateLimitKey = (req, action) => {
  const ip = req.ip || req.connection.remoteAddress;
  const email = req.body.email || 'unknown';
  return `auth:${action}:${ip}:${email}`;
};

/**
 * Log authentication events
 */
export const logAuthEvent = (event, user, req, additional = {}) => {
  const logData = {
    event,
    userId: user?._id,
    email: user?.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date(),
    ...additional
  };
  
  logger.info('Auth Event', logData);
  
  // In production, you might want to send this to a security monitoring service
  return logData;
};