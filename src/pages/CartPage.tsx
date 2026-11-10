import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Package } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useBranch } from "@/contexts/BranchContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { splitInclusiveVat } from "@/lib/vat";
import { useCustomerOrderAlerts } from "@/hooks/useCustomerOrderAlerts";

const CartPage = () => {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const { selectedBranch } = useBranch();
  const { t, lang } = useLanguage();
  const { hasActiveOrder, activeOrders, primaryAlertOrderId } = useCustomerOrderAlerts();
  const freeFrom = selectedBranch?.free_delivery_threshold ?? 100;
  const baseFee = selectedBranch?.delivery_fee ?? 10;
  const delivery = totalPrice >= freeFrom ? 0 : baseFee;
  const { exclusive: netSubtotal, vat: vatAmount } = splitInclusiveVat(totalPrice);
  const sar = t("ر.س", "SAR");

  if (items.length === 0) {
    const trackHref = primaryAlertOrderId ? `/order/${primaryAlertOrderId}` : "/orders";
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="font-heading text-2xl font-bold mb-2">{t("السلة فارغة", "Your cart is empty")}</h2>
          <p className="text-muted-foreground mb-6">
            {t("أضف منتجات من المتجر لبدء التسوق", "Add products from the store to start shopping")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link to="/">
              <Button>{t("تصفح المنتجات", "Browse products")}</Button>
            </Link>
            {hasActiveOrder && (
              <Link to={trackHref}>
                <Button variant="outline" className="gap-2">
                  <Package className="h-4 w-4" />
                  {t("تتبع طلبك", "Track your order")}
                  {activeOrders[0] ? ` #${activeOrders[0].order_number}` : ""}
                </Button>
              </Link>
            )}
          </div>
        </main>
        <div className="hidden md:block">
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-6">
        <h1 className="font-heading font-bold text-2xl mb-6">
          {t(`سلة التسوق (${items.length})`, `Shopping cart (${items.length})`)}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {items.map(({ product, quantity }) => {
              const displayName =
                lang === "en" && product.nameEn ? product.nameEn : product.name;
              return (
                <div key={product.id} className="flex gap-4 bg-card rounded-xl border p-4">
                  <img src={product.image} alt={displayName} className="w-20 h-20 rounded-lg object-cover" />
                  <div className="flex-1">
                    <h3 className="font-heading font-semibold">{displayName}</h3>
                    <p className="text-sm text-muted-foreground">{product.unit}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(product.id, quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center font-bold">{quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(product.id, quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-heading font-bold text-primary">
                        {(product.price * quantity).toFixed(1)} {sar}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => removeItem(product.id)} className="text-muted-foreground hover:text-destructive transition-colors self-start">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="bg-card rounded-xl border p-6 h-fit sticky top-32">
            <h3 className="font-heading font-bold text-lg mb-4">{t("ملخص الطلب", "Order summary")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("المجموع", "Subtotal")}</span>
                <span>{netSubtotal.toFixed(2)} {sar}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
                <span>{vatAmount.toFixed(2)} {sar}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("التوصيل", "Delivery")}</span>
                <span className={delivery === 0 ? "text-success" : ""}>
                  {delivery === 0 ? t("مجاني", "Free") : `${baseFee} ${sar}`}
                </span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-heading font-bold text-lg">
                <span>{t("الإجمالي", "Total")}</span>
                <span className="text-primary">{(totalPrice + delivery).toFixed(2)} {sar}</span>
              </div>
            </div>
            <Link to="/checkout">
              <Button className="w-full mt-4" size="lg">{t("إتمام الطلب", "Checkout")}</Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="w-full mt-2" size="lg">
                <ArrowRight className="h-4 w-4 ms-2" />
                {t("متابعة التسوق", "Continue shopping")}
              </Button>
            </Link>
            <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={clearCart}>
              {t("تفريغ السلة", "Clear cart")}
            </Button>
          </div>
        </div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default CartPage;
