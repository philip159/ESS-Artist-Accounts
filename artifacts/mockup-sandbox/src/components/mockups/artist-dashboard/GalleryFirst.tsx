import React from 'react';
import { ArrowUpRight, TrendingUp, Calendar, Info } from 'lucide-react';

export function GalleryFirst() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-stone-900 p-4 md:p-8 lg:p-12 overflow-y-auto font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HERO */}
        <section className="relative w-full h-[240px] md:h-[320px] rounded-2xl overflow-hidden shadow-sm group">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542224566-6e85f2e6772f?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          
          <div className="absolute top-4 md:top-6 left-4 md:left-6">
            <span className="bg-amber-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full uppercase tracking-wider backdrop-blur-sm shadow-sm">
              No.1 Bestseller
            </span>
          </div>

          <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-6">
            <h2 className="text-3xl md:text-4xl text-white font-medium mb-2 tracking-tight">Misty Highlands</h2>
            <div className="flex flex-wrap gap-2 text-sm text-white/80 font-medium">
              <span>28 units sold</span>
              <span>·</span>
              <span>£17.50 commission per sale</span>
            </div>
          </div>
        </section>

        {/* 3 STAT BOXES */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100 flex flex-col justify-between">
            <div>
              <h1 className="text-2xl font-medium tracking-tight mb-2">Good morning, Sophie.</h1>
              <p className="text-stone-500 text-sm leading-relaxed">
                Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Next Payout</span>
            </div>
            <div>
              <div className="text-3xl font-medium tracking-tight mb-1">£189.50</div>
              <div className="text-sm text-stone-500">30 April 2026 (Mar commissions)</div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">This Month</span>
            </div>
            <div>
              <div className="flex items-baseline gap-3 mb-1">
                <div className="text-3xl font-medium tracking-tight">£347.20</div>
                <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">+58%</div>
              </div>
              <div className="text-sm text-stone-500">vs last month (£218.80)</div>
            </div>
          </div>

        </section>

        {/* CHART & RECENT ORDERS ROW */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-stone-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-medium">Commission History</h3>
              <div className="flex gap-2">
                <button className="px-3 py-1 text-xs font-medium bg-stone-100 text-stone-600 rounded-md">6M</button>
                <button className="px-3 py-1 text-xs font-medium text-stone-500 hover:bg-stone-50 rounded-md transition-colors">1Y</button>
              </div>
            </div>
            
            <div className="h-48 w-full relative mt-4">
              <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="amberGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path 
                  d="M 0,40 L 5,30 L 35,20 L 65,5 L 95,25 L 100,40 Z" 
                  fill="url(#amberGradient)" 
                />
                <path 
                  d="M 5,30 L 35,20 L 65,5 L 95,25" 
                  fill="none" 
                  stroke="#f59e0b" 
                  strokeWidth="0.5"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx="5" cy="30" r="1.5" fill="#fff" stroke="#f59e0b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <circle cx="35" cy="20" r="1.5" fill="#fff" stroke="#f59e0b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <circle cx="65" cy="5" r="1.5" fill="#fff" stroke="#f59e0b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <circle cx="95" cy="25" r="1.5" fill="#fff" stroke="#f59e0b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[10px] font-medium text-stone-400 -mb-6">
                <span>JAN</span>
                <span>FEB</span>
                <span>MAR</span>
                <span>APR</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-stone-100 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-medium">Recent Orders</h3>
              <button className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors">View All</button>
            </div>
            
            <div className="flex-1 flex flex-col gap-4">
              {[
                { title: "Misty Highlands", date: "2 Apr 2026", commission: "£17.50" },
                { title: "Golden Shore", date: "1 Apr 2026", commission: "£22.40" },
                { title: "Quiet Forest", date: "31 Mar 2026", commission: "£14.00" },
                { title: "Abstract Tide", date: "29 Mar 2026", commission: "£31.50" },
              ].map((order, i) => (
                <div key={i} className="flex justify-between items-center group">
                  <div>
                    <div className="font-medium text-sm text-stone-900 group-hover:text-amber-600 transition-colors cursor-pointer">{order.title}</div>
                    <div className="text-xs text-stone-500">{order.date}</div>
                  </div>
                  <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                    {order.commission}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>
        
      </div>
    </div>
  );
}