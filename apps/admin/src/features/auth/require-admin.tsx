import { Navigate, Outlet } from 'react-router-dom';
import { AdminShell } from '../../components/admin-shell';
import { toErrorMessage } from '../../lib/api';
import { useAdmin } from './use-admin';

export function RequireAdmin() {
  const { admin, isLoading, isUnauthorized, error } = useAdmin();

  if (isLoading) {
    return <p className="p-6 text-sm text-fg-muted">Loading…</p>;
  }
  if (isUnauthorized || (!admin && !error)) {
    return <Navigate to="/login" replace />;
  }
  if (!admin) {
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        {toErrorMessage(error)}
      </p>
    );
  }
  return (
    <AdminShell admin={admin}>
      <Outlet />
    </AdminShell>
  );
}
