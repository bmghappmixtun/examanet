import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives.
 *
 * These wrap Next.js navigation APIs to auto-handle locale prefixes.
 * - <Link href="/matieres"> in /ar/ → goes to /ar/matieres
 * - <Link locale="fr" href="/matieres"> switches to FR
 * - redirect() preserves locale
 * - usePathname() returns pathname WITHOUT the locale prefix
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
