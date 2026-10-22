import { useCallback, useEffect, useRef, useState } from "react";

// Number Crunch — 60-second mental-math sprint with a difficulty ramp.
// Contract: ({ onComplete, content }) => JSX, calls onComplete(score) once.
// content.problems (optional, from a parent pack) = [{ question: "7 + 5", answer: 12 }, ...]
const DURATION = 60;
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Ramp the arithmetic so round 1 is easy and round 20 isn't.
function makeProblem(round) {
    if (round <= 4) {
        const a = rand(1, 9), b = rand(1, 9);
        return { question: `${a} + ${b}`, answer: a + b };
    }
    if (round <= 9) {
        const a = rand(6, 18), b = rand(1, a);
        return { question: `${a} − ${b}`, answer: a - b };
    }
    if (round <= 14) {
        const a = rand(2, 5), b = rand(2, 9);
        return { question: `${a} × ${b}`, answer: a * b };
    }
    const kind = rand(0, 2);
    if (kind === 0) {
        const a = rand(11, 25), b = rand(11, 25);
        return { question: `${a} + ${b}`, answer: a + b };
    }
    if (kind === 1) {
        const a = rand(3, 9), b = rand(3, 9);
        return { question: `${a} × ${b}`, answer: a * b };
    }
    const a = rand(2, 6), b = rand(2, 9), c = rand(2, 9);
    return { question: `${a} × ${b} + ${c}`, answer: a * b + c };
}

function makeChoices(answer) {
    const wrong = new Set();
    const offsets = shuffle([1, -1, 2, -2, 3, 10, -10, 5, -5]);
    for (const off of offsets) {
        const cand = answer + off;
        if (cand >= 0 && cand !== answer) wrong.add(cand);
        if (wrong.size === 3) break;
    }
    let filler = answer + 20;
    while (wrong.size < 3) { wrong.add(filler); filler += 7; }
    return shuffle([answer, ...Array.from(wrong)]);
}

export default function NumberCrunch({ onComplete, content }) {
    const packProblems = Array.isArray(content?.problems) && content.problems.length ? content.problems : null;

    const [state, setState] = useState("idle"); // idle | running | finished
    const [timeLeft, setTimeLeft] = useState(DURATION);
    const [round, setRound] = useState(0);
    const [problem, setProblem] = useState(null);
    const [choices, setChoices] = useState([]);
    const [correct, setCorrect] = useState(0);
    const [wrong, setWrong] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [flash, setFlash] = useState(null); // "good" | "bad" | null
    const timerRef = useRef(null);
    const fired = useRef(false);

    const finish = useCallback((hits, misses) => {
        if (fired.current) return;
        fired.current = true;
        clearInterval(timerRef.current);
        setState("finished");
        onComplete(Math.max(0, hits * 10 - misses * 2));
    }, [onComplete]);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const nextProblem = useCallback((n) => {
        const p = packProblems ? packProblems[n % packProblems.length] : makeProblem(n + 1);
        setProblem(p);
        setChoices(makeChoices(p.answer));
        setRound(n + 1);
    }, [packProblems]);

    const start = () => {
        fired.current = false;
        setState("running");
        setTimeLeft(DURATION);
        setCorrect(0); setWrong(0); setStreak(0); setBestStreak(0);
        nextProblem(0);
        timerRef.current = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) { clearInterval(timerRef.current); return 0; }
                return t - 1;
            });
        }, 1000);
    };

    // End the round when the clock hits zero, using the latest counters.
    useEffect(() => {
        if (state === "running" && timeLeft === 0) finish(correct, wrong);
    }, [timeLeft, state, correct, wrong, finish]);

    const answer = (value) => {
        if (state !== "running" || !problem) return;
        const hit = value === problem.answer;
        setFlash(hit ? "good" : "bad");
        setTimeout(() => setFlash(null), 220);
        if (hit) {
            const cs = streak + 1;
            setCorrect((c) => c + 1);
            setStreak(cs);
            setBestStreak((b) => Math.max(b, cs));
        } else {
            setWrong((w) => w + 1);
            setStreak(0);
        }
        nextProblem(round);
    };

    return (
        <div data-testid="game-number-crunch">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-bold text-[#6E675B]">Tap the right answer. The numbers grow as you go.</p>
                <div className="flex gap-2 items-center">
                    <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]" data-testid="nc-timer">⏱ {timeLeft}s</span>
                    <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]" data-testid="nc-score">⭐ {Math.max(0, correct * 10 - wrong * 2)}</span>
                    {streak >= 2 && (
                        <span className="mb-chip bg-[#E4572E]/10 text-[#E4572E]" data-testid="nc-streak">🔥 {streak}</span>
                    )}
                </div>
            </div>

            <div className={`relative bg-[#FBF6EE] rounded-3xl border-2 h-96 overflow-hidden flex flex-col items-center justify-center px-4 ${
                flash === "good" ? "border-[#3F8C5E]" : flash === "bad" ? "border-[#BC4B32]" : "border-[#E8E0D2]"
            }`}>
                {state === "idle" && (
                    <div className="text-center space-y-3">
                        <p className="font-display font-extrabold text-2xl text-[#201D18]">60 seconds of numbers 🧮</p>
                        <p className="text-sm font-semibold text-[#6E675B]">Easy at first. Sneaky by the end.</p>
                        <button onClick={start} className="btn-pop-primary" data-testid="nc-start">Start</button>
                    </div>
                )}

                {state === "running" && problem && (
                    <>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2" data-testid="nc-round">
                            Question {round}
                        </p>
                        <p className="font-display font-extrabold text-5xl text-[#201D18] mb-8" data-testid="nc-problem">
                            {problem.question}
                        </p>
                        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                            {choices.map((c, i) => (
                                <button
                                    key={`${c}-${i}`}
                                    onClick={() => answer(c)}
                                    className="rounded-2xl border-2 border-[#E8E0D2] bg-white px-4 py-5 font-display font-extrabold text-2xl text-[#201D18] hover:border-[#E4572E] active:translate-y-0.5 transition-all"
                                    data-testid={`nc-choice-${i}`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {state === "finished" && (
                    <div className="text-center space-y-2">
                        <p className="font-display font-extrabold text-3xl text-[#201D18]" data-testid="nc-final-score">
                            Score: {Math.max(0, correct * 10 - wrong * 2)}
                        </p>
                        <p className="text-[#6E675B] font-semibold">
                            {correct} right · {wrong} missed · best streak {bestStreak}
                        </p>
                        <button onClick={start} className="btn-pop-secondary mt-2" data-testid="nc-again">Play again</button>
                    </div>
                )}
            </div>
        </div>
    );
}
