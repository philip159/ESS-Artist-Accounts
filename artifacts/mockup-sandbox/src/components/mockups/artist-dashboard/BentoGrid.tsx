import React from "react";
import { 
  Calendar, 
  PoundSterling, 
  TrendingUp, 
  Package, 
  Image as ImageIcon,
  Clock,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BentoGrid() {
  return (
    <div className="min-h-screen bg-[#FDFDFC] p-4 md:p-8 font-sans overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500 mt-1">Overview of your gallery performance</p>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(140px,auto)]">
          
          {/* A. WIDE GREETING TILE (col-span-2) */}
          <Card className="col-span-1 md:col-span-2 row-span-1 bg-[#F3F4F1] border-neutral-200/60 shadow-sm p-6 flex flex-col justify-center rounded-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none transition-opacity group-hover:opacity-20">
               <Sparkles size={120} strokeWidth={1} />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl font-medium text-neutral-800 flex items-center gap-2 mb-2">
                Good morning, Sophie <span className="text-2xl">🌿</span>
              </h2>
              <p className="text-neutral-600 text-sm max-w-[85%] leading-relaxed">
                Your collection is gaining momentum — <strong className="font-medium text-neutral-800">Misty Highlands</strong> has been your bestseller 3 months running.
              </p>
            </div>
          </Card>

          {/* B. PAYOUT TILE (col-span-1) */}
          <Card className="col-span-1 border-neutral-200/60 shadow-sm p-5 flex flex-col justify-between rounded-2xl bg-white">
            <div className="flex items-start justify-between mb-4">
              <div className="p-2 bg-neutral-100 rounded-lg">
                <Calendar className="w-5 h-5 text-neutral-600" />
              </div>
              <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 font-normal hover:bg-neutral-100">
                Pending
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 mb-1">Next Payout</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-neutral-900">£189.50</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">Est. 30 April 2026</p>
            </div>
          </Card>

          {/* C. COMMISSION TILE (col-span-1) */}
          <Card className="col-span-1 border-neutral-200/60 shadow-sm p-5 flex flex-col justify-between rounded-2xl bg-white">
             <div className="flex items-start justify-between mb-4">
              <div className="p-2 bg-green-50 rounded-lg">
                <PoundSterling className="w-5 h-5 text-green-600" />
              </div>
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 font-medium border-0 flex items-center gap-1 shadow-none">
                <TrendingUp className="w-3 h-3" /> +58%
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 mb-1">Earned This Month</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-neutral-900">£347.20</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">vs £218.80 last month</p>
            </div>
          </Card>

          {/* D. CHART TILE (col-span-2, row-span-2) */}
          <Card className="col-span-1 md:col-span-2 row-span-2 border-neutral-200/60 shadow-sm p-6 flex flex-col rounded-2xl bg-white overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-medium text-neutral-900">Revenue Overview</h3>
                <p className="text-sm text-neutral-500">Monthly commission earned</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
                <span>2026</span>
              </div>
            </div>
            
            <div className="flex-1 w-full relative mt-auto flex items-end pt-8">
              {/* Fake grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="w-full h-[1px] bg-neutral-100" />
                ))}
              </div>
              
              {/* SVG Area Chart */}
              <div className="relative w-full h-full">
                 <svg viewBox="0 0 400 160" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    {/* Area fill */}
                    <path 
                      d="M0,130 L100,110 L200,60 L300,10 L400,90 L400,160 L0,160 Z" 
                      fill="url(#area-gradient)" 
                      className="opacity-50"
                    />
                    {/* Line */}
                    <path 
                      d="M0,130 L100,110 L200,60 L300,10 L400,90" 
                      fill="none" 
                      stroke="#171717" 
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Points */}
                    <circle cx="0" cy="130" r="4" fill="white" stroke="#171717" strokeWidth="2" />
                    <circle cx="100" cy="110" r="4" fill="white" stroke="#171717" strokeWidth="2" />
                    <circle cx="200" cy="60" r="4" fill="white" stroke="#171717" strokeWidth="2" />
                    <circle cx="300" cy="10" r="5" fill="#171717" />
                    <circle cx="400" cy="90" r="4" fill="white" stroke="#171717" strokeWidth="2" strokeDasharray="2,2" />
                    
                    {/* Projected line */}
                    <path 
                      d="M300,10 L400,90" 
                      fill="none" 
                      stroke="#171717" 
                      strokeWidth="3"
                      strokeDasharray="6,4"
                      strokeLinecap="round"
                    />

                    <defs>
                      <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f3f4f6" stopOpacity="1" />
                        <stop offset="100%" stopColor="#f3f4f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                 </svg>
              </div>
            </div>
            
            <div className="flex justify-between w-full mt-4 text-xs font-medium text-neutral-400 px-2">
              <span>Dec</span>
              <span>Jan</span>
              <span>Feb</span>
              <span className="text-neutral-900 font-semibold">Mar</span>
              <span>Apr</span>
            </div>
          </Card>

          {/* E. BESTSELLER TILE (col-span-1) */}
          <Card className="col-span-1 border-neutral-200/60 shadow-sm p-1 flex flex-col rounded-2xl bg-white overflow-hidden group cursor-pointer hover:border-neutral-300 transition-colors">
            <div className="relative h-[120px] w-full rounded-xl overflow-hidden bg-gradient-to-br from-stone-200 via-stone-300 to-stone-400 mb-3">
              {/* Fake image texture */}
              <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
              <div className="absolute top-2 left-2">
                 <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 shadow-none font-medium backdrop-blur-sm bg-amber-100/90 text-[10px] px-2 py-0">
                    Bestseller
                 </Badge>
              </div>
            </div>
            <div className="px-3 pb-3">
              <h3 className="font-medium text-neutral-900 text-sm truncate">Misty Highlands</h3>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-neutral-500">28 units sold</p>
                <p className="text-xs font-medium text-neutral-900">£486.00</p>
              </div>
            </div>
          </Card>

          {/* G. LIVE WORKS TILE (col-span-1) */}
          <Card className="col-span-1 border-neutral-200/60 shadow-sm p-5 flex flex-col rounded-2xl bg-white">
             <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-neutral-900 text-sm">Portfolio</h3>
              <Badge variant="outline" className="text-neutral-500 font-normal">12 Live</Badge>
             </div>
             
             <div className="flex-1 flex flex-col justify-center">
               <div className="grid grid-cols-4 gap-2">
                 {[...Array(12)].map((_, i) => (
                   <div 
                     key={i} 
                     className="aspect-square rounded-md bg-neutral-100 border border-neutral-200/50 shadow-sm"
                     style={{
                       background: `linear-gradient(135deg, hsl(${i * 30 + 40}, 20%, 90%), hsl(${i * 30 + 40}, 20%, 85%))`
                     }}
                   />
                 ))}
                 {[...Array(2)].map((_, i) => (
                   <div 
                     key={`pending-${i}`} 
                     className="aspect-square rounded-md border border-dashed border-neutral-300 flex items-center justify-center bg-neutral-50/50"
                   >
                     <Clock className="w-3 h-3 text-neutral-300" />
                   </div>
                 ))}
               </div>
             </div>
             <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                <span className="text-xs text-neutral-500">2 pending review</span>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
             </div>
          </Card>

          {/* F. RECENT ORDERS TILE (col-span-2) */}
          <Card className="col-span-1 md:col-span-2 border-neutral-200/60 shadow-sm p-0 flex flex-col rounded-2xl bg-white overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
              <h3 className="font-medium text-neutral-900 text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-neutral-400" />
                Recent Orders
              </h3>
              <button className="text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
                View all
              </button>
            </div>
            <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto">
              {[
                { title: "Misty Highlands", date: "2 Apr 2026", amount: "£17.50", status: "processing" },
                { title: "Golden Shore", date: "1 Apr 2026", amount: "£22.40", status: "shipped" },
                { title: "Quiet Forest", date: "31 Mar 2026", amount: "£14.00", status: "delivered" },
              ].map((order, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-neutral-50/50 transition-colors group cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200/50 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 group-hover:underline underline-offset-2 decoration-neutral-300">{order.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{order.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-neutral-900">{order.amount}</p>
                    <p className="text-[10px] uppercase tracking-wider font-medium text-neutral-400 mt-1">{order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
