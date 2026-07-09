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

// Vite / Cloudflare env — public vars
interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_API_KEY: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  readonly PUBLIC_FIREBASE_DATABASE_URL: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly PUBLIC_FIREBASE_APP_ID: string;
  readonly PUBLIC_R2_PUBLIC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cloudflare Pages platform env (server-side only)
declare global {
  namespace App {
    interface Platform {
      env: {
        // Public (also available via import.meta.env on client)
        PUBLIC_FIREBASE_API_KEY: string;
        PUBLIC_FIREBASE_AUTH_DOMAIN: string;
        PUBLIC_FIREBASE_DATABASE_URL: string;
        PUBLIC_FIREBASE_PROJECT_ID: string;
        PUBLIC_FIREBASE_STORAGE_BUCKET: string;
        PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
        PUBLIC_FIREBASE_APP_ID: string;
        PUBLIC_R2_PUBLIC_URL: string;

        // Secrets (server-only)
        FIREBASE_PROJECT_ID: string;
        FIREBASE_CLIENT_EMAIL: string;
        FIREBASE_PRIVATE_KEY: string;
        R2_ACCOUNT_ID: string;
        R2_ACCESS_KEY_ID: string;
        R2_SECRET_ACCESS_KEY: string;
        R2_BUCKET_NAME: string;
      };
    }
  }
}

export {};