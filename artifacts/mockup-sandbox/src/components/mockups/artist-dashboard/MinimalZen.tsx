import React from "react";
import { ArrowUpRight } from "lucide-react";

export function MinimalZen() {
  const chartPoints = "0,100 20,80 40,90 60,40 80,10 100,60";
  
  return (
    <div className="min-h-screen bg-white text-stone-900 overflow-y-auto font-sans selection:bg-stone-100">
      <div className="max-w-3xl mx-auto px-6 py-24 sm:px-12 sm:py-32 space-y-16">
        
        {/* Header Section */}
        <section className="space-y-4">
          <h1 className="text-6xl sm:text-[80px] font-light tracking-tight text-stone-900 leading-none">
            Sophie
          </h1>
          <p className="text-[15px] text-stone-400 max-w-lg leading-relaxed">
            Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running.
          </p>
        </section>

        <div className="h-[1px] w-full bg-stone-100" />

        {/* Stats & Next Payout */}
        <section className="space-y-6">
          <p className="text-stone-500 tracking-wide text-sm sm:text-base flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0">
            <span>£347.20 earned</span>
            <span className="hidden sm:inline mx-3 text-stone-300">·</span>
            <span>£189.50 pending</span>
            <span className="hidden sm:inline mx-3 text-stone-300">·</span>
            <span>12 works live</span>
          </p>
          <p className="text-stone-400 text-sm">
            Payout 30 April — March commissions
          </p>
        </section>

        {/* Sparkline Chart */}
        <section className="pt-8 pb-4">
          <div className="w-full max-w-sm h-16">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <path
                d={`M ${chartPoints}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="text-stone-300"
              />
            </svg>
          </div>
        </section>

        {/* Recent Orders */}
        <section className="space-y-4">
          {[
            { title: "Misty Highlands", comm: "£17.50", date: "2 Apr" },
            { title: "Golden Shore", comm: "£22.40", date: "1 Apr" },
            { title: "Quiet Forest", comm: "£14.00", date: "31 Mar" },
            { title: "Abstract Tide", comm: "£31.50", date: "29 Mar" }
          ].map((order, i) => (
            <div key={i} className="flex items-center text-stone-500 text-[15px] leading-relaxed">
              <span>{order.title}</span>
              <span className="mx-2 text-stone-300">·</span>
              <span>{order.comm}</span>
              <span className="mx-2 text-stone-300">·</span>
              <span className="text-stone-400">{order.date}</span>
            </div>
          ))}
        </section>

        {/* Bestseller */}
        <section className="pt-8 flex items-center gap-4">
          <div className="w-9 h-9 bg-stone-100 rounded-sm overflow-hidden shrink-0">
            {/* Placeholder for Misty Highlands thumbnail */}
            <div className="w-full h-full bg-stone-200" />
          </div>
          <p className="text-stone-400 text-sm">
            Bestseller: <span className="text-stone-600">Misty Highlands</span>
          </p>
        </section>

      </div>
    </div>
  );
}
