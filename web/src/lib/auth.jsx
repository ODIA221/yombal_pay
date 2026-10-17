import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(undefined); // undefined = chargement, null = déconnecté

  const refresh = useCallback(async () => {
    try {
      const r = await api('/v1/auth/me');
      setMerchant(r.merchant);
      return r.merchant;
    } catch {
      setMerchant(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {}
    setMerchant(null);
  }, []);

  return <AuthContext.Provider value={{ merchant, setMerchant, refresh, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
