import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';

// Page Imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/Schedules';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Settings from './pages/Settings';

// Protected Route Guard
const ProtectedRoute = ({ adminOnly = false }) => {
  const { isAuthenticated, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090D16]">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm font-medium text-slate-400">Loading Gyan Manager...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

// Public Route Guard (prevents logged in users from visiting Login)
const PublicRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

// Main Layout Wrapper
const AppLayout = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-[#090D16]">
      {/* Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <Navbar />

        {/* Scrollable page container */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/schedules" element={<Schedules />} />
            
            {/* Admin Only Routes */}
            <Route element={<ProtectedRoute adminOnly={true} />}>
              <Route path="/users" element={<Users />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Auth Routes */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<Login />} />
            </Route>

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              {/* The layout surrounds all authenticated views */}
              <Route path="/*" element={<AppLayout />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
