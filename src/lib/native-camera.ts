import { Capacitor } from "@capacitor/core";

/**
 * Pick an image. Uses native Capacitor Camera on iOS/Android (with permission prompt
 * and camera/gallery sheet), and falls back to <input type="file"> on web.
 * Returns a File ready to upload to Supabase storage.
 */
export async function pickImage(): Promise<File | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      // Request permissions explicitly so iOS shows the system prompt
      const perm = await Camera.checkPermissions();
      if (perm.camera !== "granted" || perm.photos !== "granted") {
        await Camera.requestPermissions({ permissions: ["camera", "photos"] });
      }
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        promptLabelHeader: "اختر مصدر الصورة",
        promptLabelPhoto: "من المعرض",
        promptLabelPicture: "التقاط بالكاميرا",
        promptLabelCancel: "إلغاء",
      });
      const dataUrl = photo.dataUrl;
      if (!dataUrl) return null;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const ext = photo.format || "jpg";
      return new File([blob], `photo-${Date.now()}.${ext}`, {
        type: blob.type || `image/${ext}`,
      });
    } catch (e: any) {
      // User cancelled or denied
      if (e?.message?.toLowerCase?.().includes("cancel")) return null;
      throw e;
    }
  }

  // Web fallback
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}