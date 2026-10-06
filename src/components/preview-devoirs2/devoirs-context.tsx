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
  // Clear known params first
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

export function DevoirsFilterProvider({ children, initialCycle }: { children: ReactNode; initialCycle?: string | null }) {
  // IMPORTANT: Initialize with DEFAULT on both server AND client to avoid
  // hydration mismatch. The URL has classSlug=7eme? Server renders no pill,
  // client would render "7ème année de base" → React #425 crash.
  // Sync from URL AFTER mount in useEffect.
  // initialCycle (from server-rendered searchParams) takes precedence on
  // first paint to align server/client output and avoid hydration mismatches.
  const [state, setState] = useState<FilterState>({
    ...DEFAULT_STATE,
    cycle: initialCycle || null,
  });

  // On mount: read URL once (URL takes precedence over initialCycle)
  useEffect(() => {
    const fromUrl = getFromUrl();
    setState(fromUrl);
  }, []);

  const update = useCallback((patch: Partial<FilterState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeToUrl(next);
      return next;
    });
  }, []);

  // Sync from URL on popstate (back/forward buttons)
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

export function useDevoirsContext(): FilterContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDevoirsContext must be used inside DevoirsFilterProvider');
  return v;
}
