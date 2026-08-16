import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type GuestProfile = {
  isGuest: boolean;
  guestNumber: number | null;
  displayName: string;
};

export function isAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean((user as any).is_anonymous);
}

export function formatGuestName(guestNumber: number | string): string {
  return `ضيف #${guestNumber}`;
}

/** Sign in anonymously and assign ضيف #N on the profile. */
export async function startGuestSession(): Promise<{
  user: User;
  profile: GuestProfile;
}> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("تعذر إنشاء جلسة الضيف");

  const { data: setup, error: setupErr } = await supabase.rpc("setup_guest_profile" as any);
  if (setupErr) throw setupErr;

  const guestNumber = Number((setup as any)?.guest_number) || null;
  const displayName =
    String((setup as any)?.full_name || "") ||
    (guestNumber ? formatGuestName(guestNumber) : "ضيف");

  return {
    user,
    profile: {
      isGuest: true,
      guestNumber,
      displayName,
    },
  };
}

/** Upgrade anonymous session to a real email/password account. */
export async function convertGuestAccount(opts: {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}): Promise<void> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("صيغة البريد الإلكتروني غير صحيحة");
  }
  if (!opts.password || opts.password.length < 6) {
    throw new Error("يجب أن تكون كلمة المرور 6 أحرف على الأقل");
  }

  const { error } = await supabase.auth.updateUser({
    email,
    password: opts.password,
    data: {
      full_name: opts.fullName?.trim() || undefined,
      phone: opts.phone?.trim() || undefined,
    },
  });
  if (error) throw error;

  const { error: convertErr } = await supabase.rpc("convert_guest_to_customer" as any, {
    p_full_name: opts.fullName?.trim() || null,
  });
  if (convertErr) throw convertErr;

  if (opts.phone?.trim()) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ phone: opts.phone.trim() })
        .eq("user_id", user.id);
    }
  }
}
