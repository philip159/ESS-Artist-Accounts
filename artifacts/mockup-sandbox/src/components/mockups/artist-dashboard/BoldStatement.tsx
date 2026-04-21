import React from "react";

export function BoldStatement() {
  const chartPoints = "0,100 0,80 25,60 50,20 75,40 100,0 100,100";
  
  return (
    <div className="min-h-screen bg-stone-50 text-black overflow-y-auto font-sans">
      
      {/* HUGE Hero Section */}
      <section className="min-h-[40vh] flex flex-col justify-end px-6 sm:px-12 py-16 sm:py-24 relative border-b-2 border-black">
        <div className="absolute top-8 left-6 sm:top-12 sm:left-12">
          <span className="text-sm font-bold uppercase tracking-widest bg-black text-white px-3 py-1 rounded-full">
            Hi Sophie
          </span>
        </div>
        
        <div className="space-y-2 mt-20">
          <h1 className="text-[80px] sm:text-[120px] font-bold leading-none tracking-tighter -ml-1">
            £347.20
          </h1>
          <p className="text-xl sm:text-2xl font-medium tracking-tight text-stone-600 uppercase">
            Earned in March 2026
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 sm:px-12 py-12 space-y-16">
        
        {/* Status Pill */}
        <section>
          <div className="inline-flex items-center gap-4 bg-black text-white px-6 py-4 rounded-full text-sm sm:text-base font-bold uppercase tracking-wider">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Next payout 30 April</span>
            <span className="text-stone-400">/</span>
            <span>£189.50 ready</span>
          </div>
        </section>

        {/* Chart Section */}
        <section className="space-y-8">
          {/* Range Tabs */}
          <div className="flex flex-wrap gap-2">
            {["TODAY", "THIS MONTH", "LAST MONTH", "LAST 6M", "ALL TIME"].map((tab, i) => (
              <button 
                key={tab} 
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${
                  i === 1 ? "bg-black text-white" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Area Chart */}
          <div className="w-full h-48 sm:h-64 border-b-2 border-black relative">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              <path
                d={chartPoints}
                fill="currentColor"
                className="text-black"
              />
            </svg>
          </div>
        </section>

        {/* Grid Layout for Orders & Bestseller */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-8 items-start">
          
          {/* Orders Table */}
          <section className="lg:col-span-2 space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-8 border-b-2 border-stone-200 pb-2">
              Recent Orders
            </h2>
            <div className="space-y-4">
              {[
                { title: "Misty Highlands", comm: "£17.50", date: "2 Apr" },
                { title: "Golden Shore", comm: "£22.40", date: "1 Apr" },
                { title: "Quiet Forest", comm: "£14.00", date: "31 Mar" },
                { title: "Abstract Tide", comm: "£31.50", date: "29 Mar" }
              ].map((order, i) => (
                <div key={i} className="flex justify-between items-baseline group border-b border-stone-200 pb-4">
                  <div>
                    <p className="font-bold text-lg">{order.title}</p>
                    <p className="text-xs font-mono text-stone-500 uppercase mt-1">{order.date}</p>
                  </div>
                  <p className="font-mono text-xl font-bold">{order.comm}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Bestseller Card */}
          <section>
             <div className="bg-stone-900 text-white p-8 rounded-3xl space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-stone-800 rounded-full blur-3xl -mr-10 -mt-10" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 relative z-10">
                  No.1 Bestseller
                </h3>
                <div className="space-y-2 relative z-10">
                  <p className="text-3xl font-bold leading-tight">Misty Highlands</p>
                  <p className="text-stone-400 font-mono text-sm uppercase">28 Units Sold</p>
                </div>
             </div>
          </section>

        </div>

      </div>
    </div>
  );
}
