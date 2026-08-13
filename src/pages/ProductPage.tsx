import { useParams, Link } from "react-router-dom";
import { ArrowRight, Plus, Minus, ShoppingCart, Loader2 } from "lucide-react";
import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/product/ProductCard";
import { Button } from "@/components/ui/button";
import { useProduct, useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCart } from "@/contexts/CartContext";
import { toLegacyProduct } from "@/types/product";

const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(id);
  const { data: categories } = useCategories();
  const { items, addItem, updateQuantity } = useCart();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const category = categories?.find((c) => c.id === product?.category_id);
  const { data: similarProducts } = useProducts(product?.category_id || undefined);
  const similar = (similarProducts || []).filter((p) => p.id !== product?.id).slice(0, 6);

  const gallery = product
    ? [product.image, ...((product.gallery_urls || []).filter(Boolean))].filter(
        (u, i, arr): u is string => !!u && arr.indexOf(u) === i
      )
    : [];
  const mainImage = activeImage || gallery[0] || "/placeholder.png";

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12 text-center">
          <h2 className="font-heading text-xl font-bold mb-2">المنتج غير موجود</h2>
        </main>
        <Footer />
      </div>
    );
  }

  const cartItem = items.find((i) => i.product.id === product.id);
  const legacyProduct = toLegacyProduct(product);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-4">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">الرئيسية</Link>
          <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          {category && (
            <>
              <Link to={`/category/${category.slug}`} className="hover:text-foreground transition-colors">{category.name}</Link>
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            </>
          )}
          <span className="text-foreground font-medium">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          <div className="flex flex-col order-2 md:order-1">
            <h1 className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl mb-4 leading-tight">{product.name}</h1>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="font-heading font-bold text-3xl text-primary">{product.price.toFixed(2)}</span>
              <span className="text-base text-muted-foreground">ر.س</span>
              {product.original_price && (
                <span className="text-base text-muted-foreground line-through mr-2">{product.original_price.toFixed(2)} ر.س</span>
              )}
            </div>
            {product.description && (
              <div className="mb-6">
                <h2 className="font-heading font-bold text-xl mb-3">الوصف</h2>
                <div className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm mb-6">
              {product.brand && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">الماركة</p>
                  <p className="font-medium">{product.brand}</p>
                </div>
              )}
              {product.origin_country && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">بلد المنشأ</p>
                  <p className="font-medium">{product.origin_country}</p>
                </div>
              )}
              {product.size_label && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">الحجم</p>
                  <p className="font-medium">{product.size_label}</p>
                </div>
              )}
              {product.product_form && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">شكل المنتج</p>
                  <p className="font-medium">{product.product_form}</p>
                </div>
              )}
              {product.barcode && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">الباركود</p>
                  <p className="font-medium dir-ltr" dir="ltr">{product.barcode}</p>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-muted-foreground text-xs">الوحدة</p>
                <p className="font-medium">{product.unit}</p>
              </div>
            </div>
            {product.extra_label && (
              <p className="text-sm text-primary font-medium mb-4">{product.extra_label}</p>
            )}

            {cartItem ? (
              <div className="flex items-center gap-3 mb-4">
                <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={() => updateQuantity(product.id, cartItem.quantity - 1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-xl font-bold w-8 text-center">{cartItem.quantity}</span>
                <Button size="icon" className="h-10 w-10 rounded-full" onClick={() => updateQuantity(product.id, cartItem.quantity + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4">
                <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={() => setQty(Math.max(1, qty - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-xl font-bold w-8 text-center">{qty}</span>
                <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={() => setQty(qty + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}

            {!cartItem && (
              <Button size="lg" className="gap-2 text-base rounded-xl w-full sm:w-auto" onClick={() => addItem(legacyProduct, qty)}>
                <ShoppingCart className="h-5 w-5" />
                أضف إلى السلة
              </Button>
            )}
          </div>

          <div className="order-1 md:order-2">
            <div className="aspect-square rounded-2xl overflow-hidden bg-white border sticky top-24">
              <img
                src={mainImage}
                alt={product.name}
                className="w-full h-full object-contain p-8"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/placeholder.png";
                }}
              />
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {gallery.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(src)}
                    className={`shrink-0 w-16 h-16 rounded-lg border overflow-hidden bg-white ${
                      mainImage === src ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="mt-12">
            <h2 className="font-heading font-bold text-2xl mb-4">منتجات ذات صله</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {similar.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ProductPage;
