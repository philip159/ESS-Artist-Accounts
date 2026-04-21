import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function Minimal() {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col font-sans text-stone-900 selection:bg-stone-200">
      {/* Top Bar */}
      <header className="flex items-center px-8 py-6 border-b border-stone-100">
        <img src="/__mockup/images/logo.png" alt="East Side Studio" className="h-[30px] w-auto mr-4 object-contain" />
        <span className="text-xs tracking-widest uppercase font-medium text-stone-900 mt-1">East Side Studio London</span>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative w-full">
        <div className="relative flex flex-col items-center justify-center mb-8 h-[240px] w-full max-w-xl mx-auto">
          {/* Ghostly 404 */}
          <h1 className="absolute inset-0 flex items-center justify-center text-[10rem] md:text-[14rem] font-thin text-stone-100 leading-none select-none tracking-tighter z-0">
            404
          </h1>
          {/* Foreground Text */}
          <h2 className="relative z-10 text-2xl md:text-3xl font-medium text-stone-900 tracking-tight whitespace-nowrap pt-8">
            Page not found
          </h2>
        </div>

        <p className="text-stone-500 font-light max-w-md mx-auto text-lg mb-10 leading-relaxed">
          The page you're looking for has moved, or perhaps it never existed.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Button variant="default" className="bg-stone-900 text-white hover:bg-stone-800 rounded-full px-6 py-6 h-auto shadow-none border-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return home
          </Button>
          <Button variant="ghost" className="text-stone-500 hover:text-stone-900 rounded-full px-6 py-6 h-auto">
            Contact us
          </Button>
        </div>
      </main>
    </div>
  );
}
