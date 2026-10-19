/** Driver profile / earnings — never show fake 5.0 when there are no ratings. */
export function formatDriverRatingSummary(
  rating: number | null | undefined,
  ratingsCount: number | null | undefined,
): { value: string; subtitle: string } {
  const count = Number(ratingsCount ?? 0);
  if (count <= 0) {
    return { value: "—", subtitle: "لا تقييم بعد" };
  }
  const avg = Number(rating ?? 0);
  return { value: avg.toFixed(1), subtitle: `من 5 · ${count} تقييم` };
}
