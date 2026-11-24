import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

/**
 * Глобално състояние на потребителя: профил + неговите резервации.
 * Симулираните (хиляди) резервации НЕ са тук — те живеят в двигателите (src/engine),
 * за да не се копират/сравняват от React при всяка промяна.
 */
const Ctx = createContext(null);

const KEY_PROFILE = 'ubs.profile.v1';
const KEY_BOOKINGS = 'ubs.bookings.v1';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* частен режим / пълно хранилище — приложението продължава в паметта */
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: action.profile };
    case 'addBooking':
      return { ...state, bookings: [action.booking, ...state.bookings] };
    case 'updateBooking':
      return { ...state, bookings: state.bookings.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)) };
    case 'reset':
      return { profile: null, bookings: [] };
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => ({ profile: load(KEY_PROFILE, null), bookings: load(KEY_BOOKINGS, []) }));
  useEffect(() => save(KEY_PROFILE, state.profile), [state.profile]);
  useEffect(() => save(KEY_BOOKINGS, state.bookings), [state.bookings]);
  const value = useMemo(() => ({ ...state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
