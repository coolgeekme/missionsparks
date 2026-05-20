import { useMemo, useState } from "react";

const N = 10;
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

// Place N dots non-overlapping in a 100x100 grid (approx).
function placeDots() {
    const dots = [];
    let safety = 0;
    while (dots.length < N && safety < 500) {
        safety++;
        const x = 8 + Math.random() * 84;
        const y = 8 + Math.random() * 84;
        if (dots.every((d) => Math.hypot(d.x - x, d.y - y) > 18)) {
            dots.push({ x, y });
        }
    }
    // Assign labels 1..N in shuffled order
    const labels = shuffle(Array.from({ length: N }, (_, i) => i + 1));
    return dots.map((d, i) => ({ ...d, n: labels[i] }));
}

export default function DotConnect({ onComplete }) {
    const dots = useMemo(placeDots, []);
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
                <p className="text-sm font-bold text-[#4A5568]">Tap the dots in order from 1 to 10.</p>
                <span className="mb-chip bg-[#4361EE]/10 text-[#4361EE]" data-testid="dot-connect-next">Next: {next > N ? "✓" : next}</span>
            </div>
            <div className={`relative h-80 rounded-3xl bg-[#F0F8FF] border-2 ${errorFlash ? "border-[#EF476F]" : "border-[#E2E8F0]"} overflow-hidden`}>
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
                                stroke="#4361EE" strokeWidth="3" strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
                {dots.map((d) => (
                    <button
                        key={d.n}
                        onClick={() => tap(d.n)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full border-4 font-extrabold font-display transition-all ${
                            tapped.includes(d.n)
                                ? "bg-[#06D6A0] border-[#05B488] text-white"
                                : "bg-white border-[#4361EE] text-[#4361EE] hover:scale-110"
                        }`}
                        style={{ left: `${d.x}%`, top: `${d.y}%` }}
                        data-testid={`dot-${d.n}`}
                        disabled={tapped.includes(d.n)}
                    >
                        {d.n}
                    </button>
                ))}
            </div>
        </div>
    );
}
