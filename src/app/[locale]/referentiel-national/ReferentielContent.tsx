'use client';

import { useEffect } from 'react';

/**
 * Client wrapper that renders pre-extracted HTML and mounts its inline
 * scripts as proper <script> tags. We extract scripts on the server and
 * render them here (instead of putting them inside dangerouslySetInnerHTML
 * and re-executing them client-side) so that:
 *   1. The browser executes each script exactly once (no redeclaration
 *      errors when SSR + client re-injection both fire).
 *   2. Top-level `const`/`let` declarations don't collide between
 *      multiple script blocks.
 */
export default function ReferentielContent({
  html,
  scripts = [],
}: {
  html: string;
  scripts?: string[];
}) {
  useEffect(() => {
    // Some of the page logic wires up event listeners on DOM nodes that
    // exist at SSR time. The scripts above already run during hydration,
    // so this effect is intentionally a no-op placeholder for future
    // client-only side effects (e.g. lazy loaders, analytics).
  }, [html]);

  return (
    <div id="referentiel-body" dangerouslySetInnerHTML={{ __html: html }}>
      {scripts.map((code, idx) => (
        // eslint-disable-next-line react/no-danger
        <script
          key={`ref-script-${idx}`}
          dangerouslySetInnerHTML={{ __html: code }}
        />
      ))}
    </div>
  );
}
