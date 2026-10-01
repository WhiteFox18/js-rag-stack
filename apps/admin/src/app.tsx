import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/login-page';
import { RequireAdmin } from './features/auth/require-admin';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route
          path="/users"
          element={<h1 className="text-lg font-semibold">Users</h1>}
        />
        <Route
          path="/anonymous"
          element={<h1 className="text-lg font-semibold">Anonymous</h1>}
        />
        <Route
          path="/models"
          element={<h1 className="text-lg font-semibold">Models</h1>}
        />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
