import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { BranchProvider } from "@/contexts/BranchContext";
import BranchPickerDialog from "@/components/branch/BranchPickerDialog";
import Index from "./pages/Index";
import CategoryPage from "./pages/CategoryPage";
import CategoriesPage from "./pages/CategoriesPage";
import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
import NotFound from "./pages/NotFound";
import RouteTracker from "./components/RouteTracker";
import ScrollToTop from "./components/ScrollToTop";
import MobileBottomNav from "./components/layout/MobileBottomNav";
import MobileSwipeNavigation from "./components/layout/MobileSwipeNavigation";
import { CustomerOrderAlertsListener } from "./hooks/useCustomerOrderAlerts";
import { persistQueryClient, restoreQueryClient } from "@/lib/query-persist";

// Secondary customer routes — split so home/catalog JS stays lean.
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CustomerOrdersPage = lazy(() => import("./pages/CustomerOrdersPage"));
const OrderTrackingPage = lazy(() => import("./pages/OrderTrackingPage"));
const CustomerComplaintsPage = lazy(() => import("./pages/CustomerComplaintsPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const PaymentResultPage = lazy(() => import("./pages/PaymentResultPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

// Staff panels — code-split so storefront visitors do not download them.
const AdminAuthedLayout = lazy(() => import("./routes/AdminAuthedLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProductsPage = lazy(() => import("./pages/admin/AdminProductsPage"));
const AdminCategoriesPage = lazy(() => import("./pages/admin/AdminCategoriesPage"));
const AdminComplaintsPage = lazy(() => import("./pages/admin/AdminComplaintsPage"));
const AdminOrdersPage = lazy(() => import("./pages/admin/AdminOrdersPage"));
const AdminDriversPage = lazy(() => import("./pages/admin/AdminDriversPage"));
const AdminBranchesPage = lazy(() => import("./pages/admin/AdminBranchesPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminDeliverySettingsPage = lazy(() => import("./pages/admin/AdminDeliverySettingsPage"));
const AdminSalesPage = lazy(() => import("./pages/admin/AdminSalesPage"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminCustomersPage = lazy(() => import("./pages/admin/AdminCustomersPage"));
const AdminAnnouncementsPage = lazy(() => import("./pages/admin/AdminAnnouncementsPage"));
const AdminPaymentsPage = lazy(() => import("./pages/admin/AdminPaymentsPage"));
const AdminHomePage = lazy(() => import("./pages/admin/AdminHomePage"));
const AdminEmailLogsPage = lazy(() => import("./pages/admin/AdminEmailLogsPage"));
const AdminPosPage = lazy(() => import("./pages/admin/AdminPosPage"));
const AdminCollectionsHubPage = lazy(() => import("./pages/admin/AdminCollectionsHubPage"));
const AdminRatingsPage = lazy(() => import("./pages/admin/AdminRatingsPage"));

const DriverLoginPage = lazy(() => import("./pages/driver/DriverLoginPage"));
const DriverDashboard = lazy(() => import("./pages/driver/DriverDashboard"));
const DriverOrdersPage = lazy(() => import("./pages/driver/DriverOrdersPage"));
const DriverOrderDetailPage = lazy(() => import("./pages/driver/DriverOrderDetailPage"));
const DriverHistoryPage = lazy(() => import("./pages/driver/DriverHistoryPage"));
const DriverEarningsPage = lazy(() => import("./pages/driver/DriverEarningsPage"));
const DriverProfilePage = lazy(() => import("./pages/driver/DriverProfilePage"));

const CashierLoginPage = lazy(() => import("./pages/cashier/CashierLoginPage"));
const CashierLayout = lazy(() => import("./pages/cashier/CashierLayout"));
const CashierSellPage = lazy(() => import("./pages/cashier/CashierSellPage"));
const CashierShiftPage = lazy(() => import("./pages/cashier/CashierShiftPage"));

const PreparerLoginPage = lazy(() => import("./pages/preparer/PreparerLoginPage"));
const PreparerLayout = lazy(() => import("./pages/preparer/PreparerLayout"));
const PreparerOrdersPage = lazy(() => import("./pages/preparer/PreparerOrdersPage"));
const PreparerOrderDetailPage = lazy(() => import("./pages/preparer/PreparerOrderDetailPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 24 * 60 * 60 * 1000, // keep client cache up to 30 days
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

restoreQueryClient(queryClient);
persistQueryClient(queryClient);

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-label="جاري التحميل">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BranchProvider>
          <CartProvider>
          <ScrollToTop />
          <RouteTracker />
          <CustomerOrderAlertsListener />
          <BranchPickerDialog />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Critical storefront paths — eager for first paint */}
            <Route path="/" element={<Index />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />

            {/* Secondary customer routes — lazy */}
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/orders" element={<CustomerOrdersPage />} />
            <Route path="/order/:id" element={<OrderTrackingPage />} />
            <Route path="/complaints" element={<CustomerComplaintsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/pay/:orderId" element={<PaymentPage />} />
            <Route path="/payment-result" element={<PaymentResultPage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />

            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<AdminAuthedLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/complaints" element={<AdminComplaintsPage />} />
            <Route path="/admin/customers" element={<AdminCustomersPage />} />
            <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
            <Route path="/admin/home" element={<AdminHomePage />} />
            <Route path="/admin/drivers" element={<AdminDriversPage />} />
            <Route path="/admin/branches" element={<AdminBranchesPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/delivery" element={<AdminDeliverySettingsPage />} />
            <Route path="/admin/sales" element={<AdminSalesPage />} />
            <Route path="/admin/collections" element={<AdminCollectionsHubPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/ratings" element={<AdminRatingsPage />} />
            <Route path="/admin/email-logs" element={<AdminEmailLogsPage />} />
            <Route path="/admin/pos" element={<AdminPosPage />} />
            <Route path="/admin/tracking" element={<Navigate to="/admin/drivers" replace />} />
            <Route path="/admin/wallets" element={<Navigate to="/admin/drivers" replace />} />
            </Route>

            {/* Cashier / POS Routes */}
            <Route path="/cashier/login" element={<CashierLoginPage />} />
            <Route path="/cashier" element={<CashierLayout />}>
              <Route index element={<CashierSellPage />} />
              <Route path="shift" element={<CashierShiftPage />} />
            </Route>

            {/* Order preparer Routes */}
            <Route path="/preparer/login" element={<PreparerLoginPage />} />
            <Route path="/preparer" element={<PreparerLayout />}>
              <Route index element={<PreparerOrdersPage />} />
              <Route path="order/:id" element={<PreparerOrderDetailPage />} />
            </Route>

            {/* Driver Routes */}
            <Route path="/driver/login" element={<DriverLoginPage />} />
            <Route path="/driver" element={<DriverDashboard />} />
            <Route path="/driver/orders" element={<DriverOrdersPage />} />
            <Route path="/driver/order/:id" element={<DriverOrderDetailPage />} />
            <Route path="/driver/history" element={<DriverHistoryPage />} />
            <Route path="/driver/earnings" element={<DriverEarningsPage />} />
            <Route path="/driver/profile" element={<DriverProfilePage />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <MobileBottomNav />
          <MobileSwipeNavigation />
          </CartProvider>
          </BranchProvider>
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
