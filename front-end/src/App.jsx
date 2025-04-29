import React from 'react';
import { RouterProvider, createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import Home from './Home';
import Register from './Register';
import Login from './Login';
import Universe from './Universe';
import ProtectedRoute from './ProtectedRoute';
import HomeForgotPassword from './HomeForgotPassword';
import HomeResetPassword from './HomeResetPassword';
import axios from 'axios';

// Ensure axios sends credentials with requests
axios.defaults.withCredentials = true;

// Create the router with future flags enabled
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path='/' element={<Home />} />
      <Route path='/register' element={<Register />} />
      <Route path='/home' element={<Home />} />
      <Route path='/login' element={<Login />} />
      <Route path='/forgot-password' element={<HomeForgotPassword />} />
      <Route path='/reset-password' element={<HomeResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route path='/universe/*' element={<Universe />} />
      </Route>
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
  return <RouterProvider router={router} />;
}

export default App;
