import { createClient } from '@supabase/supabase-js';

// ЗАМІНИ НА СВОЇ ДАНІ З SUPABASE
const supabaseUrl = 'https://mdqcjgxpvvknpehuqrhl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcWNqZ3hwdnZrbnBlaHVxcmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTA4MDcsImV4cCI6MjA4OTU4NjgwN30.FQ6fH62qThJ6S0FvmU2ZYkcfOvFi3y5cxoPQ1f1hNr4';

export const supabase = createClient(supabaseUrl, supabaseKey);