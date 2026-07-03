import { useMemo, useState, useEffect } from "react";
import { MEMORY_EMOJI_POOLS } from "./content_pools";
import { fetchFreshPack } from "../lib/freshPack";

const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const ROUND_SIZE = 6;

export default function MemoryCards({ onComplete, content }) {
    const [freshPack, setFreshPack] = useState(null);
    useEffect(() => {
        if (content?.items?.length) return;
        let alive = true;
        fetchFreshPack("memory-cards").then((p) => {
            if (alive && p && Array.isArray(p.items) && p.items.length) setFreshPack(p);
        });
        return () => { alive = false; };
    }, [content]);

    const EMOJIS = useMemo(() => {
        if (content?.items?.length) return content.items.slice(0, 8);
        // Pick a random theme pool, then a fresh subset per mount.
        const source = (freshPack?.items?.length
            ? freshPack.items
            : shuffle(MEMORY_EMOJI_POOLS)[0]);
        return shuffle(source).slice(0, ROUND_SIZE);
    }, [content, freshPack]);
    const initial = useMemo(() => shuffle([...EMOJIS, ...EMOJIS]).map((e, i) => ({ id: i, emoji: e })), [EMOJIS]);
    const [revealed, setRevealed] = useState({}); // id -> true
    const [matched, setMatched] = useState({}); // id -> true
    const [pair, setPair] = useState([]); // [id, id]
    const [moves, setMoves] = useState(0);

    useEffect(() => {
        if (pair.length === 2) {
            const [a, b] = pair;
            const ca = initial.find((c) => c.id === a);
            const cb = initial.find((c) => c.id === b);
            if (ca.emoji === cb.emoji) {
                setTimeout(() => {
                    setMatched((m) => {
                        const next = { ...m, [a]: true, [b]: true };
                        if (Object.keys(next).length === initial.length) {
                            setTimeout(() => onComplete(Math.max(EMOJIS.length * 10 - moves, EMOJIS.length)), 400);
                        }
                        return next;
                    });
                    setPair([]);
                }, 300);
            } else {
                setTimeout(() => {
                    setRevealed((r) => {
                        const n = { ...r };
                        delete n[a];
                        delete n[b];
                        return n;
                    });
                    setPair([]);
                }, 800);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pair]);

    const flip = (id) => {
        if (matched[id] || revealed[id] || pair.length >= 2) return;
        setRevealed((r) => ({ ...r, [id]: true }));
        setPair((p) => {
            const next = [...p, id];
            if (next.length === 2) setMoves((m) => m + 1);
            return next;
        });
    };

    const matchedCount = Object.keys(matched).length / 2;
    return (
        <div data-testid="game-memory-cards">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-[#4A5568]">Flip two cards. Find all 6 pairs.</p>
                <div className="flex gap-2">
                    <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]" data-testid="memory-pairs">{matchedCount}/6 pairs</span>
                    <span className="mb-chip bg-[#FFD166]/30 text-[#876200]">Moves: {moves}</span>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
                {initial.map((c) => {
                    const shown = revealed[c.id] || matched[c.id];
                    return (
                        <button
                            key={c.id}
                            onClick={() => flip(c.id)}
                            className={`aspect-square rounded-2xl border-2 text-4xl flex items-center justify-center font-bold transition-all ${
                                matched[c.id]
                                    ? "bg-[#06D6A0]/15 border-[#06D6A0]"
                                    : shown
                                    ? "bg-white border-[#4361EE]"
                                    : "bg-[#4361EE] border-[#4361EE] text-white"
                            }`}
                            data-testid={`memory-card-${c.id}`}
                            disabled={!!matched[c.id]}
                        >
                            {shown ? c.emoji : "?"}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
