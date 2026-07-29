'use client';

import { useState } from 'react';
import { X, Building, Mail, User, BarChart3, MessageSquare, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ContactSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactSalesModal({ isOpen, onClose }: ContactSalesModalProps) {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [volume, setVolume] = useState('100-500 audits/mo');
  const [requirements, setRequirements] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !workEmail || !orgName) {
      toast.error('Please fill in your name, work email, and organization name.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: '3ffc2c05-f580-4c78-bfa6-91e6d5de938b',
          subject: '[LeaseSight Inquiry] New Enterprise Briefing Request',
          name: fullName,
          email: workEmail.trim(),
          industry: orgName,
          companySize: volume,
          message: requirements || 'Enterprise sales inquiry',
          from_name: 'LeaseSight Enterprise Portal',
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Inquiry Sent! The LeaseSight team will reach out to you shortly.');
        setFullName('');
        setWorkEmail('');
        setOrgName('');
        setRequirements('');
        onClose();
      } else {
        throw new Error(data.message || 'Submission failed');
      }
    } catch (err) {
      toast.error('Submission failed. Please reach out directly to 241475@students.au.edu.pk.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl text-zinc-900 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Contact Enterprise Sales</h2>
              <p className="text-xs text-zinc-500">Custom volume, SOC-2 compliance & local deployment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                required
                name="name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="email"
                required
                name="email"
                value={workEmail}
                onChange={e => setWorkEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Organization Name</label>
            <div className="relative">
              <Building className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                required
                name="industry"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Acme Real Estate Group"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Estimated Monthly Contract Volume</label>
            <div className="relative">
              <BarChart3 className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <select
                name="companySize"
                value={volume}
                onChange={e => setVolume(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all appearance-none"
              >
                <option value="50-100 audits/mo">50 - 100 audits / month</option>
                <option value="100-500 audits/mo">100 - 500 audits / month</option>
                <option value="500-2500 audits/mo">500 - 2,500 audits / month</option>
                <option value="2500+ audits/mo">2,500+ audits / month (Enterprise)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Custom Requirements (Optional)</label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <textarea
                rows={3}
                name="message"
                value={requirements}
                onChange={e => setRequirements(e.target.value)}
                placeholder="Specify custom CUAD categories, SLA, or local isolated deployment requirements..."
                className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white focus:ring-1 focus:ring-zinc-900 transition-all custom-scrollbar"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 hover:bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm tracking-wider uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending Request...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send Enterprise Inquiry
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
