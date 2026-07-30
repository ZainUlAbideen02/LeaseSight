'use client';

import { useState, useEffect } from 'react';
import { Search, Settings, Cpu, Sparkles, User, Zap } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ApiKeyModal } from './ApiKeyModal';
import { ContactSalesModal } from './ContactSalesModal';
import { PricingModal } from './PricingModal';
import { UserProfileModal } from './UserProfileModal';
import { hasUserGroqKey } from '@/lib/userKeyStore';
import { getUserState, UserState } from '@/lib/userStore';

interface HeaderProps {
  isAuditing?: boolean;
  onToggleNetwork?: () => void;
  documents: string[];
  onSelectDoc: (doc: string) => void;
}

export function Header({ documents, onSelectDoc }: HeaderProps) {
  const [searchQuery, setSearchQuery]         = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen]   = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isContactSalesModalOpen, setIsContactSalesModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [hasKey, setHasKey]                   = useState(false);
  const [userState, setUserState]             = useState<UserState | null>(null);

  // Load user state on mount and whenever the store updates
  useEffect(() => {
    function syncState() {
      setHasKey(hasUserGroqKey());
      setUserState(getUserState());
    }
    syncState();
    window.addEventListener('user_store_updated', syncState);
    return () => window.removeEventListener('user_store_updated', syncState);
  }, []);

  // Derive credit badge label
  function getCreditLabel(): { text: string; color: string } {
    if (!userState) return { text: '— audits', color: 'text-zinc-400' };
    if (userState.customApiKey && userState.customApiKey.length > 0) {
      return { text: 'Unlimited (BYOK)', color: 'text-emerald-600' };
    }
    if (userState.planType === 'starter') {
      return {
        text: 'Starter Plan Active',
        color: 'text-zinc-900',
      };
    }
    const rem = userState.remainingCredits;
    const total = userState.monthlyAllowance;
    const color = rem === 0 ? 'text-red-600' : rem === 1 ? 'text-amber-600' : 'text-zinc-900';
    return { text: `${rem} / ${total} Free Audits`, color };
  }

  const creditLabel = getCreditLabel();

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0 relative z-40">

      {/* Left: Brand Logo */}
      <div className="flex items-center gap-6">
        <BrandLogo className="hover:opacity-80 transition-opacity" />
      </div>

      {/* Center: Document Search Bar */}
      <div className="relative hidden md:block">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg w-72 transition-all bg-gray-50 border ${
            isSearchFocused ? 'border-zinc-900 bg-white ring-1 ring-zinc-900' : 'border-gray-200'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Search documents…"
            className="text-xs bg-transparent outline-none flex-1 text-zinc-900 placeholder:text-zinc-400"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white text-zinc-400 border border-gray-200 hidden sm:block font-mono">
            ⌘K
          </kbd>
        </div>

        {/* Search Results Dropdown */}
        {isSearchFocused && searchQuery && (
          <div className="absolute top-full mt-1 w-full rounded-xl shadow-lg overflow-hidden z-50 border border-gray-200 bg-white animate-fade-in">
            {documents
              .filter(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 5)
              .map(doc => (
                <button
                  key={doc}
                  onMouseDown={() => { onSelectDoc(doc); setSearchQuery(''); setIsSearchFocused(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors truncate hover:bg-gray-50 text-zinc-900"
                >
                  {doc}
                </button>
              ))}
            {documents.filter(d => d.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400">No documents found</div>
            )}
          </div>
        )}
      </div>

      {/* Right: Active Utility Controls */}
      <div className="flex items-center gap-3">

        {/* Live Credit Counter Badge */}
        <button
          onClick={() => setIsPricingModalOpen(true)}
          className={`hidden sm:flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2.5 py-1.5 rounded-lg border transition-all ${
            userState?.remainingCredits === 0 && !userState?.customApiKey
              ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
              : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
          }`}
          title="Audit credits remaining — click to manage plan"
        >
          <Zap className="w-3 h-3" />
          <span className={creditLabel.color}>{creditLabel.text}</span>
        </button>

        {/* Pricing & Plans Button */}
        <button
          onClick={() => setIsPricingModalOpen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-zinc-900 hover:bg-gray-50 transition-all shadow-sm"
          title="View LeaseSight Subscription & Pricing Plans"
        >
          <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
          <span className="text-[10px] font-bold tracking-wider hidden sm:inline">
            PRICING &amp; PLANS
          </span>
        </button>

        {/* BYOK Key Settings Button */}
        <button
          onClick={() => setIsKeyModalOpen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-zinc-800 hover:bg-gray-50 transition-all"
          title={hasKey ? 'BYOK API Key Active' : 'BYOK Key Settings'}
        >
          <Cpu className="w-3.5 h-3.5 text-zinc-900" />
          <span className="text-[10px] font-bold tracking-wider hidden sm:inline">
            {hasKey ? 'KEY ACTIVE' : 'BYOK KEY'}
          </span>
        </button>

        {/* Settings Icon Button */}
        <button
          onClick={() => setIsKeyModalOpen(true)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white text-zinc-600 hover:text-zinc-900 hover:bg-gray-50 transition-all"
          title="Configure API Key Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200" />

        {/* User Profile Avatar Icon (Top Right) */}
        <button
          onClick={() => setIsProfileModalOpen(true)}
          className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold text-xs shadow-sm transition-all hover:scale-105"
          title="User Account & Credit Settings"
        >
          <User className="w-4 h-4" />
        </button>
      </div>

      <ApiKeyModal isOpen={isKeyModalOpen} onClose={() => { setIsKeyModalOpen(false); setHasKey(hasUserGroqKey()); setUserState(getUserState()); }} />
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        onOpenApiKeyModal={() => setIsKeyModalOpen(true)}
        onOpenContactSalesModal={() => setIsContactSalesModalOpen(true)}
      />
      <ContactSalesModal isOpen={isContactSalesModalOpen} onClose={() => setIsContactSalesModalOpen(false)} />
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onOpenPricingModal={() => setIsPricingModalOpen(true)}
        onOpenApiKeyModal={() => setIsKeyModalOpen(true)}
      />
    </header>
  );
}
