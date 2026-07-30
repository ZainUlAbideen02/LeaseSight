import { SignIn } from '@clerk/nextjs';
import { BrandLogo } from '@/components/BrandLogo';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-12">
      <div className="grid w-full max-w-5xl overflow-hidden border border-slate-200 bg-white shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between bg-[#1A1A1A] p-8 text-white">
          <BrandLogo className="[&_img]:brightness-0 [&_img]:invert" />
          <div className="mt-20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Secure Workstation</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Lease intelligence starts with a verified account.</h1>
            <p className="mt-5 text-sm leading-6 text-slate-300">
              Sign in to access the audit dashboard, package controls, and document knowledge base.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center p-6">
          <SignIn />
        </section>
      </div>
    </main>
  );
}
