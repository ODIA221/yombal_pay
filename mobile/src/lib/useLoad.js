// Charge des données à l'affichage de l'écran, les rafraîchit périodiquement tant qu'il est visible,
// et gère le « tirer pour rafraîchir ».
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useLoad(fetcher, { every = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef(fetcher);
  // Toujours la dernière version du chargeur (filtres à jour), mise à jour après le rendu
  useLayoutEffect(() => {
    ref.current = fetcher;
  });

  const load = useCallback(async () => {
    try {
      setData(await ref.current());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!every) return undefined;
      const t = setInterval(load, every);
      return () => clearInterval(t);
    }, [load, every]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, refresh, reload: load, setData };
}
