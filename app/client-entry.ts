export const clientEntryHref =
  process.env.NODE_ENV === 'development'
    ? '/assets/app/assets/entry.ts'
    : '/assets/entry.js'
