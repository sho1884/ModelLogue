/// <reference types="vite/client" />

// Allow importing text files as raw strings via Vite's ?raw suffix.
declare module '*.ebnf?raw' {
  const content: string;
  export default content;
}

// Build-time JST timestamp injected by vite.config.ts `define` (shown in the
// header so users / bug-reporters can identify the running build).
declare const __BUILD_TIME__: string;
