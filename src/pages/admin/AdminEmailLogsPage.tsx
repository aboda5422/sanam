import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Mail, CheckCircle2, XCircle, Ban, Clock, Search } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  sent: { label: "مُرسل", className: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2 },
  pending: { label: "قيد الإرسال", className: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: Clock },
  failed: { label: "فشل", className: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
  dlq: { label: "فشل نهائي", className: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
  suppressed: { label: "ملغى الاشتراك", className: "bg-gray-200 text-gray-800 border-gray-300", icon: Ban },
  bounced: { label: "مرتدّ", className: "bg-orange-100 text-orange-800 border-orange-300", icon: XCircle },
  complained: { label: "شكوى", className: "bg-orange-100 text-orange-800 border-orange-300", icon: XCircle },
};

const TEMPLATE_LABELS: Record<string, string> = {
  "payment-receipt": "إيصال دفع",
  "order-on-the-way": "الطلب في الطريق",
  "welcome": "بريد ترحيبي",
  "auth_emails": "بريد المصادقة",
};

const presetRange = (days: number) => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

const AdminEmailLogsPage = () => {
  const [range, setRange] = useState(presetRange(7));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-email-logs", range.from, range.to],
    queryFn: async () => {
      const fromIso = new Date(range.from + "T00:00:00").toISOString();
      const toIso = new Date(range.to + "T23:59:59").toISOString();
      const { data, error } = await supabase
        .from("email_send_log")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  // Deduplicate by message_id keeping latest status
  const dedupedLogs = useMemo(() => {
    if (!logs) return [];
    const map = new Map<string, any>();
    for (const log of logs) {
      const key = log.message_id || log.id;
      if (!map.has(key)) map.set(key, log);
    }
    return Array.from(map.values());
  }, [logs]);

  const templateOptions = useMemo(() => {
    const set = new Set<string>();
    dedupedLogs.forEach((l) => l.template_name && set.add(l.template_name));
    return Array.from(set).sort();
  }, [dedupedLogs]);

  const filtered = useMemo(() => {
    return dedupedLogs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (templateFilter !== "all" && l.template_name !== templateFilter) return false;
      if (search && !l.recipient_email?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [dedupedLogs, statusFilter, templateFilter, search]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    filtered.forEach((l) => {
      if (l.status === "sent") s.sent++;
      else if (l.status === "failed" || l.status === "dlq" || l.status === "bounced" || l.status === "complained") s.failed++;
      else if (l.status === "suppressed") s.suppressed++;
      else if (l.status === "pending") s.pending++;
    });
    return s;
  }, [filtered]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Mail className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">سجل البريد الإلكتروني</h1>
            <p className="text-sm text-muted-foreground">جميع الرسائل المُرسلة والفاشلة وعمليات إلغاء الاشتراك</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">إجمالي</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">مُرسل</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-700">{stats.sent}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">قيد الإرسال</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-yellow-700">{stats.pending}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">فشل</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-700">{stats.failed}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">ملغى الاشتراك</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-gray-700">{stats.suppressed}</div></CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setRange(presetRange(1))}>آخر 24 ساعة</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(presetRange(7))}>آخر 7 أيام</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(presetRange(30))}>آخر 30 يوم</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">من</label>
                <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">إلى</label>
                <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">القالب</label>
                <Select value={templateFilter} onValueChange={setTemplateFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {templateOptions.map((t) => (
                      <SelectItem key={t} value={t}>{TEMPLATE_LABELS[t] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="sent">مُرسل</SelectItem>
                    <SelectItem value="pending">قيد الإرسال</SelectItem>
                    <SelectItem value="failed">فشل</SelectItem>
                    <SelectItem value="dlq">فشل نهائي</SelectItem>
                    <SelectItem value="suppressed">ملغى الاشتراك</SelectItem>
                    <SelectItem value="bounced">مرتدّ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">بحث بالبريد</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="example@..." className="pr-9" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">لا توجد رسائل في الفلتر المحدد</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>القالب</TableHead>
                    <TableHead>المستلم</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الخطأ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 200).map((log: any) => {
                    const meta = STATUS_META[log.status] || STATUS_META.pending;
                    const Icon = meta.icon;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "dd MMM HH:mm", { locale: ar })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {TEMPLATE_LABELS[log.template_name] || log.template_name}
                        </TableCell>
                        <TableCell className="text-sm" dir="ltr">{log.recipient_email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>
                            <Icon className="h-3 w-3 ml-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-red-700 max-w-xs truncate">
                          {log.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {filtered.length > 200 && (
              <div className="p-3 text-center text-xs text-muted-foreground border-t">
                يعرض أول 200 سجل من أصل {filtered.length}. ضيّق نطاق التاريخ لرؤية المزيد.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminEmailLogsPage;
