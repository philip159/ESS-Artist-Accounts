import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function DarkGallery() {
  return (
    <div className="min-h-[100dvh] bg-[#0C0C0C] flex flex-col font-sans text-stone-200 selection:bg-stone-800">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          <img 
            src="/__mockup/images/logo.png" 
            alt="East Side Studio" 
            className="h-[24px] w-auto invert opacity-90 object-contain" 
          />
          <span className="text-xs tracking-widest uppercase font-medium text-white">East Side Studio</span>
        </div>
        <Badge variant="outline" className="border-stone-800 text-stone-400 bg-transparent font-normal px-3 py-1 rounded-full text-xs">
          Artist Portal
        </Badge>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-3xl mx-auto w-full">
        
        <h1 className="text-[9rem] md:text-[11rem] font-bold tracking-tighter leading-none select-none bg-gradient-to-b from-stone-500 to-stone-800 bg-clip-text text-transparent mb-2">
          404
        </h1>
        
        <h2 className="text-2xl md:text-3xl font-light text-white mb-3 tracking-tight">
          This page has gone off the wall.
        </h2>
        
        <p className="text-stone-500 text-sm md:text-base max-w-md mx-auto mb-10 leading-relaxed">
          We couldn't find what you were looking for. It may have been sold, moved, or it simply doesn't exist.
        </p>

        {/* Decorative Artworks - Placed before buttons to sit behind or give visual weight */}
        <div className="flex gap-4 opacity-50 pointer-events-none select-none items-end justify-center mb-12">
          <div className="w-28 h-36 md:w-32 md:h-40 rounded bg-gradient-to-br from-stone-800 to-stone-900 flex items-end p-3 transform -rotate-3 transition-transform duration-1000 ease-out hover:rotate-0">
            <div className="w-full">
              <div className="h-1.5 w-1/2 bg-stone-700/30 rounded-full mb-1.5"></div>
            </div>
          </div>
          <div className="w-28 h-40 md:w-32 md:h-44 rounded bg-gradient-to-bl from-stone-800 to-stone-900 flex items-end p-3 z-10 shadow-2xl shadow-black relative -top-2">
            <div className="w-full">
              <div className="h-1.5 w-2/3 bg-stone-700/30 rounded-full mb-1.5"></div>
            </div>
          </div>
          <div className="w-28 h-32 md:w-32 md:h-36 rounded bg-gradient-to-tr from-stone-800 to-stone-900 flex items-end p-3 transform rotate-2">
            <div className="w-full">
              <div className="h-1.5 w-3/4 bg-stone-700/30 rounded-full mb-1.5"></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
          <Button variant="outline" className="bg-transparent border-stone-800 text-white hover:bg-stone-900 hover:text-white rounded-full px-8 py-6 h-auto transition-colors w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Portal
          </Button>
          <Button variant="ghost" className="text-stone-400 hover:text-white hover:bg-stone-900/50 rounded-full px-8 py-6 h-auto transition-colors w-full sm:w-auto">
            Browse Collection
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>

      </main>
    </div>
  );
}
