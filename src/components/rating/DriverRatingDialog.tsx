import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface DriverRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  driverId: string;
  driverName: string;
}

const DriverRatingDialog = ({ open, onOpenChange, orderId, driverId, driverName }: DriverRatingDialogProps) => {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();
  const navigate = useNavigate();

  const closeAndNavigate = () => {
    onOpenChange(false);
    navigate("/");
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error(t("يرجى اختيار تقييم", "Please select a rating"));
      return;
    }
    setSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("driver_ratings" as any).insert({
      order_id: orderId,
      driver_id: driverId,
      user_id: session.user.id,
      rating,
      comment: comment.trim() || null,
    } as any);

    if (error) {
      if (error.code === "23505") {
        toast.info(t("تم تقييم هذا الطلب مسبقاً", "You already rated this order"));
      } else {
        toast.error(t("فشل إرسال التقييم", "Failed to submit rating"));
      }
    } else {
      toast.success(t("شكراً لتقييمك! 🌟", "Thanks for your rating! 🌟"));
    }
    setSubmitting(false);
    closeAndNavigate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeAndNavigate(); else onOpenChange(v); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">{t("قيّم المندوب", "Rate the Driver")}</DialogTitle>
          <DialogDescription className="text-center">
            {t(`كيف كانت تجربتك مع ${driverName}؟`, `How was your experience with ${driverName}?`)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              onClick={() => setRating(star)}
              className="transition-transform hover:scale-125"
            >
              <Star
                className={`h-9 w-9 transition-colors ${
                  star <= (hoveredStar || rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>
        <Textarea
          placeholder={t("أضف تعليق (اختياري)...", "Add a comment (optional)...")}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex gap-2 mt-2">
          <Button onClick={handleSubmit} disabled={submitting || rating === 0} className="flex-1">
            {t("إرسال التقييم", "Submit Rating")}
          </Button>
          <Button variant="outline" onClick={closeAndNavigate} className="flex-1">
            {t("لاحقاً", "Later")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DriverRatingDialog;
