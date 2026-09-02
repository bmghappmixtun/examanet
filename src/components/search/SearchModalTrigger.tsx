'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import SearchModal from './SearchModal';

/**
 * SearchModalTrigger — renders a search icon button. On click, opens
 * the big SearchModal. Listens for the global ⌘K / Ctrl+K shortcut.
 *
 * Mounted in the header on all viewports (replaces both HoverSearchBar
 * and MobileSearchTrigger).
 */
export default function SearchModalTrigger() {
  const [open, setOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="p-2 sm:p-2.5 rounded-full text-slate-500 hover:bg-primary-50 hover:text-primary-600 transition"
        aria-label="Rechercher (Ctrl+K)"
        title="Rechercher (Ctrl+K)"
      >
        <Search className="w-5 h-5" />
      </button>
      <SearchModal open={open} onClose={closeModal} />
    </>
  );
}
