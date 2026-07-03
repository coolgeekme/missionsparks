import { useEffect, useMemo, useState } from "react";
import { WORD_PAIRS } from "./content_pools";
import { fetchFreshPack } from "../lib/freshPack";

const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const ROUND_SIZE = 6;

export default function WordMatch({ onComplete, content }) {
    // AI-generated weekly fresh pack — overrides the pool when available.
    const [freshPack, setFreshPack] = useState(null);
    useEffect(() => {
        // Explicit pack (from a Kid Studio pack via ?packId=) wins outright.
        if (content?.pairs?.length) return;
        let alive = true;
        fetchFreshPack("word-match").then((p) => {
            if (alive && p && Array.isArray(p.pairs) && p.pairs.length) setFreshPack(p);
        });
        return () => { alive = false; };
    }, [content]);

    // Pick a fresh subset of size ROUND_SIZE each mount so kids don't see the
    // same words back-to-back.
    const PAIRS = useMemo(() => {
        if (content?.pairs?.length) return content.pairs.slice(0, 12);
        const source = (freshPack?.pairs?.length ? freshPack.pairs : WORD_PAIRS);
        return shuffle(source).slice(0, ROUND_SIZE);
    }, [content, freshPack]);
    const initial = useMemo(() => ({
        words: shuffle(PAIRS.map((p) => p.word)),
        meanings: shuffle(PAIRS.map((p) => p.meaning)),
        lookup: Object.fromEntries(PAIRS.map((p) => [p.word, p.meaning])),
    }), [PAIRS]);
    const [pickedWord, setPickedWord] = useState(null);
    const [pickedMeaning, setPickedMeaning] = useState(null);
    const [matched, setMatched] = useState({}); // word -> true
    const [wrongFlash, setWrongFlash] = useState(false);

    const tryMatch = (word, meaning) => {
        if (initial.lookup[word] === meaning) {
            setMatched((m) => {
                const next = { ...m, [word]: true };
                if (Object.keys(next).length === PAIRS.length) {
                    setTimeout(() => onComplete(PAIRS.length), 350);
                }
                return next;
            });
        } else {
            setWrongFlash(true);
            setTimeout(() => setWrongFlash(false), 350);
        }
        setPickedWord(null);
        setPickedMeaning(null);
    };

    const pickWord = (w) => {
        if (matched[w]) return;
        if (pickedMeaning) tryMatch(w, pickedMeaning);
        else setPickedWord(w);
    };
    const pickMeaning = (m) => {
        if (Object.entries(initial.lookup).some(([w, val]) => val === m && matched[w])) return;
        if (pickedWord) tryMatch(pickedWord, m);
        else setPickedMeaning(m);
    };

    const done = Object.keys(matched).length;

    return (
        <div data-testid="game-word-match">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#4A5568]">Tap a word, then tap its meaning.</p>
                <span className="mb-chip bg-[#4361EE]/10 text-[#4361EE]" data-testid="word-match-progress">{done}/{PAIRS.length}</span>
            </div>
            <div className={`grid md:grid-cols-2 gap-6 ${wrongFlash ? "animate-[shake_0.35s]" : ""}`}>
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Words</p>
                    {initial.words.map((w) => (
                        <button
                            key={w}
                            onClick={() => pickWord(w)}
                            className={`w-full text-left rounded-2xl border-2 px-4 py-3 font-bold transition-all ${
                                matched[w]
                                    ? "bg-[#06D6A0]/15 border-[#06D6A0] text-[#057a5b] line-through"
                                    : pickedWord === w
                                    ? "bg-[#4361EE] text-white border-[#4361EE]"
                                    : "bg-white border-[#E2E8F0] hover:border-[#4361EE]"
                            }`}
                            data-testid={`word-match-word-${w}`}
                            disabled={!!matched[w]}
                        >
                            {w}
                        </button>
                    ))}
                </div>
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Meanings</p>
                    {initial.meanings.map((m) => {
                        const isMatched = Object.entries(initial.lookup).some(([w, val]) => val === m && matched[w]);
                        return (
                            <button
                                key={m}
                                onClick={() => pickMeaning(m)}
                                className={`w-full text-left rounded-2xl border-2 px-4 py-3 font-bold transition-all ${
                                    isMatched
                                        ? "bg-[#06D6A0]/15 border-[#06D6A0] text-[#057a5b] line-through"
                                        : pickedMeaning === m
                                        ? "bg-[#FFD166] text-[#0B132B] border-[#E5BC5C]"
                                        : "bg-white border-[#E2E8F0] hover:border-[#FFD166]"
                                }`}
                                data-testid={`word-match-meaning-${m.slice(0, 12)}`}
                                disabled={isMatched}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
