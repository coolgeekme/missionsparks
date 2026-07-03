import { useEffect, useMemo, useState, useRef } from "react";

// Per-play variety: pick a mode so the game feels different every time.
const MODES = [
    { name: "Standard", duration: 30, size: 64, decoyChance: 0 },
    { name: "Fast",     duration: 20, size: 56, decoyChance: 0 },
    { name: "Marathon", duration: 45, size: 68, decoyChance: 0 },
    { name: "Tricky",   duration: 30, size: 60, decoyChance: 0.35 }, // 35% of taps show a red decoy — penalizes wrong taps
    { name: "Tiny",     duration: 30, size: 44, decoyChance: 0 },
];

export default function ReactionTap({ onComplete }) {
    const mode = useMemo(() => MODES[Math.floor(Math.random() * MODES.length)], []);
    const [timeLeft, setTimeLeft] = useState(mode.duration);
    const [hits, setHits] = useState(0);
    const [misses, setMisses] = useState(0);
    const [pos, setPos] = useState({ x: 50, y: 50 });
    const [isDecoy, setIsDecoy] = useState(false);
    const [running, setRunning] = useState(false);
    const [finished, setFinished] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const move = () => {
        const x = 5 + Math.random() * 75;
        const y = 5 + Math.random() * 75;
        setPos({ x, y });
        setIsDecoy(Math.random() < mode.decoyChance);
    };

    const start = () => {
        setRunning(true);
        setFinished(false);
        setHits(0);
        setMisses(0);
        setTimeLeft(mode.duration);
        move();
        timerRef.current = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    clearInterval(timerRef.current);
                    setRunning(false);
                    setFinished(true);
                    setHits((h) => {
                        onComplete(Math.max(0, h - Math.floor(misses / 2)));
                        return h;
                    });
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
    };

    const hit = () => {
        if (!running) return;
        if (isDecoy) {
            setMisses((m) => m + 1);
        } else {
            setHits((h) => h + 1);
        }
        move();
    };

    return (
        <div data-testid="game-reaction-tap">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-bold text-[#4A5568]">
                    {isDecoy || mode.decoyChance > 0
                        ? "Tap ORANGE targets — skip the red ones!"
                        : "Tap the target as fast as you can!"}
                </p>
                <div className="flex gap-2 items-center">
                    <span className="mb-chip bg-[#4361EE]/10 text-[#4361EE] text-xs" data-testid="reaction-mode">{mode.name}</span>
                    <span className="mb-chip bg-[#FFD166]/30 text-[#876200]" data-testid="reaction-time">⏱ {timeLeft}s</span>
                    <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]" data-testid="reaction-hits">⚡ {hits}</span>
                    {mode.decoyChance > 0 && (
                        <span className="mb-chip bg-[#EF476F]/15 text-[#EF476F]" data-testid="reaction-misses">✖ {misses}</span>
                    )}
                </div>
            </div>

            <div className="relative bg-[#F0F8FF] rounded-3xl border-2 border-[#E2E8F0] h-80 overflow-hidden">
                {!running && !finished && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button onClick={start} className="btn-pop-primary" data-testid="reaction-start">Start ⚡</button>
                    </div>
                )}
                {running && (
                    <button
                        onClick={hit}
                        className={`absolute rounded-full border-4 shadow-[0_6px_0_0_rgba(0,0,0,0.15)] active:translate-y-1 ${isDecoy ? "bg-[#EF476F] border-[#B03656]" : "bg-[#FFD166] border-[#E5BC5C]"}`}
                        style={{
                            left: `${pos.x}%`,
                            top: `${pos.y}%`,
                            width: mode.size,
                            height: mode.size,
                            transition: "all 0.1s",
                        }}
                        data-testid="reaction-target"
                        aria-label={isDecoy ? "decoy" : "target"}
                    />
                )}
                {finished && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <p className="font-display font-extrabold text-3xl text-[#0B132B]" data-testid="reaction-final-score">
                            Score: {Math.max(0, hits - Math.floor(misses / 2))}
                        </p>
                        <p className="text-[#4A5568] font-semibold">
                            {mode.decoyChance > 0
                                ? `${hits} hits · ${misses} decoys avoided imperfectly. Nice reflexes! 🎯`
                                : "Nice reflexes! 🎯"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
