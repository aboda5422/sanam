import { useEffect, useState } from "react";
import { GripVertical, LayoutTemplate, Loader2, Save, RotateCcw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useHomeLayout, useSaveHomeLayout } from "@/hooks/useHomeLayout";
import {
  DEFAULT_HOME_SECTIONS,
  mergeHomeLayout,
  type HomeLayoutConfig,
  type HomeSectionConfig,
  type HomeBannerSlide,
} from "@/lib/home-layout";
import { toast } from "sonner";

const BANNER_SECTION_IDS = new Set(["hero", "promo_banner", "secondary_banner"]);

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((s, i) =>
    typeof s === "object" && s && "sortOrder" in (s as object)
      ? ({ ...(s as object), sortOrder: i + 1 } as T)
      : s,
  );
}

const AdminHomePage = () => {
  const { data, isLoading } = useHomeLayout();
  const saveMutation = useSaveHomeLayout();
  const [draft, setDraft] = useState<HomeLayoutConfig | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <AdminLayout title="الصفحة الرئيسية">
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const sections = [...draft.sections].sort((a, b) => a.sortOrder - b.sortOrder);

  const updateSection = (id: string, patch: Partial<HomeSectionConfig>) => {
    setDraft({
      sections: draft.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const updateSlide = (sectionId: string, slideId: string, patch: Partial<HomeBannerSlide>) => {
    setDraft({
      sections: draft.sections.map((s) => {
        if (s.id !== sectionId || !s.slides) return s;
        return {
          ...s,
          slides: s.slides.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide)),
        };
      }),
    });
  };

  const reorder = (index: number, dir: -1 | 1) => {
    const ordered = moveItem(sections, index, index + dir) as HomeSectionConfig[];
    setDraft({ sections: ordered });
  };

  const resetDefaults = () => {
    setDraft(mergeHomeLayout({ sections: DEFAULT_HOME_SECTIONS }));
    toast.message("تمت إعادة القيم الافتراضية — احفظ لتطبيقها");
  };

  return (
    <AdminLayout title="الصفحة الرئيسية">
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LayoutTemplate className="h-5 w-5 text-primary" />
              ترتيب أقسام الصفحة الرئيسية
            </CardTitle>
            <CardDescription>
              تحكم بإظهار وإخفاء وترتيب الأقسام التسويقية والبنرات دون تعديل برمجي. التغييرات تظهر فوراً
              بعد الحفظ على تطبيق الجوال والموقع.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ الترتيب
            </Button>
            <Button type="button" variant="outline" onClick={resetDefaults}>
              <RotateCcw className="h-4 w-4 ml-2" />
              استعادة الافتراضي
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {sections.map((section, index) => (
            <Card key={section.id} className={!section.enabled ? "opacity-60" : undefined}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      onClick={() => reorder(index, -1)}
                      aria-label="أعلى"
                    >
                      ▲
                    </button>
                    <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      onClick={() => reorder(index, 1)}
                      aria-label="أسفل"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">
                          {section.sortOrder}. {section.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{section.id}</p>
                      </div>
                      <Switch
                        checked={section.enabled}
                        onCheckedChange={(v) => updateSection(section.id, { enabled: v })}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">العنوان (عربي)</Label>
                        <Input
                          value={section.title}
                          onChange={(e) => updateSection(section.id, { title: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Title (EN)</Label>
                        <Input
                          value={section.titleEn}
                          onChange={(e) => updateSection(section.id, { titleEn: e.target.value })}
                          dir="ltr"
                        />
                      </div>
                      {!BANNER_SECTION_IDS.has(section.id) && section.id !== "assistant" && (
                        <>
                          <div>
                            <Label className="text-xs">وصف مختصر</Label>
                            <Input
                              value={section.subtitle || ""}
                              onChange={(e) =>
                                updateSection(section.id, { subtitle: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">أقصى عدد منتجات</Label>
                            <Input
                              type="number"
                              value={section.maxItems ?? 12}
                              onChange={(e) =>
                                updateSection(section.id, {
                                  maxItems: Number(e.target.value) || 12,
                                })
                              }
                              dir="ltr"
                            />
                          </div>
                        </>
                      )}
                      {section.id === "under_10" && (
                        <div>
                          <Label className="text-xs">حد السعر (ر.س)</Label>
                          <Input
                            type="number"
                            value={section.priceMax ?? 10}
                            onChange={(e) =>
                              updateSection(section.id, {
                                priceMax: Number(e.target.value) || 10,
                              })
                            }
                            dir="ltr"
                          />
                        </div>
                      )}
                      {(section.id === "seasonal" ||
                        section.id === "weekend_offers" ||
                        section.id === "buy_more_save") && (
                        <div className="sm:col-span-2">
                          <Label className="text-xs">مطابقة وسم المنتج (regex اختياري)</Label>
                          <Input
                            value={section.labelMatch || ""}
                            onChange={(e) =>
                              updateSection(section.id, { labelMatch: e.target.value })
                            }
                            placeholder="مثال: موسم|رمضان"
                            dir="ltr"
                          />
                        </div>
                      )}
                    </div>

                    {BANNER_SECTION_IDS.has(section.id) && section.slides && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground">شرائح البنر</p>
                        {section.slides.map((slide) => (
                          <div
                            key={slide.id}
                            className="rounded-xl border bg-muted/30 p-3 space-y-2"
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <Label className="text-xs">عنوان الشريحة</Label>
                                <Input
                                  value={slide.title}
                                  onChange={(e) =>
                                    updateSlide(section.id, slide.id, { title: e.target.value })
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs">رابط الصورة</Label>
                                <Input
                                  value={slide.image || ""}
                                  onChange={(e) =>
                                    updateSlide(section.id, slide.id, { image: e.target.value })
                                  }
                                  dir="ltr"
                                  placeholder="https://..."
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-xs">النص الثانوي</Label>
                                <Textarea
                                  rows={2}
                                  value={slide.subtitle || ""}
                                  onChange={(e) =>
                                    updateSlide(section.id, slide.id, {
                                      subtitle: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs">نص الزر</Label>
                                <Input
                                  value={slide.ctaLabel || ""}
                                  onChange={(e) =>
                                    updateSlide(section.id, slide.id, {
                                      ctaLabel: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <Label className="text-xs">رابط الزر</Label>
                                <Input
                                  value={slide.ctaUrl || ""}
                                  onChange={(e) =>
                                    updateSlide(section.id, slide.id, { ctaUrl: e.target.value })
                                  }
                                  dir="ltr"
                                  placeholder="/categories"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-4 z-10">
          <Button
            className="w-full sm:w-auto shadow-lg"
            size="lg"
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <Save className="h-4 w-4 ml-2" />
            )}
            حفظ إعدادات الصفحة الرئيسية
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminHomePage;
