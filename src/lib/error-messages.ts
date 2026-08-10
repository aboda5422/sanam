// Map common Supabase/Auth error messages to Arabic
const errorMap: Record<string, string> = {
  "Invalid login credentials": "بيانات تسجيل الدخول غير صحيحة",
  "Email not confirmed": "لم يتم تأكيد البريد الإلكتروني بعد",
  "User already registered": "هذا البريد الإلكتروني مسجل مسبقاً",
  "Signup requires a valid password": "يرجى إدخال كلمة مرور صالحة",
  "Password should be at least 6 characters": "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
  "Unable to validate email address: invalid format": "صيغة البريد الإلكتروني غير صحيحة",
  "Email rate limit exceeded": "تم تجاوز عدد المحاولات، حاول لاحقاً",
  "For security purposes, you can only request this after": "لأسباب أمنية، يرجى الانتظار قبل المحاولة مرة أخرى",
  "New password should be different from the old password": "كلمة المرور الجديدة يجب أن تختلف عن القديمة",
  "Auth session missing": "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى",
  "Token has expired or is invalid": "رابط التفعيل منتهي أو غير صالح",
  "User not found": "المستخدم غير موجود",
  "Network error": "خطأ في الاتصال بالإنترنت",
  "Failed to fetch": "خطأ في الاتصال بالخادم",
};

export function translateError(message: string): string {
  // Exact match
  if (errorMap[message]) return errorMap[message];
  
  // Partial match
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }
  
  return message;
}
