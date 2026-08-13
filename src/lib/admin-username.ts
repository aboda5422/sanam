/** Synthetic email domain so branch managers can log in with a username. */
export const STAFF_EMAIL_DOMAIN = "staff.sanam";

export function staffEmailFromUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (!u) return "";
  if (u.includes("@")) return u;
  return `${u}@${STAFF_EMAIL_DOMAIN}`;
}
