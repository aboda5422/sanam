import { Link, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { Phone, MapPin, MessageCircle, MessageSquare, Truck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { categories, categorySections } from "@/data/store-data";
import logoFull from "@/assets/logo-full.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBranch } from "@/contexts/BranchContext";
import { BRAND } from "@/lib/brand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Snapchat & TikTok custom icons
const SnapchatIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.922-.215a.38.38 0 0 1 .134-.025c.15 0 .33.048.413.18.105.18.12.36.039.51-.105.18-.36.33-.698.45-.464.165-.96.222-1.275.27-.015.21.06.42.09.48.12.3.6 1.83-1.935 3.18-1.08.57-2.145.81-3.18.81h-.015c-1.035 0-2.1-.24-3.18-.81C7.583 13.452 8.103 11.922 8.223 11.622c.03-.06.105-.27.09-.48-.315-.048-.81-.105-1.275-.27-.33-.12-.585-.27-.69-.45-.09-.15-.075-.33.03-.51a.43.43 0 0 1 .42-.18.38.38 0 0 1 .134.025c.263.095.622.231.922.215.198 0 .326-.045.401-.09a9.3 9.3 0 0 1-.033-.57c-.104-1.628-.23-3.654.3-4.847C9.856 1.069 13.213.793 14.203.793h-2z"/>
  </svg>
);

const TiktokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.87 4.87 0 0 1-1-.15z"/>
  </svg>
);

