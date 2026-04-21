import React, { useState } from 'react';

export function Editorial() {
  const [chartTab, setChartTab] = useState('This Month');

  const recentOrders = [
    { title: "Misty Highlands", date: "2 Apr 2026", commission: "£17.50" },
    { title: "Golden Shore", date: "1 Apr 2026", commission: "£22.40" },
    { title: "Quiet Forest", date: "31 Mar 2026", commission: "£14.00" },
    { title: "Abstract Tide", date: "29 Mar 2026", commission: "£31.50" },
  ];

  return (
    <div className="min-h-screen bg-[#F9F6F0] text-[#2C2A28] overflow-y-auto px-6 md:px-16 py-12 lg:py-24 font-sans selection:bg-[#E8E1D5] selection:text-[#2C2A28]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        .font-editorial { font-family: 'Playfair Display', serif; }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-16">
        
        {/* Header Section */}
        <header className="space-y-6">
          <h1 className="font-editorial text-5xl md:text-6xl tracking-tight text-[#1A1918]">
            Good morning, Sophie.
          </h1>
          <p className="font-editorial italic text-xl text-[#7A7165] max-w-2xl leading-relaxed">
            Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          
          {/* Main Column */}
          <div className="lg:col-span-8 space-y-16">
            
            {/* Sales Chart */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium tracking-widest uppercase text-[#8C8273]">Performance</h2>
                <div className="flex space-x-2 bg-white rounded-full p-1 border border-[#E8E1D5] shadow-sm">
                  {['This Month', 'Last 3M', 'Last 6M'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setChartTab(tab)}
                      className={`text-xs px-4 py-1.5 rounded-full transition-colors ${
                        chartTab === tab 
                          ? 'bg-[#1A1918] text-[#F9F6F0]' 
                          : 'text-[#8C8273] hover:text-[#1A1918]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-[#E8E1D5] shadow-sm">
                <div className="h-48 w-full relative flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="amberGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path 
                      d="M0,120 L0,84 L133.3,54.6 L266.6,15.9 L400,81.3 L400,120 Z" 
                      fill="url(#amberGradient)" 
                    />
                    <path 
                      d="M0,84 L133.3,54.6 L266.6,15.9 L400,81.3" 
                      fill="none" 
                      stroke="#D97706" 
                      strokeWidth="2" 
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Points */}
                    <circle cx="0" cy="84" r="4" fill="#fff" stroke="#D97706" strokeWidth="2" />
                    <circle cx="133.3" cy="54.6" r="4" fill="#fff" stroke="#D97706" strokeWidth="2" />
                    <circle cx="266.6" cy="15.9" r="4" fill="#fff" stroke="#D97706" strokeWidth="2" />
                    <circle cx="400" cy="81.3" r="4" fill="#fff" stroke="#D97706" strokeWidth="2" />
                  </svg>
                  {/* Tooltips/Values */}
                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <div className="absolute left-0 bottom-[36px] -translate-x-1/2 -translate-y-full mb-2">
                      <span className="text-xs font-medium text-[#8C8273]">£120</span>
                    </div>
                    <div className="absolute left-[33.3%] bottom-[65.4px] -translate-x-1/2 -translate-y-full mb-2">
                      <span className="text-xs font-medium text-[#8C8273]">£218</span>
                    </div>
                    <div className="absolute left-[66.6%] bottom-[104.1px] -translate-x-1/2 -translate-y-full mb-2">
                      <span className="text-xs font-medium text-[#1A1918]">£347</span>
                    </div>
                    <div className="absolute right-0 bottom-[38.7px] translate-x-1/2 -translate-y-full mb-2">
                      <span className="text-xs font-medium text-[#8C8273]">£129</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between mt-6 text-xs text-[#A39A8D] uppercase tracking-wider">
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                </div>
              </div>
            </section>

            {/* Recent Orders Table */}
            <section className="space-y-6">
              <h2 className="text-sm font-medium tracking-widest uppercase text-[#8C8273]">Recent Acquisitions</h2>
              <div className="w-full">
                <div className="border-t border-[#E8E1D5]">
                  {recentOrders.map((order, i) => (
                    <div key={i} className="flex justify-between items-center py-5 border-b border-[#E8E1D5] group hover:bg-[#F3EFE8] transition-colors -mx-4 px-4 rounded-lg">
                      <div className="flex flex-col">
                        <span className="font-editorial text-lg text-[#1A1918]">{order.title}</span>
                        <span className="text-sm text-[#8C8273]">{order.date}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-[#1A1918]">{order.commission}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

          </div>

          {/* Sidebar Column */}
          <div className="lg:col-span-4 space-y-16">
            
            {/* Payout Section */}
            <section>
              <div className="w-full h-px bg-[#D9D1C4] mb-8"></div>
              <h3 className="font-editorial text-2xl text-[#1A1918] mb-2">Next Payout · 30 April 2026</h3>
              <p className="text-[#7A7165] text-sm">March commissions · £189.50 pending</p>
              
              <div className="mt-12 grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#8C8273] mb-1">Earned Mar</p>
                  <p className="font-editorial text-2xl text-[#1A1918]">£347.20</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#8C8273] mb-1">Earned Feb</p>
                  <p className="font-editorial text-2xl text-[#7A7165]">£218.80</p>
                </div>
              </div>
              <div className="w-full h-px bg-[#D9D1C4] mt-8"></div>
            </section>

            {/* Catalog Stats */}
            <section className="space-y-6">
              <h2 className="text-sm font-medium tracking-widest uppercase text-[#8C8273]">At a glance</h2>
              <div className="flex gap-4">
                <div className="bg-white px-5 py-4 rounded-xl border border-[#E8E1D5] shadow-sm flex-1 text-center">
                  <span className="block font-editorial text-3xl text-[#1A1918]">12</span>
                  <span className="block text-xs text-[#8C8273] mt-1">Live Works</span>
                </div>
                <div className="bg-[#F3EFE8] px-5 py-4 rounded-xl border border-[#E8E1D5] flex-1 text-center">
                  <span className="block font-editorial text-3xl text-[#7A7165]">2</span>
                  <span className="block text-xs text-[#8C8273] mt-1">Pending</span>
                </div>
              </div>
            </section>

            {/* Bestseller */}
            <section className="space-y-6">
              <h2 className="text-sm font-medium tracking-widest uppercase text-[#8C8273]">Collection Highlight</h2>
              <div className="bg-white p-4 rounded-xl border border-[#E8E1D5] shadow-sm flex gap-4 items-center">
                <div className="w-20 h-24 rounded-md bg-gradient-to-br from-[#E0D5C1] to-[#C9BAA3] shrink-0"></div>
                <div className="space-y-2">
                  <span className="inline-block px-2.5 py-1 bg-[#FEF3C7] text-[#92400E] text-[10px] uppercase tracking-wider font-semibold rounded-sm">Bestseller</span>
                  <h4 className="font-editorial text-xl text-[#1A1918]">Misty Highlands</h4>
                  <p className="text-xs text-[#8C8273]">28 units sold · £486.00</p>
                </div>
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
