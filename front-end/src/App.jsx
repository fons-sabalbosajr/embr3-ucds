import React, { useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Register from './Register';
import Login from './Login'
import Universe from  './Universe';
import ProtectedRoute from './ProtectedRoute';
import axios from 'axios';

// Ensure axios sends credentials with requests
axios.defaults.withCredentials = true;

function App() {
  return (
    <BrowserRouter>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/register' element={<Register />} />
          <Route path='/home' element={<Home />} />
          <Route path='/login' element={<Login />} />
          
          <Route element={<ProtectedRoute />}> 
            <Route path='/universe/*' element={<Universe />} />
          </Route>
        </Routes>
      </BrowserRouter>
  )
}

export default App
