'use client';

import { useState, useEffect } from 'react';
import { Key, CheckCircle2, ShieldAlert, X, Save, Trash2, Cpu } from 'lucide-react';
import { getUserGroqKey, setUserGroqKey, removeUserGroqKey, hasUserGroqKey } from '@/lib/userKeyStore';
import { setApiKey } from '@/lib/userStore';
import { toast } from 'sonner';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const [keyInput, setKeyInput] = useState('');
  const [isKeyActive, setIsKeyActive] = useState(false);
  const [savedKeyMask, setSavedKeyMask] = useState('');

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

    setUserGroqKey(trimmed);
    setApiKey(trimmed);
    refreshKeyState();
    toast.success('Custom API Key stored successfully in browser localStorage (user_groq_api_key)!');
    onClose();
  };

  const handleClear = () => {
    removeUserGroqKey();
    setApiKey(null);
    refreshKeyState();
    toast.info('API Key cleared. Engine reverted to browser-native hybrid mode.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-gray-200 text-zinc-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-zinc-900">BYOK Key Configuration</h2>
              <p className="text-xs text-zinc-500">Configure custom Groq or OpenAI key in browser memory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-gray-100 hover:text-zinc-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Indicator */}
        <div className="my-5 rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isKeyActive ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-zinc-400 shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold text-zinc-900">
                {isKeyActive ? `Custom Key Active (${savedKeyMask})` : 'Hybrid Engine Mode Active'}
              </p>
              <p className="text-[11px] text-zinc-500">
                {isKeyActive
                  ? 'Browser LLM API reasoning active (Groq LPU / OpenAI)'
                  : 'Browser-native hybrid TF-IDF/BM25 extraction engine active'}
              </p>
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
            isKeyActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-200 text-zinc-600 border-gray-300'
          }`}>
            {isKeyActive ? 'ACTIVE' : 'HYBRID'}
          </span>
        </div>

        {/* Input Form */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-700">
            API Key (<code className="text-zinc-900">gsk_...</code> or <code className="text-zinc-900">sk-...</code>)
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_your_groq_or_openai_key..."
              className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Key is stored 100% locally in browser <code className="bg-gray-100 px-1 py-0.5 rounded border border-gray-200 text-zinc-800">localStorage</code> under <code className="text-zinc-900 font-bold">user_groq_api_key</code>. It never touches backend servers.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
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
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 hover:bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm tracking-wider uppercase transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            Save Key
          </button>
        </div>

      </div>
    </div>
  );
}
