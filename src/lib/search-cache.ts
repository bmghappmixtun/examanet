// @ts-nocheck
import { db } from './d1-admin';
import { unstable_cache } from 'next/cache';

/**
 * Cached lookups for search filters.
 * These rarely change (admin adds subjects/classes occasionally)
 * so we cache them for 5 minutes.
 */

interface Synonym { term: string; synonyms: string[] }
interface SubjectLookup { id: string; slug: string }
interface ClassLookup { id: string; slug: string }
interface SectionLookup { id: string; slug: string }

/**
 * Fetch all synonyms from DB. Cached for 5 min.
 * Replaces db.searchSynonym.findMany() per search.
 */
export const getAllSynonyms = unstable_cache(
  async (): Promise<Synonym[]> => {
    return db.searchSynonym.findMany({
      select: { term: true, synonyms: true },
    });
  },
  ['all-synonyms'],
  { revalidate: 300, tags: ['search'] }
);

/**
 * Resolve subject slugs to IDs in one query.
 * Replaces db.subject.findMany() per search.
 */
export const resolveSubjectSlugs = unstable_cache(
  async (slugs: string[]): Promise<SubjectLookup[]> => {
    if (!slugs.length) return [];
    return db.subject.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
  },
  ['resolve-subjects'],
  { revalidate: 300, tags: ['search'] }
);

/**
 * Resolve class slugs to IDs in one query.
 */
export const resolveClassSlugs = unstable_cache(
  async (slugs: string[]): Promise<ClassLookup[]> => {
    if (!slugs.length) return [];
    return db.class.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
  },
  ['resolve-classes'],
  { revalidate: 300, tags: ['search'] }
);

/**
 * Resolve section slugs to IDs in one query.
 */
export const resolveSectionSlugs = unstable_cache(
  async (slugs: string[]): Promise<SectionLookup[]> => {
    if (!slugs.length) return [];
    return db.section.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
  },
  ['resolve-sections'],
  { revalidate: 300, tags: ['search'] }
);
