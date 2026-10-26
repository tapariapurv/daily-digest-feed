// Public by design: the publishable key only identifies the project to Supabase Auth.
// App data is never reachable with it (tables live in a private schema).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://plwxqndxlpqtayipltwz.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_POdiYebPd7OLrsy4WUoUxQ_QABsz9jl';
