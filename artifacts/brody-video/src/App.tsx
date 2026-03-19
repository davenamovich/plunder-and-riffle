import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Users, MessageSquare, Briefcase, Zap } from "lucide-react";

const SCENE_DURATIONS = [
  8, // 0: Cold open - Brody staring
  12, // 1: Stats moment - Leads generated
  10, // 2: "While I was at the game"
  12, // 3: The Pitch - Rotators & AI
  10, // 4: Sign-up moment - 24-hour free trial
  8  // 5: End card - Logo & "Definitely fine"
];

export default function App() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    const totalScenes = SCENE_DURATIONS.length;
    let timeout: NodeJS.Timeout;

    const playScene = (index: number) => {
      timeout = setTimeout(() => {
        setCurrentScene((prev) => (prev + 1) % totalScenes);
      }, SCENE_DURATIONS[index] * 1000);
    };

    playScene(currentScene);

    return () => clearTimeout(timeout);
  }, [currentScene]);

  // Persistent camera moves based on scene
  const getCameraPosition = () => {
    switch(currentScene) {
      case 0: return { scale: 1, x: 0, y: 0 };
      case 1: return { scale: 1.1, x: '-5%', y: '5%' };
      case 2: return { scale: 1.2, x: '5%', y: '-5%' };
      case 3: return { scale: 1.05, x: 0, y: '2%' };
      case 4: return { scale: 1.15, x: 0, y: 0 };
      case 5: return { scale: 1, x: 0, y: 0 };
      default: return { scale: 1, x: 0, y: 0 };
    }
  }

  return (
    <div className="w-full h-screen bg-[#0b1a2c] overflow-hidden relative text-[#f5deb3] flex items-center justify-center">
      {/* Background Layer (Persistent) */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-[#0b1a2c] via-[#1a2b40] to-[#2c1a0f] opacity-90"
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Moving Ambient Lights */}
      <motion.div 
        className="absolute w-[80vw] h-[80vw] rounded-full bg-[#b45f06] blur-[150px] opacity-20 pointer-events-none mix-blend-screen"
        animate={{
          x: currentScene === 0 ? '-20vw' : currentScene === 1 ? '30vw' : currentScene === 2 ? '-40vw' : '10vw',
          y: currentScene === 0 ? '-20vh' : currentScene === 1 ? '40vh' : currentScene === 2 ? '20vh' : '-10vh',
          scale: currentScene % 2 === 0 ? 1 : 1.5
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
      />

      <motion.div 
        className="absolute inset-0 opacity-[0.05] pointer-events-none z-[100]" 
        style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
      />

      <motion.div 
        className="relative w-full h-full"
        animate={getCameraPosition()}
        transition={{ duration: 3, ease: "easeInOut" }}
      >
        
        {/* SCENE 0: Cold Open */}
        <Scene isVisible={currentScene === 0}>
          <div className="absolute inset-0 flex items-center justify-center w-full h-full px-12">
             <motion.div 
              className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay"
              style={{ backgroundImage: "url('/brody-video/brody.png')" }}
              initial={{ scale: 1.1 }}
              animate={currentScene === 0 ? { scale: 1 } : { scale: 1.1 }}
              transition={{ duration: 8, ease: "easeOut" }}
            />
            <div className="relative z-10 w-full max-w-7xl grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-16 items-center">
              <motion.div
                initial={{ x: -100, opacity: 0, rotateY: 20 }}
                animate={currentScene === 0 ? { x: 0, opacity: 1, rotateY: 0 } : { x: -100, opacity: 0 }}
                transition={{ duration: 1.2, type: "spring" }}
              >
                <div className="relative group perspective-1000">
                  <div className="absolute inset-0 bg-[#b45f06] rounded-xl transform rotate-3 blur-lg opacity-50 group-hover:opacity-70 transition-opacity duration-1000" />
                  <img 
                    src="/brody-video/brody.png" 
                    alt="Brody" 
                    className="w-full h-[65vh] object-cover rounded-xl shadow-2xl border-4 border-[#f5deb3]/10 relative z-10 transform-gpu"
                  />
                </div>
              </motion.div>
              
              <div className="space-y-8">
                <motion.div 
                  className="inline-block px-5 py-2 border border-[#b45f06] rounded-full text-[#b45f06] font-bold tracking-[0.2em] text-sm uppercase bg-[#2c1a0f]/80 backdrop-blur"
                  initial={{ opacity: 0, y: 20 }}
                  animate={currentScene === 0 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                >
                  Incoming Transmission
                </motion.div>
                
                <motion.h1 
                  className="text-6xl md:text-8xl font-display leading-[0.9] text-[#f5deb3] uppercase"
                  initial={{ opacity: 0, y: 30 }}
                  animate={currentScene === 0 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                >
                  "So apparently my AI has been working while I was at the game."
                </motion.h1>
                
                <motion.div 
                  className="flex items-center gap-4 text-xl text-[#f5deb3]/80 font-medium"
                  initial={{ opacity: 0 }}
                  animate={currentScene === 0 ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 2.5, duration: 1 }}
                >
                  <span className="w-12 h-[2px] bg-[#f1c232]"></span>
                  Brody Bennett <span className="opacity-50">| Frat House Common Room</span>
                </motion.div>
              </div>
            </div>
          </div>
        </Scene>

        {/* SCENE 1: Stats */}
        <Scene isVisible={currentScene === 1}>
           <div className="absolute inset-0 flex flex-col items-center justify-center w-full h-full px-12">
            <motion.h2 
              className="text-7xl md:text-9xl font-display text-center mb-24 text-[#f5deb3] uppercase"
              initial={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
              animate={currentScene === 1 ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0, y: -50 }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              The Damage Report
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
              <StatCard icon={<Users size={40} />} value="4,208" label="Leads Sourced" isVisible={currentScene === 1} delay={0.5} />
              <StatCard icon={<MessageSquare size={40} />} value="1,832" label="Messages Sent" isVisible={currentScene === 1} delay={0.8} />
              <StatCard icon={<TrendingUp size={40} />} value="47" label="Meetings Booked" isVisible={currentScene === 1} delay={1.1} />
            </div>
            
            <motion.p
              className="mt-24 text-4xl font-display text-[#b45f06] uppercase tracking-wider"
              initial={{ opacity: 0, y: 20 }}
              animate={currentScene === 1 ? { opacity: 1, y: 0 } : { opacity: 0 }}
              transition={{ delay: 3, duration: 1 }}
            >
              "I literally haven't checked my laptop since Thursday."
            </motion.p>
          </div>
        </Scene>

        {/* SCENE 2: The Setup */}
        <Scene isVisible={currentScene === 2}>
           <div className="absolute inset-0 flex items-center justify-center w-full h-full px-12">
             <div className="relative z-10 w-full max-w-7xl flex flex-col md:flex-row items-center gap-16">
              <div className="flex-1 space-y-10">
                <motion.h2 
                  className="text-7xl md:text-[8rem] font-display text-[#f1c232] uppercase leading-[0.8]"
                  initial={{ opacity: 0, x: -100 }}
                  animate={currentScene === 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 100 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                >
                  Plunder<br/>& Riffle.
                </motion.h2>
                <motion.div 
                  className="space-y-6 text-3xl text-[#f5deb3]/80 font-light"
                  initial={{ opacity: 0 }}
                  animate={currentScene === 2 ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.8 }}
                >
                  <p>A <span className="italic">"totally fine"</span> SaaS company.</p>
                  <p>We set up 24-hour AI rotators.</p>
                  <p className="text-4xl text-[#f5deb3] font-bold">They work. You sleep.</p>
                </motion.div>
              </div>
              
              <div className="flex-1 w-full">
                <motion.div 
                  className="w-full bg-[#0b1a2c]/80 backdrop-blur-xl p-8 rounded-2xl border border-[#f1c232]/30 shadow-[0_0_80px_rgba(180,95,6,0.3)] relative overflow-hidden"
                  initial={{ scale: 0.8, opacity: 0, rotateY: 30, z: -200 }}
                  animate={currentScene === 2 ? { scale: 1, opacity: 1, rotateY: 0, z: 0 } : { scale: 0.8, opacity: 0 }}
                  transition={{ duration: 1.2, type: "spring" }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                  <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <div className="text-sm text-white/40 ml-2 font-mono tracking-widest">brody_rotator.exe</div>
                  </div>
                  <div className="font-mono text-xl md:text-2xl text-[#f1c232]/90 space-y-5">
                    <TypewriterText text="> initializing BrodyBot_v1.2..." isVisible={currentScene === 2} delay={1.5} />
                    <TypewriterText text="> scraping target accounts..." isVisible={currentScene === 2} delay={2.5} />
                    <TypewriterText text="> 328 prospects found. drafting hyper-personalized outreach..." isVisible={currentScene === 2} delay={3.5} />
                    <TypewriterText text="> dispatching emails... [██████████] 100%" isVisible={currentScene === 2} delay={5.0} />
                    <motion.div 
                      className="text-[#b45f06] mt-8 block font-bold"
                      initial={{ opacity: 0 }}
                      animate={currentScene === 2 ? { opacity: 1 } : { opacity: 0 }}
                      transition={{ delay: 6.5 }}
                    >
                      > status: crushing it.
                    </motion.div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </Scene>

        {/* SCENE 3: The Pitch */}
        <Scene isVisible={currentScene === 3}>
          <div className="absolute inset-0 flex items-center justify-center w-full h-full bg-[#b45f06]">
            <motion.div 
              className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(#2c1a0f 2px, transparent 2px)", backgroundSize: "40px 40px" }}
              animate={{ backgroundPosition: ["0px 0px", "40px 40px"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            <div className="text-center space-y-20 relative z-10 w-full max-w-6xl px-12">
              <motion.h2 
                className="text-[8rem] md:text-[12rem] font-display text-[#0b1a2c] uppercase leading-[0.85]"
                initial={{ opacity: 0, scale: 0.5, y: 100 }}
                animate={currentScene === 3 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 1.2 }}
                transition={{ duration: 1, type: "spring", bounce: 0.4 }}
              >
                Let the agent<br />prove it first.
              </motion.h2>
              
              <div className="flex flex-col md:flex-row justify-center gap-12">
                <motion.div 
                  className="bg-[#0b1a2c] text-[#f5deb3] px-12 py-8 rounded-full text-4xl font-display uppercase tracking-widest flex items-center justify-center gap-6 shadow-2xl border border-[#f1c232]/20"
                  initial={{ opacity: 0, y: 50, rotate: -5 }}
                  animate={currentScene === 3 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: 50 }}
                  transition={{ delay: 1, type: "spring" }}
                >
                  <Zap size={40} className="text-[#f1c232]" />
                  24-Hour Rotators
                </motion.div>
                
                <motion.div 
                  className="bg-[#0b1a2c] text-[#f5deb3] px-12 py-8 rounded-full text-4xl font-display uppercase tracking-widest flex items-center justify-center gap-6 shadow-2xl border border-[#f1c232]/20"
                  initial={{ opacity: 0, y: 50, rotate: 5 }}
                  animate={currentScene === 3 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: 50 }}
                  transition={{ delay: 1.3, type: "spring" }}
                >
                  <Briefcase size={40} className="text-[#f1c232]" />
                  Powered by AI
                </motion.div>
              </div>
            </div>
          </div>
        </Scene>

        {/* SCENE 4: Sign-up moment */}
        <Scene isVisible={currentScene === 4}>
           <div className="absolute inset-0 flex items-center justify-center w-full h-full px-12">
             <div className="relative z-10 w-full max-w-6xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={currentScene === 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: -50 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="space-y-4"
              >
                <h3 className="text-6xl md:text-8xl font-display text-[#f5deb3] uppercase">
                  Look, you could do this yourself.
                </h3>
                <h3 className="text-6xl md:text-8xl font-display text-[#b45f06] uppercase">
                  But you're busy.
                </h3>
              </motion.div>

              <motion.div 
                className="mt-24 inline-block bg-[#2c1a0f]/80 backdrop-blur border-2 border-[#b45f06] p-16 rounded-[3rem] shadow-[0_30px_100px_rgba(180,95,6,0.3)]"
                initial={{ opacity: 0, scale: 0.8, rotateX: -30 }}
                animate={currentScene === 4 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.8 }}
                transition={{ delay: 1.5, duration: 1, type: "spring" }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="text-2xl text-[#f1c232] uppercase tracking-[0.3em] font-bold mb-8">The Offer</div>
                <div className="text-8xl md:text-[8rem] font-display text-[#f5deb3] mb-8 leading-none uppercase">24-hour<br/>free trial</div>
                <div className="text-3xl text-[#f5deb3]/70 font-light">Just go to plunderandriffle.com. It's easy.</div>
              </motion.div>
            </div>
          </div>
        </Scene>

        {/* SCENE 5: End Card */}
        <Scene isVisible={currentScene === 5}>
          <div className="absolute inset-0 flex flex-col items-center justify-center w-full h-full bg-[#0b1a2c] px-12">
            <motion.div 
              className="w-80 h-80 mb-16 relative"
              initial={{ scale: 0, rotate: -180 }}
              animate={currentScene === 5 ? { scale: 1, rotate: 0 } : { scale: 0 }}
              transition={{ type: "spring", damping: 15, duration: 1.5 }}
            >
              <div className="absolute inset-0 border-[16px] border-[#f1c232] rounded-3xl rotate-12 opacity-40 mix-blend-screen" />
              <div className="absolute inset-0 border-[16px] border-[#b45f06] rounded-3xl -rotate-6 opacity-60 mix-blend-screen" />
              <div className="absolute inset-0 bg-[#2c1a0f] border-8 border-[#f5deb3] rounded-3xl flex items-center justify-center shadow-2xl">
                <span className="text-[120px] font-display text-[#f1c232] leading-none pt-4">P&R</span>
              </div>
            </motion.div>

            <motion.h1 
              className="text-[6rem] md:text-[9rem] font-display text-[#f5deb3] uppercase leading-none tracking-tight mb-8"
              initial={{ opacity: 0, y: 50 }}
              animate={currentScene === 5 ? { opacity: 1, y: 0 } : { opacity: 0 }}
              transition={{ delay: 0.8, duration: 1 }}
            >
              Plunder & Riffle
            </motion.h1>
            
            <motion.p 
              className="text-5xl font-light text-[#f1c232] tracking-wider mb-20"
              initial={{ opacity: 0 }}
              animate={currentScene === 5 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 1.5, duration: 1 }}
            >
              plunderandriffle.com
            </motion.p>
            
            <motion.div 
              className="flex items-center gap-6 text-[#f5deb3]/50 text-2xl font-bold tracking-[0.3em] uppercase border-t border-[#f5deb3]/10 pt-12"
              initial={{ opacity: 0 }}
              animate={currentScene === 5 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 2.5, duration: 1 }}
            >
              <Users size={32} /> 8 billion reviews. Definitely fine.
            </motion.div>
          </div>
        </Scene>

      </motion.div>
    </div>
  );
}

// Helper components
function Scene({ children, isVisible }: { children: React.ReactNode, isVisible: boolean }) {
  return (
    <motion.div 
      className="absolute inset-0 origin-center"
      initial={{ opacity: 0, scale: 1.1, zIndex: 0 }}
      animate={isVisible ? { opacity: 1, scale: 1, zIndex: 10 } : { opacity: 0, scale: 0.9, zIndex: 0 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{ pointerEvents: isVisible ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  );
}

function StatCard({ icon, value, label, isVisible, delay }: { icon: React.ReactNode, value: string, label: string, isVisible: boolean, delay: number }) {
  return (
    <motion.div 
      className="bg-[#2c1a0f]/60 backdrop-blur-xl border border-[#b45f06]/40 p-12 rounded-[2.5rem] flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
      initial={{ opacity: 0, y: 100, rotateX: 45 }}
      animate={isVisible ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 100 }}
      transition={{ delay, duration: 1.2, type: "spring", bounce: 0.3 }}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#f1c232] to-transparent opacity-50" />
      <div className="p-8 bg-[#0b1a2c] rounded-full text-[#f1c232] mb-10 shadow-inner border border-white/5">
        {icon}
      </div>
      <div className="text-8xl font-display text-[#f5deb3] mb-6 tracking-wider">
        {isVisible && <Counter value={value} delay={delay + 0.5} />}
      </div>
      <div className="text-[#f5deb3]/60 font-bold uppercase tracking-[0.2em] text-xl">{label}</div>
    </motion.div>
  );
}

function Counter({ value, delay }: { value: string, delay: number }) {
  const [display, setDisplay] = useState("0");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplay(value);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return <span>{display}</span>;
}

function TypewriterText({ text, isVisible, delay }: { text: string, isVisible: boolean, delay: number }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (!isVisible) {
      setDisplayedText("");
      return;
    }

    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayedText(text.substring(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 30);
      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [isVisible, delay, text]);

  return <div>{displayedText || "\u00A0"}</div>;
}
