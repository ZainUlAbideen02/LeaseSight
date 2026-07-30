/**
 * Dynamic User & Credit State Store (userStore.ts)
 * Reactive local storage state manager for user subscription plans, audit credits, and API keys.
 * SSR-safe execution. Credit state is keyed per Clerk userId to isolate accounts.
 */

export type PlanType = 'free' | 'starter' | 'pay_as_you_go' | 'enterprise';

export interface UserState {
  planType: PlanType;
  remainingCredits: number;
  monthlyAllowance: number;
  customApiKey: string | null;
  userEmail: string;
  clerkUserId: string | null;
}

const STORAGE_KEY = 'leasesight_user_store';
const INITIALIZED_USERS_KEY = 'leasesight_initialized_users';

const DEFAULT_STATE: UserState = {
  planType: 'free',
  remainingCredits: 3,
  monthlyAllowance: 3,
  customApiKey: null,
  userEmail: '',
  clerkUserId: null,
};

export function getUserState(): UserState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existingApiKey =
      localStorage.getItem('user_groq_api_key') || localStorage.getItem('user_groq_key');

    if (!raw) {
      const initialState = { ...DEFAULT_STATE, customApiKey: existingApiKey || null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
      return initialState;
    }

    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      customApiKey: existingApiKey || parsed.customApiKey || null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveUserState(state: UserState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('user_store_updated'));
  } catch (err) {
    console.error('[userStore] Failed to save state:', err);
  }
}

/**
 * Initialize session for a given Clerk userId.
 * - First-time users get 3 free credits seeded.
 * - Returning users retain their existing credit balance.
 */
export function initializeUserSession(userId: string, email?: string): UserState {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  try {
    const current = getUserState();

    // Check if this userId has been initialized before
    const rawInitialized = localStorage.getItem(INITIALIZED_USERS_KEY);
    const initializedUsers: string[] = rawInitialized ? JSON.parse(rawInitialized) : [];
    const isNewUser = !initializedUsers.includes(userId);

    let newState: UserState;

    if (isNewUser) {
      // Brand new user — seed 3 free credits
      newState = {
        ...DEFAULT_STATE,
        remainingCredits: 3,
        monthlyAllowance: 3,
        planType: 'free',
        clerkUserId: userId,
        userEmail: email || current.userEmail || '',
        customApiKey: current.customApiKey || null,
      };
      // Mark as initialized
      initializedUsers.push(userId);
      localStorage.setItem(INITIALIZED_USERS_KEY, JSON.stringify(initializedUsers));
    } else {
      // Returning user — retain existing state, just update userId + email
      newState = {
        ...current,
        clerkUserId: userId,
        userEmail: email || current.userEmail || '',
      };
    }

    saveUserState(newState);
    return newState;
  } catch {
    return DEFAULT_STATE;
  }
}

export function setPlan(planType: PlanType): UserState {
  const current = getUserState();
  const allowance =
    planType === 'starter' ? 25 : planType === 'pay_as_you_go' ? current.monthlyAllowance : 3;
  const newState: UserState = {
    ...current,
    planType,
    monthlyAllowance: allowance,
    remainingCredits: planType === 'starter' ? 25 : current.remainingCredits,
  };
  saveUserState(newState);
  return newState;
}

export function addCredits(count: number): UserState {
  const current = getUserState();
  const newState: UserState = {
    ...current,
    remainingCredits: current.remainingCredits + count,
  };
  saveUserState(newState);
  return newState;
}

export function deductCredit(): boolean {
  const current = getUserState();
  // BYOK users are never charged credits
  if (current.customApiKey && current.customApiKey.length > 0) {
    return true;
  }
  if (current.remainingCredits <= 0) {
    return false;
  }
  const newState: UserState = {
    ...current,
    remainingCredits: current.remainingCredits - 1,
  };
  saveUserState(newState);
  return true;
}

export function setApiKey(key: string | null): UserState {
  const current = getUserState();
  const cleanKey = key ? key.trim() : null;

  if (cleanKey) {
    localStorage.setItem('user_groq_api_key', cleanKey);
    localStorage.setItem('user_groq_key', cleanKey);
  } else {
    localStorage.removeItem('user_groq_api_key');
    localStorage.removeItem('user_groq_key');
  }

  const newState: UserState = {
    ...current,
    customApiKey: cleanKey,
  };
  saveUserState(newState);
  return newState;
}

export function resetUserStore(): UserState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INITIALIZED_USERS_KEY);
    const newState: UserState = {
      ...DEFAULT_STATE,
      remainingCredits: 3,
      monthlyAllowance: 3,
      planType: 'free',
    };
    saveUserState(newState);
    return newState;
  } catch {
    return DEFAULT_STATE;
  }
}

