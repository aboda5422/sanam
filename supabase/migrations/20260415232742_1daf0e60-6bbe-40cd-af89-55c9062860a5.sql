
CREATE TABLE public.driver_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, user_id)
);

ALTER TABLE public.driver_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can rate their orders" ON public.driver_ratings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own ratings" ON public.driver_ratings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all ratings" ON public.driver_ratings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'store_admin') OR has_role(auth.uid(), 'site_admin'));

CREATE POLICY "Admins can manage ratings" ON public.driver_ratings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'store_admin') OR has_role(auth.uid(), 'site_admin'));
