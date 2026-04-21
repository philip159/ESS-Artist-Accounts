import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function ArtisticFrame() {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-between font-sans selection:bg-stone-200">
      {/* Navigation */}
      <nav className="w-full flex items-center justify-between p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img src="/__mockup/images/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          <span className="font-serif text-lg tracking-wide text-stone-800">East Side Studio London</span>
        </div>
        <div className="px-4 py-1.5 rounded-full border border-stone-200 bg-white/50 text-xs font-medium tracking-widest uppercase text-stone-600">
          Artist Portal
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-6 py-12">
        
        {/* The Frame */}
        <div className="relative group">
          {/* Sold Badge */}
          <div className="absolute -top-3 -right-3 z-10 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm rotate-12 uppercase tracking-wider">
            Sold
          </div>
          
          {/* Outer Frame */}
          <div className="p-4 bg-stone-300 rounded-sm shadow-2xl ring-1 ring-black/5">
            {/* Inner Matte */}
            <div className="p-16 bg-stone-100 ring-1 ring-inset ring-black/5 shadow-inner">
              {/* Artwork Content */}
              <div className="flex flex-col items-center justify-center gap-6">
                <div className="text-[8rem] leading-none font-serif text-stone-800 tracking-tighter mix-blend-multiply opacity-90">
                  404
                </div>
                
                <div className="flex flex-col items-center gap-4 w-full max-w-[200px]">
                  <div className="text-sm font-medium text-stone-500 tracking-[0.3em] uppercase whitespace-nowrap">
                    Page Not Found
                  </div>
                  
                  <div className="w-full h-px bg-stone-300"></div>
                  
                  <div className="text-xs italic text-stone-400 font-serif text-center">
                    Mixed media on missing server, 2026
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Museum Label Card */}
        <div className="mt-16 w-full max-w-sm">
          <Card className="bg-white/80 backdrop-blur-sm border-stone-200 shadow-sm rounded-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-serif text-stone-800">Error 404</CardTitle>
              <CardDescription className="text-stone-500 text-sm">East Side Studio London — Artist Portal</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-stone-600 mb-6 leading-relaxed">
                The page you are looking for has been removed from our current exhibition or never existed in our collection.
              </p>
              <Button 
                variant="outline" 
                className="w-full rounded-none border-stone-300 text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                onClick={() => window.location.href = "/"}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Gallery
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full p-6 text-center text-xs text-stone-400 tracking-widest uppercase">
        East Side Studio London · Artist Portal
      </footer>
    </div>
  );
}
