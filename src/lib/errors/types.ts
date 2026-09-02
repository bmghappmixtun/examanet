/**
 * Global error types for Examanet
 * Used by error boundaries, API handlers, and the logging endpoint
 */

export type ErrorSource = 'CLIENT' | 'SERVER' | 'BUILD' | 'CRON' | 'EXTERNAL';
export type ErrorSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface ErrorContext {
  // Component name (for client errors)
  component?: string;
  // Action that triggered the error
  action?: string;
  // Additional data (form values, props, etc.)
  data?: Record<string, unknown>;
  // User ID (server side)
  userId?: string;
  // User email (server side)
  userEmail?: string;
  // Custom fields
  [key: string]: unknown;
}

export interface ErrorReport {
  // Short reference ID (auto-generated if missing)
  reference?: string;
  // Type of error
  source: ErrorSource;
  // Severity (default: ERROR)
  severity?: ErrorSeverity;
  // Error message
  message: string;
  // Stack trace (optional)
  stack?: string;
  // URL where error occurred
  url?: string;
  // HTTP method
  method?: string;
  // User agent
  userAgent?: string;
  // Vercel request ID for correlation with VercelLog
  requestId?: string;
  // Vercel region (e.g. 'fra1')
  region?: string;
  // Additional context
  context?: ErrorContext;
  // Whether to send email
  sendEmail?: boolean;
}

/**
 * Generate a short human-readable reference ID
 * Format: ERR-XXXXXX (6 alphanumeric chars, uppercase, no ambiguous chars)
 */
export function generateErrorReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I/L
  let result = 'ERR-';
  for (let i = 0; i < 6; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/**
 * Sanitize error message for user display
 * Removes stack traces, file paths, internal details
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Une erreur inattendue s\'est produite';
  // Truncate to 200 chars
  if (message.length > 200) {
    return message.substring(0, 197) + '...';
  }
  return message;
}

/**
 * Extract user-friendly error message from various error types
 */
export function getUserFacingMessage(err: unknown): string {
  if (!err) return 'Une erreur inattendue s\'est produite';
  if (typeof err === 'string') return sanitizeErrorMessage(err);
  if (err instanceof Error) {
    return sanitizeErrorMessage(err.message || 'Une erreur est survenue');
  }
  if (typeof err === 'object' && err !== null) {
    const obj = err as any;
    if (typeof obj.message === 'string') return sanitizeErrorMessage(obj.message);
    if (typeof obj.error === 'string') return sanitizeErrorMessage(obj.error);
  }
  return 'Une erreur inattendue s\'est produite';
}
