export type RequestPrincipal =
  | {
      type: 'anonymous';
      anonymous_session_id: string;
    }
  | {
      type: 'authenticated';
      user_id: string;
      auth_session_id: string;
    };

export type AnonymousPrincipal = Extract<
  RequestPrincipal,
  { type: 'anonymous' }
>;
