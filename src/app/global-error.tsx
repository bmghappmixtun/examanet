'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/client-reporter';
import { generateErrorReference } from '@/lib/errors/types';

/**
 * Global error boundary (CLOUDFLARE POC — feature/cf-isolated)
 *
 * Catches errors that occur in the root layout itself.
 * Renders WITHOUT the layout (no Header/Footer), so we keep this self-contained
 * with inline styles (no Tailwind, no external imports that might fail).
 *
 * On CF Workers, the layout itself can throw if Prisma can't load. Instead of
 * showing a scary "Erreur critique" page, we show a quiet "Loading" state.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = error.digest || generateErrorReference();

  useEffect(() => {
    reportClientError({
      message: error.message || 'Unknown global error',
      stack: error.stack,
      component: 'app/global-error.tsx',
      action: 'render',
      severity: 'CRITICAL',
      data: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="fr">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        minHeight: '100vh',
      }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>

            <h1 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 12px',
            }}>
              Chargement en cours…
            </h1>

            <p style={{
              fontSize: '16px',
              color: '#475569',
              margin: '0 0 32px',
              lineHeight: 1.6,
            }}>
              Le contenu se charge. Si cette page reste vide plus de 30 secondes, essayez de recharger.
            </p>

            <button
              onClick={() => reset()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0EA5E9 0%, #0284c7 100%)',
                color: '#ffffff',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                minHeight: '44px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
