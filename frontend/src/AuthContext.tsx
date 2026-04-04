import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchAuthStatus, getAuthToken, loginAdmin, logoutAdmin } from "./api";

interface AuthContextValue {
  /** false only when auth is configured and user is not logged in. */
  isAdmin: boolean;
  /** true while fetching /api/auth/status on mount */
  authChecking: boolean;
  /** true when PROBEMAP_ADMIN_PASSWORD is set on the server */
  authRequired: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAdmin: true,
  authChecking: false,
  authRequired: false,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(() => getAuthToken() !== null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    fetchAuthStatus()
      .then(({ required }) => {
        setAuthRequired(required);
        if (!required) setIsAdmin(true);
        // If required, isAdmin depends on whether we have a stored token
      })
      .catch(() => {
        // If status endpoint fails, assume no auth required (backward compat)
        setIsAdmin(true);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const login = useCallback(async (password: string) => {
    await loginAdmin(password);
    setIsAdmin(true);
  }, []);

  const logout = useCallback(async () => {
    await logoutAdmin();
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAdmin, authChecking, authRequired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
