'use client';
/**
 * Cloudflare Turnstile widget wrapper.
 * 
 * 2026-09-07: Added in response to bot traffic on /recherche.
 * Set TURNSTILE_SITE_KEY env var to enable.
 * If not set, the component renders nothing (graceful degradation).
 * 
 * Usage:
 *   <Turnstile onVerify={(token) => setToken(token)} />
 * 
 * Then send the token in your form: token=<turnstile-token>
 * Verify server-side with: POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: any;
  }
}

export default function Turnstile({
  onVerify,
  theme = 'light',
  className = '',
}: {
  onVerify: (token: string) => void;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    // Load Turnstile script if not already loaded
    if (!window.turnstile) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      
      script.onload = () => {
        renderWidget();
      };
    } else {
      renderWidget();
    }

    function renderWidget() {
      if (containerRef.current && window.turnstile) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => onVerify(token),
        });
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey, theme, onVerify]);

  if (!siteKey) return null;

  return <div ref={containerRef} className={className} />;
}
