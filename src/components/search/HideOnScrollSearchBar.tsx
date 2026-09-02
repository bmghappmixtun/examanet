'use client';
import { useEffect, useState } from 'react';
import SearchBar from './SearchBar';

export default function HideOnScrollSearchBar({ initialQuery = '' }: { initialQuery?: string }) {
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    function onScroll() {
      const currentY = window.scrollY;
      // Always show at top
      if (currentY < 80) {
        setVisible(true);
      } else if (currentY > lastScrollY + 4) {
        // Scrolling down → hide
        setVisible(false);
      } else if (currentY < lastScrollY - 4) {
        // Scrolling up → show
        setVisible(true);
      }
      setLastScrollY(currentY);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [lastScrollY]);

  return (
    <div
      className={`sticky top-20 z-30 bg-white border-b border-slate-200 shadow-sm transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="py-4">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <SearchBar size="md" initialQuery={initialQuery} />
        </div>
      </div>
    </div>
  );
}
