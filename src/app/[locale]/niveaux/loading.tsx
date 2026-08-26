// Page-level loading: return null instead of showing spinner
// The [locale]/loading.tsx shows "Chargement en cours" but that doesn't
// resolve on CF Workers + OpenNext for this page. Returning null means
// the server-rendered content is shown immediately when ready.
export default function Loading() {
  return null;
}
