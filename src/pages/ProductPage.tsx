import { useParams, Link } from "react-router-dom";
import { ArrowRight, Plus, Minus, ShoppingCart, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/product/ProductCard";
import SeoHead from "@/components/seo/SeoHead";
import { Button } from "@/components/ui/button";
import { useProduct, useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCart } from "@/contexts/CartContext";
import { useBranch } from "@/contexts/BranchContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toLegacyProduct } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import {
  breadcrumbJsonLd,
  productJsonLd,
  productTitle,
  truncateMeta,
} from "@/lib/seo";
import { SmartImage } from "@/components/ui/SmartImage";
import { optimizeImageUrl } from "@/lib/image-url";

const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const { selectedBranch } = useBranch();
  const { t, lang } = useLanguage();
  const { data: product, isLoading, isFetching } = useProduct(id);
  const { data: categories } = useCategories();
  const { items, addItem, updateQuantity } = useCart();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const categoryFromBranch = categories?.find((c) => c.id === product?.category_id);

  // Fallback category for SEO when branch not chosen yet (useCategories is branch-gated).
  const { data: categoryFallback } = useQuery({
    queryKey: ["product-category-seo", product?.category_id],
    enabled: !!product?.category_id && !categoryFromBranch,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_en, slug")
        .eq("id", product!.category_id!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; name_en: string | null; slug: string } | null;
    },
  });

  const category = categoryFromBranch || categoryFallback || undefined;
  const { data: similarProducts } = useProducts(product?.category_id || undefined, { limit: 8 });
  const similar = (similarProducts || []).filter((p) => p.id !== product?.id).slice(0, 6);

  const gallery = product
    ? [product.image, ...((product.gallery_urls || []).filter(Boolean))].filter(
        (u, i, arr): u is string => !!u && arr.indexOf(u) === i
      )
    : [];
  const mainImage = activeImage || gallery[0] || "/placeholder.png";

  const displayName = product
    ? lang === "en" && product.name_en
      ? product.name_en
      : product.name
    : "";
  const categoryName = category
    ? lang === "en"
      ? category.name_en || category.name
      : category.name
    : "";
  const sar = t("ر.س", "SAR");

  const seoJsonLd = useMemo(() => {
    if (!product || !id) return undefined;
    const path = `/product/${id}`;
    const crumbs = [
      { name: lang === "en" ? "Home" : "الرئيسية", path: "/" },
      ...(category ? [{ name: categoryName || category.name, path: `/category/${category.slug}` }] : []),
      { name: displayName || product.name, path },
    ];
    return [
      productJsonLd({
        name: displayName || product.name,
        description: product.description,
        image: product.image,
        price: product.price,
        path,
        brand: product.brand,
        sku: product.barcode,
        availability: product.is_active ? "InStock" : "OutOfStock",
      }),
      breadcrumbJsonLd(crumbs),
    ];
  }, [product, id, category, categoryName, displayName, lang]);

  if (isLoading || (isFetching && !product)) {
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
        <SeoHead
          title={t("المنتج غير موجود | سنام سوبر ماركت", "Product not found | Sanam Supermarket")}
          description={t(
            "هذا المنتج غير متوفر حالياً في سنام سوبر ماركت.",
            "This product is currently unavailable at Sanam Supermarket.",
          )}
          path={id ? `/product/${id}` : "/"}
          noIndex
        />
        <Header />
        <main className="flex-1 container py-12 text-center">
          <h1 className="font-heading text-xl font-bold mb-2">{t("المنتج غير موجود", "Product not found")}</h1>
        </main>
        <Footer />
      </div>
    );
  }

  const cartItem = items.find((i) => i.product.id === product.id);
  const legacyProduct = toLegacyProduct(product);
  const canAddToCart = !!selectedBranch;
  const description =
    product.description ||
    (lang === "en"
      ? `Buy ${displayName} from Sanam Supermarket — delivery in Makkah and Riyadh.`
      : `اشترِ ${product.name} من سنام سوبر ماركت — توصيل في مكة المكرمة والرياض.`);

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={productTitle(displayName || product.name)}
        description={truncateMeta(description)}
        path={`/product/${id}`}
        image={product.image}
        type="product"
        jsonLd={seoJsonLd}
      />
      <Header />
      <main className="flex-1 container py-4">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6" aria-label={t("مسار التنقل", "Breadcrumb")}>
          <Link to="/" className="hover:text-foreground transition-colors">{t("الرئيسية", "Home")}</Link>
          <ArrowRight className={`h-3.5 w-3.5 ${lang === "ar" ? "rotate-180" : ""}`} />
          {category && (
            <>
              <Link to={`/category/${category.slug}`} className="hover:text-foreground transition-colors">{categoryName}</Link>
              <ArrowRight className={`h-3.5 w-3.5 ${lang === "ar" ? "rotate-180" : ""}`} />
            </>
          )}
          <span className="text-foreground font-medium">{displayName}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          <div className="flex flex-col order-2 md:order-1">
            <h1 className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl mb-4 leading-tight">{displayName}</h1>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="font-heading font-bold text-3xl text-primary">{product.price.toFixed(2)}</span>
              <span className="text-base text-muted-foreground">{sar}</span>
              {product.original_price && (
                <span className="text-base text-muted-foreground line-through ms-2">
                  {product.original_price.toFixed(2)} {sar}
                </span>
              )}
            </div>
            {product.description && (
              <div className="mb-6">
                <h2 className="font-heading font-bold text-xl mb-3">{t("الوصف", "Description")}</h2>
                <div className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm mb-6">
              {product.brand && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("الماركة", "Brand")}</p>
                  <p className="font-medium">{product.brand}</p>
                </div>
              )}
              {product.origin_country && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("بلد المنشأ", "Origin")}</p>
                  <p className="font-medium">{product.origin_country}</p>
                </div>
              )}
              {product.size_label && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("الحجم", "Size")}</p>
                  <p className="font-medium">{product.size_label}</p>
                </div>
              )}
              {product.product_form && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("شكل المنتج", "Form")}</p>
                  <p className="font-medium">{product.product_form}</p>
                </div>
              )}
              {product.barcode && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground text-xs">{t("الباركود", "Barcode")}</p>
                  <p className="font-medium dir-ltr" dir="ltr">{product.barcode}</p>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-muted-foreground text-xs">{t("الوحدة", "Unit")}</p>
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
              <Button
                size="lg"
                className="gap-2 text-base rounded-xl w-full sm:w-auto"
                disabled={!canAddToCart}
                onClick={() => addItem(legacyProduct, qty)}
              >
                <ShoppingCart className="h-5 w-5" />
                {t("أضف إلى السلة", "Add to cart")}
              </Button>
            )}
          </div>

          <div className="order-1 md:order-2">
            <div className="aspect-square rounded-2xl overflow-hidden bg-white border sticky top-24">
              <SmartImage
                src={mainImage}
                preset="detail"
                alt={displayName}
                width={800}
                height={800}
                className="w-full h-full object-contain p-8"
                fetchPriority="high"
                decoding="async"
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
                    <img
                      src={optimizeImageUrl(src, "thumb")}
                      alt=""
                      width={64}
                      height={64}
                      className="w-full h-full object-contain p-1"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="mt-12">
            <h2 className="font-heading font-bold text-2xl mb-4">{t("منتجات ذات صله", "Related products")}</h2>
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
