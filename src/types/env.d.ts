interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
    readonly VITE_BASELINE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}