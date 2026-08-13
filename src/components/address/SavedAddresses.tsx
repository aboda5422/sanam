import { useState, useEffect } from "react";
import { Home, Briefcase, Star, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Address {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  is_default: boolean;
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
    fetchAddresses();
  };

  const deleteAddress = async (id: string) => {
    await supabase.from("user_addresses").delete().eq("id", id);
    toast.success("تم حذف العنوان");
    fetchAddresses();
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
              {addr.label === "home" ? (
                <Home className="h-5 w-5 text-primary flex-shrink-0" />
              ) : (
                <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />
              )}
              <div>
                <span className="font-semibold text-sm">
                  {addr.label === "home" ? "المنزل" : "العمل"}
                </span>
                {addr.is_default && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mr-2">
                    افتراضي
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{addr.address}</p>
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
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
