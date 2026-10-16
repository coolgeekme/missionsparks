import { useMemo, useState } from "react";

const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

// Randomize dot count per play — 8/10/12/15/20 dots — with progressively tighter
// spacing at higher counts so the play feels different every time.
function pickDotCount() {
    const options = [8, 10, 12, 12, 15, 20];
    return options[Math.floor(Math.random() * options.length)];
}

function placeDots(N) {
    const dots = [];
    let safety = 0;
    // Adaptive minimum distance so higher-N rounds still fit the 100x100 grid.
    const minDist = Math.max(10, 60 / Math.sqrt(N));
    while (dots.length < N && safety < 1500) {
        safety++;
        const x = 6 + Math.random() * 88;
        const y = 6 + Math.random() * 88;
        if (dots.every((d) => Math.hypot(d.x - x, d.y - y) > minDist)) {
            dots.push({ x, y });
        }
    }
    const labels = shuffle(Array.from({ length: dots.length }, (_, i) => i + 1));
    return dots.map((d, i) => ({ ...d, n: labels[i] }));
}

export default function DotConnect({ onComplete }) {
    const N = useMemo(pickDotCount, []);
    const dots = useMemo(() => placeDots(N), [N]);
    const [next, setNext] = useState(1);
    const [tapped, setTapped] = useState([]);
    const [errorFlash, setErrorFlash] = useState(false);

    const tap = (n) => {
        if (n === next) {
            const newTapped = [...tapped, n];
            setTapped(newTapped);
            const nx = next + 1;
            setNext(nx);
            if (nx > N) {
                setTimeout(() => onComplete(N), 250);
            }
        } else {
            setErrorFlash(true);
            setTimeout(() => setErrorFlash(false), 300);
        }
    };

    return (
        <div data-testid="game-dot-connect">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#6E675B]">Tap the dots in order from 1 to {N}.</p>
                <span className="mb-chip bg-[#E4572E]/10 text-[#E4572E]" data-testid="dot-connect-next">Next: {next > N ? "✓" : next}</span>
            </div>
            <div className={`relative h-80 rounded-3xl bg-[#FBF6EE] border-2 ${errorFlash ? "border-[#BC4B32]" : "border-[#E8E0D2]"} overflow-hidden`}>
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {tapped.slice(0, -1).map((n, idx) => {
                        const a = dots.find((d) => d.n === n);
                        const b = dots.find((d) => d.n === tapped[idx + 1]);
                        if (!a || !b) return null;
                        return (
                            <line
                                key={idx}
                                x1={`${a.x}%`} y1={`${a.y}%`}
                                x2={`${b.x}%`} y2={`${b.y}%`}
                                stroke="#E4572E" strokeWidth="3" strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
                {dots.map((d) => {
                    const size = N > 15 ? "h-10 w-10 text-sm" : "h-12 w-12";
                    return (
                        <button
                            key={d.n}
                            onClick={() => tap(d.n)}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 ${size} rounded-full border-4 font-extrabold font-display transition-all ${
                                tapped.includes(d.n)
                                    ? "bg-[#3F8C5E] border-[#2F6B47] text-white"
                                    : "bg-white border-[#E4572E] text-[#E4572E] hover:scale-110"
                            }`}
                            style={{ left: `${d.x}%`, top: `${d.y}%` }}
                            data-testid={`dot-${d.n}`}
                            disabled={tapped.includes(d.n)}
                        >
                            {d.n}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
