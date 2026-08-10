
-- 1. BRANCHES
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view branches" ON public.branches FOR SELECT USING (true);
CREATE POLICY "Admins can manage branches" ON public.branches FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.branches (name, address, lat, lng, phone) VALUES
  ('المركز الرئيسي - حي الوسام', 'شارع ثعلبة بن أوس، حي الوسام، خميس مشيط', 18.3433, 42.7669, '0530909751'),
  ('فرع حي شباعة', 'حي شباعة، خميس مشيط', 18.3284, 42.7275, '0530233395');

-- 2. CATEGORIES
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  image TEXT,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. PRODUCTS
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  original_price NUMERIC,
  image TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'قطعة',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_featured ON public.products(is_featured) WHERE is_featured = true;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. BRANCH INVENTORY
CREATE TABLE public.branch_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view inventory" ON public.branch_inventory FOR SELECT USING (true);
CREATE POLICY "Admins can manage inventory" ON public.branch_inventory FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE TRIGGER update_branch_inventory_updated_at BEFORE UPDATE ON public.branch_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. UPDATE ORDERS
ALTER TABLE public.orders
  ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN collected_amount NUMERIC NOT NULL DEFAULT 0;

-- 6. DRIVER WALLET
CREATE TABLE public.driver_wallet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  total_collected NUMERIC NOT NULL DEFAULT 0,
  total_commission NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC NOT NULL DEFAULT 0.10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers view own wallet" ON public.driver_wallet FOR SELECT USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()));
CREATE POLICY "Admins view all wallets" ON public.driver_wallet FOR SELECT USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE POLICY "Admins manage wallets" ON public.driver_wallet FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE TRIGGER update_driver_wallet_updated_at BEFORE UPDATE ON public.driver_wallet FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. WALLET TRANSACTIONS
CREATE TYPE public.wallet_transaction_type AS ENUM ('collection', 'commission', 'settlement');
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  type public.wallet_transaction_type NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers view own transactions" ON public.wallet_transactions FOR SELECT USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()));
CREATE POLICY "Admins view all transactions" ON public.wallet_transactions FOR SELECT USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE POLICY "Admins manage transactions" ON public.wallet_transactions FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE INDEX idx_wallet_transactions_driver ON public.wallet_transactions(driver_id);

-- 8. COMPLAINTS
CREATE TYPE public.complaint_type AS ENUM ('complaint', 'inquiry');
CREATE TYPE public.complaint_status AS ENUM ('open', 'in_progress', 'resolved');
CREATE TABLE public.complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  type public.complaint_type NOT NULL DEFAULT 'complaint',
  message TEXT NOT NULL,
  status public.complaint_status NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  replied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own complaints" ON public.complaints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create complaints" ON public.complaints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all complaints" ON public.complaints FOR SELECT USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE POLICY "Admins manage complaints" ON public.complaints FOR ALL USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
CREATE TRIGGER update_complaints_updated_at BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_inventory;
