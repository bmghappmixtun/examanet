'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import ViewToggle, { ViewMode } from './ViewToggle';
import { safeSetItem } from '@/lib/safeStorage';

export default function ResourcesViewClient({
  currentView,
  sp,
}: {
  currentView: ViewMode;
  sp: Record<string, any>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleViewChange = (mode: ViewMode) => {
    // safeSetItem is a no-op when localStorage is unavailable (Safari private
    // mode, third-party iframe contexts) — keeps the toggle responsive
    // without throwing ERR-3EU598.
    safeSetItem('resources-view', mode);
    // Update URL
    const params = new URLSearchParams(searchParams);
    if (mode === 'grid') params.delete('view');
    else params.set('view', mode);
    startTransition(() => {
      router.push(`/ressources?${params.toString()}`);
    });
  };

  return <ViewToggle mode={currentView} onChange={handleViewChange} />;
}
