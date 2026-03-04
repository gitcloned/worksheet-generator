import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { TestsPage } from './pages/TestsPage';
import { CreateTestPage } from './pages/CreateTestPage';
import { TestViewerPage } from './pages/TestViewerPage';
import { TakeTestPage } from './pages/TakeTestPage';

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/take-test/:token" element={<TakeTestPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/tests" replace />} />
          <Route path="/tests" element={<TestsPage />} />
          <Route path="/tests/new" element={<CreateTestPage />} />
          <Route path="/tests/:testId" element={<TestViewerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
