import { useCallback, useEffect, useState } from 'react';

const KEY = 'card-table:pile';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The visitor's offer pile: item ids, remembered in this browser. */
export function usePile() {
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* private mode etc.: the pile just won't persist */
    }
  }, [ids]);

  const add = useCallback((id: string) => setIds((p) => (p.includes(id) ? p : [...p, id])), []);
  const remove = useCallback((id: string) => setIds((p) => p.filter((x) => x !== id)), []);
  const clear = useCallback(() => setIds([]), []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, setIds, add, remove, clear, has };
}
