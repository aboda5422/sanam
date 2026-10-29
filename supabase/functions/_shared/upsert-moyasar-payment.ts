/**
 * Ensures a `payments` row exists for a Moyasar payment and syncs status.
 * Live checkout uses Moyasar.js (no create-moyasar-payment), so verify/webhook
 * must insert when missing — otherwise AdminPaymentsPage stays empty while
 * orders.payment_status can still become paid.
 */
export async function upsertMoyasarPayment(
  supabase: { from: (table: string) => any },
  verified: {
    id: string;
    status: string;
    amount?: number;
    currency?: string;
    source?: { type?: string } | null;
    metadata?: { order_id?: string; user_id?: string } | null;
  },
  newStatus: "pending" | "paid" | "failed" | "refunded" | "cancelled",
): Promise<{ paymentId: string | null; orderId: string | null }> {
  const moyasarId = verified.id;
  const orderId = verified.metadata?.order_id ?? null;
  const amountSar =
    typeof verified.amount === "number" ? Number(verified.amount) / 100 : null;
  const method = verified.source?.type || "creditcard";

  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("moyasar_payment_id", moyasarId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("payments")
      .update({
        status: newStatus,
        raw_response: verified,
        ...(amountSar != null ? { amount: amountSar } : {}),
        method,
      })
      .eq("id", existing.id);
    return { paymentId: existing.id, orderId };
  }

  if (!orderId || amountSar == null) {
    console.error("Cannot insert payment: missing order_id or amount", {
      moyasarId,
      orderId,
      amount: verified.amount,
    });
    return { paymentId: null, orderId };
  }

  const { data: inserted, error } = await supabase
    .from("payments")
    .insert({
      order_id: orderId,
      user_id: verified.metadata?.user_id || null,
      moyasar_payment_id: moyasarId,
      amount: amountSar,
      currency: verified.currency || "SAR",
      method,
      status: newStatus,
      source: verified.source ?? null,
      raw_response: verified,
    })
    .select("id")
    .single();

  if (error) {
    // Race: another request inserted the same moyasar_payment_id
    if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message || "")) {
      const { data: raced } = await supabase
        .from("payments")
        .select("id")
        .eq("moyasar_payment_id", moyasarId)
        .maybeSingle();
      if (raced?.id) {
        await supabase
          .from("payments")
          .update({ status: newStatus, raw_response: verified, method })
          .eq("id", raced.id);
        return { paymentId: raced.id, orderId };
      }
    }
    console.error("Failed to insert payment:", error);
    return { paymentId: null, orderId };
  }

  return { paymentId: inserted?.id ?? null, orderId };
}
