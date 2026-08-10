import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";

type CategoryForm = { name: string; name_en: string; slug: string; image: string; is_active: boolean; sort_order: string };
const emptyForm: CategoryForm = { name: "", name_en: "", slug: "", image: "", is_active: true, sort_order: "0" };

const AdminCategoriesPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_en, image, slug, is_active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, name_en: form.name_en || null, slug: form.slug,
        image: form.image || null, is_active: form.is_active, sort_order: Number(form.sort_order) || 0,
      };
      if (editingId) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
      setDialogOpen(false); setEditingId(null); setForm(emptyForm);
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("تم الحذف"); setDeleteId(null); },
    onError: () => toast.error("حدث خطأ"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("categories").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-categories"] }); toast.success("تم التحديث"); },
    onError: () => toast.error("حدث خطأ"),
  });

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ name: c.name, name_en: c.name_en || "", slug: c.slug, image: c.image || "", is_active: c.is_active, sort_order: String(c.sort_order) });
    setDialogOpen(true);
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };

  const autoSlug = (name: string) => name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const filtered = categories?.filter((c) => {
    const matchSearch = search === "" || c.name.includes(search) || (c.name_en && c.name_en.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? c.is_active : !c.is_active);
    return matchSearch && matchStatus;
  });

  return (
    <AdminLayout title="إدارة الأقسام">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن قسم..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">مفعّل</SelectItem>
            <SelectItem value="inactive">معطّل</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{filtered?.length ?? 0} قسم</Badge>
        <Button onClick={openAdd} className="mr-auto"><Plus className="ml-1 h-4 w-4" />إضافة قسم</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right p-3 font-medium">القسم</th>
                  <th className="text-right p-3 font-medium">الرابط</th>
                  <th className="text-center p-3 font-medium">الترتيب</th>
                  <th className="text-center p-3 font-medium">مفعّل</th>
                  <th className="text-center p-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img src={c.image || "/placeholder.svg"} alt={c.name} className="w-10 h-10 rounded-lg object-cover bg-white border" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.svg"; }} />
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.name_en}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{c.slug}</td>
                    <td className="p-3 text-center text-muted-foreground">{c.sort_order}</td>
                    <td className="p-3 text-center">
                      <Switch checked={c.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, value: v })} />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "تعديل قسم" : "إضافة قسم جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>اسم القسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>الاسم بالإنجليزية</Label><Input value={form.name_en} onChange={(e) => { setForm({ ...form, name_en: e.target.value, slug: !editingId ? autoSlug(e.target.value) : form.slug }); }} /></div>
            <div><Label>الرابط (slug)</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
            <ImageUpload value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="categories" />
            <div><Label>ترتيب العرض</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />مفعّل</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.slug || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              {editingId ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا القسم؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCategoriesPage;
