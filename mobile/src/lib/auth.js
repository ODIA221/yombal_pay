// Session du marchand (ou du caissier) : jeton gardé dans le coffre sécurisé, profil rechargé au démarrage.
import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadServerUrl, setToken, setUnauthorizedHandler } from './api';
import { getItem, removeItem, setItem } from './storage';

const TOKEN_KEY = 'yp_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = chargement, null = déconnecté
  const [merchant, setMerchant] = useState(undefined);

  const signOutLocal = useCallback(async () => {
    setToken(null);
    await removeItem(TOKEN_KEY);
    setMerchant(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocal);
    (async () => {
      await loadServerUrl();
      const t = await getItem(TOKEN_KEY);
      if (!t) return setMerchant(null);
      setToken(t);
      try {
        setMerchant((await api('/v1/auth/me')).merchant);
      } catch (e) {
        // Serveur injoignable : on garde le jeton, l'écran de connexion proposera de réessayer
        if (e.status === 401) await signOutLocal();
        else setMerchant(null);
      }
    })();
  }, [signOutLocal]);

  const login = useCallback(async (email, password) => {
    const r = await api('/v1/auth/login', { method: 'POST', body: { email, password, client: 'mobile' }, auth: false });
    setToken(r.token);
    await setItem(TOKEN_KEY, r.token);
    setMerchant(r.merchant);
    return r.merchant;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {}
    await signOutLocal();
  }, [signOutLocal]);

  const refresh = useCallback(async () => {
    const m = (await api('/v1/auth/me')).merchant;
    setMerchant(m);
    return m;
  }, []);

  return createElement(AuthContext.Provider, { value: { merchant, setMerchant, login, logout, refresh } }, children);
}

export const useAuth = () => useContext(AuthContext);
