'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity, Search, Wifi, WifiOff, Network, Settings, ChevronDown, Database, LayoutPanelLeft, GraduationCap, Cpu } from 'lucide-react';
import { api } from '@/lib/api';
import { BrandLogo } from './BrandLogo';
import { GroqKeyModal } from './GroqKeyModal';
import { hasUserGroqKey } from '@/lib/userKeyStore';

interface HeaderProps {
  isAuditing: boolean;
  onToggleNetwork: () => void;
  documents: string[];
  onSelectDoc: (doc: string) => void;
}

export function Header({ isAuditing, onToggleNetwork, documents, onSelectDoc }: HeaderProps) {
  const [health, setHealth]               = useState<{ status?: string } | null>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isServicesOpen, setIsServicesOpen]   = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen]   = useState(false);
  const [hasKey, setHasKey]                   = useState(false);

  useEffect(() => {
    setHasKey(hasUserGroqKey());
    const fetchHealth = () => {
      api.health().then(setHealth).catch(() => setHealth(null));
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = Boolean(health?.status);

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b glass shrink-0"
            style={{ borderColor: 'var(--border-default)', zIndex: 40, position: 'relative' }}>

      {/* Left: Logo + Brand + Switcher */}
      <div className="flex items-center gap-6">
        <BrandLogo className="hover:opacity-80 transition-opacity" />

        {/* Service Switcher */}
        <div className="relative">
          <button 
            onClick={() => setIsServicesOpen(!isServicesOpen)}
            onBlur={() => setTimeout(() => setIsServicesOpen(false), 200)}
            className="hidden items-center gap-2 border border-black/10 bg-black/5 px-3 py-1.5 transition-all hover:-translate-y-0.5 hover:bg-black/10 md:flex"
          >
            <LayoutPanelLeft className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-[11px] font-bold tracking-tight opacity-70">SERVICES</span>
            <ChevronDown className={`w-3 h-3 opacity-30 transition-transform ${isServicesOpen ? 'rotate-180' : ''}`} />
          </button>

          {isServicesOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 border border-black/10 bg-white shadow-2xl z-50 p-1.5 animate-fade-in">
              <Link href="/dashboard/audit" className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-purple-50 transition-colors group">
                <div className="w-8 h-8 rounded-md bg-purple-100 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Lease Auditor</p>
                  <p className="text-[10px] text-gray-500">Surgical AI analysis & chat</p>
                </div>
              </Link>
              <Link href="/dashboard/migrate" className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-blue-50 transition-colors group mt-1">
                <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Migration Pro</p>
                  <p className="text-[10px] text-gray-500">Legacy data bulk extraction</p>
                </div>
              </Link>
              <Link href="/dashboard/research" className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-emerald-50 transition-colors group mt-1">
                <div className="w-8 h-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Peer-Review AI</p>
                  <p className="text-[10px] text-gray-500">Academic pre-submission audit</p>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Center: Search */}
      <div className="relative hidden md:block">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg w-72 transition-all"
             style={{
               background: 'var(--bg-card)',
               border: isSearchFocused
                 ? '1px solid var(--accent-primary-light)'
                 : '1px solid var(--border-default)',
               boxShadow: isSearchFocused ? 'var(--shadow-glow)' : 'none',
             }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search documents…"
            className="text-xs bg-transparent outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded hidden sm:block"
               style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
            ⌘K
          </kbd>
        </div>

        {/* Dropdown Results */}
        {isSearchFocused && searchQuery && (
          <div className="absolute top-full mt-1 w-full rounded-xl shadow-lg overflow-hidden z-50 border animate-fade-in"
               style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
            {documents
              .filter(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 5)
              .map(doc => (
                <button
                  key={doc}
                  onMouseDown={() => { onSelectDoc(doc); setSearchQuery(''); setIsSearchFocused(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors truncate hover:opacity-80"
                  style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}
                >
                  {doc}
                </button>
              ))}
            {documents.filter(d => d.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No documents found</div>
            )}
          </div>
        )}
      </div>

      {/* Right: Status + Controls */}
      <div className="flex items-center gap-3">
        {/* Network Graph Toggle */}
        <button
          onClick={onToggleNetwork}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 transition-all hover:-translate-y-0.5 hover:opacity-80"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
        >
          <Network className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">3D Map</span>
        </button>

        {/* Agent Activity */}
        <div className="flex items-center gap-1.5">
          <Activity
            className={`w-3.5 h-3.5 ${isAuditing ? 'animate-pulse' : ''}`}
            style={{ color: isAuditing ? 'var(--accent-emerald)' : 'var(--text-muted)' }}
          />
          <span className="text-xs hidden sm:inline"
                style={{ color: isAuditing ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
            {isAuditing ? 'Agents Active' : 'Idle'}
          </span>
        </div>

        {/* System Health */}
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse-dot' : ''}`}
               style={{ background: isConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
          {isConnected
            ? <Wifi    className="w-3.5 h-3.5" style={{ color: 'var(--accent-emerald)' }} />
            : <WifiOff className="w-3.5 h-3.5" style={{ color: 'var(--accent-red)' }} />}
        </div>

        {/* Client RAG Key Button */}
        <button
          onClick={() => setIsKeyModalOpen(true)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:-translate-y-0.5"
          style={{
            background: hasKey ? 'rgba(147, 51, 234, 0.08)' : 'rgba(217, 119, 6, 0.08)',
            borderColor: hasKey ? 'rgba(147, 51, 234, 0.3)' : 'rgba(217, 119, 6, 0.3)',
            color: hasKey ? '#9333EA' : '#D97706',
          }}
          title={hasKey ? 'Browser LLM Key Active' : 'Client RAG Fallback Mode'}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold tracking-wider hidden sm:inline">
            {hasKey ? 'KEY ACTIVE' : 'FALLBACK'}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ background: 'var(--border-default)' }} />

        {/* Settings / Backend Status Link */}
        <Link
          href="/settings"
          id="settings-nav-btn"
          className="relative flex items-center gap-2 px-2.5 py-1.5 transition-all hover:-translate-y-0.5 hover:opacity-80"
          style={{
            background: isConnected ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
            border: isConnected ? '1px solid rgba(5,150,105,0.3)' : '1px solid rgba(220,38,38,0.3)',
          }}
          title={isConnected ? 'Managed backend connected' : 'Managed backend needs attention'}
        >
          <Settings className="w-3.5 h-3.5" style={{ color: isConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
          
          <span className="text-[10px] font-semibold tracking-wide hidden lg:inline"
                style={{ color: isConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
            {isConnected ? 'BACKEND' : 'CHECK API'}
          </span>

          {/* Status Dot */}
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                style={{ background: isConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
        </Link>
      </div>

      <GroqKeyModal isOpen={isKeyModalOpen} onClose={() => { setIsKeyModalOpen(false); setHasKey(hasUserGroqKey()); }} />
    </header>
  );
}
