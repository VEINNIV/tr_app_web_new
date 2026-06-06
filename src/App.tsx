import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TranslationProvider } from './context/TranslationContext';
import { ThemeProvider } from './context/ThemeContext';
import { CartProvider } from './context/CartContext';
import Navbar from './components/ui/Navbar';
import BottomNav from './components/ui/BottomNav';
import TranslationStatusBar from './components/TranslationStatusBar';
import CookieConsent from './components/ui/CookieConsent';
import EnvErrorPage from './components/EnvErrorPage';
import OnboardingModal from './components/OnboardingModal';
import { checkEnv } from './lib/env';
import ErrorBoundary from './components/ErrorBoundary';

const LandingPage        = lazy(() => import('./pages/LandingPage'));
const AuthPage           = lazy(() => import('./pages/AuthPage'));
const DashboardPage      = lazy(() => import('./pages/DashboardPage'));
const TranslatorPage     = lazy(() => import('./pages/TranslatorPage'));
const DocumentsPage      = lazy(() => import('./pages/DocumentsPage'));
const ChatPage           = lazy(() => import('./pages/ChatPage'));
const SettingsPage       = lazy(() => import('./pages/SettingsPage'));
const StudyNotesPage     = lazy(() => import('./pages/StudyNotesPage'));
const StudyDeckPage      = lazy(() => import('./pages/StudyDeckPage'));
const AdminDashboardPage  = lazy(() => import('./pages/AdminDashboardPage'));
const CheckoutPage        = lazy(() => import('./pages/CheckoutPage'));
const GlossaryPage        = lazy(() => import('./pages/GlossaryPage'));
const SharedDocumentPage  = lazy(() => import('./pages/SharedDocumentPage'));
const ToolsPage           = lazy(() => import('./pages/ToolsPage'));
const ContactPage         = lazy(() => import('./pages/ContactPage'));
const LegalPage           = lazy(() => import('./pages/LegalPage'));
const WritePage           = lazy(() => import('./pages/WritePage'));
const UnderConstructionPage = lazy(() => import('./pages/UnderConstructionPage'));
const NotFoundPage        = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </motion.div>
  );
}

function AppLayout() {
  const location = useLocation();
  const { user, profile, refreshProfile } = useAuth();
  const hideNavbar = location.pathname === '/auth';
  const showBottomNav = !!user && location.pathname !== '/auth' && location.pathname !== '/';
  const showOnboarding = !!user && !!profile && profile.onboarding_completed === false;

  return (
    <>
      {!hideNavbar && <Navbar />}
      <main style={{ flex: 1, paddingTop: hideNavbar ? 0 : undefined }}>
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
              <Route path="/auth" element={<PageTransition><AuthPage /></PageTransition>} />
              <Route path="/dashboard" element={<ProtectedRoute><PageTransition><DashboardPage /></PageTransition></ProtectedRoute>} />
              <Route path="/translate" element={<ProtectedRoute><PageTransition><TranslatorPage /></PageTransition></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><PageTransition><DocumentsPage /></PageTransition></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><PageTransition><ChatPage /></PageTransition></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><PageTransition><SettingsPage /></PageTransition></ProtectedRoute>} />
              <Route path="/study-notes" element={<ProtectedRoute><PageTransition><StudyNotesPage /></PageTransition></ProtectedRoute>} />
              <Route path="/study" element={<ProtectedRoute><PageTransition><StudyDeckPage /></PageTransition></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><PageTransition><AdminDashboardPage /></PageTransition></AdminRoute>} />
              <Route path="/glossary" element={<ProtectedRoute><PageTransition><GlossaryPage /></PageTransition></ProtectedRoute>} />
              <Route path="/tools" element={<ProtectedRoute><PageTransition><ToolsPage /></PageTransition></ProtectedRoute>} />
              <Route path="/listen" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="listen" /></PageTransition></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="projects" /></PageTransition></ProtectedRoute>} />
              <Route path="/highlight" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="highlight" /></PageTransition></ProtectedRoute>} />
              <Route path="/mindmap" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="mindmap" /></PageTransition></ProtectedRoute>} />
              <Route path="/cite" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="cite" /></PageTransition></ProtectedRoute>} />
              <Route path="/write" element={<ProtectedRoute><PageTransition><WritePage /></PageTransition></ProtectedRoute>} />
              <Route path="/achievements" element={<ProtectedRoute><PageTransition><UnderConstructionPage slug="achievements" /></PageTransition></ProtectedRoute>} />
              <Route path="/shared/:token" element={<PageTransition><SharedDocumentPage /></PageTransition>} />
              <Route path="/checkout" element={<PageTransition><CheckoutPage /></PageTransition>} />
              <Route path="/pricing" element={<PageTransition><LandingPage /></PageTransition>} />
              <Route path="/contact" element={<PageTransition><ContactPage /></PageTransition>} />
              <Route path="/legal" element={<PageTransition><LegalPage /></PageTransition>} />
              <Route path="/legal/:slug" element={<PageTransition><LegalPage /></PageTransition>} />
              <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>
      <TranslationStatusBar />
      <CookieConsent />
      {showBottomNav && <BottomNav />}
      {showOnboarding && (
        <OnboardingModal userId={user!.id} onComplete={refreshProfile} />
      )}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-lg)',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-family)',
          },
        }}
      />
    </>
  );
}

export default function App() {
  const env = checkEnv();
  if (!env.ok) return <EnvErrorPage missing={env.missing} />;

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <TranslationProvider>
                <AppLayout />
              </TranslationProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
