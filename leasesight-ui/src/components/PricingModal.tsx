'use client';

import { X, Check, Sparkles, CreditCard, ShieldCheck, Zap, Building, Key } from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeyModal: () => void;
  onOpenContactSalesModal: () => void;
}

export function PricingModal({
  isOpen,
  onClose,
  onOpenApiKeyModal,
  onOpenContactSalesModal,
}: PricingModalProps) {
  if (!isOpen) return null;

  const handleSubscribeStarter = () => {
    window.location.href = 'https://buy.stripe.com/test_9B6dRa7382po2kGa9y9ws01';
  };

  const handleTopUpCredits = () => {
    window.location.href = 'https://buy.stripe.com/test_bJe5kE2MS2po1gCa9y9ws00';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-6xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl text-zinc-900 overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                LeaseSight Subscription & Pricing Tiers
              </h2>
              <p className="text-xs text-zinc-500">
                Choose a plan tailored to your commercial real estate & legal audit volume
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Tier Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

          {/* Card 1: Bring Your Own Key (BYOK) */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-zinc-400 hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 text-zinc-900 mb-2">
                <Key className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">BYOK ($0/mo)</h3>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-zinc-900">$0</span>
                <span className="text-xs text-zinc-500"> / month</span>
              </div>
              <ul className="space-y-2.5 text-xs text-zinc-600 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Unlimited audits using your Groq / OpenAI key</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Stored 100% locally in browser memory</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Full 10-point CUAD Matrix compliance</span>
                </li>
              </ul>
            </div>
            <button
              onClick={() => { onClose(); onOpenApiKeyModal(); }}
              className="w-full py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-zinc-900 text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              Configure Key
            </button>
          </div>

          {/* Card 2: Starter Subscription ($5/mo) */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-zinc-900 bg-white p-5 shadow-lg transition-all">
            <div className="absolute -top-3 right-4 bg-zinc-900 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              MOST POPULAR
            </div>
            <div>
              <div className="flex items-center gap-2 text-zinc-900 mb-2">
                <Zap className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Starter Plan</h3>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-zinc-900">$5</span>
                <span className="text-xs text-zinc-500"> / month</span>
              </div>
              <ul className="space-y-2.5 text-xs text-zinc-600 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>25 Managed Audits / month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Smart Obligation Calendar Sync</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Interactive Bounding Box Highlights</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>PDF & JSON Summary Exports</span>
                </li>
              </ul>
            </div>
            <button
              onClick={handleSubscribeStarter}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-semibold tracking-wider uppercase transition-colors shadow-sm"
            >
              Subscribe for $5/mo
            </button>
          </div>

          {/* Card 3: Pay-As-You-Go ($5 for 10 Credits) */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-zinc-400 hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 text-zinc-900 mb-2">
                <CreditCard className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Pay-As-You-Go</h3>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-zinc-900">$5</span>
                <span className="text-xs text-zinc-500"> / 10 credits</span>
              </div>
              <ul className="space-y-2.5 text-xs text-zinc-600 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>$0.50 per audit top-up</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Unused credits never expire</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>All Starter features included</span>
                </li>
              </ul>
            </div>
            <button
              onClick={handleTopUpCredits}
              className="w-full py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-zinc-900 text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              Top-Up $5 Credits
            </button>
          </div>

          {/* Card 4: Enterprise (Custom Pricing) */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 hover:border-zinc-400 hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 text-zinc-900 mb-2">
                <Building className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Enterprise</h3>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-zinc-900">Custom</span>
                <span className="text-xs text-zinc-500"> / volume</span>
              </div>
              <ul className="space-y-2.5 text-xs text-zinc-600 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Unlimited volume & dedicated SLA</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Custom CUAD category tuning</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
                  <span>Browser-native local deployment</span>
                </li>
              </ul>
            </div>
            <button
              onClick={() => { onClose(); onOpenContactSalesModal(); }}
              className="w-full py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-zinc-900 text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              Contact Sales
            </button>
          </div>

        </div>

        {/* Footer Guarantee */}
        <div className="mt-6 border-t border-gray-100 pt-4 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-zinc-900" />
            <span>Browser-native local evaluation. No contract text is stored on external servers.</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
