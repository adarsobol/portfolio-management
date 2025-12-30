import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ViewType } from '../../types';

interface AppRoutesProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  children: React.ReactNode;
}

/**
 * Route configuration component
 * Handles modal state via URL: /item/:id opens modal, /dashboard closes it
 * Preserves filters/search in URL query params
 */
export const AppRoutes: React.FC<AppRoutesProps> = ({ children }) => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<>{children}</>} />
      <Route path="/item/:id" element={<>{children}</>} />
      <Route path="/admin" element={<>{children}</>} />
      <Route path="/timeline" element={<>{children}</>} />
      <Route path="/workflows" element={<>{children}</>} />
      <Route path="/dependencies" element={<>{children}</>} />
      <Route path="/resources" element={<>{children}</>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

