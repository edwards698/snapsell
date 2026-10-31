import { CreditCard, Sparkles } from 'lucide-react';

/** Right-hand panel on the sign-in pages: a glimpse of the product (a WhatsApp sale in progress). */
export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[oklch(0.262_0.051_172.6)] lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 10%, oklch(0.596 0.145 163.2 / 0.55), transparent 70%), radial-gradient(50% 45% at 90% 80%, oklch(0.541 0.281 293 / 0.35), transparent 70%), radial-gradient(40% 40% at 70% 20%, oklch(0.769 0.188 70.1 / 0.18), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative">
        <p className="text-sm font-medium text-emerald-200/80">Snap. Chat. Get paid.</p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white text-balance">
          Your shop, your WhatsApp and your payments in one place.
        </h2>
      </div>

      <div className="relative mx-auto w-full max-w-sm pb-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur-md">
          <div className="rounded-[1.5rem] bg-[oklch(0.97_0.01_120)] p-4 text-[13px] leading-snug text-zinc-800 shadow-inner">
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-200/80 pb-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                MB
              </div>
              <div>
                <p className="text-sm font-semibold">Mwila B.</p>
                <p className="text-[11px] text-zinc-500">WhatsApp · online</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="mr-10 w-fit rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                Hi! Do you have the wireless headphones? I need two 🎧
              </p>
              <div className="ml-8 rounded-2xl rounded-tr-sm bg-emerald-100 px-3 py-2 shadow-sm">
                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
                  <Sparkles className="size-3" /> Assistant
                </p>
                Yes, they&apos;re in stock at K350 each. Delivery or collection?
              </div>
              <p className="mr-10 w-fit rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                Delivery to Woodlands please
              </p>
              <div className="ml-8 rounded-2xl rounded-tr-sm bg-emerald-100 px-3 py-2 shadow-sm">
                <p className="font-semibold">Order ORD-00125</p>
                <div className="mt-1 space-y-0.5 font-mono text-[12px] text-zinc-700">
                  <div className="flex justify-between">
                    <span>2 × Headphones</span>
                    <span>K700</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>K50</span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-300/70 pt-0.5 font-semibold text-zinc-900">
                    <span>Total</span>
                    <span>K750</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-2 -right-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white px-4 py-3 shadow-xl">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CreditCard className="size-4" />
          </span>
          <div>
            <p className="text-xs text-zinc-500">Payment verified</p>
            <p className="text-sm font-semibold text-zinc-900 tabular">K750.00</p>
          </div>
        </div>
      </div>

      <p className="relative text-xs text-emerald-100/60">Illustrative example.</p>
    </div>
  );
}
