---
name: Driver Interface
description: واجهة مندوب التوصيل - صفحات وجداول وخرائط جوجل
type: feature
---

## الصفحات
- `/driver/login` - تسجيل دخول المندوب (تحقق من الدور)
- `/driver` - لوحة تحكم مع إحصائيات وحالة الاستقبال
- `/driver/orders` - طلبات متاحة + طلباتي (tabs)
- `/driver/order/:id` - تفاصيل الطلب مع خريطة جوجل وتتبع
- `/driver/history` - سجل الطلبات السابقة
- `/driver/earnings` - الأرباح والإحصائيات
- `/driver/profile` - بيانات المندوب

## الجداول
- `user_roles` - أدوار المستخدمين (customer, driver, store_admin, site_admin)
- `drivers` - بيانات المندوب (موقع، تقييم، أرباح)
- `orders` - الطلبات مع إحداثيات GPS
- `order_items` - عناصر الطلب

## حالات الطلب
pending → assigned → preparing → on_the_way → delivered/cancelled

## خرائط جوجل
- المفتاح محفوظ كـ GOOGLE_MAPS_API_KEY (backend secret)
- edge function `get-maps-key` يوفر المفتاح للفرونتند
- تتبع موقع المندوب realtime + اتجاهات للعميل
