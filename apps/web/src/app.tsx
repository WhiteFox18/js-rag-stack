import { Navigate, Route, Routes } from 'react-router-dom';
import { AccountPage } from './features/auth/account-page';
import { ChatPage } from './features/chat/chat-page';
import { ChatShell } from './features/chat/chat-shell';

export function App() {
  return (
    <Routes>
      <Route element={<ChatShell />}>
        <Route path="/chats/:chatId?" element={<ChatPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Route>
    </Routes>
  );
}
