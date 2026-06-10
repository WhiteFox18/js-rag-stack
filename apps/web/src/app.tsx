import { Route, Routes } from 'react-router-dom';
import { HealthPage } from './features/health/health-page';

export function App() {
  return (
    <Routes>
      <Route path="*" element={<HealthPage />} />
    </Routes>
  );
}
