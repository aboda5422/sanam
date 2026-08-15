import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Phone, Mail, Loader2, Pencil, Save, X, Car, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import DriverLayout from "@/components/driver/DriverLayout";

const VEHICLE_LABELS: Record<string, string> = {
  car: "سيارة",
  motorcycle: "دراجة نارية",
  bicycle: "دراجة هوائية",
};

const DriverProfilePage = () => {
  const { loading: authLoading, driverId, userId } = useDriverAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("car");
  const [savedPhone, setSavedPhone] = useState("");
  const [savedVehicle, setSavedVehicle] = useState("car");
  const [email, setEmail] = useState("");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!driverId || !userId) return;

    const fetch = async () => {
      const { data: driver } = await supabase
        .from("drivers")
        .select("phone, vehicle_type, created_at")
        .eq("id", driverId)
        .single();

      if (driver) {
        const p = driver.phone || "";
        const v = driver.vehicle_type || "car";
        setPhone(p);
        setVehicleType(v);
        setSavedPhone(p);
        setSavedVehicle(v);
        setJoinedAt(driver.created_at || null);
      }

      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email || "");
    };

    fetch();
  }, [driverId, userId]);

  const handleSave = async () => {
    if (!driverId) return;
    setSaving(true);

    const { error } = await supabase
      .from("drivers")
      .update({ phone, vehicle_type: vehicleType })
      .eq("id", driverId);

    setSaving(false);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }

    setSavedPhone(phone);
    setSavedVehicle(vehicleType);
    setEditing(false);
    toast({ title: "تم الحفظ", description: "تم تحديث بيانات حسابك" });
  };

  const handleCancel = () => {
    setPhone(savedPhone);
    setVehicleType(savedVehicle);
    setEditing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/driver/login");
  };

  if (authLoading) {
    return (
      <DriverLayout title="حسابي">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="حسابي">
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">
        <Card>
          <CardHeader className="p-4 pb-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">بيانات الحساب</CardTitle>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                  aria-label="تعديل"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm">البريد الإلكتروني</Label>
              <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2.5 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span dir="ltr" className="min-w-0 flex-1 text-start">{email}</span>
              </div>
            </div>

            {editing ? (
              <>
                <div>
                  <Label className="text-sm">رقم الجوال</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05xxxxxxxx"
                      className="pr-10 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm">نوع المركبة</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="car">سيارة</SelectItem>
                      <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                      <SelectItem value="bicycle">دراجة هوائية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                  <Button type="button" variant="outline" disabled={saving} className="gap-2" onClick={handleCancel}>
                    <X className="h-4 w-4" />
                    إلغاء
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-sm">رقم الجوال</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2.5 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span dir="ltr" className="min-w-0 flex-1 text-start">{phone || "—"}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">نوع المركبة</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2.5 text-sm">
                    <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{VEHICLE_LABELS[vehicleType] || vehicleType}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm">تاريخ الانضمام</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2.5 text-sm">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      {joinedAt
                        ? new Date(joinedAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
                        : "—"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          <LogOut className="h-4 w-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>
    </DriverLayout>
  );
};

export default DriverProfilePage;
