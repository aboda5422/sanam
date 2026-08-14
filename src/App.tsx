import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import CheckoutPage from "./pages/CheckoutPage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import NotFound from "./pages/NotFound";
import CustomerComplaintsPage from "./pages/CustomerComplaintsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import PaymentPage from "./pages/PaymentPage";
import PaymentResultPage from "./pages/PaymentResultPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RouteTracker from "./components/RouteTracker";
import ScrollToTop from "./components/ScrollToTop";
import MobileBottomNav from "./components/layout/MobileBottomNav";
import MobileSwipeNavigation from "./components/layout/MobileSwipeNavigation";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import AdminCategoriesPage from "./pages/admin/AdminCategoriesPage";
import AdminComplaintsPage from "./pages/admin/AdminComplaintsPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminDriversPage from "./pages/admin/AdminDriversPage";
import AdminBranchesPage from "./pages/admin/AdminBranchesPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminDeliverySettingsPage from "./pages/admin/AdminDeliverySettingsPage";
import AdminSalesPage from "./pages/admin/AdminSalesPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminCustomersPage from "./pages/admin/AdminCustomersPage";
import AdminAnnouncementsPage from "./pages/admin/AdminAnnouncementsPage";
import AdminPaymentsPage from "./pages/admin/AdminPaymentsPage";
import AdminEmailLogsPage from "./pages/admin/AdminEmailLogsPage";
// Driver pages
import DriverLoginPage from "./pages/driver/DriverLoginPage";
import DriverDashboard from "./pages/driver/DriverDashboard";
import DriverOrdersPage from "./pages/driver/DriverOrdersPage";
import DriverOrderDetailPage from "./pages/driver/DriverOrderDetailPage";
import DriverHistoryPage from "./pages/driver/DriverHistoryPage";
import DriverEarningsPage from "./pages/driver/DriverEarningsPage";
import DriverProfilePage from "./pages/driver/DriverProfilePage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
      <CartProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BranchProvider>
          <ScrollToTop />
          <RouteTracker />
          <BranchPickerDialog />
          <Routes>
            {/* Customer Routes */}
            <Route path="/" element={<Index />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/order/:id" element={<OrderTrackingPage />} />
            <Route path="/complaints" element={<CustomerComplaintsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/pay/:orderId" element={<PaymentPage />} />
            <Route path="/payment-result" element={<PaymentResultPage />} />
            <Route path="/unsubscribe" element={<UnsubscribePage />} />

            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrdersPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/complaints" element={<AdminComplaintsPage />} />
            <Route path="/admin/customers" element={<AdminCustomersPage />} />
            <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
            <Route path="/admin/drivers" element={<AdminDriversPage />} />
            <Route path="/admin/branches" element={<AdminBranchesPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/delivery" element={<AdminDeliverySettingsPage />} />
            <Route path="/admin/sales" element={<AdminSalesPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/email-logs" element={<AdminEmailLogsPage />} />
            <Route path="/admin/tracking" element={<Navigate to="/admin/drivers" replace />} />
            <Route path="/admin/wallets" element={<Navigate to="/admin/drivers" replace />} />

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
          <MobileBottomNav />
          <MobileSwipeNavigation />
          </BranchProvider>
        </BrowserRouter>
      </CartProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
