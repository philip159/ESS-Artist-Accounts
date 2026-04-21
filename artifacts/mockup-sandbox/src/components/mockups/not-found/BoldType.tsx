import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BoldType() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 p-6 md:p-12 overflow-hidden selection:bg-stone-900 selection:text-stone-50">
      {/* Top Bar */}
      <header className="flex justify-between items-center w-full max-w-7xl mx-auto">
        <img 
          src="/__mockup/images/logo.png" 
          alt="East Side Studio" 
          className="h-6 w-auto mix-blend-difference opacity-90"
        />
        <div className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400">
          Artist Portal
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center w-full max-w-7xl mx-auto relative z-10 py-20">
        <div className="flex flex-col items-start -ml-2 md:-ml-4">
          <div className="flex items-baseline gap-4 md:gap-8 flex-wrap">
            <h1 className="text-[6rem] sm:text-[8rem] md:text-[12rem] lg:text-[15rem] font-black tracking-tighter uppercase leading-[0.75] text-stone-900 m-0">
              FOUR
            </h1>
            <span className="text-[4rem] sm:text-[6rem] md:text-[10rem] lg:text-[13rem] font-black tracking-tighter uppercase leading-[0.8] text-stone-300">
              OH
            </span>
          </div>
          
          <h1 className="text-[6rem] sm:text-[8rem] md:text-[12rem] lg:text-[15rem] font-black tracking-tighter uppercase leading-[0.85] text-stone-900 m-0">
            FOUR.
          </h1>
        </div>

        <div className="mt-8 md:mt-16 max-w-3xl">
          <div className="h-px bg-stone-300 w-full mb-6"></div>
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">
            Page not found
          </p>
        </div>
      </main>

      {/* Bottom Section */}
      <footer className="flex flex-col sm:flex-row justify-between items-start sm:items-end w-full max-w-7xl mx-auto mt-auto gap-8 pt-8">
        <Button 
          size="lg" 
          className="bg-stone-900 text-stone-50 hover:bg-stone-800 rounded-none h-14 px-8 text-sm font-bold tracking-widest uppercase flex items-center gap-3 transition-transform hover:-translate-y-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Button>
        
        <div className="text-stone-400 text-xs font-medium tracking-wider uppercase">
          Error 404 · East Side Studio London
        </div>
      </footer>
    </div>
  );
}
