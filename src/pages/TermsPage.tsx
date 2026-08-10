import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { FileText } from "lucide-react";

const TermsPage = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container max-w-3xl py-8 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("الشروط والأحكام", "Terms & Conditions")}</h1>
        </div>

        <div className="bg-card rounded-xl border p-6 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">{t("مقدمة", "Introduction")}</h2>
            <p>{t(
              "مرحباً بكم في متجر سنام سوبر ماركت. باستخدامكم لخدماتنا فإنكم توافقون على الالتزام بهذه الشروط والأحكام. يرجى قراءتها بعناية قبل استخدام المتجر.",
              "Welcome to Sanam Supermarket. By using our services, you agree to comply with these terms and conditions. Please read them carefully before using the store."
            )}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("بيانات الشركة", "Company Information")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("الاسم التجاري: سنام سوبر ماركت", "Trade name: Sanam Supermarket")}</li>
              <li>{t("المقر: مكة المكرمة والرياض", "Location: Makkah & Riyadh")}</li>
              <li>{t("للتواصل: واتساب 0502291213", "Contact: WhatsApp 0502291213")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("الطلبات والتوصيل", "Orders & Delivery")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("جميع الأسعار المعروضة شاملة لضريبة القيمة المضافة 15%", "All displayed prices include 15% VAT")}</li>
              <li>{t("يتم تأكيد الطلب بعد إتمام عملية الدفع أو اختيار الدفع عند الاستلام", "Orders are confirmed after payment or selecting cash on delivery")}</li>
              <li>{t("نلتزم بتوصيل الطلبات في أقرب وقت ممكن وفقاً لمنطقة التوصيل", "We commit to delivering orders as soon as possible based on delivery area")}</li>
              <li>{t("رسوم التوصيل تختلف حسب المنطقة والمسافة", "Delivery fees vary by area and distance")}</li>
              <li>{t("يحق للمتجر رفض أو إلغاء أي طلب لأسباب تتعلق بالتوفر أو خطأ في التسعير", "The store reserves the right to reject or cancel orders due to availability or pricing errors")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("الإلغاء والاسترجاع", "Cancellation & Returns")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("يمكن إلغاء الطلب قبل بدء التجهيز", "Orders can be cancelled before preparation begins")}</li>
              <li>{t("في حال وجود منتج تالف أو غير مطابق، يرجى التواصل معنا خلال 24 ساعة من الاستلام", "For damaged or non-conforming products, please contact us within 24 hours of delivery")}</li>
              <li>{t("يتم استرداد المبلغ خلال 5-14 يوم عمل حسب طريقة الدفع", "Refunds are processed within 5-14 business days depending on payment method")}</li>
              <li>{t("المنتجات القابلة للتلف (خضار، فواكه، لحوم) غير قابلة للإرجاع بعد الاستلام إلا في حال وجود عيب", "Perishable products are non-returnable after delivery unless defective")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("المسؤولية", "Liability")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("العميل مسؤول عن صحة بيانات التوصيل المدخلة", "The customer is responsible for the accuracy of delivery information")}</li>
              <li>{t("المتجر غير مسؤول عن التأخير الناتج عن ظروف قاهرة", "The store is not liable for delays due to force majeure")}</li>
              <li>{t("يتحمل العميل مسؤولية الحفاظ على سرية بيانات حسابه", "The customer is responsible for maintaining account confidentiality")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("حقوق الملكية الفكرية", "Intellectual Property")}</h2>
            <p>{t(
              "جميع المحتويات المعروضة في المتجر من نصوص وصور وشعارات وتصاميم هي ملكية فكرية لسنام سوبر ماركت ولا يجوز نسخها أو استخدامها دون إذن كتابي مسبق.",
              "All content displayed in the store including text, images, logos, and designs are intellectual property of Sanam Supermarket and may not be copied or used without prior written permission."
            )}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("الشكاوى والنزاعات", "Complaints & Disputes")}</h2>
            <p>{t(
              "في حال وجود أي شكوى أو نزاع، يرجى التواصل معنا عبر صفحة الشكاوى والاقتراحات أو الاتصال على 0502291213. تخضع هذه الشروط لأنظمة المملكة العربية السعودية.",
              "For any complaints or disputes, please contact us through the complaints page or call 0502291213. These terms are governed by Saudi Arabian regulations."
            )}</p>
          </section>

          <section className="border-t pt-4">
            <p className="text-muted-foreground text-xs">
              {t("آخر تحديث: أغسطس 2026", "Last updated: August 2026")} • {t("سنام سوبر ماركت | Sanam Supermarket", "Sanam Supermarket")}
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TermsPage;
