
-- Create storage bucket for product and category images
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);

-- Anyone can view images
CREATE POLICY "Anyone can view images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- Admins can upload images
CREATE POLICY "Admins can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images'
  AND (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
  )
);

-- Admins can update images
CREATE POLICY "Admins can update images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'images'
  AND (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
  )
);

-- Admins can delete images
CREATE POLICY "Admins can delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'images'
  AND (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
  )
);
