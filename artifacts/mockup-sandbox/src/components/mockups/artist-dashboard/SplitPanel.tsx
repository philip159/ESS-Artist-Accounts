import React from "react";
import { 
  Calendar, 
  TrendingUp, 
  ArrowUpRight,
  Clock,
  Image as ImageIcon
} from "lucide-react";

export function SplitPanel() {
  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row font-serif-sans overflow-hidden">
      
      {/* LEFT PANEL */}
      <div className="w-full md:w-[340px] bg-[#F5F4F2] border-r border-stone-200 shrink-0 flex flex-col h-[100dvh] overflow-y-auto">
        <div className="p-8 pb-6">
          <h1 className="text-[28px] font-medium text-stone-800 tracking-tight leading-tight">
            Hi Sophie,
          </h1>
          <p className="text-sm text-stone-500 italic mt-2 leading-relaxed">
            "Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running."
          </p>
        </div>

        <div className="px-8 py-6 border-t border-stone-200/60">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase">NEXT PAYOUT</span>
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl font-medium text-stone-900">£189.50</span>
            </div>
            <p className="text-sm text-stone-500 flex items-center gap-1.5 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              30 April 2026
            </p>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-stone-200/60 space-y-5 flex-1">
          <div>
            <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase">THIS MONTH</span>
            <div className="flex items-end justify-between mt-1">
              <span className="text-lg font-medium text-stone-900">£347.20 earned</span>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> 58%
              </span>
            </div>
          </div>
          
          <div>
            <span className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase">PORTFOLIO</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-medium text-stone-900">12 live works</span>
              <span className="text-sm text-stone-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                2 pending
              </span>
            </div>
          </div>
        </div>

        {/* Bestseller Pin at bottom */}
        <div className="p-6 m-4 mt-0 bg-white rounded-xl shadow-sm border border-stone-100 relative overflow-hidden group">
          <div className="absolute top-3 right-3 z-10">
            <span className="text-[10px] font-bold tracking-wider text-amber-800 bg-amber-100 px-2 py-1 rounded-sm uppercase">
              BESTSELLER
            </span>
          </div>
          <div className="w-full h-32 bg-stone-100 rounded-lg mb-4 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-stone-200 to-stone-300" />
            <ImageIcon className="w-8 h-8 text-stone-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />
          </div>
          <h3 className="font-medium text-stone-900 text-sm">Misty Highlands</h3>
          <div className="flex justify-between items-center mt-1 text-sm text-stone-500">
            <span>28 units</span>
            <span>£486.00</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col h-[100dvh] overflow-y-auto bg-white">
        
        {/* Tabs */}
        <div className="px-10 py-6 border-b border-stone-100 flex items-center gap-6 sticky top-0 bg-white/80 backdrop-blur-md z-10">
          {["This Month", "Last Month", "Last 6M", "All Time"].map((tab, i) => (
            <button 
              key={tab} 
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                i === 0 
                  ? "border-stone-900 text-stone-900" 
                  : "border-transparent text-stone-400 hover:text-stone-600 hover:border-stone-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Chart Section */}
        <div className="px-10 py-10 border-b border-stone-100">
          <div className="mb-8">
            <h2 className="text-lg font-medium text-stone-900">Revenue Performance</h2>
            <p className="text-sm text-stone-500 mt-1">Commission earned over time</p>
          </div>
          
          <div className="h-[240px] w-full relative">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-xs text-stone-400 text-right pr-4 font-mono">
              <span>£400</span>
              <span>£300</span>
              <span>£200</span>
              <span>£100</span>
              <span>£0</span>
            </div>
            
            {/* Grid lines */}
            <div className="absolute left-12 right-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-full h-[1px] bg-stone-100" />
              ))}
            </div>

            {/* SVG Chart */}
            <div className="absolute left-12 right-0 top-0 bottom-6">
              <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                {/* Area */}
                <path 
                  d="M0,170 L200,140 L400,60 L600,10 L800,110 L800,200 L0,200 Z" 
                  fill="url(#split-area-gradient)" 
                  className="opacity-60"
                />
                {/* Line */}
                <path 
                  d="M0,170 L200,140 L400,60 L600,10 L800,110" 
                  fill="none" 
                  stroke="#292524" 
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {/* Points */}
                <circle cx="200" cy="140" r="4" fill="white" stroke="#292524" strokeWidth="2" />
                <circle cx="400" cy="60" r="4" fill="white" stroke="#292524" strokeWidth="2" />
                <circle cx="600" cy="10" r="5" fill="#292524" />
                <circle cx="800" cy="110" r="4" fill="white" stroke="#292524" strokeWidth="2" strokeDasharray="2,2" />
                
                {/* Dashed line to current */}
                <path 
                  d="M600,10 L800,110" 
                  fill="none" 
                  stroke="#292524" 
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                />

                <defs>
                  <linearGradient id="split-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e7e5e4" stopOpacity="1" />
                    <stop offset="100%" stopColor="#e7e5e4" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* X-axis labels */}
            <div className="absolute left-12 right-0 bottom-0 flex justify-between text-xs text-stone-400 font-medium">
              <span className="translate-x-[-50%]">Dec</span>
              <span className="translate-x-[-50%]">Jan</span>
              <span className="translate-x-[-50%]">Feb</span>
              <span className="translate-x-[-50%] text-stone-900 font-bold bg-stone-100 px-2 py-0.5 rounded-full">Mar</span>
              <span className="translate-x-[-50%]">Apr</span>
            </div>
          </div>
        </div>

        {/* Ledger / Table Section */}
        <div className="px-10 py-10 flex-1">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-stone-900">Recent Ledger</h2>
            <button className="text-sm text-stone-500 hover:text-stone-900 font-medium transition-colors">
              Export CSV
            </button>
          </div>
          
          <div className="w-full">
            <div className="grid grid-cols-12 gap-4 pb-3 border-b border-stone-200 text-xs font-semibold tracking-wider text-stone-400 uppercase">
              <div className="col-span-5">Artwork</div>
              <div className="col-span-3">Date</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Commission</div>
            </div>
            
            <div className="divide-y divide-stone-100">
              {[
                { title: "Misty Highlands", date: "2 Apr 2026", status: "Processing", amount: "£17.50", code: "ORD-9932" },
                { title: "Golden Shore", date: "1 Apr 2026", status: "Shipped", amount: "£22.40", code: "ORD-9901" },
                { title: "Quiet Forest", date: "31 Mar 2026", status: "Delivered", amount: "£14.00", code: "ORD-9874" },
                { title: "Abstract Tide", date: "29 Mar 2026", status: "Delivered", amount: "£31.50", code: "ORD-9842" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 py-4 items-center group hover:bg-stone-50/50 transition-colors -mx-4 px-4 rounded-lg">
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-8 h-8 bg-stone-100 rounded flex items-center justify-center">
                       <ImageIcon className="w-3 h-3 text-stone-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900">{row.title}</p>
                      <p className="text-[11px] text-stone-400 font-mono mt-0.5">{row.code}</p>
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-stone-600">{row.date}</div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-600">
                      {row.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-medium text-stone-900">{row.amount}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
