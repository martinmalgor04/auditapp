import type { Cookies } from '@sveltejs/kit';

export type CookieSetCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export function createTrackingCookies(initial: Record<string, string> = {}): {
  cookies: Cookies;
  setCalls: CookieSetCall[];
  deleteCalls: Array<{ name: string; options: Record<string, unknown> }>;
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  const setCalls: CookieSetCall[] = [];
  const deleteCalls: Array<{ name: string; options: Record<string, unknown> }> = [];

  const cookies = {
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      store.set(name, value);
      setCalls.push({ name, value, options });
    },
    delete: (name: string, options: Record<string, unknown> = {}) => {
      store.delete(name);
      deleteCalls.push({ name, options });
    },
    serialize: () => '',
    getAll: () => [...store.entries()].map(([name, value]) => ({ name, value }))
  } as unknown as Cookies;

  return { cookies, setCalls, deleteCalls, store };
}
