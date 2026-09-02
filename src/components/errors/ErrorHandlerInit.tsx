'use client';

import { useEffect } from 'react';
import { installGlobalErrorHandlers } from '@/lib/errors/client-reporter';

/**
 * Install global client error handlers
 * Mount this once in the root layout
 */
export default function ErrorHandlerInit() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return null;
}
