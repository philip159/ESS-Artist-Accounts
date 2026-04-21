import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminLayout } from "@/layouts/AdminLayout";
import { ArtistLayout } from "@/layouts/ArtistLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import { ArtistAuthProvider, useArtistAuth } from "@/contexts/ArtistAuthContext";
import NotFound from "@/pages/not-found";
import ArtistSubmit from "@/pages/ArtistSubmit";
import FramePreview from "@/pages/FramePreview";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin/Dashboard";
import Artworks from "@/pages/Artworks";
import Templates from "@/pages/Templates";
import AdminMockups from "@/pages/admin/Mockups";
import AdminExports from "@/pages/admin/Exports";
import FormSettings from "@/pages/admin/FormSettings";
import AdminFeedback from "@/pages/admin/Feedback";
import COAEditor from "@/pages/admin/COAEditor";
import EmailTemplates from "@/pages/admin/EmailTemplates";
import AdminArtists from "@/pages/admin/Artists";
import AdminPayouts from "@/pages/admin/Payouts";
import ContractEditor from "@/pages/admin/ContractEditor";
import AdminContracts from "@/pages/admin/Contracts";
import AdminForms from "@/pages/admin/Forms";
import AdminFormDetail from "@/pages/admin/FormDetail";
import ArtistDashboard from "@/pages/artist/Dashboard";
import ArtistArtworks from "@/pages/artist/Artworks";
import ArtistPayouts from "@/pages/artist/Payouts";
import ArtistUpload from "@/pages/artist/Upload";
import ArtistCommissions from "@/pages/artist/Commissions";
import ArtistInvoices from "@/pages/artist/Invoices";
import ArtistFAQs from "@/pages/artist/FAQs";
import ArtistSettings from "@/pages/artist/Settings";
import ArtistLogin from "@/pages/artist/Login";
import ArtistSetup from "@/pages/artist/Setup";
import ArtistOnboarding from "@/pages/ArtistOnboarding";
import CreatorContract from "@/pages/CreatorContract";
import AdminCreators from "@/pages/admin/Creators";
import AdminQuickOrder from "@/pages/AdminQuickOrder";
import AdminARViewer from "@/pages/admin/ARViewer";
import ARViewer from "@/pages/ARViewer";
import ARTest from "@/pages/ARTest";
import ShopifyARViewer from "@/pages/ShopifyARViewer";
import ShopifyIntegration from "@/pages/admin/ShopifyIntegration";
import SizeMapping from "@/pages/admin/SizeMapping";
import ARAnalytics from "@/pages/admin/ARAnalytics";
import ARImageReport from "@/pages/admin/ARImageReport";
import ProductAddons from "@/pages/admin/ProductAddons";
import AdaptiveImages from "@/pages/admin/AdaptiveImages";
import MountReview from "@/pages/admin/MountReview";
import MultiRatio from "@/pages/admin/MultiRatio";
import ErrorLogs from "@/pages/admin/ErrorLogs";
import MediaEditor from "@/pages/admin/MediaEditor";
import ScanVideoVariants from "@/pages/admin/ScanVideoVariants";
import ScanVideoManager from "@/pages/admin/ScanVideoManager";
import ProductMedia from "@/pages/admin/ProductMedia";
import SocialMedia from "@/pages/admin/SocialMedia";
import HighResReview from "@/pages/admin/HighResReview";
import HangerPositioner from "@/pages/HangerPositioner";
import { Loader2 } from "lucide-react";

function ArtistProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useArtistAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/artist/login" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/preview" component={FramePreview} />
      <Route path="/submit" component={ArtistSubmit} />
      <Route path="/onboarding/:token" component={ArtistOnboarding} />
      <Route path="/creator-contract/:token" component={CreatorContract} />
      <Route path="/ar/shopify" component={ShopifyARViewer} />
      <Route path="/ar/test" component={ARTest} />
      <Route path="/admin/hanger-position" component={HangerPositioner} />
      <Route path="/ar/:id" component={ARViewer} />
      <Route path="/">
        {() => <Redirect to={`/artist/login${window.location.hash}`} />}
      </Route>
      
      <Route path="/admin/login" component={AdminLogin} />
      
      <Route path="/admin">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/artworks">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <Artworks />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/mockups">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminMockups />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/templates">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <Templates />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/exports">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminExports />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/settings">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <FormSettings />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/feedback">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminFeedback />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/coa-editor">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <COAEditor />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/email-templates">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <EmailTemplates />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/artworks">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistArtworks />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/payouts">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistPayouts />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/upload">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistUpload />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/commissions">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistCommissions />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/invoices">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistInvoices />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/faqs">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistFAQs />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id/settings">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistSettings />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/view-artist/:id">
        {() => (
          <ProtectedRoute>
            <ArtistLayout>
              <ArtistDashboard />
            </ArtistLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/artists">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminArtists />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/payouts">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminPayouts />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/contract-editor">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ContractEditor />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/contracts">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminContracts />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/forms/:key">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminFormDetail />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/forms">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminForms />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/creators">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminCreators />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/quick-order">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminQuickOrder />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/ar-viewer">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdminARViewer />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/size-mapping">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <SizeMapping />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/shopify-integration">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ShopifyIntegration />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/ar-analytics">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ARAnalytics />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/ar-image-report">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ARImageReport />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/product-addons">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ProductAddons />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/adaptive-images">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <AdaptiveImages />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/multi-ratio">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <MultiRatio />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/high-res-review">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <HighResReview />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/mount-review">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <MountReview />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/media-editor">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <MediaEditor />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/error-logs">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ErrorLogs />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/scan-video-variants">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ScanVideoVariants />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/scan-videos">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ScanVideoManager />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/product-media">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <ProductMedia />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/social-media">
        {() => (
          <ProtectedRoute>
            <AdminLayout>
              <SocialMedia />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      
      <Route path="/artist/login" component={ArtistLogin} />
      <Route path="/artist/setup" component={ArtistSetup} />
      <Route path="/artist">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistDashboard />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/artworks">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistArtworks />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/payouts">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistPayouts />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/upload">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistUpload />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/commissions">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistCommissions />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/invoices">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistInvoices />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/faqs">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistFAQs />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      <Route path="/artist/settings">
        {() => (
          <ArtistProtectedRoute>
            <ArtistLayout>
              <ArtistSettings />
            </ArtistLayout>
          </ArtistProtectedRoute>
        )}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ArtistAuthProvider>
          <ImpersonationProvider>
            <Router />
          </ImpersonationProvider>
        </ArtistAuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
