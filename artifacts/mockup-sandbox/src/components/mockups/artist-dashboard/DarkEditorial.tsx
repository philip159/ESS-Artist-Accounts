import React from 'react';
import { ArrowUpRight, TrendingUp } from 'lucide-react';

export function DarkEditorial() {
  return (
    <div className="min-h-screen bg-[#1C2333] text-slate-300 p-8 md:p-16 overflow-y-auto font-sans">
      <div className="max-w-5xl mx-auto space-y-16">
        
        <header className="space-y-4">
          <h1 className="font-['Playfair_Display'] text-5xl md:text-7xl text-[#FDFBF7] tracking-tight">
            Good evening, Sophie.
          </h1>
          <p className="text-slate-400 italic text-lg md:text-xl max-w-2xl">
            "Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running."
          </p>
        </header>

        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="flex-shrink-0 mx-4 text-xs tracking-[0.2em] text-white/40">2026</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        <section className="space-y-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Next Payout / 30 April 2026 / March Commissions
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div>
              <div className="text-5xl md:text-6xl text-[#FDFBF7] font-light tracking-tight">£347.20</div>
              <div className="text-sm text-slate-400 uppercase tracking-widest mt-2">Earned this month</div>
            </div>
            <div className="md:text-right">
              <div className="text-3xl text-slate-300 font-light">£189.50</div>
              <div className="text-sm text-slate-500 uppercase tracking-widest mt-2">Pending payout</div>
            </div>
          </div>
        </section>

        <section className="h-48 relative border-b border-white/10 pb-8">
          <div className="absolute inset-0 flex items-end justify-between px-2 text-xs text-slate-500 uppercase tracking-widest pb-2">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
          </div>
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
            <path 
              d="M 5,30 L 35,20 L 65,5 L 95,25" 
              fill="none" 
              stroke="#FDFBF7" 
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx="5" cy="30" r="1.5" fill="#FDFBF7" />
            <circle cx="35" cy="20" r="1.5" fill="#FDFBF7" />
            <circle cx="65" cy="5" r="1.5" fill="#FDFBF7" />
            <circle cx="95" cy="25" r="1.5" fill="#FDFBF7" />
          </svg>
        </section>

        <section>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-6">Recent Orders</div>
          <div className="w-full text-sm">
            {[
              { title: "Misty Highlands", date: "2 Apr 2026", commission: "£17.50" },
              { title: "Golden Shore", date: "1 Apr 2026", commission: "£22.40" },
              { title: "Quiet Forest", date: "31 Mar 2026", commission: "£14.00" },
              { title: "Abstract Tide", date: "29 Mar 2026", commission: "£31.50" },
            ].map((order, i) => (
              <div key={i} className="flex justify-between items-center py-4 border-b border-white/5 group hover:bg-white/[0.02] transition-colors px-2 -mx-2 rounded">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-8">
                  <span className="text-[#FDFBF7] font-medium">{order.title}</span>
                  <span className="text-slate-500">{order.date}</span>
                </div>
                <div className="text-emerald-400 font-mono tracking-tight">{order.commission}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24 bg-[#141A26] rounded-xl overflow-hidden flex flex-col md:flex-row border border-white/5">
          <div className="p-8 md:p-12 flex-1 flex flex-col justify-center">
            <div className="text-[10px] text-amber-500/80 uppercase tracking-[0.2em] mb-4">No.1 Bestseller</div>
            <h3 className="font-['Playfair_Display'] text-4xl text-[#FDFBF7] italic mb-6">Misty Highlands</h3>
            <div className="flex gap-8 text-sm">
              <div>
                <div className="text-slate-500 uppercase tracking-widest text-[10px] mb-1">Units Sold</div>
                <div className="text-slate-300">28</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-widest text-[10px] mb-1">Revenue</div>
                <div className="text-slate-300">£486.00</div>
              </div>
            </div>
          </div>
          <div className="w-full md:w-1/3 min-h-[200px] bg-gradient-to-br from-slate-800 to-slate-900 relative">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1572949645841-094f3a9c4c94?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-50 grayscale"></div>
          </div>
        </section>
        
      </div>
    </div>
  );
}