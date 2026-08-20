import { Routes, Route, Navigate } from 'react-router-dom';
import VerifyPage from './pages/Verify';
import NotFoundPage from './pages/NotFound';

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/verify" replace />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
