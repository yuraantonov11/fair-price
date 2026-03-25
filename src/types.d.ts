/// <reference types="vite/client" />

declare global {
    interface Window {
        dataLayer: any[];
    }
}

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}