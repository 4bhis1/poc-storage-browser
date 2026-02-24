import React, { useState, useEffect } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
  useSearchParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import TransferStatus from "./components/TransferStatus";
import BucketsPage from "./pages/BucketsPage";
import FilesPage from "./pages/FilesPage";
import SyncPage from "./pages/SyncPage";
import SyncHistoryPage from "./pages/SyncHistoryPage";
import RecentActivitiesPage from "./pages/RecentActivitiesPage";
import LoginPage from "./pages/LoginPage";
import { SystemProvider } from "./contexts/SystemContext";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const Layout = () => {
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-hidden relative bg-white sm:rounded-tl-2xl border border-slate-200 mr-3 mb-3">
          <Routes>
            <Route path="/" element={<BucketsPage />} />
            <Route path="/files/:bucketId" element={<FilesPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/sync/:configId" element={<SyncHistoryPage />} />
            <Route path="/recent" element={<RecentActivitiesPage />} />
          </Routes>
        </div>
      </div>
      <TransferStatus />
    </div>
  );
};

const Providers = ({ children }) => {
  return (
    <Router>
      <AuthProvider>
        <SystemProvider>{children}</SystemProvider>
      </AuthProvider>
    </Router>
  );
};

const App = () => {
  return (
    <Providers>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Providers>
  );
};

export default App;
