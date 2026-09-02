// @ts-nocheck
/**
 * Wrapper for API route handlers
 * Catches errors, logs them with the global error logger, returns user-friendly response
 *
 * Usage:
 *   import { withErrorHandler } from '@/lib/errors/with-error-handler';
 *
 *   export const GET = withErrorHandler(async (req) => {
 *     const data = await prisma.user.findMany();
 *     return NextResponse.json(data);
 *   }, { action: 'list-users' });
 *
 *   export const POST = withErrorHandler(async (req) => {
 *     const body = await req.json();
 *     // ...
 *   }, { action: 'create-user' });
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from './logger';
import { generateErrorReference, getUserFacingMessage } from './types';
import { getCurrentUser } from '@/lib/auth';

type Handler<P = unknown> = (req: NextRequest, ctx: P) => Promise<Response> | Response;

interface WithErrorHandlerOptions<P> {
  // Action name for logging
  action: string;
  // Whether the endpoint requires auth (default: false)
  requireAuth?: boolean;
  // Custom context extractor
  getContext?: (req: NextRequest, ctx: P) => Record<string, unknown>;
}

export function withErrorHandler<P = unknown>(
  handler: Handler<P>,
  options: WithErrorHandlerOptions<P>
) {
  return async (req: NextRequest, ctx: P): Promise<Response> => {
    const reference = generateErrorReference();
    let userId: string | undefined;
    let userEmail: string | undefined;

    try {
      // Optional auth check
      if (options.requireAuth) {
        const user = await getCurrentUser();
        if (!user) {
          return NextResponse.json(
            { error: 'Non autorisé', reference },
            { status: 401 }
          );
        }
        userId = user.id;
        userEmail = user.email;
      } else {
        // Try to identify user if available
        try {
          const user = await getCurrentUser();
          if (user) {
            userId = user.id;
            userEmail = user.email;
          }
        } catch {
          // ignore
        }
      }

      return await handler(req, ctx);
    } catch (err: any) {
      // Log the error
      const customContext = options.getContext?.(req, ctx) || {};
      console.error(`[${reference}] ${options.action}:`, err);

      // Capture Vercel request ID for correlation with VercelLog
      // Vercel adds these headers to every request:
      //   x-vercel-id: unique request ID (e.g. "fra1::abc123")
      //   x-vercel-forwarded-for: client IP
      const vercelRequestId = req.headers.get('x-vercel-id') || undefined;
      const vercelRegion = req.headers.get('x-vercel-ip-region') || undefined;
      const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

      await logError({
        reference,
        source: 'SERVER',
        severity: 'ERROR',
        message: err?.message || 'Unknown error',
        stack: err?.stack,
        url: req.url,
        method: req.method,
        userAgent: req.headers.get('user-agent') || undefined,
        requestId: vercelRequestId,
        region: vercelRegion,
        context: {
          action: options.action,
          userId,
          userEmail,
          ip: forwardedFor,
          ...customContext,
        },
        sendEmail: !!userEmail,
      });

      return NextResponse.json(
        {
          error: getUserFacingMessage(err),
          reference,
        },
        { status: 500 }
      );
    }
  };
}
