/// <reference types="vite/client" />

/** Vite raw imports (§84.15): TODO.md is loaded verbatim as text for the Deviations workspace. */
declare module '*?raw' {
  const content: string
  export default content
}
