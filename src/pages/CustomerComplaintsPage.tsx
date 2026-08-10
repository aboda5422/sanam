import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Plus, Clock, CheckCircle, Loader2, Image, X, Send } from "lucide-react";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import { pickImage } from "@/lib/native-camera";

type ComplaintStatus = "open" | "in_progress" | "resolved";

const statusMap: Record<ComplaintStatus, { label: string; color: string }> = {
  open: { label: "مفتوحة", color: "bg-red-100 text-red-800" },
  in_progress: { label: "قيد المعالجة", color: "bg-yellow-100 text-yellow-800" },
  resolved: { label: "تم الحل", color: "bg-green-100 text-green-800" },
};

const CustomerComplaintsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { verify: verifyRecaptcha } = useRecaptcha();
  const [user, setUser] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [type, setType] = useState<"complaint" | "inquiry">("complaint");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
    });
  }, [navigate]);

  const { data: orders } = useQuery({
    queryKey: ["my-orders-for-complaints", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["my-complaints", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleImageAdd = async () => {
    if (images.length >= 3) {
      toast.error("أقصى عدد للصور 3");
      return;
    }
    let file: File | null = null;
    try {
      file = await pickImage();
    } catch (e: any) {
      toast.error("تعذّر فتح الكاميرا: " + (e?.message || ""));
      return;
    }
    if (!file) return;
    setImages(prev => [...prev, file!]);
    const reader = new FileReader();
    reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string]);
    reader.readAsDataURL(file);
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");

      // reCAPTCHA v3 check
      const passed = await verifyRecaptcha("complaint");
      if (!passed) throw new Error("recaptcha_failed");

      // Upload images
      const imageUrls: string[] = [];
      for (const file of images) {
        const ext = file.name.split('.').pop();
        const path = `complaints/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("images").upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }

      const { error } = await supabase.from("complaints").insert({
        user_id: user.id,
        order_id: selectedOrder || null,
        type,
        message,
        image_urls: imageUrls,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الشكوى بنجاح");
      queryClient.invalidateQueries({ queryKey: ["my-complaints"] });
      setShowNew(false);
      setMessage("");
      setSelectedOrder("");
      setImages([]);
      setPreviews([]);
    },
    onError: () => toast.error("حدث خطأ أثناء الإرسال"),
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container max-w-2xl py-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            الشكاوى والاستفسارات
          </h1>
          <Button onClick={() => setShowNew(true)} size="sm">
            <Plus className="h-4 w-4 ml-1" />
            شكوى جديدة
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : complaints?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد شكاوى سابقة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {complaints?.map(c => {
              const st = statusMap[c.status as ComplaintStatus];
              return (
                <div key={c.id} className="bg-card rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {c.type === "complaint" ? "شكوى" : "استفسار"} • {new Date(c.created_at).toLocaleDateString("ar-SA")}
                      </span>
                    </div>
                    <Badge className={st.color}>{st.label}</Badge>
                  </div>
                  <p className="text-sm mb-2">{c.message}</p>
                  {(c as any).image_urls?.length > 0 && (
                    <div className="flex gap-2 mb-2">
                      {(c as any).image_urls.map((url: string, i: number) => (
                        <img key={i} src={url} alt="" className="h-16 w-16 rounded object-cover border" />
                      ))}
                    </div>
                  )}
                  {c.admin_reply && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
                      <p className="text-xs font-medium text-primary mb-1">رد الإدارة</p>
                      <p className="text-sm">{c.admin_reply}</p>
                      {c.replied_at && (
                        <p className="text-xs text-muted-foreground mt-1">{new Date(c.replied_at).toLocaleDateString("ar-SA")}</p>
                      )}
                    </div>
                  )}
                  {/* Status timeline */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <div className={`flex items-center gap-1 text-xs ${c.status === "open" || c.status === "in_progress" || c.status === "resolved" ? "text-primary" : "text-muted-foreground"}`}>
                      <div className="h-2 w-2 rounded-full bg-current" />
                      <span>تم الاستلام</span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                    <div className={`flex items-center gap-1 text-xs ${c.status === "in_progress" || c.status === "resolved" ? "text-primary" : "text-muted-foreground"}`}>
                      <div className="h-2 w-2 rounded-full bg-current" />
                      <span>قيد المعالجة</span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                    <div className={`flex items-center gap-1 text-xs ${c.status === "resolved" ? "text-green-600" : "text-muted-foreground"}`}>
                      <div className="h-2 w-2 rounded-full bg-current" />
                      <span>تم الحل</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New complaint dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إرسال شكوى أو استفسار</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>النوع</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="complaint">شكوى</SelectItem>
                  <SelectItem value="inquiry">استفسار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الطلب المتعلق (اختياري)</Label>
              <Select value={selectedOrder} onValueChange={setSelectedOrder}>
                <SelectTrigger><SelectValue placeholder="اختر الطلب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون طلب محدد</SelectItem>
                  {orders?.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      طلب #{o.order_number} - {new Date(o.created_at).toLocaleDateString("ar-SA")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>وصف المشكلة</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="اكتب تفاصيل المشكلة هنا..." rows={4} />
            </div>
            <div>
              <Label className="mb-2 block">إرفاق صور (حتى 3)</Label>
              <div className="flex gap-2 flex-wrap">
                {previews.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="" className="h-20 w-20 rounded-lg object-cover border" />
                    <button onClick={() => removeImage(i)} className="absolute -top-1 -left-1 bg-destructive text-white rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button
                    type="button"
                    onClick={handleImageAdd}
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  >
                    <Image className="h-6 w-6 text-muted-foreground/50" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!message.trim() || submitMutation.isPending}
              className="w-full"
            >
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  );
};

export default CustomerComplaintsPage;
