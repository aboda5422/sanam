import { ledgerSignedLabel, ledgerStatusLabel, type DriverLedgerRow } from "@/lib/driver-transactions-print";

export const DRIVER_TRANSACTIONS_HINT =
  "الكاش: قيمة الطلب هي البضاعة بدون التوصيل، والمتبقي ما يسلّمه بعد خصم أجره. الشبكة: قيمة الطلب صفر لأنها وصلت البنك، والرصيد يتحرك بأجره. الرصيد يجمع فقط ما لم تتم تسويته. حصة الموقع هي ما يبقى من أجرة التوصيل بعد أجر المندوب. الموجب له، والسالب عليه.";

export const DRIVER_COLLECTIONS_HINT =
  "الكاش: قيمة الطلب هي البضاعة بدون التوصيل، والمتبقي ما يسلّمه بعد خصم أجره. الشبكة: قيمة الطلب صفر لأنها وصلت البنك، والرصيد يتحرك بأجره. الرصيد يجمع فقط ما لم تتم تسويته. الموجب له، والسالب عليه.";

function statusClass(status: DriverLedgerRow["status"]) {
  if (status === "collected") return "bg-emerald-100 text-emerald-800";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  return "bg-sky-100 text-sky-800";
}

export function DriverTransactionsTable({
  rows,
  hideSiteShare = false,
}: {
  rows: DriverLedgerRow[];
  hideSiteShare?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">لا معاملات في هذه الفترة</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className={`w-full text-sm ${hideSiteShare ? "min-w-[640px]" : "min-w-[760px]"}`}>
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-right p-2 font-medium">الطلب</th>
            <th className="text-right p-2 font-medium">قيمة الطلب</th>
            <th className="text-right p-2 font-medium">التوصيل</th>
            <th className="text-right p-2 font-medium">أجر المندوب</th>
            {hideSiteShare ? null : <th className="text-right p-2 font-medium">حصة الموقع</th>}
            <th className="text-right p-2 font-medium">المتبقي</th>
            <th className="text-right p-2 font-medium">الرصيد</th>
            <th className="text-right p-2 font-medium">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="p-2 whitespace-nowrap">
                <span className="font-medium">#{row.orderNumber}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {row.channel === "card" ? "شبكة" : "كاش"}
                  {" · "}
                  {new Date(row.at).toLocaleDateString("ar-SA")}
                </span>
              </td>
              <td className="p-2">{row.goods.toFixed(2)}</td>
              <td className="p-2">{row.delivery.toFixed(2)}</td>
              <td className="p-2 text-emerald-700">{row.wage.toFixed(2)}</td>
              {hideSiteShare ? null : <td className="p-2">{row.siteShare.toFixed(2)}</td>}
              <td className={`p-2 font-medium ${row.effect < 0 ? "text-red-700" : row.effect > 0 ? "text-emerald-700" : ""}`}>
                {ledgerSignedLabel(row.effect)}
              </td>
              <td className={`p-2 font-bold ${row.balance < 0 ? "text-red-700" : row.balance > 0 ? "text-emerald-700" : ""}`}>
                {ledgerSignedLabel(row.balance)}
              </td>
              <td className="p-2">
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${statusClass(row.status)}`}>
                  {ledgerStatusLabel(row.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
