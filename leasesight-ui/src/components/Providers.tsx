'use client';

import { AuthGate } from '@/components/AuthGate';
import { ToastProvider } from '@/components/ToastProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthGate>{children}</AuthGate>
    </ToastProvider>
  );
}
