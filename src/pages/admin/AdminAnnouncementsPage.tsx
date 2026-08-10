import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Announcement {
  id: string;
  title: string;
  content: string | null;
  is_active: boolean;
  sort_order: number;
  bg_color: string;
  created_at: string;
}

const AdminAnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: "", content: "", is_active: true, bg_color: "primary" });

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("announcements")
      .select("*")
      .order("sort_order", { ascending: true });
    setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("العنوان مطلوب"); return; }

    if (editing) {
      const { error } = await (supabase as any)
        .from("announcements")
        .update(form)
        .eq("id", editing.id);
      if (error) { toast.error("فشل التحديث"); return; }
      toast.success("تم تحديث الشعار");
    } else {
      const { error } = await (supabase as any)
        .from("announcements")
        .insert({ ...form, sort_order: announcements.length });
      if (error) { toast.error("فشل الإضافة"); return; }
      toast.success("تم إضافة الشعار");
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ title: "", content: "", is_active: true, bg_color: "primary" });
    fetchAnnouncements();
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any)
      .from("announcements")
      .delete()
      .eq("id", id);
    if (error) { toast.error("فشل الحذف"); return; }
    toast.success("تم حذف الشعار");
    fetchAnnouncements();
  };

  const handleToggle = async (ann: Announcement) => {
    await (supabase as any)
      .from("announcements")
      .update({ is_active: !ann.is_active })
      .eq("id", ann.id);
    fetchAnnouncements();
  };

  const openEdit = (ann: Announcement) => {
    setEditing(ann);
    setForm({ title: ann.title, content: ann.content || "", is_active: ann.is_active, bg_color: ann.bg_color });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", content: "", is_active: true, bg_color: "primary" });
    setDialogOpen(true);
  };

  const bgOptions = [
    { value: "primary", label: "أخضر (رئيسي)", className: "bg-primary text-primary-foreground" },
    { value: "destructive", label: "أحمر", className: "bg-destructive text-destructive-foreground" },
    { value: "warning", label: "برتقالي", className: "bg-orange-500 text-white" },
    { value: "info", label: "أزرق", className: "bg-blue-500 text-white" },
    { value: "dark", label: "داكن", className: "bg-foreground text-background" },
  ];

  return (
    <AdminLayout title="إدارة الشعارات والإعلانات">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            تحكم بالشعارات المنبثقة التي تظهر في أعلى صفحة العميل
          </p>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 ml-1" />
            شعار جديد
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : announcements.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-2 opacity-30" />
              لا توجد شعارات بعد
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {announcements.map(ann => {
              const bgOpt = bgOptions.find(b => b.value === ann.bg_color) || bgOptions[0];
              return (
                <Card key={ann.id} className={`border ${!ann.is_active ? "opacity-50" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                      
                      {/* Preview */}
                      <div className="flex-1">
                        <div className={`rounded-lg px-3 py-2 text-sm ${bgOpt.className}`}>
                          <span className="font-semibold">{ann.title}</span>
                          {ann.content && <span className="mr-2 opacity-80">{ann.content}</span>}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={ann.is_active}
                          onCheckedChange={() => handleToggle(ann)}
                        />
                        <Badge variant={ann.is_active ? "default" : "secondary"} className="text-[10px]">
                          {ann.is_active ? "مفعّل" : "معطّل"}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ann)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent dir="rtl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>حذف الشعار</AlertDialogTitle>
                              <AlertDialogDescription>هل تريد حذف هذا الشعار؟</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(ann.id)} className="bg-destructive text-destructive-foreground">
                                حذف
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل الشعار" : "شعار جديد"}</DialogTitle>
              <DialogDescription>أضف نصاً يظهر في الشريط العلوي لواجهة العميل</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>العنوان الرئيسي</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="🎉 خصم 20% على أول طلب!"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>نص إضافي (اختياري)</Label>
                <Input
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="استخدم كود: BAZAR20"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>لون الخلفية</Label>
                <div className="flex gap-2 mt-2">
                  {bgOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm(f => ({ ...f, bg_color: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${opt.className} ${
                        form.bg_color === opt.value ? "ring-2 ring-offset-2 ring-foreground scale-105" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>مفعّل</Label>
              </div>

              {/* Preview */}
              <div>
                <Label className="text-xs text-muted-foreground">معاينة:</Label>
                <div className={`rounded-lg px-3 py-2 text-sm mt-1 ${bgOptions.find(b => b.value === form.bg_color)?.className}`}>
                  <span className="font-semibold">{form.title || "العنوان"}</span>
                  {form.content && <span className="mr-2 opacity-80">{form.content}</span>}
                </div>
              </div>

              <Button onClick={handleSave} className="w-full">
                {editing ? "تحديث" : "إضافة"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAnnouncementsPage;
