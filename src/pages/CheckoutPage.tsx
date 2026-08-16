import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Clock, CheckCircle, CreditCard, Banknote, Loader2, Pencil, Lock } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCart } from "@/contexts/CartContext";
import { useBranch } from "@/contexts/BranchContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import AddressMapPicker from "@/components/address/AddressMapPicker";
import SavedAddresses from "@/components/address/SavedAddresses";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import {
  useActiveDeliveryZones,
  isLocationCovered,
  checkDeliveryCoverageRpc,
  calculateDeliveryFeeRpc,
  OUT_OF_SERVICE_MESSAGE,
} from "@/hooks/useDeliveryZones";
import {
  distanceFromBranch,
  feeForDistance,
  isValidNationalAddress,
  normalizeNationalAddress,
  addressHasCoords,
  IMMEDIATE_DELIVERY_LABEL,
  isBranchOpenNow,
  immediateDeliveryClosedMessage,
  formatAddressLabel,
  notifyAddressesChanged,
  NATIONAL_ADDRESS_LOOKUP_ENABLED,
  type CustomerAddressPayload,
} from "@/lib/branch";
import { applyCustomerDiscount } from "@/lib/customer-discount";
import { splitInclusiveVat } from "@/lib/vat";
import { convertGuestAccount, isAnonymousUser, startGuestSession } from "@/lib/guest";
import { translateError } from "@/lib/error-messages";

const deliveryTimes = [
  IMMEDIATE_DELIVERY_LABEL,
  "10:00 - 12:00 صباحاً",
  "12:00 - 2:00 ظهراً",
  "2:00 - 4:00 عصراً",
  "4:00 - 6:00 مساءً",
  "6:00 - 8:00 مساءً",
  "8:00 - 10:00 مساءً",
];

