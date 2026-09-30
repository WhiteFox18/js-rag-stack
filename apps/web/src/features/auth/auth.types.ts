import type { AuthUser } from '@js-rag-stack/api-client';

export type AuthMode = 'sign-in' | 'sign-up';

export interface AuthDialogProps {
  initialMode: AuthMode;
  onClose: () => void;
}

export interface AuthMenuProps {
  user: AuthUser | null;
  onSignIn: () => void;
  onSignUp: () => void;
}
