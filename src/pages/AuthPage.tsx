import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import { lovable } from "@/integrations/lovable/index";
import { Capacitor } from "@capacitor/core";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { verify: verifyRecaptcha } = useRecaptcha();

  const handleGoogle = async () => {
    // On native (iOS/Android) use the Google Sign-In SDK via Capacitor.
    // This opens the system account picker / Google app instead of trying
    // to load Lovable's web OAuth proxy from inside the WebView.
    if (Capacitor.isNativePlatform()) {
      setLoading(true);
      try {
        const WEB_CLIENT_ID =
          "148924632918-2vcnigktvm5duqs6jqr84i5uog3nlt1a.apps.googleusercontent.com";
        const IOS_CLIENT_ID =
          "148924632918-b0fu5t6nopeilvan8cjqmdr24dp44bep.apps.googleusercontent.com";
        const { SocialLogin } = await import("@capgo/capacitor-social-login");
        try {
          await SocialLogin.initialize({
            google: {
              webClientId: WEB_CLIENT_ID,
              iOSClientId: IOS_CLIENT_ID,
              iOSServerClientId: WEB_CLIENT_ID,
              mode: "online",
            },
          });
        } catch {}
        // NOTE: do not pass `scopes` here — on Android the @capgo plugin
        // throws "You CANNOT use scopes without modifying the main activity".
        // email/profile are included by default. Also don't pass a `nonce`:
        // the plugin does not embed it in the returned idToken, which causes
        // Supabase to throw "Passed nonce and nonce in id_token should either
        // both exist or not".
        const res: any = await SocialLogin.login({
          provider: "google",
          options: {},
        });
        const idToken: string | undefined =
          res?.result?.idToken ?? res?.result?.authentication?.idToken;
        if (!idToken) throw new Error("No idToken returned from Google");
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) throw error;
        toast({ title: "تم تسجيل الدخول بنجاح", description: "مرحباً بك في سنام" });
        navigate("/");
      } catch (err: any) {
        console.error("Native Google sign-in failed:", err);
        toast({
          title: "فشل تسجيل الدخول",
          description: err?.message || "تعذر تسجيل الدخول عبر Google",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast({ title: "خطأ", description: "فشل تسجيل الدخول عبر Google", variant: "destructive" });
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate("/");
  };

  const handleApple = async () => {
    if (!isIOS) return;
    setLoading(true);
    try {
      const WEB_CLIENT_ID =
        "148924632918-2vcnigktvm5duqs6jqr84i5uog3nlt1a.apps.googleusercontent.com";
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      try {
        await SocialLogin.initialize({
          apple: {},
          google: {
            webClientId: WEB_CLIENT_ID,
            iOSServerClientId: WEB_CLIENT_ID,
            mode: "online",
          },
        });
      } catch {}
      const rawNonce = (globalThis.crypto?.randomUUID?.() ??
        Math.random().toString(36).slice(2)) + Date.now().toString(36);
      // Apple expects the SHA-256 hash of the nonce; Supabase verifies using the raw nonce.
      const enc = new TextEncoder().encode(rawNonce);
      const hashBuf = await crypto.subtle.digest("SHA-256", enc);
      const hashedNonce = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const res: any = await SocialLogin.login({
        provider: "apple",
        options: { scopes: ["email", "name"], nonce: hashedNonce },
      });
      const idToken: string | undefined =
        res?.result?.idToken ?? res?.result?.identityToken;
      if (!idToken) throw new Error("No identityToken returned from Apple");
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: idToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      // If Apple returned a full name on first sign-in, persist it to profile
      const givenName: string | undefined =
        res?.result?.givenName ?? res?.result?.profile?.givenName;
      const familyName: string | undefined =
        res?.result?.familyName ?? res?.result?.profile?.familyName;
      const fullNameFromApple = [givenName, familyName].filter(Boolean).join(" ").trim();
      if (fullNameFromApple && data?.user?.id) {
        try {
          await supabase
            .from("profiles")
            .update({ full_name: fullNameFromApple })
            .eq("user_id", data.user.id);
        } catch {}
      }
      toast({ title: "تم تسجيل الدخول بنجاح", description: "مرحباً بك في سنام" });
      navigate("/");
    } catch (err: any) {
      console.error("Native Apple sign-in failed:", err);
      toast({
        title: "فشل تسجيل الدخول",
        description: err?.message || "تعذر تسجيل الدخول عبر Apple",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // reCAPTCHA v3 — silent bot check
      const action = isLogin ? "login" : "signup";
      const passed = await verifyRecaptcha(action);
      if (!passed) {
        toast({ title: "تم رفض الطلب", description: "فشل التحقق الأمني، يرجى المحاولة مرة أخرى", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "تم تسجيل الدخول بنجاح", description: "مرحباً بك في سنام" });
        navigate("/");
      } else {
        // Validate email format client-side first
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          toast({ title: "خطأ", description: "صيغة البريد الإلكتروني غير صحيحة", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          toast({ title: "خطأ", description: "يجب أن تكون كلمة المرور 6 أحرف على الأقل", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // Send welcome email (fire-and-forget — don't block UX)
        supabase.functions
          .invoke("send-transactional-email", {
            body: {
              templateName: "welcome",
              recipientEmail: email,
              idempotencyKey: `welcome-${signUpData.user?.id ?? email}`,
              templateData: { customerName: fullName },
            },
          })
          .catch((err) => console.warn("Welcome email failed:", err));
        toast({ title: "تم التسجيل بنجاح", description: "تم إرسال رابط التفعيل إلى بريدك الإلكتروني" });
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: translateError(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md px-4">
          <div className="bg-card rounded-2xl border p-6 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
                <span className="text-primary-foreground font-heading font-extrabold text-lg">بم</span>
              </div>
              <h1 className="font-heading font-bold text-xl">
                {isLogin ? "تسجيل الدخول" : "إنشاء حساب جديد"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {isLogin ? "مرحباً بعودتك إلى سنام" : "سجّل الآن واطلب بقالتك بسهولة"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div>
                    <Label htmlFor="fullName" className="text-sm">الاسم الكامل</Label>
                    <div className="relative mt-1">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="أدخل اسمك الكامل" className="pr-10 text-sm" required />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-sm">
                      رقم الجوال <span className="text-muted-foreground text-xs">(اختياري - يُطلب عند الطلب)</span>
                    </Label>
                    <div className="relative mt-1">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" className="pr-10 text-sm" dir="ltr" />
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="email" className="text-sm">البريد الإلكتروني</Label>
                <div className="relative mt-1">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" className="pr-10 text-sm" dir="ltr" required />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="text-sm">كلمة المرور</Label>
                <div className="relative mt-1">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="أدخل كلمة المرور" className="pr-10 pl-10 text-sm" dir="ltr" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isLogin && (
                <Link to="/forgot-password" className="block text-xs text-primary hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              )}

              <Button type="submit" className="w-full text-sm" disabled={loading}>
                {loading ? "جاري المعالجة..." : isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="h-px bg-border flex-1" />
              <span className="text-xs text-muted-foreground">أو</span>
              <span className="h-px bg-border flex-1" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full text-sm gap-2"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.7 28.9 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.7 28.9 5 24 5 16.4 5 9.8 9.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43c4.8 0 9.3-1.8 12.7-4.9l-5.9-4.8C28.9 34.6 26.6 35.5 24 35.5c-5.3 0-9.7-2.9-11.3-7l-6.5 5C9.6 38.6 16.2 43 24 43z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.1 3.9-3.9 5.2l5.9 4.8C40.6 35.6 43 30.2 43 24c0-1.2-.1-2.4-.4-3.5z"/>
              </svg>
              تسجيل الدخول بحساب Google
            </Button>

            {isIOS && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm gap-2 mt-2 bg-black text-white hover:bg-black/90 hover:text-white border-black"
                onClick={handleApple}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M16.365 1.43c0 1.14-.42 2.2-1.26 3.05-.86.9-2.02 1.48-3.1 1.4-.13-1.08.42-2.22 1.21-3.04.86-.9 2.13-1.5 3.15-1.41zM20.5 17.07c-.55 1.27-.8 1.83-1.5 2.95-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.06-1.78-4.06-3.35C-.13 16.95-.43 11.4 1.93 8.62c1.42-1.66 3.66-2.64 5.77-2.64 2.15 0 3.5.99 5.28.99 1.73 0 2.78-.99 5.26-.99 1.88 0 3.86 1.02 5.27 2.78-4.64 2.54-3.88 9.18-2.01 8.31z"/>
                </svg>
                تسجيل الدخول عبر Apple
              </Button>
            )}

            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}
              </span>{" "}
              <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
                {isLogin ? "سجّل الآن" : "تسجيل الدخول"}
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AuthPage;
