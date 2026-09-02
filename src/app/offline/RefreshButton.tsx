'use client';

import { RefreshCw } from 'lucide-react';

export default function RefreshButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition min-h-[44px]"
    >
      <RefreshCw className="w-4 h-4" />
      Réessayer
    </button>
  );
}
