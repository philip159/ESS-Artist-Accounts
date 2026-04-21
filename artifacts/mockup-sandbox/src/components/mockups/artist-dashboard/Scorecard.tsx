import React, { useState } from "react";
import { ArrowUpRight, Clock, Image as ImageIcon, Hourglass, Medal } from "lucide-react";

export function Scorecard() {
  const [range, setRange] = useState("This Month");

  const chartData = [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 218 },
    { label: "Mar", value: 347 },
    { label: "Apr (MTD)", value: 129 },
  ];
  const maxVal = Math.max(...chartData.map((d) => d.value));

  const orders = [
    { id: "1", art: "Misty Highlands", date: "2 Apr 2026", commission: "£17.50" },
    { id: "2", art: "Golden Shore", date: "1 Apr 2026", commission: "£22.40" },
    { id: "3", art: "Quiet Forest", date: "31 Mar 2026", commission: "£14.00" },
    { id: "4", art: "Abstract Tide", date: "29 Mar 2026", commission: "£31.50" },
  ];

  return (
    <div className="min-h-screen bg-white text-stone-900 p-6 md:p-10 font-sans overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <p className="text-stone-600 text-sm md:text-base font-medium tracking-wide uppercase">Hi Sophie</p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-1 tracking-tight">Metric Scorecard</h1>
        </header>

        {/* Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 border border-stone-200 bg-white shadow-sm flex flex-col justify-between group hover:border-stone-300 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="text-stone-500 text-sm font-medium">This Month's Commission</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight text-stone-900">£347.20</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">+58% vs last month</div>
            </div>
          </div>

          <div className="p-5 border border-stone-200 bg-white shadow-sm flex flex-col justify-between group hover:border-stone-300 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="text-stone-500 text-sm font-medium">Next Payout Date</span>
              <Clock className="w-4 h-4 text-stone-400" />
            </div>
            <div>
              <div className="text-xl md:text-2xl font-bold tracking-tight text-stone-900 mt-2">30 Apr 2026</div>
              <div className="text-xs text-stone-500 font-medium mt-1">March commissions</div>
            </div>
          </div>

          <div className="p-5 border border-stone-200 bg-white shadow-sm flex flex-col justify-between group hover:border-stone-300 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="text-stone-500 text-sm font-medium">Collection Size</span>
              <ImageIcon className="w-4 h-4 text-stone-400" />
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight text-stone-900">12</div>
              <div className="text-xs text-stone-500 font-medium mt-1">Live Works</div>
            </div>
          </div>

          <div className="p-5 border border-stone-200 bg-white shadow-sm flex flex-col justify-between group hover:border-stone-300 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="text-stone-500 text-sm font-medium">Pending Payout</span>
              <Hourglass className="w-4 h-4 text-stone-400" />
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight text-stone-900">£189.50</div>
              <div className="text-xs text-stone-500 font-medium mt-1">Ready for transfer</div>
            </div>
          </div>
        </div>

        {/* Range Selector & Chart */}
        <section className="border border-stone-200 bg-white shadow-sm p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <h2 className="text-lg font-semibold text-stone-900">Monthly Performance</h2>
            <div className="flex bg-stone-100 p-1 rounded-md text-sm border border-stone-200">
              {["Today", "This Month", "Last Month", "Last 6M"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded-sm transition-all font-medium ${
                    range === r ? "bg-white text-stone-900 shadow-sm border border-stone-200/50" : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {chartData.map((d) => (
              <div key={d.label} className="flex items-center gap-4">
                <div className="w-20 text-sm text-stone-500 text-right font-medium">{d.label}</div>
                <div className="flex-1 flex items-center gap-3">
                  <div
                    className="h-8 bg-stone-800 rounded-sm transition-all duration-500"
                    style={{ width: `${Math.max((d.value / maxVal) * 100, 2)}%` }}
                  />
                  <div className="text-sm font-bold text-stone-700 w-16">£{d.value}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Orders */}
        <section className="border border-stone-200 bg-white shadow-sm">
          <div className="p-6 border-b border-stone-200">
            <h2 className="text-lg font-semibold text-stone-900">Recent Commissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-stone-600 text-xs uppercase tracking-wider font-semibold border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 cursor-pointer hover:bg-stone-100 transition-colors">Artwork</th>
                  <th className="px-6 py-4 cursor-pointer hover:bg-stone-100 transition-colors">Date</th>
                  <th className="px-6 py-4 text-right cursor-pointer hover:bg-stone-100 transition-colors">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800">
                {orders.map((order, idx) => (
                  <tr key={order.id} className={idx % 2 === 0 ? "bg-white hover:bg-stone-50" : "bg-stone-50/50 hover:bg-stone-50"}>
                    <td className="px-6 py-4 font-medium">{order.art}</td>
                    <td className="px-6 py-4 text-stone-500">{order.date}</td>
                    <td className="px-6 py-4 text-right font-bold tabular-nums">{order.commission}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Leaderboard Row */}
        <section className="border border-stone-200 bg-stone-900 text-white shadow-sm p-6 flex flex-col md:flex-row items-center gap-6 rounded-sm">
          <div className="flex-shrink-0 bg-amber-400 p-3 rounded-full text-stone-900 shadow-md border border-amber-300">
            <Medal className="w-8 h-8" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-stone-400 text-xs uppercase tracking-widest font-semibold mb-1">Bestselling Artwork</h2>
            <div className="text-2xl font-bold">Misty Highlands</div>
          </div>
          <div className="flex gap-8 text-center md:text-left justify-center md:justify-end w-full md:w-auto">
            <div>
              <div className="text-stone-400 text-xs uppercase tracking-wider mb-1">Units Sold</div>
              <div className="text-xl font-semibold">28</div>
            </div>
            <div>
              <div className="text-stone-400 text-xs uppercase tracking-wider mb-1">Total Revenue</div>
              <div className="text-xl font-semibold">£486.00</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
