import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";

export type UserRole = "ADMIN";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  setAuth: (token: string, user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "emme_token";

let tokenRef: string | null = localStorage.getItem(TOKEN_KEY);

export function getAuthToken(): string | null {
  return tokenRef;
}

function setStoredToken(newToken: string | null) {
  tokenRef = newToken;
  if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
  else localStorage.removeItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (authToken: string) => {
    try {
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setStoredToken(null);
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      tokenRef = storedToken;
      fetchUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== TOKEN_KEY) return;
      const newToken = e.newValue;
      tokenRef = newToken;
      setToken(newToken);
      if (newToken) fetchUser(newToken);
      else setUser(null);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [fetchUser]);

  async function login(email: string, password: string) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Errore nel login");
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }

  function setAuth(newToken: string, newUser: User) {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function updateUser(updates: Partial<User>) {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        setAuth,
        updateUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

// Per compatibilità con i componenti che chiamano usePermission()
// — in EMME esiste un solo ruolo ADMIN, tutto è permesso.
export function usePermission() {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const permissions = useMemo(
    () => ({
      isAdmin: true,
      canAccessLeads: true,
      canAccessSettings: true,
    }),
    [],
  );
  function hasRole(..._allowedRoles: UserRole[]): boolean {
    return !!role;
  }
  return { role, ...permissions, hasRole };
}
