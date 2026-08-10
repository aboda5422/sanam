import { ReactNode } from "react";
import DriverBottomNav from "./DriverBottomNav";

interface DriverLayoutProps {
  children: ReactNode;
  title?: string;
}

const DriverLayout = ({ children, title }: DriverLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {title && (
        <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
          <div className="flex items-center justify-center h-14 px-4">
            <h1 className="font-heading font-bold text-lg">{title}</h1>
          </div>
        </header>
      )}
      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>
      <DriverBottomNav />
    </div>
  );
};

export default DriverLayout;
