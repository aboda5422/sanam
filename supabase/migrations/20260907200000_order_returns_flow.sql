-- Must be committed before using enum value 'return' in later migration
ALTER TYPE public.complaint_type ADD VALUE IF NOT EXISTS 'return';
