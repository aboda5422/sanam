import { Link } from "react-router-dom";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoFullLight from "@/assets/logo-full-light.png";

type Props = {
  children: React.ReactNode;
  /** Show cart/back actions (hide on success if you prefer only page CTAs). */
  showNavActions?: boolean;
};

/** Minimal shell for payment flow — no storefront header/footer distraction. */
const PaymentChrome = ({ children, showNavActions = true }: Props) => {
  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex h-14 items-center justify-between gap-3 max-w-2xl">
          <Link to="/" className="shrink-0" aria-label="سنام سوبرماركت">
            <img src={logoFullLight} alt="سنام" className="h-8 w-auto object-contain" />
          </Link>
          {showNavActions ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
                <Link to="/cart">
                  <ArrowRight className="h-4 w-4" />
                  الرجوع للسلة
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/">
                  <ShoppingBag className="h-4 w-4" />
                  متابعة التسوق
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex-1 container max-w-2xl py-8">{children}</main>
    </div>
  );
};

export default PaymentChrome;
