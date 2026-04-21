import { Button } from "@/components/ui/button";

export function Editorial() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F9F6F0] font-sans overflow-hidden">
      {/* Left Column */}
      <div className="w-full md:w-[45%] flex flex-col justify-between p-8 md:p-16 lg:p-24 relative">
        <div className="mb-16 md:mb-0">
          <img 
            src="/__mockup/images/logo.png" 
            alt="East Side Studio London" 
            className="h-7 w-auto object-contain"
          />
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="font-serif text-[6rem] md:text-[8rem] lg:text-[10rem] leading-[0.8] tracking-tight flex flex-col mb-12" style={{ fontFamily: '"Playfair Display", serif' }}>
            <span className="text-stone-300">Page</span>
            <span className="text-stone-300 ml-8 md:ml-16">Not</span>
            <span className="text-stone-900">Found.</span>
          </div>

          <div className="w-12 h-px bg-amber-700/60 mb-8"></div>

          <p className="text-stone-600 text-lg md:text-xl max-w-sm mb-10 leading-relaxed">
            It seems this page has wandered off the gallery wall. Let us guide you back.
          </p>

          <div className="flex flex-col gap-4 max-w-xs">
            <Button 
              size="lg" 
              className="w-full bg-stone-900 text-stone-50 hover:bg-stone-800 rounded-none h-14 text-sm tracking-widest uppercase font-medium"
            >
              Back to the Portal
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full border-stone-300 text-stone-700 hover:bg-stone-200/50 hover:text-stone-900 rounded-none h-14 text-sm tracking-widest uppercase font-medium"
            >
              View All Artists
            </Button>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="w-full md:w-[55%] h-[50vh] md:h-screen relative p-4 md:p-8">
        <div className="w-full h-full relative overflow-hidden bg-stone-200">
          <img 
            src="/__mockup/images/ess-studio-01.jpg" 
            alt="Studio view" 
            className="w-full h-full object-cover object-center absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
          
          <div className="absolute bottom-8 left-8 md:bottom-12 md:left-12">
            <span className="text-white text-6xl md:text-8xl font-bold opacity-90 tracking-tighter">
              404
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
