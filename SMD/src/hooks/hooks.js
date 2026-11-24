import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getEngine } from '../engine/registry.js';
import { useStore } from '../store/store.jsx';

/** Минимален hash router: #/ , #/b/:id , #/my , #/bench , #/profile */
export function useRoute() {
  const read = () => window.location.hash.slice(1) || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (path) => {
  window.location.hash = path;
};

/**
 * Връща двигателя на бизнеса и неговата версия.
 * useSyncExternalStore: компонентът се преизчертава САМО когато версията на този двигател се смени.
 */
export function useEngine(cfg) {
  const { bookings } = useStore();
  // bookings се подават само при първото създаване (после двигателят се обновява инкрементално)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const engine = useMemo(() => getEngine(cfg, bookings), [cfg]);
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);
  return [engine, version];
}
