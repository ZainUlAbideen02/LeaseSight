'use client';

import { useState, useEffect } from 'react';
import { Key, CheckCircle2, ShieldAlert, X, Save, Trash2, Cpu } from 'lucide-react';
import { getUserGroqKey, setUserGroqKey, removeUserGroqKey, hasUserGroqKey } from '@/lib/userKeyStore';

interface GroqKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GroqKeyModal({ isOpen, onClose }: GroqKeyModalProps) {
  const [keyInput, setKeyInput] = useState('');
  const [isKeyActive, setIsKeyActive] = useState(false);
  const [savedKeyMask, setSavedKeyMask] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      refreshKeyState();
    }
  }, [isOpen]);

  const refreshKeyState = () => {
    const active = hasUserGroqKey();
    const key = getUserGroqKey();
    setIsKeyActive(active);
    if (key && key.length > 8) {
      setSavedKeyMask(`${key.slice(0, 4)}...${key.slice(-4)}`);
      setKeyInput(key);
    } else {
      setSavedKeyMask('');
      setKeyInput('');
    }
  };

  const handleSave = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      handleClear();
      return;
    }

    if (!trimmed.startsWith('gsk_')) {
      setNotification('Warning: Groq API keys typically start with "gsk_". Saved anyway.');
    } else {
      setNotification('Custom Groq API Key saved successfully!');
    }

    setUserGroqKey(trimmed);
    refreshKeyState();
    setTimeout(() => setNotification(null), 3000);
  };

  const handleClear = () => {
    removeUserGroqKey();
    refreshKeyState();
    setNotification('Custom key cleared. Client-side engine reverted to Fallback Mode.');
    setTimeout(() => setNotification(null), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Client-Side RAG & LLM Key</h2>
              <p className="text-xs text-slate-500">Configures in-browser Groq LPU audit reasoning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Indicator */}
        <div className="my-5 rounded-xl border p-3.5 flex items-center justify-between"
             style={{
               backgroundColor: isKeyActive ? '#F0FDF4' : '#FFFBEB',
               borderColor: isKeyActive ? '#BBF7D0' : '#FDE68A',
             }}>
          <div className="flex items-center gap-2.5">
            {isKeyActive ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <div>
              <p className={`text-xs font-bold ${isKeyActive ? 'text-emerald-900' : 'text-amber-900'}`}>
                {isKeyActive ? `Key Active (${savedKeyMask})` : 'Fallback Mode (No API Key)'}
              </p>
              <p className={`text-[11px] ${isKeyActive ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isKeyActive
                  ? 'Browser-native Groq LPU reasoning active (llama-3.3-70b)'
                  : 'Client-side deterministic regex audit parser active'}
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
            isKeyActive ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
          }`}>
            {isKeyActive ? 'ACTIVE' : 'FALLBACK'}
          </span>
        </div>

        {/* Input Form */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700">
            Groq API Key (<code className="text-purple-600">gsk_...</code>)
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_your_groq_api_key..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Your key is stored 100% locally in your browser's <code className="bg-slate-100 px-1 py-0.5 rounded">localStorage</code> (`user_groq_key`). It never touches backend servers.
          </p>
        </div>

        {/* Notification Alert */}
        {notification && (
          <div className="mt-3 rounded-lg bg-slate-900 p-2.5 text-xs text-white animate-fade-in flex items-center justify-between">
            <span>{notification}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {isKeyActive && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Key
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-purple-700 transition-all hover:shadow-lg"
          >
            <Save className="h-3.5 w-3.5" />
            Save Key
          </button>
        </div>

      </div>
    </div>
  );
}
