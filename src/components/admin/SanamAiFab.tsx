import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "كم عدد زوار الموقع اليوم؟",
  "كم طلب اليوم وما الإيراد؟",
  "أين أعدل المنتجات؟",
  "كم شكوى مفتوحة؟",
  "ملخص سريع للمتجر",
];

/** Floating Sanam AI chat for admin shell */
export default function SanamAiFab() {
  const { filterBranchId, scopedBranchIds } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "مرحباً، أنا Sanam AI. اسألني عن أي شيء في المنصة: الزوار، الطلبات، المنتجات، الكاشير، الشكاوى، المناديب، أو كيف تستخدم صفحة معيّنة.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const branch_id =
        filterBranchId ||
        (scopedBranchIds?.length === 1 ? scopedBranchIds[0] : null);
      const { data, error } = await supabase.functions.invoke("sanam-ai-chat", {
        body: { question, branch_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages((m) => [...m, { role: "assistant", text: data?.answer || "لا توجد إجابة" }]);
    } catch (e: any) {
      toast.error(e.message || "تعذر الاتصال بـ Sanam AI");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "عذراً، حدث خطأ أثناء الإجابة. حاول مرة أخرى." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        title="Sanam AI"
        aria-label="Sanam AI"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed bottom-20 left-5 z-[60] w-[min(100vw-2rem,380px)] h-[min(70vh,520px)] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden"
          dir="rtl"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b bg-primary text-primary-foreground">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Bot className="h-4 w-4" />
              Sanam AI
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-xl px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground mr-auto"
                    : "bg-card border ml-auto"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> يفكّر…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="px-2 pt-2 flex flex-wrap gap-1 border-t bg-background">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="text-[10px] rounded-full border px-2 py-1 hover:bg-muted"
                onClick={() => ask(s)}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="p-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اسأل عن المخزون، العملاء، المناديب…"
              disabled={busy}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
