'use client';

import { useEffect } from 'react';
import { installGlobalErrorHandlers } from '@/lib/errors/client-reporter';

/**
 * Install global client error handlers
 * Mount this once in the root layout
 *
 * TEMP DEBUG: Also capture React hydration errors with full stack trace
 * to help identify the exact source of #418/#423/#425 hydration mismatches.
 */
export default function ErrorHandlerInit() {
  useEffect(() => {
    installGlobalErrorHandlers();
    
    // TEMP: Capture all errors with React stack traces
    const origError = window.onerror;
    window.onerror = function(msg, url, line, col, err) {
      // Check if this is a React hydration error
      if (typeof msg === 'string' && (msg.includes('Minified React error') || msg.includes('Hydration'))) {
        const stack = err?.stack || 'no stack';
        const firstFrame = stack.split('\n').slice(0, 3).join(' | ').slice(0, 500);
        
        // Capture and report to server
        fetch('/api/errors/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'CLIENT',
            severity: 'CRITICAL',
            component: 'hydration-error-trace',
            action: 'mismatch',
            message: msg.slice(0, 500),
            stack: stack.slice(0, 2000),
            url,
            line,
            col,
            data: {
              firstFrame,
              pathname: location.pathname,
              userAgent: navigator.userAgent.slice(0, 100),
              bodyClass: document.body.className,
              htmlAttrs: {
                lang: document.documentElement.lang,
                dir: document.documentElement.dir,
              },
            },
          }),
          keepalive: true,
        }).catch(() => {});
      }
      
      if (origError) return origError.call(this, msg, url, line, col, err);
      return false;
    };
  }, []);

  return null;
}
