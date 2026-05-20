import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function MissionTimer({ estimatedMinutes }) {
    const [seconds, setSeconds] = useState(0);
    const [running, setRunning] = useState(false);
    const ref = useRef(null);

    useEffect(() => () => clearInterval(ref.current), []);

    const toggle = () => {
        if (running) {
            clearInterval(ref.current);
            setRunning(false);
        } else {
            setRunning(true);
            ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        }
    };
    const reset = () => {
        clearInterval(ref.current);
        setRunning(false);
        setSeconds(0);
    };

    const target = (estimatedMinutes || 0) * 60;
    const pct = target > 0 ? Math.min(100, (seconds / target) * 100) : 0;
    const over = target > 0 && seconds > target;

    return (
        <div className="mb-card p-4 sm:p-5" data-testid="mission-timer">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-mono font-extrabold ${
                        running ? "bg-[#06D6A0] text-white" : "bg-[#E2E8F0] text-[#4A5568]"
                    }`} data-testid="mission-timer-status">
                        {running ? "●" : "⏸"}
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Working time</p>
                        <p className="font-display font-extrabold text-2xl text-[#0B132B] leading-none mt-0.5" data-testid="mission-timer-display">
                            {fmt(seconds)}
                        </p>
                        {target > 0 && (
                            <p className="text-xs font-bold text-[#4A5568] mt-1">
                                {over ? `+${fmt(seconds - target)} past target` : `Target: ${fmt(target)}`}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={toggle} className={running ? "btn-pop-ghost px-4 py-2" : "btn-pop-primary px-4 py-2"} data-testid="mission-timer-toggle">
                        {running ? (<><Pause size={14} className="inline mr-1" /> Pause</>) : (<><Play size={14} className="inline mr-1" /> {seconds > 0 ? "Resume" : "Start"}</>)}
                    </button>
                    <button onClick={reset} disabled={!seconds} className="btn-pop-ghost px-3 py-2 disabled:opacity-50" data-testid="mission-timer-reset" aria-label="reset timer">
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>
            {target > 0 && (
                <div className="mt-3 h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                    <div className={`h-full ${over ? "bg-[#EF476F]" : "bg-[#06D6A0]"} transition-all`} style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}
