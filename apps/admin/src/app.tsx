import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/login-page';
import { AnonymousDetailPage } from './features/anonymous/anonymous-detail-page';
import { AnonymousPage } from './features/anonymous/anonymous-page';
import { RequireAdmin } from './features/auth/require-admin';
import { ModelsPage } from './features/models/models-page';
import { UserDetailPage } from './features/users/user-detail-page';
import { UsersPage } from './features/users/users-page';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId" element={<UserDetailPage />} />
        <Route path="/anonymous" element={<AnonymousPage />} />
        <Route path="/anonymous/:sessionId" element={<AnonymousDetailPage />} />
        <Route path="/models" element={<ModelsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
