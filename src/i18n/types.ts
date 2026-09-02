/**
 * Type-safe message keys via next-intl AppConfig.
 *
 * Currently disabled because the codebase uses dynamic key construction
 * (e.g., `t('foo' + someVar + '.bar')`) which doesn't fit the strict
 * type system. Re-enable when all dynamic calls are converted to use
 * proper namespacing.
 */
// declare module 'next-intl' {
//   interface AppConfig {
//     Messages: typeof messages;
//   }
// }

export {};
