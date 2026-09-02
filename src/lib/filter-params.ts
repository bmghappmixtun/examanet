import {
  parseAsString,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsStringEnum,
} from 'nuqs';

// ============== PARSERS ==============
// Use a special null/empty string handling: empty string means "no value"
const emptyStringToUndefined = (v: string | null) => (v === null || v === '' ? undefined : v);

export const filterParsers = {
  // Free-text search
  q: parseAsString.withDefault(''),

  // Multi-select filters
  type: parseAsArrayOf(parseAsString).withDefault([]),
  class: parseAsArrayOf(parseAsString).withDefault([]),
  section: parseAsArrayOf(parseAsString).withDefault([]),
  subject: parseAsArrayOf(parseAsString).withDefault([]),
  trimestre: parseAsArrayOf(parseAsString).withDefault([]),
  year: parseAsArrayOf(parseAsString).withDefault([]),
  language: parseAsArrayOf(parseAsString).withDefault([]),

  // Boolean toggles
  hasCorrection: parseAsBoolean.withDefault(false),

  // Single-value filters
  teacherId: parseAsString.withDefault(''),

  // Sort
  sort: parseAsStringEnum(['recent', 'popular', 'downloads', 'rating', 'oldest']).withDefault(
    'recent',
  ),

  // Pagination
  page: parseAsInteger.withDefault(1),

  // View (grid/list)
  view: parseAsStringEnum(['grid', 'list']).withDefault('grid'),
};

// ============== URL SERIALIZATION ==============
// Custom serializer: only include non-default values to keep URLs clean
export function serializeFilters(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'boolean' && value === false) continue;
    if (typeof value === 'number' && value === 1 && key === 'page') continue;
    if (value === 'recent' && key === 'sort') continue;
    if (value === 'grid' && key === 'view') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, String(v)));
    } else {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

// ============== ACTIVE FILTER COUNT ==============
type FilterValues = {
  q: string;
  type: string[];
  class: string[];
  section: string[];
  subject: string[];
  trimestre: string[];
  year: string[];
  language: string[];
  hasCorrection: boolean;
  teacherId: string;
  sort: string;
  page: number;
  view: string;
};

export function countActiveFilters(values: FilterValues): number {
  let n = 0;
  if (values.q) n++;
  n += values.type.length;
  n += values.class.length;
  n += values.section.length;
  n += values.subject.length;
  n += values.trimestre.length;
  n += values.year.length;
  n += values.language.length;
  if (values.hasCorrection) n++;
  if (values.teacherId) n++;
  return n;
}
