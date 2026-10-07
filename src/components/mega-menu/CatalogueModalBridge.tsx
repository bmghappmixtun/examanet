'use client';

/**
 * CatalogueModalBridge — Lesson #94 pattern (CustomEvent, no function props).
 *
 * Mounts an always-on MenuMatieresCollegeLycee whose state is driven by a
 * window CustomEvent 'examanet:catalogue-open'. Mobile menu's "Catalogue"
 * button dispatches this event to open the modal without passing a
 * function prop across the server/client boundary.
 */

import { useEffect, useState } from 'react';
import MenuMatieresCollegeLycee from './MenuMatieresCollegeLycee';

export default function CatalogueModalBridge() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('examanet:catalogue-open', onOpen);
    return () => window.removeEventListener('examanet:catalogue-open', onOpen);
  }, []);

  return (
    <MenuMatieresCollegeLycee
      headless
      open={open}
      onOpenChange={setOpen}
    />
  );
}