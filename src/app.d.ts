/// <reference types="@sveltejs/kit" />

// Svelte 5 ambient type declarations
declare module '*.svelte' {
  import type { ComponentType, SvelteComponent } from 'svelte';
  const component: ComponentType<SvelteComponent>;
  export default component;
}

// Web Worker module declarations
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

// Vite env
interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_API_KEY: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  readonly PUBLIC_FIREBASE_DATABASE_URL: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly PUBLIC_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}