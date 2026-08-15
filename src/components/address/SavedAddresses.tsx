import { useState, useEffect } from "react";
import { Home, Briefcase, MapPin, Hash, Star, Trash2, Plus, Pencil } from "lucide-react";
import { formatAddressLabel, notifyAddressesChanged, parseAddressLabelKind, NATIONAL_ADDRESS_LOOKUP_ENABLED, type AddressLabelKind } from "@/lib/branch";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Address {
  id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  national_address?: string | null;
}

interface SavedAddressesProps {
  onSelect: (address: Address) => void;
  onAddNew: () => void;
  selectedId?: string;
  /** When false, only the saved list is shown (add button rendered by parent). Default true. */
  showAddButton?: boolean;
  /** Bump to refetch after an external save. */
  refreshKey?: number;
}

const SavedAddresses = ({ onSelect, onAddNew, selectedId, showAddButton = true, refreshKey = 0 }: SavedAddressesProps) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<AddressLabelKind>("home");
  const [editCustom, setEditCustom] = useState("");

  const fetchAddresses = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const { data } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", session.user.id)
      .order("is_default", { ascending: false });
    
    setAddresses((data as Address[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAddresses(); }, [refreshKey]);

  const setDefault = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Unset all defaults first
    await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", session.user.id);
    // Set new default
    await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    toast.success("تم تعيين العنوان الافتراضي");
    notifyAddressesChanged();
    fetchAddresses();
  };

  const deleteAddress = async (id: string) => {
    await supabase.from("user_addresses").delete().eq("id", id);
    toast.success("تم حذف العنوان");
    notifyAddressesChanged();
    fetchAddresses();
  };

  const startEdit = (addr: Address) => {
    const kind = parseAddressLabelKind(addr.label);
    setEditingId(addr.id);
    setEditKind(kind);
    setEditCustom(kind === "custom" ? addr.label : "");
  };

  const saveEditName = async (id: string) => {
    const label = editKind === "custom" ? editCustom.trim() : editKind;
    if (!label) {
      toast.error("اكتب اسماً للعنوان");
      return;
    }
    const { error } = await supabase.from("user_addresses").update({ label }).eq("id", id);
    if (error) {
      toast.error("فشل حفظ الاسم");
      return;
    }
    toast.success("تم حفظ اسم العنوان");
    setEditingId(null);
    notifyAddressesChanged();
    fetchAddresses();
  };

  const labelIcon = (label: string) => {
    if (label === "home") return <Home className="h-5 w-5 text-primary flex-shrink-0" />;
    if (label === "work") return <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />;
    if (label === "national") return <Hash className="h-5 w-5 text-primary flex-shrink-0" />;
    return <MapPin className="h-5 w-5 text-primary flex-shrink-0" />;
  };

  if (loading) return <div className="py-4 text-center text-muted-foreground text-sm">جاري التحميل...</div>;

  return (
    <div className="flex flex-col gap-3">
      {addresses.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">لا توجد عناوين محفوظة بعد</p>
      )}

      {addresses.map((addr) => (
        <button
          key={addr.id}
          type="button"
          onClick={() => onSelect(addr)}
          className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
            selectedId === addr.id
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {labelIcon(addr.label)}
              <div className="min-w-0">
                {editingId === addr.id ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={editKind}
                      onChange={(e) => setEditKind(e.target.value as AddressLabelKind)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="home">المنزل</option>
                      <option value="work">العمل</option>
                      <option value="national" disabled={!NATIONAL_ADDRESS_LOOKUP_ENABLED}>العنوان الوطني</option>
                      <option value="custom">مخصص</option>
                    </select>
                    {editKind === "custom" && (
                      <Input
                        value={editCustom}
                        onChange={(e) => setEditCustom(e.target.value)}
                        placeholder="اسم العنوان"
                        maxLength={40}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => saveEditName(addr.id)}>حفظ الاسم</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold text-sm">
                      {formatAddressLabel(addr.label)}
                    </span>
                    {addr.is_default && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mr-2">
                        افتراضي
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{addr.address}</p>
                    {addr.national_address && (
                      <p className="text-xs font-mono mt-0.5 dir-ltr" dir="ltr">{addr.national_address}</p>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startEdit(addr); }}
                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                title="تعديل الاسم"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </button>
              {!addr.is_default && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDefault(addr.id); }}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  title="تعيين كافتراضي"
                >
                  <Star className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteAddress(addr.id); }}
                className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                title="حذف"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          </div>
        </button>
      ))}

      {showAddButton && (
        <Button variant="outline" className="w-full mt-1" onClick={onAddNew}>
          <Plus className="h-4 w-4 ml-2" />
          إضافة عنوان جديد
        </Button>
      )}
    </div>
  );
};

export default SavedAddresses;
