/**
 * Shared Facets type for resource filtering
 * Used by /api/ressources route and /ressources page + FilterShell client component
 */
export interface Facets {
  byType: Record<string, number>;
  byTrimestre: Record<string, number>;
  byYear: Record<string, number>;
  byLanguage: Record<string, number>;
  byClass: Record<string, number>;
  bySection: Record<string, number>;
  bySubject: Record<string, number>;
  withCorrection: number;
  collegePilote: number;
  collegeOrdinaire: number;
  lyceePilote: number;
  lyceeOrdinaire: number;
}

export interface RessourcesResponse {
  resources: any[];
  total: number;
  totalPages: number;
  currentPage: number;
  facets: Facets;
  // Display name maps: slug → human-readable name (per locale)
  // Used by the filter sidebar to show 'Sciences' instead of 'sciences'
  nameMaps?: {
    class?: Record<string, string>;
    section?: Record<string, string>;
    subject?: Record<string, string>;
  };
}
console.log('Build timestamp:', new Date().toISOString());
