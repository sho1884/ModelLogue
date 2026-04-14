/// <reference types="vite/client" />

// Allow importing text files as raw strings via Vite's ?raw suffix.
declare module '*.ebnf?raw' {
  const content: string;
  export default content;
}
