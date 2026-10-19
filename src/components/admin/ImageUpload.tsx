import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { pickImage } from "@/lib/native-camera";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  folder: "products" | "categories" | "announcements";
  label?: string;
}

const ImageUpload = ({ value, onChange, folder, label = "الصورة" }: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"upload" | "url" | null>(value && !value.includes("/storage/v1/") ? "url" : null);

  const handlePick = async () => {
    let file: File | null = null;
    try {
      file = await pickImage();
    } catch (e: any) {
      toast.error("تعذّر فتح الكاميرا: " + (e?.message || ""));
      return;
    }
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
      return;
    }

    setUploading(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("images").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      toast.error("فشل رفع الصورة: " + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
    onChange(urlData.publicUrl);
    setUploading(false);
    toast.success("تم رفع الصورة بنجاح");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-1">
        <Button type="button" variant={mode === "upload" ? "default" : "outline"} size="sm" className="h-8 text-xs" title="رفع صورة محفوظة على الكمبيوتر" onClick={() => setMode("upload")}>
          <Upload className="h-3.5 w-3.5 ml-1" />رفع من الكمبيوتر
        </Button>
        <Button type="button" variant={mode === "url" ? "default" : "outline"} size="sm" className="h-8 text-xs" title="انسخ رابط الصورة والصقه في الحقل" onClick={() => setMode("url")}>
          <LinkIcon className="h-3.5 w-3.5 ml-1" />لصق رابط
        </Button>
      </div>

      {mode === "upload" && (
        <Button type="button" variant="outline" className="w-full" onClick={handlePick} disabled={uploading}>
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />جاري الرفع...</> : <><Upload className="h-4 w-4 ml-2" />اختر الصورة من الكمبيوتر</>}
        </Button>
      )}
      {mode === "url" && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="الصق رابط الصورة هنا" />
      )}

      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt="preview"
            className="w-16 h-16 rounded-lg object-cover border"
            onError={(e) => { e.currentTarget.src = "/placeholder.png"; }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
