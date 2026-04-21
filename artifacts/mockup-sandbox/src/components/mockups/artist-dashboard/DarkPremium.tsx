import React from 'react';

export function DarkPremium() {
  const recentOrders = [
    { title: "Misty Highlands", date: "2 Apr 2026", commission: "£17.50" },
    { title: "Golden Shore", date: "1 Apr 2026", commission: "£22.40" },
    { title: "Quiet Forest", date: "31 Mar 2026", commission: "£14.00" },
    { title: "Abstract Tide", date: "29 Mar 2026", commission: "£31.50" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-y-auto px-6 md:px-12 lg:px-20 py-12 lg:py-20 font-sans selection:bg-[#10B981] selection:text-white">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="space-y-4 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight text-white">
            Hi Sophie
          </h1>
          <p className="text-[#666666] text-lg font-light leading-relaxed">
            Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running.
          </p>
        </header>

        {/* Stat Pills */}
        <div className="flex flex-wrap gap-4 pt-4">
          <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-[#141414] border border-[#222222]">
            <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
            <span className="text-sm font-medium text-[#EAEAEA]">£347.20 this month</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-[#141414] border border-[#222222]">
            <div className="w-2 h-2 rounded-full bg-[#D4AF37]"></div>
            <span className="text-sm font-medium text-[#EAEAEA]">12 live works</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-[#141414] border border-[#222222]">
            <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
            <span className="text-sm font-medium text-[#EAEAEA]">Next payout Apr 30</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Chart Card */}
            <div className="bg-[#141414] border border-[#222222] rounded-xl p-6 md:p-8 relative overflow-hidden group">
              {/* Subtle background glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#10B981] rounded-full blur-[100px] opacity-5"></div>
              
              <div className="flex justify-between items-end mb-8 relative z-10">
                <div>
                  <h2 className="text-[#888888] text-xs font-mono tracking-widest uppercase mb-2">Revenue YTD</h2>
                  <p className="text-3xl font-light">£814.00</p>
                </div>
                <div className="flex gap-2">
                  {['1M', '3M', '6M', 'YTD'].map((t, i) => (
                    <button key={t} className={`text-xs px-3 py-1.5 rounded-md transition-colors ${i === 1 ? 'bg-[#222222] text-white' : 'text-[#666666] hover:text-[#AAAAAA]'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="h-64 w-full relative z-10">
                {/* Horizontal Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map((_, i) => (
                    <div key={i} className="w-full h-px bg-[#222222]"></div>
                  ))}
                </div>
                
                <svg className="w-full h-full absolute inset-0 overflow-visible" viewBox="0 0 400 120" preserveAspectRatio="none">
                  <path 
                    d="M0,84 L133.3,54.6 L266.6,15.9 L400,81.3" 
                    fill="none" 
                    stroke="#10B981" 
                    strokeWidth="3" 
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Glowing line effect */}
                  <path 
                    d="M0,84 L133.3,54.6 L266.6,15.9 L400,81.3" 
                    fill="none" 
                    stroke="#10B981" 
                    strokeWidth="8" 
                    opacity="0.2"
                    vectorEffect="non-scaling-stroke"
                    className="blur-sm"
                  />
                  <circle cx="0" cy="84" r="5" fill="#0A0A0A" stroke="#10B981" strokeWidth="2" />
                  <circle cx="133.3" cy="54.6" r="5" fill="#0A0A0A" stroke="#10B981" strokeWidth="2" />
                  <circle cx="266.6" cy="15.9" r="5" fill="#10B981" />
                  <circle cx="266.6" cy="15.9" r="12" fill="#10B981" opacity="0.2" />
                  <circle cx="400" cy="81.3" r="5" fill="#0A0A0A" stroke="#10B981" strokeWidth="2" />
                </svg>

                {/* X-Axis labels */}
                <div className="absolute -bottom-8 left-0 w-full flex justify-between text-xs font-mono text-[#666666]">
                  <span className="-translate-x-1/2">JAN</span>
                  <span className="-translate-x-1/2 ml-[33.3%]">FEB</span>
                  <span className="-translate-x-1/2 ml-[33.3%] text-white">MAR</span>
                  <span className="translate-x-1/2">APR</span>
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div>
              <h2 className="text-[#888888] text-xs font-mono tracking-widest uppercase mb-4 pl-1">Recent Activity</h2>
              <div className="bg-[#141414] border border-[#222222] rounded-xl overflow-hidden">
                {recentOrders.map((order, i) => (
                  <div key={i} className="flex justify-between items-center p-5 border-b border-[#222222] last:border-0 hover:bg-[#1A1A1A] transition-colors cursor-default group">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-sm text-[#EAEAEA] group-hover:text-white transition-colors">{order.title}</span>
                      <span className="text-xs font-mono text-[#666666]">{order.date}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-[#10B981]">{order.commission}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Side Column */}
          <div className="space-y-8">
            
            {/* Payout Card */}
            <div className="bg-[#141414] border border-[#222222] rounded-xl p-6 relative overflow-hidden border-l-2 border-l-[#D4AF37]">
              <div className="space-y-6">
                <div>
                  <h2 className="text-[#888888] text-xs font-mono tracking-widest uppercase mb-2">Next Payout</h2>
                  <p className="text-xl font-light text-white">30 April 2026</p>
                </div>
                
                <div className="pt-4 border-t border-[#222222]">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-[#666666] text-sm">March commissions</span>
                    <span className="text-2xl font-light text-[#D4AF37]">£189.50</span>
                  </div>
                  <div className="w-full bg-[#222222] h-1.5 rounded-full overflow-hidden mt-4">
                    <div className="bg-[#D4AF37] h-full w-[75%] rounded-full"></div>
                  </div>
                  <p className="text-xs text-[#666666] mt-3 text-right">Processing</p>
                </div>
              </div>
            </div>

            {/* Bestseller Card */}
            <div className="bg-[#141414] border border-[#222222] rounded-xl overflow-hidden group hover:border-[#333333] transition-colors">
              <div className="h-48 w-full bg-gradient-to-br from-[#2A2A2A] to-[#111111] relative p-4 flex flex-col justify-between">
                <div className="self-end">
                  <span className="px-3 py-1 bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-mono tracking-widest uppercase rounded-full">
                    Bestseller
                  </span>
                </div>
                {/* Decorative wireframe element for fine art vibe */}
                <div className="absolute inset-0 opacity-10 flex items-center justify-center pointer-events-none">
                  <div className="w-24 h-32 border border-white rotate-6"></div>
                  <div className="w-24 h-32 border border-white -rotate-3 absolute"></div>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <h3 className="font-medium text-lg text-white">Misty Highlands</h3>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-[#666666]">Units Sold</span>
                  <span className="text-white">28</span>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-[#666666]">Total Rev</span>
                  <span className="text-white">£486.00</span>
                </div>
              </div>
            </div>

            {/* Pending Actions */}
            <div className="bg-[#141414] border border-[#222222] rounded-xl p-6">
               <h2 className="text-[#888888] text-xs font-mono tracking-widest uppercase mb-4">Pending Submissions</h2>
               <div className="space-y-4">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded bg-[#222222] flex items-center justify-center">
                     <div className="w-2 h-2 bg-[#F59E0B] rounded-full animate-pulse"></div>
                   </div>
                   <div>
                     <p className="text-sm text-[#EAEAEA]">Autumn Drift</p>
                     <p className="text-xs text-[#666666]">In Review</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded bg-[#222222] flex items-center justify-center">
                     <div className="w-2 h-2 bg-[#F59E0B] rounded-full animate-pulse"></div>
                   </div>
                   <div>
                     <p className="text-sm text-[#EAEAEA]">Urban Sequence</p>
                     <p className="text-xs text-[#666666]">In Review</p>
                   </div>
                 </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
