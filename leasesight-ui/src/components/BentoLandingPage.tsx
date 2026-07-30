'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Activity, Database, GraduationCap, 
  ArrowRight, Sparkles, Cpu, Layers, 
  Search, ShieldCheck, Zap
} from 'lucide-react';
import { useAuth } from '@clerk/nextjs';

const BentoCard = ({ 
  title, 
  description, 
  icon: Icon, 
  href, 
  color, 
  tech, 
  action, 
  className = "" 
}: { 
  title: string; 
  description: string; 
  icon: any; 
  href: string; 
  color: string; 
  tech: string; 
  action: string;
  className?: string;
}) => (
  <div className={`group relative rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-8 overflow-hidden transition-all hover:border-white/20 hover:bg-white/[0.07] ${className}`}>
    <div className={`absolute -top-10 -right-10 p-8 opacity-5 group-hover:opacity-10 transition-opacity`}>
      <Icon className="w-64 h-64" style={{ color }} />
    </div>
    
    <div className="relative h-full flex flex-col justify-between z-10">
      <div>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 duration-500" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <h2 className="text-3xl font-bold mb-4 tracking-tight">{title}</h2>
        <p className="text-white/50 max-w-sm leading-relaxed text-sm mb-6">
          {description}
        </p>
        
        <div className="flex flex-wrap gap-2 mb-8">
          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-widest">
            {tech}
          </span>
          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-widest">
            {action}
          </span>
        </div>
      </div>
      
      <Link href={href} className="flex items-center gap-2 text-sm font-bold transition-all group-hover:gap-3" style={{ color }}>
        Launch Service <ArrowRight className="w-4 h-4" />
      </Link>
    </div>

    {/* Hover Glow Effect */}
    <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent to-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
  </div>
);

export function BentoLandingPage() {
  const { userId } = useAuth();

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[340px]">
      
      {/* Box 1: LeaseSight Auditor */}
      <BentoCard 
        className="md:col-span-8 md:row-span-2"
        title="LeaseSight Auditor"
        description="Interactive RAG auditing with visual evidence markers. Chat with any legal or research document and see the evidence highlighted on the original PDF."
        icon={Activity}
        href={userId ? "/dashboard/audit" : "/pricing"}
        color="#a855f7" // purple-500
        tech="Visual Proof-Chain"
        action="Talk to your lease"
      />

      {/* Box 2: Legacy Migration Pro */}
      <BentoCard 
        className="md:col-span-4 md:row-span-1"
        title="Legacy Migration"
        description="Bulk PDF-to-SQL migration for enterprise ERPs. Recover legacy data at scale."
        icon={Database}
        href={userId ? "/dashboard/migrate" : "/pricing"}
        color="#3b82f6" // blue-500
        tech="Bulk ERP Integration"
        action="Convert 500+ PDFs"
      />

      {/* Box 3: Peer-Review Assistant */}
      <BentoCard 
        className="md:col-span-4 md:row-span-1"
        title="Peer-Review AI"
        description="Academic pre-submission auditor for EMNLP, NeurIPS, and NAACL. Benchmarking RAG."
        icon={GraduationCap}
        href={userId ? "/dashboard/research" : "/pricing"}
        color="#10b981" // emerald-500
        tech="Benchmarking RAG"
        action="Audit your draft"
      />

      {/* Mini Feature: Security */}
      <div className="md:col-span-4 group relative rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-8 transition-all hover:border-white/20">
        <ShieldCheck className="w-6 h-6 text-emerald-400 mb-4" />
        <h3 className="text-lg font-bold mb-2">Managed Security</h3>
        <p className="text-white/40 text-xs font-mono leading-relaxed">
          Server-managed Gemini, Azure OCR, and Pinecone access with no browser-side keys.
        </p>
      </div>

      {/* Mini Feature: Analytics */}
      <div className="md:col-span-4 group relative rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-8 transition-all hover:border-white/20">
        <Cpu className="w-6 h-6 text-purple-400 mb-4" />
        <h3 className="text-lg font-bold mb-2">GPU Orchestration</h3>
        <p className="text-white/40 text-xs font-mono leading-relaxed">
          Distributed processing for rapid batch migration and large-scale RAG indexing.
        </p>
      </div>

      {/* Mini Feature: Search */}
      <div className="md:col-span-4 group relative rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-8 transition-all hover:border-white/20">
        <Layers className="w-6 h-6 text-blue-400 mb-4" />
        <h3 className="text-lg font-bold mb-2">Semantic Discovery</h3>
        <p className="text-white/40 text-xs font-mono leading-relaxed">
          Deep semantic search across your entire legal and academic archive.
        </p>
      </div>

    </div>
  );
}
