import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Phone, Car, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import DriverLayout from "@/components/driver/DriverLayout";

const DriverProfilePage = () => {
  const { loading: authLoading, driverId, userId } = useDriverAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("car");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!driverId || !userId) return;

    const fetch = async () => {
      const { data: driver } = await supabase
        .from("drivers")
        .select("phone, vehicle_type")
        .eq("id", driverId)
        .single();

      if (driver) {
        setPhone(driver.phone || "");
        setVehicleType(driver.vehicle_type || "car");
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

    toast({ title: "تم الحفظ", description: "تم تحديث بيانات حسابك" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/driver/login");
  };

  if (authLoading) {
    return (
      <DriverLayout title="حسابي">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="حسابي">
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm">البريد الإلكتروني</Label>
              <div className="relative mt-1">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={email} disabled className="pr-10 text-sm opacity-60" dir="ltr" />
              </div>
            </div>

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

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
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
