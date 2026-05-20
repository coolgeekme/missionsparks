import { useEffect, useState, useRef } from "react";

const DURATION = 30; // seconds

export default function ReactionTap({ onComplete }) {
    const [timeLeft, setTimeLeft] = useState(DURATION);
    const [hits, setHits] = useState(0);
    const [pos, setPos] = useState({ x: 50, y: 50 });
    const [running, setRunning] = useState(false);
    const [finished, setFinished] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const move = () => {
        const x = 5 + Math.random() * 75;
        const y = 5 + Math.random() * 75;
        setPos({ x, y });
    };

    const start = () => {
        setRunning(true);
        setFinished(false);
        setHits(0);
        setTimeLeft(DURATION);
        move();
        timerRef.current = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    clearInterval(timerRef.current);
                    setRunning(false);
                    setFinished(true);
                    setTimeout(() => setHits((h) => { onComplete(h); return h; }), 50);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
    };

    const hit = () => {
        if (!running) return;
        setHits((h) => h + 1);
        move();
    };

    return (
        <div data-testid="game-reaction-tap">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#4A5568]">Tap the orange target as fast as you can!</p>
                <div className="flex gap-2">
                    <span className="mb-chip bg-[#FFD166]/30 text-[#876200]" data-testid="reaction-time">⏱ {timeLeft}s</span>
                    <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]" data-testid="reaction-hits">⚡ {hits}</span>
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
                        className="absolute h-16 w-16 rounded-full bg-[#FFD166] border-4 border-[#E5BC5C] shadow-[0_6px_0_0_#E5BC5C] active:translate-y-1"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transition: "all 0.1s" }}
                        data-testid="reaction-target"
                        aria-label="target"
                    />
                )}
                {finished && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <p className="font-display font-extrabold text-3xl text-[#0B132B]" data-testid="reaction-final-score">
                            Score: {hits}
                        </p>
                        <p className="text-[#4A5568] font-semibold">Nice reflexes! 🎯</p>
                    </div>
                )}
            </div>
        </div>
    );
}