const Footer = () => {
  const { t, lang } = useLanguage();
  const { openPicker } = useBranch();
  const navigate = useNavigate();
  const mainSections = categorySections.slice(0, 5);
  const whatsappNumber = BRAND.whatsapp;
  const [staffOpen, setStaffOpen] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const startPress = () => {
    pressTimer.current = setTimeout(() => setStaffOpen(true), 1500);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <footer className="bg-foreground text-background mt-8">
      <div className="container py-10">
        {/* Top section: Logo + Social + App download */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8 pb-8 border-b border-background/10">
          {/* Logo & description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <img
                src={logoFull}
                alt={BRAND.fullNameAr}
                className="h-12 md:h-14 w-auto max-w-[260px] md:max-w-[320px] object-contain cursor-pointer select-none"
                onMouseDown={startPress}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={startPress}
                onTouchEnd={cancelPress}
                onTouchCancel={cancelPress}
                draggable={false}
              />
            </div>
            <p className="text-sm text-background/60 max-w-xs">
              {t(BRAND.taglineAr, BRAND.taglineEn)}
            </p>
          </div>

          {/* App download buttons */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium mb-1">{t("حمّل التطبيق", "Download App")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toast.message(t("قريباً", "Coming soon"))}
                className="flex items-center gap-2 bg-background/10 hover:bg-background/20 rounded-lg px-3 py-2 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <div className="text-right">
                  <p className="text-[10px] text-background/60">حمّل من</p>
                  <p className="text-xs font-medium">App Store</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => toast.message(t("قريباً", "Coming soon"))}
                className="flex items-center gap-2 bg-background/10 hover:bg-background/20 rounded-lg px-3 py-2 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M3.609 1.814 13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893 2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199 2.302 2.302-2.302 2.302L15.396 12l2.302-2.492zM5.864 2.658l10.937 6.333L14.5 11.292 5.864 2.658z"/>
                </svg>
                <div className="text-right">
                  <p className="text-[10px] text-background/60">حمّل من</p>
                  <p className="text-xs font-medium">Google Play</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Category sections */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 mb-8 pb-8 border-b border-background/10">
          {mainSections.map((section) => {
            const sectionCats = categories.filter((c) => c.section === section.id).slice(0, 6);
            return (
              <div key={section.id}>
                <h4 className="font-heading font-semibold text-sm mb-3">{t(section.title, section.titleEn)}</h4>
                <div className="space-y-1.5">
                  {sectionCats.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/category/${cat.id}`}
                      className="block text-xs text-background/60 hover:text-primary transition-colors"
                    >
                      {t(cat.name, cat.nameEn)}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Contact Us Section */}
        <div className="mb-8 pb-8 border-b border-background/10">
          <h4 className="font-heading font-semibold text-sm mb-4 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            {t("تواصل معنا", "Contact Us")}
          </h4>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              {t("واتساب", "WhatsApp")}
              <span dir="ltr">{BRAND.phoneDisplay}</span>
            </a>
            <a
              href={`tel:${BRAND.phoneTel}`}
              className="flex items-center gap-2 bg-background/10 hover:bg-background/20 rounded-full px-4 py-2 text-sm transition-colors"
            >
              <Phone className="h-4 w-4 text-primary" />
              <span dir="ltr">{BRAND.phoneDisplay}</span>
            </a>
            <Link
              to="/complaints"
              className="flex items-center gap-2 bg-background/10 hover:bg-background/20 rounded-full px-4 py-2 text-sm transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
              {t("الشكاوى والاستفسارات", "Complaints")}
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-background/60">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="inline-flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => openPicker(lang === "en" ? "Makkah" : "مكة المكرمة")}
                  className="hover:text-primary underline-offset-2 hover:underline transition-colors"
                >
                  {t("مكة المكرمة", "Makkah")}
                </button>
                <span aria-hidden="true">{t("و", " & ")}</span>
                <button
                  type="button"
                  onClick={() => openPicker(lang === "en" ? "Riyadh" : "الرياض")}
                  className="hover:text-primary underline-offset-2 hover:underline transition-colors"
                >
                  {t("الرياض", "Riyadh")}
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* Government compliance placeholders — update when Sanam CR/VAT are provided */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-6 py-4 border-t border-background/10">
          <div className="flex items-center gap-3">
            <div className="bg-background/10 rounded-lg p-2 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-primary">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
            </div>
            <div className="text-right">
              <p className="text-xs text-background/60">السجل التجاري</p>
              <p className="text-sm font-bold" dir="ltr">—</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-background/10 rounded-lg p-2 flex items-center justify-center">
              <span className="text-xs font-bold text-primary leading-tight text-center">ضريبة<br/>القيمة<br/>المضافة<br/><span className="text-[10px]">VAT</span></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="text-xs text-background/60">الرقم الضريبي</p>
              <p className="text-sm font-bold" dir="ltr">—</p>
            </div>
          </div>
        </div>

        {/* Legal Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
          <Link to="/privacy" className="text-xs text-background/60 hover:text-primary transition-colors">
            {t("سياسة الخصوصية", "Privacy Policy")}
          </Link>
          <span className="text-background/20">|</span>
          <Link to="/terms" className="text-xs text-background/60 hover:text-primary transition-colors">
            {t("الشروط والأحكام", "Terms & Conditions")}
          </Link>
          <span className="text-background/20">|</span>
          <Link to="/complaints" className="text-xs text-background/60 hover:text-primary transition-colors">
            {t("الشكاوى والاقتراحات", "Complaints & Suggestions")}
          </Link>
        </div>

        {/* Bottom section: Social + Copyright */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

          {/* Social icons */}
          <div className="flex items-center gap-3">
            <a href={BRAND.social.snapchat} target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-primary transition-colors" aria-label="Snapchat">
              <SnapchatIcon />
            </a>
            <a href={BRAND.social.instagram} target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-primary transition-colors" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </a>
            <a href={BRAND.social.x} target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-primary transition-colors" aria-label="X">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href={BRAND.social.tiktok} target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-primary transition-colors" aria-label="TikTok">
              <TiktokIcon />
            </a>
          </div>

          {/* Copyright / legal */}
          <p className="text-[11px] text-background/40 text-center md:text-right leading-relaxed">
            © {new Date().getFullYear()} {BRAND.legalNameAr}
            <span className="mx-1.5 opacity-50">|</span>
            {t("س.ت", "CR")} {BRAND.crNumber}
          </p>
        </div>

        {/* reCAPTCHA notice (required by Google Terms) */}
        <p className="text-[10px] text-background/30 text-center mt-3">
          هذا الموقع محمي بواسطة reCAPTCHA وتطبق{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            سياسة الخصوصية
          </a>{" "}
          و{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            شروط الخدمة
          </a>{" "}
          الخاصة بـ Google.
        </p>
      </div>

      {/* Staff access dialog (long-press logo to open) */}
      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">دخول الموظفين</DialogTitle>
            <DialogDescription className="text-center">
              اختر نوع الحساب لتسجيل الدخول
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-2">
            <Button
              variant="outline"
              className="h-14 justify-start gap-3"
              onClick={() => {
                setStaffOpen(false);
                navigate("/driver/login");
              }}
            >
              <Truck className="h-5 w-5 text-primary" />
              <div className="text-right">
                <div className="font-semibold">واجهة المندوب</div>
                <div className="text-xs text-muted-foreground">دخول مندوب التوصيل</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-14 justify-start gap-3"
              onClick={() => {
                setStaffOpen(false);
                navigate("/admin/login");
              }}
            >
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div className="text-right">
                <div className="font-semibold">لوحة التحكم</div>
                <div className="text-xs text-muted-foreground">دخول الإدارة والمشرفين</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
};

export default Footer;