const CheckoutPage = () => {
  const { items, totalPrice, clearCart, markCheckoutReached, markConverted } = useCart();
  const { selectedBranch, ratesByBranch, openPicker } = useBranch();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { verify: verifyRecaptcha } = useRecaptcha();
  const { active: activeZones } = useActiveDeliveryZones(selectedBranch?.id);
  const [selectedTime, setSelectedTime] = useState("");
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [name, setName] = useState("");
  const [nationalAddress, setNationalAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddressPayload | null>(null);
  const [user, setUser] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [processing, setProcessing] = useState(false);
  const [askDefaultPhone, setAskDefaultPhone] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [askGuestRegister, setAskGuestRegister] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [guestRegisterName, setGuestRegisterName] = useState("");
  const [registeringGuest, setRegisteringGuest] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [startingGuest, setStartingGuest] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number>(10);
  const [customerDiscountPercent, setCustomerDiscountPercent] = useState(0);

  const ONLINE_PAYMENT_ENABLED = true;

  useEffect(() => {
    markCheckoutReached();
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const guest = isAnonymousUser(session.user);
        setIsGuest(guest);
        const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();
        if (profile) {
          const guestFromProfile = Boolean((profile as any).is_guest);
          setIsGuest(guest || guestFromProfile);
          const guestLabel =
            ((guest || guestFromProfile) && (profile as any).guest_number)
              ? `ضيف #${(profile as any).guest_number}`
              : profile.full_name;
          setName(guestLabel || session.user.user_metadata?.full_name || "");
          setPhone(profile.phone || "");
          setSavedPhone(profile.phone || "");
          setCustomerDiscountPercent(Number((profile as any).discount_percent) || 0);
        } else if (guest) {
          setName("ضيف");
        }
        // Auto-select default delivery address
        const { data: defaultAddr } = await supabase
          .from("user_addresses")
          .select("id, label, address, lat, lng, national_address")
          .eq("user_id", session.user.id)
          .eq("is_default", true)
          .maybeSingle();
        if (defaultAddr) {
          setSelectedAddress(defaultAddr as CustomerAddressPayload);
          const na = (defaultAddr as any).national_address;
          if (na) setNationalAddress(normalizeNationalAddress(na));
        }
      }
      setSessionChecked(true);
    };
    init();
  }, [markCheckoutReached]);

  const loadCheckoutSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setIsGuest(false);
      return;
    }
    setUser(session.user);
    const guest = isAnonymousUser(session.user);
    setIsGuest(guest);
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();
    if (profile) {
      const guestFromProfile = Boolean((profile as any).is_guest);
      setIsGuest(guest || guestFromProfile);
      const guestLabel =
        ((guest || guestFromProfile) && (profile as any).guest_number)
          ? `ضيف #${(profile as any).guest_number}`
          : profile.full_name;
      setName(guestLabel || session.user.user_metadata?.full_name || "");
      setPhone(profile.phone || "");
      setSavedPhone(profile.phone || "");
      setCustomerDiscountPercent(Number((profile as any).discount_percent) || 0);
    } else if (guest) {
      setName("ضيف");
    }
  };

  const handleContinueAsGuest = async () => {
    setStartingGuest(true);
    try {
      const { data: sec } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "security")
        .maybeSingle();
      if ((sec?.value as any)?.allow_guest_checkout === false) {
        toast({
          title: "غير متاح حالياً",
          description: "الشراء كزائر معطل من إعدادات المتجر",
          variant: "destructive",
        });
        return;
      }
      const { profile } = await startGuestSession();
      await loadCheckoutSession();
      toast({
        title: "تمت المتابعة كزائر",
        description: `مرحباً ${profile.displayName}`,
      });
    } catch (err: any) {
      toast({
        title: "تعذرت المتابعة كزائر",
        description: translateError(err?.message || String(err)),
        variant: "destructive",
      });
    } finally {
      setStartingGuest(false);
    }
  };

  // If a saved/default address falls outside active zones, clear it once zones are known
  useEffect(() => {
    if (!selectedAddress || activeZones.length === 0) return;
    if (!addressHasCoords(selectedAddress)) return;
    if (!isLocationCovered(selectedAddress.lat!, selectedAddress.lng!, activeZones)) {
      setSelectedAddress(null);
      toast({
        title: "خارج نطاق التوصيل",
        description: OUT_OF_SERVICE_MESSAGE,
        variant: "destructive",
      });
    }
  }, [activeZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate delivery fee from distance tiers / RPC when address or branch changes
  useEffect(() => {
    const run = async () => {
      if (!selectedBranch || !selectedAddress || !addressHasCoords(selectedAddress)) {
        setDeliveryFee(selectedBranch?.delivery_fee ?? 10);
        return;
      }
      if (!isLocationCovered(selectedAddress.lat!, selectedAddress.lng!, activeZones)) {
        setDeliveryFee(selectedBranch.delivery_fee);
        return;
      }
      const rpcFee = await calculateDeliveryFeeRpc(
        selectedBranch.id,
        selectedAddress.lat!,
        selectedAddress.lng!
      );
      if (rpcFee != null) {
        setDeliveryFee(rpcFee);
        return;
      }
      const rates = ratesByBranch[selectedBranch.id] || [];
      const km = distanceFromBranch(selectedBranch, {
        lat: selectedAddress.lat!,
        lng: selectedAddress.lng!,
      });
      setDeliveryFee(feeForDistance(rates, km, selectedBranch.delivery_fee));
    };
    run();
  }, [selectedBranch, selectedAddress, activeZones, ratesByBranch]);

  const distanceKm =
    selectedBranch && selectedAddress && addressHasCoords(selectedAddress)
      ? distanceFromBranch(selectedBranch, {
          lat: selectedAddress.lat!,
          lng: selectedAddress.lng!,
        })
      : null;

  const freeDeliveryFrom = selectedBranch?.free_delivery_threshold ?? 100;
  const minOrder = selectedBranch?.min_order ?? 20;
  const delivery = totalPrice >= freeDeliveryFrom ? 0 : deliveryFee;
  const { percent: discountPercent, amount: discountAmount } = applyCustomerDiscount(
    totalPrice,
    customerDiscountPercent,
  );
  const total = totalPrice - discountAmount + delivery;
  const { exclusive: netSubtotal, vat: vatAmount } = splitInclusiveVat(totalPrice);

  if (!selectedBranch) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center space-y-4">
          <MapPin className="h-12 w-12 mx-auto text-primary" />
          <h2 className="font-heading text-xl font-bold">اختر الفرع أولاً</h2>
          <p className="text-muted-foreground">يجب اختيار فرع قبل إتمام الطلب</p>
          <Button onClick={openPicker}>اختيار الفرع</Button>
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0 && !submitted) {
    navigate("/cart");
    return null;
  }

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Header />
        <main className="flex-1 container py-10 flex items-center justify-center">
          <div className="w-full max-w-md bg-card rounded-2xl border p-6 shadow-sm text-center space-y-4">
            <h1 className="font-heading font-bold text-xl">إتمام الطلب</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              سجّل الدخول لحفظ طلباتك، أو تابع كزائر بالجوال والعنوان فقط.
            </p>
            <Button
              className="w-full"
              onClick={() => navigate("/auth?next=/checkout")}
              disabled={startingGuest}
            >
              تسجيل الدخول
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleContinueAsGuest}
              disabled={startingGuest}
            >
              {startingGuest ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري المتابعة...
                </>
              ) : (
                "المتابعة كزائر"
              )}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary"
              onClick={() => navigate("/cart")}
              disabled={startingGuest}
            >
              العودة للسلة
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (submitted && orderId) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center">
          <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
          <h2 className="font-heading text-2xl font-bold mb-2">تم تأكيد طلبك بنجاح! 🎉</h2>
          <p className="text-muted-foreground mb-2">
            سيتم التواصل معك على الرقم <span dir="ltr" className="font-semibold text-foreground">{phone}</span> لتأكيد التوصيل
          </p>
          {isGuest && (
            <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
              طلبك باسم {name}. يمكنك متابعة الطلب طالما بقيت هذه الصفحة مفتوحة. إن أغلقتها قد تفقد التتبع ما لم تحفظ حساباً.
            </p>
          )}
          {!isGuest && <div className="mb-6" />}
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={() => navigate(`/order/${orderId}`)}>تتبع الطلب</Button>
            {isGuest && (
              <Button variant="secondary" onClick={() => setAskGuestRegister(true)}>
                حفظ بياناتي / إنشاء حساب
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/")}>العودة للتسوق</Button>
          </div>
        </main>
        <AlertDialog open={askGuestRegister} onOpenChange={setAskGuestRegister}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حفظ بياناتك كحساب؟</AlertDialogTitle>
              <AlertDialogDescription>
                أضف بريداً وكلمة مرور لتتبع طلباتك لاحقاً. المندوب سيصل إليك بالجوال والعنوان حتى بدون حساب.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-sm">البريد الإلكتروني (إلزامي)</Label>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="example@email.com"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">كلمة المرور (إلزامي)</Label>
                <Input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">الاسم (اختياري)</Label>
                <Input
                  value={guestRegisterName}
                  onChange={(e) => setGuestRegisterName(e.target.value)}
                  placeholder="اتركه فارغاً للإبقاء على اسم الضيف"
                  className="mt-1"
                />
              </div>
            </div>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel disabled={registeringGuest}>لاحقاً</AlertDialogCancel>
              <AlertDialogAction
                disabled={registeringGuest}
                onClick={async (e) => {
                  e.preventDefault();
                  setRegisteringGuest(true);
                  try {
                    await convertGuestAccount({
                      email: guestEmail,
                      password: guestPassword,
                      fullName: guestRegisterName || undefined,
                      phone,
                    });
                    setIsGuest(false);
                    if (guestRegisterName.trim()) setName(guestRegisterName.trim());
                    setAskGuestRegister(false);
                    toast({ title: "تم حفظ الحساب", description: "يمكنك تسجيل الدخول بنفس البريد لاحقاً" });
                  } catch (err: any) {
                    toast({
                      title: "تعذر حفظ الحساب",
                      description: translateError(err?.message || String(err)),
                      variant: "destructive",
                    });
                  } finally {
                    setRegisteringGuest(false);
                  }
                }}
              >
                {registeringGuest ? "جاري الحفظ..." : "حفظ الحساب"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Footer />
      </div>
    );
  }

  const handleAddressSelected = async (addr: CustomerAddressPayload) => {
    if (addressHasCoords(addr) && !isLocationCovered(addr.lat!, addr.lng!, activeZones)) {
      toast({ title: "خارج نطاق التوصيل", description: OUT_OF_SERVICE_MESSAGE, variant: "destructive" });
      return;
    }
    setSelectedAddress(addr);
    if (addr.national_address) setNationalAddress(addr.national_address);
    setShowMapPicker(false);

    if (user && !addr.id && !isGuest) {
      const { count } = await supabase
        .from("user_addresses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      await supabase.from("user_addresses").insert({
        user_id: user.id,
        label: addr.label,
        address: addr.address,
        lat: addr.lat,
        lng: addr.lng,
        national_address: addr.national_address || null,
        is_default: (count || 0) === 0,
      });
      notifyAddressesChanged();
    }
  };

  const handleSelectSavedAddress = (addr: CustomerAddressPayload & { id: string }) => {
    if (addressHasCoords(addr) && !isLocationCovered(addr.lat!, addr.lng!, activeZones)) {
      toast({ title: "خارج نطاق التوصيل", description: OUT_OF_SERVICE_MESSAGE, variant: "destructive" });
      return;
    }
    setSelectedAddress(addr);
    if (addr.national_address) setNationalAddress(normalizeNationalAddress(addr.national_address));
  };

  const placeOrder = async () => {
    if (!selectedBranch || !user) return;

    const national = normalizeNationalAddress(nationalAddress || selectedAddress?.national_address || "");
    const hasNational = isValidNationalAddress(national);
    const hasCoords = selectedAddress ? addressHasCoords(selectedAddress) : false;

    setProcessing(true);

    const covered = hasCoords
      ? await checkDeliveryCoverageRpc(
          selectedAddress!.lat!,
          selectedAddress!.lng!,
          selectedBranch.id
        )
      : true;
    if (!covered) {
      setProcessing(false);
      toast({ title: "خارج نطاق التوصيل", description: OUT_OF_SERVICE_MESSAGE, variant: "destructive" });
      return;
    }

    const recaptcha = await verifyRecaptcha("order");
    if (!recaptcha.ok) {
      setProcessing(false);
      toast({ title: "تعذر إكمال التحقق", description: recaptcha.message, variant: "destructive" });
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        customer_name: name,
        customer_phone: phone,
        delivery_address: selectedAddress?.address || (hasNational ? `العنوان الوطني: ${national}` : ""),
        delivery_lat: hasCoords ? selectedAddress!.lat : null,
        delivery_lng: hasCoords ? selectedAddress!.lng : null,
        subtotal: totalPrice,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        delivery_fee: delivery,
        total,
        status: "pending",
        payment_method: paymentMethod === "cash" ? "cash" : "online",
        branch_id: selectedBranch.id,
        national_address: hasNational ? national : null,
        notes: `وقت التوصيل: ${selectedTime} | الفرع: ${selectedBranch.name}`,
      } as any)
      .select()
      .single();

    if (orderError || !order) {
      setProcessing(false);
      const msg = orderError?.message || "";
      const outOfZone = /خارج نطاق|delivery/i.test(msg);
      toast({
        title: outOfZone ? "خارج نطاق التوصيل" : "حدث خطأ أثناء إنشاء الطلب",
        description: outOfZone ? OUT_OF_SERVICE_MESSAGE : undefined,
        variant: "destructive",
      });
      return;
    }

    // Create order items
    const orderItems = items.map(({ product, quantity }) => ({
      order_id: order.id,
      product_name: product.name,
      product_image: product.image || null,
      unit_price: product.price,
      quantity,
      total_price: product.price * quantity,
    }));

    await supabase.from("order_items").insert(orderItems);

    // Cash on delivery → done
    if (paymentMethod === "cash") {
      setOrderId(order.id);
      setSubmitted(true);
      markConverted();
      clearCart();
      setProcessing(false);
      toast({ title: "تم إرسال الطلب بنجاح ✅" });
      if (isGuest) setAskGuestRegister(true);
      return;
    }

    // Online payment → Moyasar form on /pay/:orderId
    markConverted();
    clearCart();
    navigate(`/pay/${order.id}`);
    setProcessing(false);
  };

  const handleSubmit = async () => {
    if (!selectedBranch) {
      toast({ title: "يرجى اختيار الفرع أولاً", variant: "destructive" });
      openPicker();
      return;
    }

    if (totalPrice < minOrder) {
      toast({
        title: "الطلب أقل من الحد الأدنى",
        description: `أقل طلب لهذا الفرع ${minOrder} ر.س`,
        variant: "destructive",
      });
      return;
    }

    if (selectedTime === IMMEDIATE_DELIVERY_LABEL && !isBranchOpenNow(selectedBranch.work_start, selectedBranch.work_end)) {
      toast({
        title: "خارج وقت الدوام",
        description: immediateDeliveryClosedMessage(selectedBranch.work_start, selectedBranch.work_end),
        variant: "destructive",
      });
      return;
    }

    const national = normalizeNationalAddress(nationalAddress || selectedAddress?.national_address || "");
    const hasNational = isValidNationalAddress(national);
    const hasCoords = selectedAddress ? addressHasCoords(selectedAddress) : false;

    if (!phone || !selectedTime) {
      toast({ title: "يرجى تعبئة الجوال ووقت التوصيل", variant: "destructive" });
      return;
    }

    if (!isGuest && !name) {
      toast({ title: "يرجى تعبئة الاسم", variant: "destructive" });
      return;
    }

    if (!hasNational && !hasCoords) {
      toast({
        title: "أضف عنوان التوصيل",
        description: "يكفي العنوان الوطني المختصر أو الموقع على الخريطة",
        variant: "destructive",
      });
      return;
    }

    if (national && !hasNational) {
      toast({
        title: "العنوان الوطني المختصر غير صحيح",
        description: "مثال: ANCAW32154",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({ title: "يرجى تسجيل الدخول أو المتابعة كزائر", variant: "destructive" });
      return;
    }

    if (hasCoords && !isLocationCovered(selectedAddress!.lat!, selectedAddress!.lng!, activeZones)) {
      toast({ title: "خارج نطاق التوصيل", description: OUT_OF_SERVICE_MESSAGE, variant: "destructive" });
      return;
    }

    // First-time phone for registered users: ask to save as default
    if (!isGuest && !savedPhone.trim() && phone.trim()) {
      setAskDefaultPhone(true);
      return;
    }

    if (isGuest && user && phone.trim()) {
      await supabase.from("profiles").update({ phone: phone.trim() }).eq("user_id", user.id);
    }

    await placeOrder();
  };

  const savePhoneAsDefault = async (): Promise<boolean> => {
    if (!user || !phone.trim()) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phone.trim() })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "تعذر حفظ الرقم", description: error.message, variant: "destructive" });
      return false;
    }
    setSavedPhone(phone.trim());
    setEditingPhone(false);
    toast({ title: "تم اعتماد الرقم كافتراضي" });
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />
      <AlertDialog open={askDefaultPhone} onOpenChange={setAskDefaultPhone}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>اعتماد رقم الجوال؟</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد اعتماد الرقم{" "}
              <span className="font-semibold text-foreground" dir="ltr">{phone}</span>
              {" "}كرقم افتراضي في حسابك حتى لا يُطلب منك في كل مرة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={processing}
              onClick={() => {
                setAskDefaultPhone(false);
                void placeOrder();
              }}
            >
              لا، لهذه المرة فقط
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={processing}
              onClick={async (e) => {
                e.preventDefault();
                const saved = await savePhoneAsDefault();
                if (!saved) return;
                setAskDefaultPhone(false);
                await placeOrder();
              }}
            >
              نعم، احفظه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <main className="flex-1 container py-6">
        <h1 className="font-heading font-bold text-2xl mb-6">إتمام الطلب</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery info */}
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                معلومات التوصيل
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    {isGuest ? "اسم العميل" : "الاسم الكامل"}
                  </label>
                  {isGuest ? (
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <p className="font-semibold text-sm">{name || "ضيف"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        يظهر للمناديب والإدارة بهذا الاسم المميّز — الاسم الحقيقي غير مطلوب للضيف
                      </p>
                    </div>
                  ) : (
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="أدخل اسمك" />
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">رقم الجوال</label>
                  {savedPhone && !editingPhone ? (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm" dir="ltr">{phone}</span>
                        <span className="text-xs text-muted-foreground">الرقم المسجل في حسابك</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingPhone(true)}
                        className="text-xs gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تغيير لهذا الطلب
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="05XXXXXXXX"
                        dir="ltr"
                        className="text-right"
                      />
                      {savedPhone && (
                        <button
                          type="button"
                          onClick={() => { setPhone(savedPhone); setEditingPhone(false); }}
                          className="text-xs text-primary hover:underline"
                        >
                          ↩ العودة للرقم المسجل ({savedPhone})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Branch + national address */}
            <div className="bg-card rounded-xl border p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">الفرع</p>
                  <p className="font-semibold">{selectedBranch.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedBranch.city}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={openPicker}>
                  تغيير الفرع
                </Button>
              </div>
              {NATIONAL_ADDRESS_LOOKUP_ENABLED && (
              <div>
                <Label htmlFor="national-address">العنوان الوطني المختصر</Label>
                <Input
                  id="national-address"
                  value={nationalAddress}
                  onChange={(e) => setNationalAddress(e.target.value.toUpperCase())}
                  placeholder="ANCAW32154"
                  dir="ltr"
                  className="mt-1.5 font-mono tracking-wider"
                  maxLength={12}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  اختياري إذا حددت الموقع على الخريطة، ومطلوب إذا لم تحدد الخريطة. مثال: ANCAW32154
                </p>
              </div>
              )}
            </div>

            {/* Address selection */}
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                عنوان التوصيل
              </h3>

              {selectedAddress && !showMapPicker ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border-2 border-primary bg-primary/5">
                    <p className="font-semibold text-sm">{formatAddressLabel(selectedAddress.label)}</p>
                    <p className="text-sm text-muted-foreground mt-1">{selectedAddress.address}</p>
                    {selectedAddress.national_address && (
                      <p className="text-xs font-mono mt-1" dir="ltr">{selectedAddress.national_address}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedAddress(null); setShowMapPicker(false); }}>
                    تغيير العنوان
                  </Button>
                </div>
              ) : showMapPicker ? (
                <AddressMapPicker onAddressSelected={handleAddressSelected} />
              ) : (
                <div className="space-y-3">
                  {user && !isGuest && (
                    <SavedAddresses
                      onSelect={handleSelectSavedAddress}
                      onAddNew={() => setShowMapPicker(true)}
                      selectedId={selectedAddress?.id}
                    />
                  )}
                  {(!user || isGuest) && (
                    <>
                      {isGuest && (
                        <p className="text-xs text-muted-foreground">
                          العنوان إلزامي للضيف حتى يصل المندوب إليك.
                        </p>
                      )}
                      <Button type="button" className="w-full" onClick={() => setShowMapPicker(true)}>
                        تحديد عنوان التوصيل على الخريطة
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Delivery time */}
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                وقت التوصيل
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {deliveryTimes.map((time) => (
                  <button
                    key={time}
                    onClick={() => {
                      if (
                        time === IMMEDIATE_DELIVERY_LABEL &&
                        selectedBranch &&
                        !isBranchOpenNow(selectedBranch.work_start, selectedBranch.work_end)
                      ) {
                        toast({
                          title: "خارج وقت الدوام",
                          description: immediateDeliveryClosedMessage(
                            selectedBranch.work_start,
                            selectedBranch.work_end,
                          ),
                          variant: "destructive",
                        });
                        return;
                      }
                      setSelectedTime(time);
                    }}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                      selectedTime === time
                        ? "border-primary bg-primary/5 text-primary"
                        : "hover:border-primary/30"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                طريقة الدفع
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`p-4 rounded-lg border-2 text-right transition-all flex items-center gap-3 ${
                    paymentMethod === "cash" ? "border-primary bg-primary/5" : "hover:border-primary/30"
                  }`}
                >
                  <Banknote className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">الدفع عند الاستلام</p>
                    <p className="text-xs text-muted-foreground">نقداً للمندوب</p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!ONLINE_PAYMENT_ENABLED}
                  onClick={() => ONLINE_PAYMENT_ENABLED && setPaymentMethod("online")}
                  className={`p-4 rounded-lg border-2 text-right transition-all flex items-center gap-3 relative ${
                    !ONLINE_PAYMENT_ENABLED
                      ? "opacity-50 cursor-not-allowed border-border bg-muted/20"
                      : paymentMethod === "online"
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/30"
                  }`}
                  title={!ONLINE_PAYMENT_ENABLED ? "قريباً - قيد إجراءات الترخيص" : ""}
                >
                  <CreditCard className={`h-6 w-6 ${ONLINE_PAYMENT_ENABLED ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold text-sm ${ONLINE_PAYMENT_ENABLED ? "" : "text-muted-foreground"}`}>دفع إلكتروني</p>
                      {!ONLINE_PAYMENT_ENABLED && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" />
                          قريباً
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">مدى · فيزا · STC Pay · أبل باي على آيفون</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-card rounded-xl border p-6 h-fit sticky top-32">
            <h3 className="font-heading font-bold text-lg mb-4">ملخص الطلب</h3>
            <div className="space-y-2 text-sm mb-4">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between">
                  <span className="text-muted-foreground">{product.name} × {quantity}</span>
                  <span>{(product.price * quantity).toFixed(1)} ر.س</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المجموع</span>
                <span>{netSubtotal.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ضريبة القيمة المضافة (15%)</span>
                <span>{vatAmount.toFixed(2)} ر.س</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>خصم العميل ({discountPercent}%)</span>
                  <span>−{discountAmount.toFixed(2)} ر.س</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  التوصيل
                  {distanceKm != null && delivery > 0 ? (
                    <span className="text-[11px] text-muted-foreground/80 block">~{distanceKm.toFixed(1)} كم من الفرع</span>
                  ) : null}
                </span>
                <span className={delivery === 0 ? "text-green-500" : ""}>{delivery === 0 ? "مجاني" : `${delivery} ر.س`}</span>
              </div>
              <div className="flex justify-between font-heading font-bold text-lg pt-2 border-t">
                <span>الإجمالي</span>
                <span className="text-primary">{total.toFixed(2)} ر.س</span>
              </div>
            </div>
            <Button className="w-full mt-4" size="lg" onClick={handleSubmit} disabled={processing || totalPrice < minOrder}>
              {processing ? <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري المعالجة...</> :
                totalPrice < minOrder ? `أقل طلب ${minOrder} ر.س` :
                paymentMethod === "online" ? "متابعة للدفع" : "تأكيد الطلب"}
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutPage;
