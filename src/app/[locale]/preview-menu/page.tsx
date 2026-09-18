import { redirect } from 'next/navigation';

/**
 * /preview-menu — landing page that shows links to all 5 variants
 */
export default function PreviewMenuIndex() {
  // Default redirect to variant 1
  redirect('/fr/preview-menu/1');
}
