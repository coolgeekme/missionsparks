import { useEffect, useState, useRef } from "react";

const TOTAL = 60; // seconds
const IN = 4;
const HOLD = 1;
const OUT = 6;
const CYCLE = IN + HOLD + OUT; // 11s

export default function BreathingBubble({ onComplete }) {
    const [t, setT] = useState(0);
    const [running, setRunning] = useState(false);
    const ref = useRef(null);

    useEffect(() => () => clearInterval(ref.current), []);

    const start = () => {
        setRunning(true);
        setT(0);
        ref.current = setInterval(() => {
            setT((x) => {
                if (x >= TOTAL) {
                    clearInterval(ref.current);
                    setRunning(false);
                    setTimeout(() => onComplete(Math.floor(TOTAL / CYCLE)), 50);
                    return TOTAL;
                }
                return x + 0.1;
            });
        }, 100);
    };

    // phase math
    const inCycle = t % CYCLE;
    let phase = "Breathe in";
    let scale = 0.6;
    if (inCycle < IN) {
        phase = "Breathe in";
        scale = 0.6 + (inCycle / IN) * 0.7; // 0.6 → 1.3
    } else if (inCycle < IN + HOLD) {
        phase = "Hold";
        scale = 1.3;
    } else {
        phase = "Breathe out";
        const o = inCycle - IN - HOLD;
        scale = 1.3 - (o / OUT) * 0.7; // 1.3 → 0.6
    }

    const left = Math.max(0, Math.ceil(TOTAL - t));

    return (
        <div data-testid="game-breathing">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#4A5568]">Match your breath to the bubble.</p>
                <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]" data-testid="breathing-time">⏱ {left}s</span>
            </div>
            <div className="relative h-80 rounded-3xl bg-gradient-to-br from-[#F0F8FF] to-[#06D6A0]/10 border-2 border-[#E2E8F0] flex items-center justify-center overflow-hidden">
                <div
                    className="rounded-full bg-[#06D6A0]/40 border-4 border-[#06D6A0] transition-transform duration-[100ms]"
                    style={{ width: 140, height: 140, transform: `scale(${scale})` }}
                    data-testid="breathing-bubble"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="font-display font-extrabold text-2xl text-[#0B132B] drop-shadow-sm" data-testid="breathing-phase">
                        {running ? phase : "Ready?"}
                    </p>
                </div>
                {!running && (
                    <div className="absolute bottom-6">
                        <button onClick={start} className="btn-pop-accent" data-testid="breathing-start">Start 🫧</button>
                    </div>
                )}
            </div>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mt-3">
                Inhale 4s · hold 1s · exhale 6s
            </p>
        </div>
    );
}
