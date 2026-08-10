INSERT INTO public.user_roles (user_id, role) VALUES 
  ('e224cf1b-0ff2-4b9c-8873-f84148c88bb7', 'driver'),
  ('e224cf1b-0ff2-4b9c-8873-f84148c88bb7', 'store_admin'),
  ('e224cf1b-0ff2-4b9c-8873-f84148c88bb7', 'customer')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.drivers (user_id, phone, vehicle_type, is_available)
VALUES ('e224cf1b-0ff2-4b9c-8873-f84148c88bb7', '0530233395', 'car', true)
ON CONFLICT DO NOTHING;