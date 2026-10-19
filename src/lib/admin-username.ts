/**
 * Synthetic email domains for staff who sign in with a username only.
 * Brand domain: @staff.sanam — never show @staff.tomo in the UI.
 */
export const STAFF_EMAIL_LEGACY_DOMAIN = "staff.tomo";
export const STAFF_EMAIL_DOMAIN = "staff.sanam";

/** Login resolution — prefer sanam, then legacy tomo if still in Auth. */
export function staffEmailFromUsername(username: string): string {
  const candidates = staffLoginEmailCandidates(username);
  return candidates[0] || "";
}

/**
 * Emails to try when signing in with username or email.
 * Full emails are used as-is; bare usernames try sanam then legacy.
 */
export function staffLoginEmailCandidates(username: string): string[] {
  const u = username.trim().toLowerCase();
  if (!u) return [];
  if (u.includes("@")) {
    // Normalize legacy domain typed by mistake
    if (u.endsWith(`@${STAFF_EMAIL_LEGACY_DOMAIN}`)) {
      const local = u.slice(0, -(STAFF_EMAIL_LEGACY_DOMAIN.length + 1));
      return [`${local}@${STAFF_EMAIL_DOMAIN}`, u];
    }
    return [u];
  }
  return [`${u}@${STAFF_EMAIL_DOMAIN}`, `${u}@${STAFF_EMAIL_LEGACY_DOMAIN}`];
}

/** Preferred email for newly created staff accounts. */
export function staffEmailForNewAccount(username: string): string {
  const u = username.trim().toLowerCase();
  if (!u) return "";
  if (u.includes("@")) return displayStaffEmail(u);
  return `${u}@${STAFF_EMAIL_DOMAIN}`;
}

export function isStaffSyntheticEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return (
    e.endsWith(`@${STAFF_EMAIL_LEGACY_DOMAIN}`) || e.endsWith(`@${STAFF_EMAIL_DOMAIN}`)
  );
}

/** UI display — rewrite legacy @staff.tomo → @staff.sanam (no Tomo branding). */
export function displayStaffEmail(email: string | null | undefined): string {
  const e = (email || "").trim();
  if (!e) return "";
  const lower = e.toLowerCase();
  if (lower.endsWith(`@${STAFF_EMAIL_LEGACY_DOMAIN}`)) {
    return `${e.slice(0, e.length - STAFF_EMAIL_LEGACY_DOMAIN.length)}${STAFF_EMAIL_DOMAIN}`;
  }
  return e;
}
