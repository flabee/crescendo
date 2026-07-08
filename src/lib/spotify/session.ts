export interface SessionLike {
  accessToken?: string;
  error?: string;
}

export function tokenFromSession(session: SessionLike | null): string {
  if (session?.error) throw new Error("Session expired — please re-login.");
  if (!session?.accessToken) throw new Error("Not authenticated.");
  return session.accessToken;
}
