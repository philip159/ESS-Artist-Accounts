import React from "react";

export function ActivityFeed() {
  const chartPoints = "0,80 30,50 60,65 90,20 120,45 150,10 180,30";

  return (
    <div className="min-h-screen bg-[#F8F8F7] text-stone-800 p-4 sm:p-8 font-sans overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <header className="pt-4">
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-stone-900">
            Hi Sophie <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
          </h1>
        </header>

        {/* Dynamic Quote Box */}
        <div className="bg-amber-50/80 border-l-4 border-amber-400 p-5 rounded-r-xl shadow-sm">
          <p className="text-amber-900 font-medium italic text-lg leading-snug">
            "Your collection is gaining momentum — Misty Highlands has been your bestseller 3 months running."
          </p>
        </div>

        {/* Payout Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-2xl shadow-inner border border-blue-100">
              📅
            </div>
            <div>
              <h2 className="text-stone-500 text-sm font-medium mb-0.5">Next Payout</h2>
              <p className="text-stone-900 font-medium text-lg">30 April 2026</p>
            </div>
          </div>
          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold tracking-wide border border-emerald-100 self-start sm:self-auto shadow-sm">
            £189.50 ready
          </div>
        </div>

        {/* Chart Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-stone-500 text-sm font-medium mb-1">This Month</h2>
              <p className="text-3xl font-bold text-stone-900 tracking-tight">£347.20</p>
            </div>
            <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
              +58%
            </div>
          </div>
          <div className="w-full h-32 relative flex items-end">
            <svg viewBox="0 0 180 100" className="w-full h-full preserve-3d" preserveAspectRatio="none">
              <path
                d={`M ${chartPoints}`}
                fill="none"
                stroke="currentColor"
                className="text-stone-900"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dots */}
              {chartPoints.split(" ").map((point, i) => {
                const [x, y] = point.split(",");
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="currentColor"
                    className="text-stone-900"
                  />
                );
              })}
              {chartPoints.split(" ").map((point, i) => {
                const [x, y] = point.split(",");
                return (
                  <circle
                    key={`inner-${i}`}
                    cx={x}
                    cy={y}
                    r="2"
                    fill="white"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent pointer-events-none opacity-50" />
          </div>
        </div>

        {/* Activity Feed Timeline */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-xl font-bold text-stone-900 mb-6 tracking-tight">Activity</h2>
          <div className="relative space-y-0 pl-4 sm:pl-0">
            {/* Vertical Line */}
            <div className="absolute left-[27px] sm:left-[71px] top-4 bottom-4 w-px bg-stone-200" />
            
            <div className="relative flex items-start gap-4 sm:gap-6 py-4">
              <div className="hidden sm:block w-12 text-right pt-0.5 text-sm font-semibold text-stone-400">2 Apr</div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white mt-1.5 shadow-sm" />
              <div className="flex-1">
                <div className="sm:hidden text-xs font-semibold text-stone-400 mb-1">2 Apr</div>
                <p className="text-stone-800 font-medium">
                  <span className="font-bold text-stone-900">Misty Highlands</span> sold for £49.99
                </p>
                <p className="text-emerald-600 text-sm font-semibold mt-0.5">You earned £17.50</p>
              </div>
            </div>

            <div className="relative flex items-start gap-4 sm:gap-6 py-4">
              <div className="hidden sm:block w-12 text-right pt-0.5 text-sm font-semibold text-stone-400">1 Apr</div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white mt-1.5 shadow-sm" />
              <div className="flex-1">
                <div className="sm:hidden text-xs font-semibold text-stone-400 mb-1">1 Apr</div>
                <p className="text-stone-800 font-medium">
                  <span className="font-bold text-stone-900">Golden Shore</span> sold
                </p>
                <p className="text-emerald-600 text-sm font-semibold mt-0.5">You earned £22.40</p>
              </div>
            </div>

            <div className="relative flex items-start gap-4 sm:gap-6 py-4">
              <div className="hidden sm:block w-12 text-right pt-0.5 text-sm font-semibold text-stone-400">31 Mar</div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white mt-1.5 shadow-sm" />
              <div className="flex-1">
                <div className="sm:hidden text-xs font-semibold text-stone-400 mb-1">31 Mar</div>
                <p className="text-stone-800 font-medium">
                  <span className="font-bold text-stone-900">Quiet Forest</span> sold
                </p>
                <p className="text-emerald-600 text-sm font-semibold mt-0.5">You earned £14.00</p>
              </div>
            </div>

            <div className="relative flex items-start gap-4 sm:gap-6 py-4">
              <div className="hidden sm:block w-12 text-right pt-0.5 text-sm font-semibold text-stone-400">29 Mar</div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white mt-1.5 shadow-sm" />
              <div className="flex-1">
                <div className="sm:hidden text-xs font-semibold text-stone-400 mb-1">29 Mar</div>
                <p className="text-stone-800 font-medium">
                  <span className="font-bold text-stone-900">Abstract Tide</span> sold
                </p>
                <p className="text-emerald-600 text-sm font-semibold mt-0.5">You earned £31.50</p>
              </div>
            </div>

            <div className="relative flex items-start gap-4 sm:gap-6 py-4">
              <div className="hidden sm:block w-12 text-right pt-0.5 text-sm font-semibold text-stone-400">15 Mar</div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white mt-1.5 shadow-sm" />
              <div className="flex-1">
                <div className="sm:hidden text-xs font-semibold text-stone-400 mb-1">15 Mar</div>
                <p className="text-stone-800 font-medium">
                  <span className="font-bold text-stone-900">Misty Highlands</span> added to the live collection
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bestseller Promo Card */}
        <div className="bg-stone-900 text-white rounded-2xl overflow-hidden shadow-md flex items-stretch border border-stone-800">
          <div className="w-1/3 bg-gradient-to-br from-stone-700 to-stone-800 shrink-0 relative">
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <div className="p-5 sm:p-6 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold tracking-wider text-amber-400 uppercase">Your Bestseller</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">Misty Highlands</h3>
            <p className="text-stone-400 text-sm mt-1">28 units sold this year</p>
          </div>
        </div>
      </div>
    </div>
  );
}
