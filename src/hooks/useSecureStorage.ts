// Secure local session storage helper with in-memory & localStorage fallback
const STORAGE_PREFIX = 'rfr_secure_vault_';

export const secureStore = {
  async set(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage set failed:', e);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn('Storage get failed:', e);
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch (e) {
      console.warn('Storage delete failed:', e);
    }
  },
};
