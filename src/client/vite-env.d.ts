/// <reference types="vite/client" />

// TypeScript 6 refuses a side-effect import it has no declaration for, and
// neither Vite's client types nor tldraw ship one for a bare `.css` specifier.
// Both imports are real and load through Vite's CSS pipeline at build time.
declare module '*.css'
