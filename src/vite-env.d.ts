/// <reference types="vite/client" />

// Global vendor libraries loaded via <script> tags
declare const JSZip: any;
declare const ImageTracer: any;

// Vite raw imports for shader files
declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

declare module '*.vert?raw' {
  const content: string;
  export default content;
}

declare module '*.frag?raw' {
  const content: string;
  export default content;
}

declare module '*.glsl?raw' {
  const content: string;
  export default content;
}
