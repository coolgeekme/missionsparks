import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FEELING_SCENARIOS } from "./content_pools";

// Feelings Detective — read a tiny moment, name the feeling.
// Contract: ({ onComplete, content }) => JSX, calls onComplete(score) once.
// content.scenarios (optional, from a parent pack) = [{ scenario, feeling, distractors: [...] }, ...]
const ROUNDS = 8;
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

export default function FeelingsDetective({ onComplete, content }) {
    const deck = useMemo(() => {
        const source = Array.isArray(content?.scenarios) && content.scenarios.length
            ? content.scenarios
            : FEELING_SCENARIOS;
        return shuffle(source).slice(0, Math.min(ROUNDS, source.length));
    }, [content]);

    const [index, setIndex] = useState(0);
    const [correct, setCorrect] = useState(0);
    const [picked, setPicked] = useState(null);
    const [done, setDone] = useState(false);
    const advanced = useRef(null);
    const fired = useRef(false);

    const card = deck[index];

    // Options are rebuilt per card so the right answer isn't always in the same slot.
    const options = useMemo(() => {
        if (!card) return [];
        const wrongs = (card.distractors || []).slice(0, 3);
        return shuffle([card.feeling, ...wrongs]);
    }, [card]);

    useEffect(() => () => clearTimeout(advanced.current), []);

    const finish = useCallback((hits) => {
        if (fired.current) return;
        fired.current = true;
        setDone(true);
        onComplete(hits * 10);
    }, [onComplete]);

    const pick = (feeling) => {
        if (picked) return;
        const hit = feeling === card.feeling;
        setPicked(feeling);
        const hits = correct + (hit ? 1 : 0);
        if (hit) setCorrect(hits);
        advanced.current = setTimeout(() => {
            if (index + 1 >= deck.length) {
                finish(hits);
            } else {
                setIndex((i) => i + 1);
                setPicked(null);
            }
        }, hit ? 750 : 1400);
    };

    if (!card) return <p className="text-sm font-bold text-[#6E675B]">No scenarios loaded.</p>;

    if (done) {
        return (
            <div data-testid="game-feelings-detective" className="text-center py-6 space-y-2">
                <p className="font-display font-extrabold text-3xl text-[#201D18]" data-testid="fd-final-score">
                    {correct} of {deck.length}
                </p>
                <p className="text-[#6E675B] font-semibold">
                    You read {correct} feeling{correct === 1 ? "" : "s"} right. Naming a feeling is a real skill. 💛
                </p>
            </div>
        );
    }

    return (
        <div data-testid="game-feelings-detective">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-bold text-[#6E675B]">Read the moment. Which feeling is it?</p>
                <div className="flex gap-2 items-center">
                    <span className="mb-chip bg-[#E4572E]/10 text-[#E4572E]" data-testid="fd-progress">
                        {index + 1}/{deck.length}
                    </span>
                    <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]" data-testid="fd-score">⭐ {correct * 10}</span>
                </div>
            </div>

            <div className="bg-white rounded-3xl border-2 border-[#E8E0D2] p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mb-2">The moment</p>
                <p className="font-display font-bold text-xl sm:text-2xl leading-snug text-[#201D18]" data-testid="fd-scenario">
                    {card.scenario}
                </p>

                <div className="grid sm:grid-cols-2 gap-3 mt-6">
                    {options.map((opt, i) => {
                        const isPicked = picked === opt;
                        const isRight = opt === card.feeling;
                        const reveal = !!picked;
                        return (
                            <button
                                key={opt}
                                onClick={() => pick(opt)}
                                disabled={reveal}
                                className={`rounded-2xl border-2 px-4 py-4 font-bold text-left transition-all ${
                                    reveal && isRight
                                        ? "bg-[#3F8C5E]/15 border-[#3F8C5E] text-[#2F6B47]"
                                        : reveal && isPicked
                                        ? "bg-[#BC4B32]/15 border-[#BC4B32] text-[#BC4B32]"
                                        : reveal
                                        ? "bg-white border-[#E8E0D2] text-[#9A9286]"
                                        : "bg-white border-[#E8E0D2] text-[#201D18] hover:border-[#E4572E]"
                                }`}
                                data-testid={`fd-choice-${i}`}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>

                {picked && (
                    <p className="mt-4 text-sm font-bold text-[#6E675B]" data-testid="fd-feedback">
                        {picked === card.feeling
                            ? "Yes — that's it."
                            : `Close. It's more like “${card.feeling}”.`}
                    </p>
                )}
            </div>
        </div>
    );
}
