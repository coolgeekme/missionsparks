// MissionSparks two-spark brand mark.
// primary = big spark, accent = small spark (the "child" rising off it).
export default function SparkMark({ size = 24, primary = "#201D18", accent = "#E4572E", className = "" }) {
    const d = "M0 -34 C2.8 -15 3.8 -9 10 -6 C16 -3 21 -2 32 0 C21 2 16 3 10 6 C3.8 9 2.8 15 0 34 C-2.8 15 -3.8 9 -10 6 C-16 3 -21 2 -32 0 C-21 -2 -16 -3 -10 -6 C-3.8 -9 -2.8 -15 0 -34 Z";
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            data-testid="spark-mark"
        >
            <g transform="translate(50 50)"><path d={d} fill={primary} /></g>
            <g transform="translate(77 32) scale(0.42)"><path d={d} fill={accent} /></g>
        </svg>
    );
}
