import { useEffect, useMemo, useState } from "react";
import { SENTENCE_PUZZLES } from "./content_pools";
import { fetchFreshPack } from "../lib/freshPack";

const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const ROUND_SIZE = 4;

export default function SentenceBuilder({ onComplete, content }) {
    const [freshPack, setFreshPack] = useState(null);
    useEffect(() => {
        if (content?.sentences?.length) return;
        let alive = true;
        fetchFreshPack("sentence-builder").then((p) => {
            if (alive && p && Array.isArray(p.sentences) && p.sentences.length) setFreshPack(p);
        });
        return () => { alive = false; };
    }, [content]);

    const PUZZLES = useMemo(() => {
        if (content?.sentences?.length) return content.sentences.slice(0, 5);
        const source = (freshPack?.sentences?.length ? freshPack.sentences : SENTENCE_PUZZLES);
        return shuffle(source).slice(0, ROUND_SIZE);
    }, [content, freshPack]);
    const puzzles = useMemo(
        () => PUZZLES.map((s) => ({
            target: s.split(" "),
            bank: shuffle(s.split(" ").map((w, i) => ({ w, id: i }))),
        })),
        [PUZZLES],
    );
    const [idx, setIdx] = useState(0);
    const [placed, setPlaced] = useState([]); // array of ids in order
    const [score, setScore] = useState(0);

    const cur = puzzles[idx];
    const remaining = cur.bank.filter((b) => !placed.includes(b.id));

    const place = (id) => setPlaced((p) => [...p, id]);
    const undo = () => setPlaced((p) => p.slice(0, -1));
    const clear = () => setPlaced([]);

    const check = () => {
        const built = placed.map((id) => cur.bank.find((b) => b.id === id).w);
        const correct = built.length === cur.target.length && built.every((w, i) => w === cur.target[i]);
        if (correct) {
            const newScore = score + 1;
            setScore(newScore);
            if (idx === puzzles.length - 1) {
                setTimeout(() => onComplete(newScore), 300);
            } else {
                setIdx((i) => i + 1);
                setPlaced([]);
            }
        }
        return correct;
    };

    const placedWords = placed.map((id) => cur.bank.find((b) => b.id === id).w);
    const isComplete = placed.length === cur.target.length;
    const isCorrect = isComplete && placedWords.every((w, i) => w === cur.target[i]);
    const isWrong = isComplete && !isCorrect;

    return (
        <div data-testid="game-sentence-builder">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#6E675B]">Build the sentence by tapping words in order.</p>
                <span className="mb-chip bg-[#BC4B32]/15 text-[#BC4B32]" data-testid="sentence-progress">
                    Puzzle {idx + 1}/{puzzles.length}
                </span>
            </div>

            <div
                className={`min-h-20 rounded-2xl border-2 p-4 mb-4 transition-colors ${
                    isCorrect ? "bg-[#3F8C5E]/10 border-[#3F8C5E]" :
                    isWrong ? "bg-[#BC4B32]/10 border-[#BC4B32]" : "bg-white border-[#E8E0D2]"
                }`}
                data-testid="sentence-target"
            >
                {placed.length === 0 ? (
                    <p className="text-[#9A9286] font-bold">Tap words below to build your sentence…</p>
                ) : (
                    <p className="font-display font-bold text-lg text-[#201D18]">
                        {placedWords.join(" ")}
                        {!isComplete && <span className="text-[#9A9286]"> _</span>}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4" data-testid="sentence-bank">
                {remaining.map((b) => (
                    <button
                        key={b.id}
                        onClick={() => place(b.id)}
                        className="rounded-xl border-2 border-[#E8E0D2] bg-white px-4 py-2 font-bold text-[#201D18] hover:border-[#BC4B32]"
                        data-testid={`sentence-word-${b.id}`}
                    >
                        {b.w}
                    </button>
                ))}
            </div>

            <div className="flex gap-2">
                <button onClick={undo} disabled={!placed.length} className="btn-pop-ghost flex-1 text-sm py-2 disabled:opacity-50" data-testid="sentence-undo">↶ Undo</button>
                <button onClick={clear} disabled={!placed.length} className="btn-pop-ghost flex-1 text-sm py-2 disabled:opacity-50" data-testid="sentence-clear">Clear</button>
                <button
                    onClick={check}
                    disabled={!isComplete}
                    className="btn-pop-primary flex-1 text-sm py-2 disabled:opacity-50"
                    data-testid="sentence-check"
                >
                    Check ✓
                </button>
            </div>
        </div>
    );
}
