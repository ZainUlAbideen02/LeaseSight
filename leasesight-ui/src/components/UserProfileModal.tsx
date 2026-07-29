'use client';

import { useState, useEffect } from 'react';
import { X, User, Zap, Key, CreditCard, LogOut, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';
import { getUserState, UserState } from '@/lib/userStore';
import { toast } from 'sonner';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPricingModal: () => void;
  onOpenApiKeyModal: () => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  onOpenPricingModal,
  onOpenApiKeyModal,
}: UserProfileModalProps) {
  const [userState, setUserState] = useState<UserState>(getUserState());

  const refreshState = () => {
    setUserState(getUserState());
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
    }
    window.addEventListener('user_store_updated', refreshState);
    return () => window.removeEventListener('user_store_updated', refreshState);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogout = () => {
    toast.info('Logged out of LeaseSight session.');
    onClose();
  };

  const getPlanTitle = (plan: string) => {
    switch (plan) {
      case 'starter':
        return 'Starter Plan ($5 / mo)';
      case 'pay_as_you_go':
        return 'Pay-As-You-Go ($0.50 / audit)';
      case 'enterprise':
        return 'Enterprise Plan';
      default:
        return 'Free Plan ($0 / mo)';
    }
  };

  const hasKey = Boolean(userState.customApiKey && userState.customApiKey.length > 0);
  const keyMask = hasKey && userState.customApiKey
    ? `${userState.customApiKey.slice(0, 4)}...${userState.customApiKey.slice(-4)}`
    : '';

  const creditPercentage = Math.min(100, Math.round((userState.remainingCredits / Math.max(1, userState.monthlyAllowance)) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl text-zinc-900 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-md">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900">{userState.userEmail}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                  {userState.planType.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Commercial Real Estate Auditor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-gray-100 hover:text-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subscription & Credit Details */}
        <div className="my-5 space-y-3">
          
          {/* Active Plan Card */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Active Subscription</p>
                <p className="text-sm font-bold text-zinc-900">{getPlanTitle(userState.planType)}</p>
              </div>
            </div>
            <button
              onClick={() => { onClose(); onOpenPricingModal(); }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Upgrade <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Audit Credits Tracker */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-zinc-700" />
                <span className="text-xs font-bold text-zinc-900">Audit Credits Remaining</span>
              </div>
              <span className="text-xs font-extrabold text-zinc-900">
                {userState.remainingCredits} / {userState.monthlyAllowance} Left
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full bg-zinc-900 rounded-full transition-all duration-300" style={{ width: `${creditPercentage}%` }} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">
              Top up available anytime or bring your own API key for unlimited audits.
            </p>
          </div>

          {/* API Key Status */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-200 text-zinc-700 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Engine Key</p>
                {hasKey ? (
                  <div className="flex items-center gap-1 text-emerald-700 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Custom Groq Key Active ({keyMask})</span>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-zinc-900">LeaseSight Hybrid Engine</p>
                )}
              </div>
            </div>
            <button
              onClick={() => { onClose(); onOpenApiKeyModal(); }}
              className="text-xs font-semibold text-zinc-900 hover:text-black underline"
            >
              Manage
            </button>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col gap-2">
          <button
            onClick={() => { onClose(); onOpenPricingModal(); }}
            className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-semibold tracking-wider uppercase transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Top-Up Credits / Upgrade Plan
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-zinc-700 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </div>

      </div>
    </div>
  );
}
