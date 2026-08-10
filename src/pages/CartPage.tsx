import { Link } from "react-router-dom";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";

const CartPage = () => {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="font-heading text-2xl font-bold mb-2">السلة فارغة</h2>
          <p className="text-muted-foreground mb-6">أضف منتجات من المتجر لبدء التسوق</p>
          <Link to="/">
            <Button>تصفح المنتجات</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-6">
        <h1 className="font-heading font-bold text-2xl mb-6">سلة التسوق ({items.length})</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map(({ product, quantity }) => (
              <div key={product.id} className="flex gap-4 bg-card rounded-xl border p-4">
                <img src={product.image} alt={product.name} className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1">
                  <h3 className="font-heading font-semibold">{product.name}</h3>
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
                    <span className="font-heading font-bold text-primary">{(product.price * quantity).toFixed(1)} ر.س</span>
                  </div>
                </div>
                <button onClick={() => removeItem(product.id)} className="text-muted-foreground hover:text-destructive transition-colors self-start">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-card rounded-xl border p-6 h-fit sticky top-32">
            <h3 className="font-heading font-bold text-lg mb-4">ملخص الطلب</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المنتجات</span>
                <span>{totalPrice.toFixed(1)} ر.س</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">التوصيل</span>
                <span className={totalPrice >= 100 ? "text-success" : ""}>{totalPrice >= 100 ? "مجاني" : "15 ر.س"}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-heading font-bold text-lg">
                <span>الإجمالي</span>
                <span className="text-primary">{(totalPrice + (totalPrice >= 100 ? 0 : 15)).toFixed(1)} ر.س</span>
              </div>
            </div>
            <Link to="/checkout">
              <Button className="w-full mt-4" size="lg">إتمام الطلب</Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="w-full mt-2" size="lg">
                <ArrowRight className="h-4 w-4 ml-2" />
                متابعة التسوق
              </Button>
            </Link>
            <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={clearCart}>
              تفريغ السلة
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CartPage;
