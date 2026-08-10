import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  loading?: boolean;
}

const KPICard = ({ title, value, icon: Icon, trend, trendUp, color = "primary", loading }: KPICardProps) => {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-green-100 text-green-600",
    warning: "bg-amber-100 text-amber-600",
    info: "bg-blue-100 text-blue-600",
    destructive: "bg-red-100 text-red-600",
    purple: "bg-purple-100 text-purple-600",
    teal: "bg-teal-100 text-teal-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`rounded-xl p-3 ${colorMap[color] || colorMap.primary}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">{title}</p>
          {loading ? (
            <div className="h-7 w-16 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold font-heading">{value}</p>
          )}
          {trend && (
            <p className={`text-xs mt-0.5 ${trendUp ? "text-green-600" : "text-red-500"}`}>
              {trend}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default KPICard;
