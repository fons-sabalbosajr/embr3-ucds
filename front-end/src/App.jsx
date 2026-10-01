import React from 'react';
import { RouterProvider, createBrowserRouter, createRoutesFromElements, Route, Navigate } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import ThemeProvider from './theme/ThemeProvider';
import FeedbackBridge from './shared/FeedbackBridge';
import Landing from './Landing';
import Register from './Register';
import Login from './Login';
import Universe from './Universe';
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

      {/* Legacy paths — kept so existing bookmarks and password-reset emails work */}
      <Route path='/' element={<RedirectTo to={ROUTES.landing} />} />
      <Route path='/home' element={<RedirectTo to={ROUTES.landing} />} />
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
          <Route path='/universe/*' element={<Universe />} errorElement={<RouteError />} />
        </Route>
      </Route>

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
      <AntdApp component={false}>
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
