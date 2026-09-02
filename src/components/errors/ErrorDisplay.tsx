'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft, Home, Mail, Loader2 } from 'lucide-react';
import { reportClientError } from '@/lib/errors/client-reporter';

interface ErrorDisplayProps {
  // The error reference ID (shown to user)
  reference?: string;
  // The error title
  title?: string;
  // The error message (user-facing)
  message?: string;
  // Show the "go back" button
  showBack?: boolean;
  // Show the "home" button
  showHome?: boolean;
  // Compact mode (for inline errors)
  compact?: boolean;
}

export default function ErrorDisplay({
  reference,
  title = 'Quelque chose s\'est mal passé',
  message = 'Une erreur inattendue s\'est produite. Notre équipe a été notifiée automatiquement.',
  showBack = true,
  showHome = true,
  compact = false,
}: ErrorDisplayProps) {
  const [reportingState, setReportingState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  // Report the error to the server on mount
  useEffect(() => {
    if (!reference) return;
    // Already reported by the boundary; just show feedback
  }, [reference]);

  const handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-600 mb-4 max-w-md">{message}</p>
        {reference && (
          <code className="text-xs font-mono text-slate-500 mb-4">
            Réf: {reference}
          </code>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center">
        {/* Animated icon */}
        <div className="relative inline-block mb-6">
          <div className="absolute inset-0 bg-red-200 rounded-full blur-2xl opacity-50 animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center mx-auto shadow-lg">
            <AlertTriangle className="w-12 h-12 text-red-600" aria-hidden="true" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
          {title}
        </h1>

        {/* Message */}
        <p className="text-base sm:text-lg text-slate-600 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Reference ID */}
        {reference && (
          <div className="mb-8 inline-block">
            <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2">
              <p className="text-xs text-slate-500 mb-1">Référence de l'incident</p>
              <code className="text-sm font-mono font-bold text-slate-900 tracking-wider">
                {reference}
              </code>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-primary-600 hover:to-primary-700 transition-all min-h-[44px]"
          >
            <RefreshCw className="w-5 h-5" />
            Réessayer
          </button>

          {showBack && (
            <button
              onClick={handleBack}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              Page précédente
            </button>
          )}

          {showHome && (
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all min-h-[44px]"
            >
              <Home className="w-5 h-5" />
              Accueil
            </Link>
          )}
        </div>

        {/* Help */}
        <div className="border-t border-slate-200 pt-6">
          <p className="text-sm text-slate-500 mb-2">
            Le problème persiste ?
          </p>
          <a
            href="mailto:contact@examanet.com"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition"
          >
            <Mail className="w-4 h-4" />
            Contacter le support
          </a>
          <p className="text-xs text-slate-400 mt-2">
            Mentionnez la référence <strong>{reference}</strong> pour une aide rapide
          </p>
        </div>
      </div>
    </div>
  );
}
