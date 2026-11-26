import React, { Suspense, lazy } from 'react';
import { RouterProvider, createBrowserRouter, createRoutesFromElements, Route, Navigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import ThemeProvider from './theme/ThemeProvider';
import FeedbackBridge from './shared/FeedbackBridge';
import Landing from './Landing';
import Register from './Register';
import Login from './Login';
import ProtectedRoute from './ProtectedRoute';
import YearGuard from './YearGuard';
import RouteError from './RouteError';
import YearSelect from './YearSelect';
import { YearProvider } from './context/YearContext';
import { UcdsSettingsProvider } from './context/UcdsSettingsContext';
import HomeForgotPassword from './HomeForgotPassword';
import HomeResetPassword from './HomeResetPassword';
import { ROUTES, SITE_BASE } from './config/routes';
import axios from 'axios';
import PageLoading from './shared/components/PageLoading';

// The signed-in application: its own chunk, so the landing and sign-in pages do
// not carry it. On 4 Nov 2026 it made them download 4.2 MB (1.3 MB compressed).
const Universe = lazy(() => import('./Universe'));
// The public Document Portal: its own chunk, so the landing and sign-in pages
// do not carry the PDF viewer.
const DocumentPortal = lazy(() => import('./modules/portal/DocumentPortal'));
// The Progress Tracker's public link: its own chunk too (the charts).
const PublicProgress = lazy(() => import('./modules/admin/progress/PublicProgress'));

// Ensure axios sends credentials with requests
axios.defaults.withCredentials = true;

// The backend answers 409 NO_ACTIVE_YEAR when a year-scoped route is called
// without a container selected, and 403 YEAR_FORBIDDEN when access has been
// revoked since selection. Either way the correct destination is the picker.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error?.response?.data?.code;
    const onPicker = window.location.pathname === ROUTES.selectYear;
    if ((code === 'NO_ACTIVE_YEAR' || code === 'YEAR_FORBIDDEN') && !onPicker) {
      window.location.assign(ROUTES.selectYear);
    }
    // DOMAIN_FORBIDDEN is deliberately not redirected. The screen that made
    // the call renders its own explanation, and bouncing the user elsewhere
    // would hide which module they were refused.
    return Promise.reject(error);
  }
);

// Preserve any query string (the reset-password token) when forwarding a legacy
// path to its new home under SITE_BASE.
const RedirectTo = ({ to }) => (
  <Navigate to={`${to}${window.location.search}${window.location.hash}`} replace />
);

/** /universe/<rest> → /e-universe/<rest>, query and hash kept; bare /universe → the app's home. */
const LegacyAppRedirect = () => {
  const rest = window.location.pathname.replace(/^\/universe\/?/, '');
  return <Navigate to={`${rest ? `${ROUTES.app}/${rest}` : ROUTES.appHome}${window.location.search}${window.location.hash}`} replace />;
};

// Create the router with future flags enabled
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Public site */}
      <Route path={SITE_BASE} element={<Landing />} />
      <Route path={ROUTES.login} element={<Login />} />
      <Route path={ROUTES.register} element={<Register />} />
      <Route path={ROUTES.forgotPassword} element={<HomeForgotPassword />} />
      <Route path={ROUTES.resetPassword} element={<HomeResetPassword />} />
      {/* Public, outside the application: anyone asks for a scanned document
          and reads it here once the Records Unit approves. No sign-in. */}
      <Route
        path={ROUTES.documentPortal}
        element={
          <Suspense fallback={<PageLoading tip="Opening the Document Portal" />}>
            <DocumentPortal />
          </Suspense>
        }
        errorElement={<RouteError />}
      />
      {/* Public, outside the application: the UCD updating's figures for a
          link the Developer turned on. Read-only; no sign-in. */}
      <Route
        path={ROUTES.progressPublic}
        element={
          <Suspense fallback={<PageLoading tip="Opening the progress" />}>
            <PublicProgress />
          </Suspense>
        }
        errorElement={<RouteError />}
      />

      {/* Legacy paths — kept so existing bookmarks and password-reset emails work */}
      <Route path='/' element={<RedirectTo to={ROUTES.landing} />} />
      <Route path='/home' element={<RedirectTo to={ROUTES.landing} />} />
      {/* The year picker moved under /e-universe; old bookmarks still arrive. */}
      <Route path='/select-year' element={<RedirectTo to={ROUTES.selectYear} />} />
      <Route path='/login' element={<RedirectTo to={ROUTES.login} />} />
      <Route path='/register' element={<RedirectTo to={ROUTES.register} />} />
      <Route path='/forgot-password' element={<RedirectTo to={ROUTES.forgotPassword} />} />
      <Route path='/reset-password' element={<RedirectTo to={ROUTES.resetPassword} />} />
      {/* The public site used to live under /universe-central-database-system. */}
      <Route path='/universe-central-database-system' element={<RedirectTo to={ROUTES.landing} />} />
      <Route path='/universe-central-database-system/login' element={<RedirectTo to={ROUTES.login} />} />
      <Route path='/universe-central-database-system/register' element={<RedirectTo to={ROUTES.register} />} />
      <Route path='/universe-central-database-system/forgot-password' element={<RedirectTo to={ROUTES.forgotPassword} />} />
      <Route path='/universe-central-database-system/reset-password' element={<RedirectTo to={ROUTES.resetPassword} />} />

      {/* Authenticated: choose a year container, then enter the application */}
      <Route element={<ProtectedRoute />}>
        <Route path={ROUTES.selectYear} element={<YearSelect />} errorElement={<RouteError />} />
        <Route element={<YearGuard />}>
          <Route
            path='/e-universe/*'
            element={
              <Suspense fallback={<PageLoading tip="Opening E-Universe" />}>
                <Universe />
              </Suspense>
            }
            errorElement={<RouteError />}
          />
        </Route>
      </Route>

      {/* The application moved from /universe to /e-universe: old bookmarks,
          emailed links and stored notices still arrive. */}
      <Route path='/universe/*' element={<LegacyAppRedirect />} />

      {/* Unknown paths land on the public site rather than a blank screen */}
      <Route path='*' element={<RedirectTo to={ROUTES.landing} />} />
    </>
  ),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

function App() {
  // AntdApp supplies the context that message/notification/Modal need in order
  // to read the dynamic theme. `component={false}` renders no wrapper element,
  // so existing full-height layouts are unaffected.
  // ThemeProvider owns the ConfigProvider, so the login, landing and
  // year-selection screens are themed too. Previously only the authenticated
  // shell was, and signing in felt like crossing between two applications.
  return (
    <ThemeProvider>
      {/* Notices open below the 64px header, so one that stays until dismissed
          (a document request) never covers the bell or the account menu. */}
      <AntdApp component={false} notification={{ top: 76 }}>
        {/* Captures the context-aware message/notification/modal instances so
            code outside a component can use them without the static API's
            "cannot consume context" warning. Renders nothing. */}
        <FeedbackBridge />
        <YearProvider>
          <RouterProvider router={router} />
        </YearProvider>
      </AntdApp>
    </ThemeProvider>
  );
}

export default App;
