/**
 * API Key State Management (userKeyStore.ts)
 * Client-side localStorage utility for user-managed custom Groq API key (`user_groq_key`).
 * SSR-safe execution.
 */

const GROQ_KEY_STORAGE_NAME = 'user_groq_key';

/**
 * Retrieves the stored Groq API key from localStorage.
 */
export function getUserGroqKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = localStorage.getItem(GROQ_KEY_STORAGE_NAME);
    return key ? key.trim() : null;
  } catch (err) {
    console.error('[userKeyStore] Failed to read user_groq_key:', err);
    return null;
  }
}

/**
 * Saves a custom Groq API key to localStorage.
 */
export function setUserGroqKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cleanKey = key.trim();
    if (!cleanKey) {
      removeUserGroqKey();
      return;
    }
    localStorage.setItem(GROQ_KEY_STORAGE_NAME, cleanKey);
  } catch (err) {
    console.error('[userKeyStore] Failed to set user_groq_key:', err);
  }
}

/**
 * Removes the stored Groq API key from localStorage.
 */
export function removeUserGroqKey(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GROQ_KEY_STORAGE_NAME);
  } catch (err) {
    console.error('[userKeyStore] Failed to remove user_groq_key:', err);
  }
}

/**
 * Checks whether a non-empty Groq API key exists in localStorage.
 */
export function hasUserGroqKey(): boolean {
  const key = getUserGroqKey();
  return Boolean(key && key.length > 0);
}
