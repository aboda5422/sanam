import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Shield, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

const PrivacyPolicyPage = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container max-w-3xl py-8 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("سياسة الخصوصية", "Privacy Policy")}</h1>
        </div>

        <div className="bg-card rounded-xl border p-6 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">{t("مقدمة", "Introduction")}</h2>
            <p>{t(
              "نحن في سنام سوبر ماركت نلتزم بحماية خصوصية عملائنا ومستخدمي خدماتنا. توضح هذه السياسة كيفية جمع واستخدام وحماية بياناتكم الشخصية وفقاً لنظام حماية البيانات الشخصية في المملكة العربية السعودية.",
              "At Sanam Supermarket, we are committed to protecting the privacy of our customers. This policy explains how we collect, use, and protect your personal data in accordance with Saudi Arabia's Personal Data Protection Law."
            )}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("البيانات التي نجمعها", "Data We Collect")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("الاسم الكامل ورقم الجوال والبريد الإلكتروني", "Full name, phone number, and email address")}</li>
              <li>{t("عنوان التوصيل والموقع الجغرافي", "Delivery address and geographic location")}</li>
              <li>{t("سجل الطلبات والمشتريات", "Order and purchase history")}</li>
              <li>{t("بيانات الدفع (معالجة عبر بوابات دفع آمنة)", "Payment information (processed through secure payment gateways)")}</li>
              <li>{t("بيانات الاستخدام وملفات تعريف الارتباط", "Usage data and cookies")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("كيفية استخدام البيانات", "How We Use Your Data")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("معالجة وتوصيل الطلبات", "Processing and delivering orders")}</li>
              <li>{t("التواصل معكم بخصوص طلباتكم", "Communicating with you about your orders")}</li>
              <li>{t("تحسين خدماتنا وتجربة المستخدم", "Improving our services and user experience")}</li>
              <li>{t("إرسال العروض والتحديثات (بعد موافقتكم)", "Sending offers and updates (with your consent)")}</li>
              <li>{t("الامتثال للمتطلبات القانونية والتنظيمية", "Compliance with legal and regulatory requirements")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("حماية البيانات", "Data Protection")}</h2>
            <p>{t(
              "نستخدم إجراءات أمنية متقدمة لحماية بياناتكم الشخصية من الوصول غير المصرح به أو التعديل أو الإفصاح أو الإتلاف. تشمل هذه الإجراءات التشفير وجدران الحماية وضوابط الوصول المحدود.",
              "We use advanced security measures to protect your personal data from unauthorized access, modification, disclosure, or destruction. These include encryption, firewalls, and restricted access controls."
            )}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("مشاركة البيانات", "Data Sharing")}</h2>
            <p>{t(
              "لا نبيع أو نؤجر بياناتكم الشخصية لأطراف ثالثة. قد نشارك بياناتكم فقط مع مقدمي خدمات التوصيل والدفع لإتمام طلباتكم، أو عند الطلب من جهة حكومية مختصة وفقاً للأنظمة المعمول بها.",
              "We do not sell or rent your personal data to third parties. We may share data only with delivery and payment service providers to fulfill your orders, or when required by competent government authorities under applicable regulations."
            )}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("حقوقكم", "Your Rights")}</h2>
            <ul className="list-disc pr-6 space-y-1">
              <li>{t("الحق في الوصول إلى بياناتكم الشخصية", "Right to access your personal data")}</li>
              <li>{t("الحق في تصحيح أو تحديث بياناتكم", "Right to correct or update your data")}</li>
              <li>{t("الحق في طلب حذف بياناتكم", "Right to request deletion of your data")}</li>
              <li>{t("الحق في الاعتراض على معالجة بياناتكم", "Right to object to data processing")}</li>
              <li>{t("الحق في سحب الموافقة في أي وقت", "Right to withdraw consent at any time")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t("التواصل معنا", "Contact Us")}</h2>
            <p>{t(
              "لأي استفسار حول سياسة الخصوصية أو لممارسة حقوقكم، يرجى التواصل معنا عبر واتساب أو الاتصال على 0502291213.",
              "For any privacy-related inquiries or to exercise your rights, please contact us via WhatsApp or call 0502291213."
            )}</p>
          </section>

          <section className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <Trash2 className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold mb-2">{t("حذف بيانات الحساب", "Delete Account Data")}</h2>
                <p className="mb-3">{t(
                  "يحق لكم طلب حذف حسابكم وجميع البيانات المرتبطة به (الطلبات، العناوين، معلومات الاتصال) بشكل نهائي. سيتم تنفيذ طلب الحذف خلال مدة أقصاها 48 ساعة من استلامه، وسيتم إشعاركم فور إتمام العملية.",
                  "You have the right to request the permanent deletion of your account and all associated data (orders, addresses, contact information). Deletion requests will be processed within a maximum of 48 hours, and you will be notified once completed."
                )}</p>
                <Link
                  to="/complaints"
                  className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("تقديم طلب حذف الحساب", "Request Account Deletion")}
                </Link>
                <p className="text-xs text-muted-foreground mt-2">
                  {t(
                    "اختر النوع \"شكوى\" واكتب \"طلب حذف حساب\" في وصف المشكلة.",
                    "Select type \"Complaint\" and write \"Account deletion request\" in the description."
                  )}
                </p>
              </div>
            </div>
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

export default PrivacyPolicyPage;
