-- Must be committed before using the new enum value in later statements
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'order_preparer';
