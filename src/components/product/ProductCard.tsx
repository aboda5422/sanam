import { Plus, Minus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/types/product";
import { toLegacyProduct } from "@/types/product";
import { Link } from "react-router-dom";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const { items, addItem, updateQuantity } = useCart();
  const cartItem = items.find((i) => i.product.id === product.id);
  const legacyProduct = toLegacyProduct(product);
  const discount = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;

  return (
    <div className="bg-card rounded-xl overflow-hidden group relative">
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-white p-3">
          <img
            src={product.image || "/placeholder.svg"}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.svg"; }}
          />
          {discount > 0 && (
            <span className="absolute top-2 right-2 bg-destructive text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              {discount}%-
            </span>
          )}
          {product.is_featured && (
            <span className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              الأكثر مبيعاً
            </span>
          )}
        </div>
      </Link>

      <div className="absolute bottom-[68px] left-2 z-10">
        {cartItem ? (
          <div className="flex items-center gap-0.5 bg-primary rounded-full shadow-md">
            <button
              className="w-7 h-7 flex items-center justify-center text-primary-foreground rounded-full hover:bg-primary-dark transition-colors"
              onClick={(e) => { e.preventDefault(); updateQuantity(product.id, cartItem.quantity - 1); }}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-primary-foreground text-xs font-bold w-4 text-center">{cartItem.quantity}</span>
            <button
              className="w-7 h-7 flex items-center justify-center text-primary-foreground rounded-full hover:bg-primary-dark transition-colors"
              onClick={(e) => { e.preventDefault(); updateQuantity(product.id, cartItem.quantity + 1); }}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            className="w-7 h-7 flex items-center justify-center bg-white border border-border text-foreground rounded-full shadow-sm hover:bg-muted transition-colors"
            onClick={(e) => { e.preventDefault(); addItem(legacyProduct); }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-2 pb-3 pt-1">
        <div className="flex items-baseline gap-1 mb-0.5">
          <span className="font-heading font-bold text-foreground text-base">{product.price.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">ر.س</span>
        </div>
        {product.original_price && (
          <span className="text-xs text-muted-foreground line-through block">{product.original_price.toFixed(2)} ر.س</span>
        )}
        <Link to={`/product/${product.id}`}>
          <h3 className="text-sm text-foreground mt-1 line-clamp-2 leading-relaxed hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>
      </div>
    </div>
  );
};

export default ProductCard;
