-- Keep only the 3 canonical Sanam branches; delete duplicates
-- Keep: riyadh-rimal, makkah-sharia-7, makkah-sharia-5

DELETE FROM public.branches
WHERE slug NOT IN ('riyadh-rimal', 'makkah-sharia-7', 'makkah-sharia-5');
