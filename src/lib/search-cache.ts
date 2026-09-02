// @ts-nocheck
import { prisma } from './prisma';
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
 * Replaces prisma.searchSynonym.findMany() per search.
 */
export const getAllSynonyms = unstable_cache(
  async (): Promise<Synonym[]> => {
    return prisma.searchSynonym.findMany({
      select: { term: true, synonyms: true },
    });
  },
  ['all-synonyms'],
  { revalidate: 300, tags: ['search'] }
);

/**
 * Resolve subject slugs to IDs in one query.
 * Replaces prisma.subject.findMany() per search.
 */
export const resolveSubjectSlugs = unstable_cache(
  async (slugs: string[]): Promise<SubjectLookup[]> => {
    if (!slugs.length) return [];
    return prisma.subject.findMany({
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
    return prisma.class.findMany({
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
    return prisma.section.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
  },
  ['resolve-sections'],
  { revalidate: 300, tags: ['search'] }
);
