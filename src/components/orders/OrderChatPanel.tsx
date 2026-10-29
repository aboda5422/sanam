import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { markCustomerOrderChatSeen } from "@/hooks/useCustomerOrderAlerts";

export type OrderChatMode = "customer" | "staff";

const STAFF_SIDE = new Set(["staff", "admin", "preparer", "system"]);

type OrderMessage = {
  id: string;
  order_id: string;
  sender_id: string;
  sender_role: string;
  body: string | null;
  image_urls: string[] | null;
  message_type: string;
  created_at: string;
};

type Props = {
  orderId: string;
  mode: OrderChatMode;
  orderStatus?: string;
  className?: string;
  onOrderChanged?: () => void;
};

const typeLabel: Record<string, string> = {
  cancel_request: "طلب إلغاء",
  edit_request: "طلب تعديل",
  return_for_edit: "إرجاع للتعديل",
  cancel_confirmed: "تم تأكيد الإلغاء",
  edit_submitted: "تم إرسال التعديل",
  system: "نظام",
};

export default function OrderChatPanel({
  orderId,
  mode,
  orderStatus,
  className,
  onOrderChanged,
}: Props) {
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const queryKey = ["order-messages", orderId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OrderMessage[];
    },
    enabled: !!orderId,
  });

  useEffect(() => {
    if (mode !== "customer" || !orderId) return;
    markCustomerOrderChatSeen(orderId);
  }, [mode, orderId, messages.length]);

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-messages-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_messages",
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).slice(0, 4 - pendingFiles.length);
    setPendingFiles((prev) => [...prev, ...next].slice(0, 4));
    next.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setPreviews((prev) => [...prev, ev.target?.result as string].slice(0, 4));
      reader.readAsDataURL(file);
    });
  };

  const removePending = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadImages = async (userId: string) => {
    const urls: string[] = [];
    for (const file of pendingFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `order-chat/${orderId}/${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("يجب تسجيل الدخول");
      const body = text.trim();
      if (!body && pendingFiles.length === 0) throw new Error("اكتب رسالة أو أرفق صورة");

      const imageUrls = await uploadImages(user.id);
      const { error } = await supabase.from("order_messages" as any).insert({
        order_id: orderId,
        sender_id: user.id,
        sender_role: mode === "staff" ? "staff" : "customer",
        body: body || null,
        image_urls: imageUrls,
        message_type: imageUrls.length && !body ? "image" : "text",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      setPendingFiles([]);
      setPreviews([]);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message || "تعذر إرسال الرسالة"),
  });

  const rpcMutation = useMutation({
    mutationFn: async (payload: { fn: string; args: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc(payload.fn as any, payload.args as any);
      if (error) throw error;
      const result = data as { success?: boolean; code?: string; message?: string } | null;
      if (result && result.success === false) {
        throw new Error(result.message || result.code || "فشلت العملية");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      onOrderChanged?.();
      toast.success("تم التنفيذ");
    },
    onError: (e: Error) => toast.error(e.message || "تعذر تنفيذ الإجراء"),
  });

  const blocked = orderStatus === "cancelled" || orderStatus === "delivered";

  const openCancelRequest =
    messages.some((m) => m.message_type === "cancel_request") && orderStatus !== "cancelled";

  return (
    <div className={cn("flex flex-col h-full min-h-[360px]", className)} dir="rtl">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 p-3 bg-muted/20 rounded-lg border">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">لا رسائل بعد — ابدأ المحادثة</p>
        )}
        {messages.map((m) => {
          const mine =
            (mode === "customer" && m.sender_role === "customer") ||
            (mode === "staff" && STAFF_SIDE.has(m.sender_role));
          const isSpecial = !["text", "image"].includes(m.message_type || "text");
          return (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                isSpecial
                  ? "mx-auto bg-amber-50 border border-amber-200 text-amber-900 text-center"
                  : mine
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "me-auto bg-background border",
              )}
            >
              {isSpecial && (
                <p className="text-[10px] font-semibold mb-1 opacity-80">
                  {typeLabel[m.message_type] || m.message_type}
                </p>
              )}
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {m.image_urls && m.image_urls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.image_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="h-20 w-20 object-cover rounded-lg border" />
                    </a>
                  ))}
                </div>
              )}
              <p className={cn("text-[10px] mt-1 opacity-70", mine && !isSpecial && "text-primary-foreground/80")}>
                {new Date(m.created_at).toLocaleString("ar-SA", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
          );
        })}
      </div>

      {!blocked && (
        <div className="mt-3 space-y-2">
          {mode === "customer" && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rpcMutation.isPending}
                onClick={() =>
                  rpcMutation.mutate({
                    fn: "request_order_cancel",
                    args: { p_order_id: orderId, p_reason: null },
                  })
                }
              >
                طلب إلغاء
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={rpcMutation.isPending || orderStatus === "on_the_way"}
                onClick={() =>
                  rpcMutation.mutate({
                    fn: "request_order_edit",
                    args: { p_order_id: orderId, p_note: null },
                  })
                }
              >
                طلب تعديل
              </Button>
            </div>
          )}

          {mode === "staff" && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={rpcMutation.isPending || orderStatus === "cancelled"}
                onClick={() =>
                  rpcMutation.mutate({
                    fn: "staff_confirm_order_cancel",
                    args: { p_order_id: orderId, p_notes: null },
                  })
                }
              >
                تأكيد الإلغاء
                {openCancelRequest ? " ●" : ""}
              </Button>
            </div>
          )}

          {previews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {previews.map((src, i) => (
                <div key={src} className="relative">
                  <img src={src} alt="" className="h-14 w-14 object-cover rounded border" />
                  <button
                    type="button"
                    className="absolute -top-1 -left-1 bg-background rounded-full border p-0.5"
                    onClick={() => removePending(i)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="اكتب رسالة..."
              rows={2}
              className="resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!sendMutation.isPending) sendMutation.mutate();
                }
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={pendingFiles.length >= 4}
              title="إرفاق صورة"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
