/**
 * API Key State Management (userKeyStore.ts)
 * Client-side localStorage utility for user-managed custom Groq / OpenAI API key (`user_groq_api_key`).
 * SSR-safe execution.
 */

const KEY_STORAGE_NAMES = ['user_groq_api_key', 'user_groq_key'];

/**
 * Retrieves the stored API key from localStorage.
 */
export function getUserGroqKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (const name of KEY_STORAGE_NAMES) {
      const key = localStorage.getItem(name);
      if (key && key.trim().length > 0) return key.trim();
    }
    return null;
  } catch (err) {
    console.error('[userKeyStore] Failed to read API key:', err);
    return null;
  }
}

/**
 * Saves a custom API key to localStorage under user_groq_api_key.
 */
export function setUserGroqKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cleanKey = key.trim();
    if (!cleanKey) {
      removeUserGroqKey();
      return;
    }
    localStorage.setItem('user_groq_api_key', cleanKey);
    localStorage.setItem('user_groq_key', cleanKey);
  } catch (err) {
    console.error('[userKeyStore] Failed to set user_groq_api_key:', err);
  }
}

/**
 * Removes the stored API key from localStorage.
 */
export function removeUserGroqKey(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('user_groq_api_key');
    localStorage.removeItem('user_groq_key');
  } catch (err) {
    console.error('[userKeyStore] Failed to remove API key:', err);
  }
}

/**
 * Checks whether a non-empty API key exists in localStorage.
 */
export function hasUserGroqKey(): boolean {
  const key = getUserGroqKey();
  return Boolean(key && key.length > 0);
}
