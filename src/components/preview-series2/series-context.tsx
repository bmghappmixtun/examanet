'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface FilterState {
  classSlug: string | null;
  trimestre: string | null;
  subtype: string | null;
  number: string | null;
  sortMode: string;
  cycle: string | null;
}

interface FilterContext extends FilterState {
  setClass: (slug: string | null) => void;
  setTrimestre: (tri: string | null) => void;
  setType: (subtype: string | null, number: string | null) => void;
  setSort: (s: string) => void;
  setCycle: (c: string | null) => void;
  clearAll: () => void;
}

const Ctx = createContext<FilterContext | null>(null);

function getFromUrl(): FilterState {
  if (typeof window === 'undefined') {
    return { classSlug: null, trimestre: null, subtype: null, number: null, sortMode: 'recent', cycle: null };
  }
  const sp = new URLSearchParams(window.location.search);
  return {
    classSlug: sp.get('classSlug') || sp.get('class'),
    trimestre: sp.get('trimestre'),
    subtype: sp.get('subtype'),
    number: sp.get('number'),
    sortMode: sp.get('sort') || 'recent',
    cycle: sp.get('cycle'),
  };
}

function writeToUrl(state: FilterState) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const k of ['classSlug', 'class', 'trimestre', 'subtype', 'number', 'sort', 'cycle']) {
    url.searchParams.delete(k);
  }
  if (state.classSlug) url.searchParams.set('classSlug', state.classSlug);
  if (state.trimestre) url.searchParams.set('trimestre', state.trimestre);
  if (state.subtype) url.searchParams.set('subtype', state.subtype);
  if (state.number) url.searchParams.set('number', state.number);
  if (state.sortMode && state.sortMode !== 'recent') url.searchParams.set('sort', state.sortMode);
  if (state.cycle) url.searchParams.set('cycle', state.cycle);
  window.history.replaceState(null, '', url.toString());
}

const DEFAULT_STATE: FilterState = {
  classSlug: null,
  trimestre: null,
  subtype: null,
  number: null,
  sortMode: 'recent',
  cycle: null,
};

export function SeriesFilterProvider({ children, initialCycle }: { children: ReactNode; initialCycle?: string | null }) {
  const [state, setState] = useState<FilterState>({
    ...DEFAULT_STATE,
    cycle: initialCycle || null,
  });

  useEffect(() => {
    setState(getFromUrl());
  }, []);

  const update = useCallback((patch: Partial<FilterState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeToUrl(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onPop = () => setState(getFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value: FilterContext = {
    ...state,
    setClass: (slug) => update({ classSlug: slug, trimestre: null, subtype: null, number: null }),
    setTrimestre: (tri) => update({ trimestre: tri, subtype: null, number: null }),
    setType: (subtype, number) => update({ subtype, number }),
    setSort: (s) => update({ sortMode: s }),
    setCycle: (c) => update({ cycle: c, classSlug: null, trimestre: null, subtype: null, number: null }),
    clearAll: () => update({ trimestre: null, subtype: null, number: null }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSeriesContext(): FilterContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSeriesContext must be used inside SeriesFilterProvider');
  return v;
}