// Empty placeholder used by vitest to satisfy the `server-only` import in lib/blob-storage.ts.
// This file is committed because vitest's resolver needs a real path to alias to.
// It has no runtime effect — `import 'server-only'` is a marker for Next.js,
// and vitest runs the tests in jsdom where the marker is meaningless.
export {};
