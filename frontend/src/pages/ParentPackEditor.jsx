import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, Save, Play, Users } from "lucide-react";
import { GAMES, findGameByPackType } from "../games";

const PACK_TYPES = [
    { value: "word_match", label: "Word Match", emoji: "🔤", help: "Match a word to its meaning. Great for vocabulary." },
    { value: "memory_cards", label: "Memory Cards", emoji: "🧠", help: "Pair up matching icons. Boosts working memory." },
    { value: "sentence_builder", label: "Sentence Builder", emoji: "📝", help: "Arrange shuffled words into a sentence." },
];

const EMPTY = {
    word_match: { pairs: [{ word: "", meaning: "" }, { word: "", meaning: "" }, { word: "", meaning: "" }, { word: "", meaning: "" }] },
    memory_cards: { items: ["", "", "", ""] },
    sentence_builder: { sentences: [""] },
};

export default function ParentPackEditor({ mode = "create" }) {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const editing = mode === "edit";

    const [students, setStudents] = useState([]);
    const [name, setName] = useState("");
    const [gameType, setGameType] = useState(search.get("type") || "word_match");
    const [content, setContent] = useState(EMPTY[search.get("type") || "word_match"]);
    const [shareWith, setShareWith] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(editing);

    useEffect(() => {
        (async () => {
            try {
                const sres = await api.get("/students");
                setStudents(sres.data || []);
                if (editing && id) {
                    const { data } = await api.get(`/game-packs/${id}`);
                    setName(data.name);
                    setGameType(data.game_type);
                    setContent(data.content || EMPTY[data.game_type]);
                    setShareWith(data.share_with_student_ids || []);
                }
            } catch (e) {
                toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message));
            } finally { setLoading(false); }
        })();
    }, [id, editing]);

    // Reset content when changing type during creation
    const changeType = (t) => {
        setGameType(t);
        if (!editing) setContent(EMPTY[t]);
    };

    const updateContent = (next) => setContent(next);

    const toggleShare = (sid) => setShareWith((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);

    const submit = async () => {
        setSaving(true);
        try {
            const payload = {
                name: name.trim() || PACK_TYPES.find((t) => t.value === gameType)?.label,
                game_type: gameType,
                content,
                share_with_student_ids: shareWith,
            };
            if (editing) await api.put(`/game-packs/${id}`, payload);
            else await api.post("/game-packs", payload);
            toast.success(editing ? "Pack updated!" : "Pack saved & ready to play.");
            navigate("/games");
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message));
        } finally { setSaving(false); }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#4361EE] font-bold">Loading…</div>;

    return (
        <div className="min-h-screen" data-testid="parent-pack-editor">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/games" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="editor-back">
                    <ArrowLeft size={16} /> Back to games
                </Link>
                <header>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">{editing ? "Edit pack" : "Build a pack"}</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-1">{editing ? name || "Edit pack" : "Make a new mini-game pack"}</h1>
                    <p className="text-[#4A5568] font-semibold mt-2">Custom packs replace the default content for the chosen mini-game.</p>
                </header>

                <section className="mb-card p-6 space-y-4">
                    <Field label="Pack name">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Volcano words, Family memory set, Robot sentences"
                            className="w-full rounded-2xl border-2 border-[#E2E8F0] px-4 py-3 font-bold focus:border-[#4361EE] outline-none"
                            data-testid="editor-name"
                            maxLength={80}
                        />
                    </Field>

                    {!editing && (
                        <Field label="Game type">
                            <div className="grid sm:grid-cols-3 gap-2" data-testid="editor-type-grid">
                                {PACK_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => changeType(t.value)}
                                        className={`text-left rounded-2xl border-2 p-3 transition-all ${gameType === t.value ? "border-[#4361EE] bg-[#4361EE]/5" : "border-[#E2E8F0] bg-white hover:border-[#4361EE]"}`}
                                        data-testid={`editor-type-${t.value}`}
                                    >
                                        <div className="text-2xl">{t.emoji}</div>
                                        <p className="font-bold text-sm text-[#0B132B] mt-1">{t.label}</p>
                                        <p className="text-xs text-[#4A5568] mt-1">{t.help}</p>
                                    </button>
                                ))}
                            </div>
                        </Field>
                    )}

                    {gameType === "word_match" && (
                        <WordMatchEditor content={content} setContent={updateContent} />
                    )}
                    {gameType === "memory_cards" && (
                        <MemoryEditor content={content} setContent={updateContent} />
                    )}
                    {gameType === "sentence_builder" && (
                        <SentenceEditor content={content} setContent={updateContent} />
                    )}

                    {students.length > 0 && (
                        <Field label={<><Users size={14} className="inline" /> Share with</>}>
                            <p className="text-xs font-semibold text-[#4A5568] mb-2">Pick which kids see this pack. Leave empty to share with every linked kid.</p>
                            <div className="flex flex-wrap gap-2" data-testid="editor-share-grid">
                                {students.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => toggleShare(s.id)}
                                        className={`px-3 py-1.5 rounded-2xl text-sm font-bold border-2 transition-all ${shareWith.includes(s.id) ? "bg-[#4361EE] border-[#4361EE] text-white" : "bg-white border-[#E2E8F0] text-[#4A5568] hover:border-[#4361EE]"}`}
                                        data-testid={`editor-share-${s.id}`}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    )}
                </section>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="btn-pop-primary inline-flex items-center gap-2 disabled:opacity-50"
                        data-testid="editor-save"
                    >
                        <Save size={16} /> {saving ? "Saving…" : (editing ? "Save changes" : "Save pack")}
                    </button>
                    <Link to={`/play/preview/${findGameByPackType(gameType)?.key}`} className="btn-pop-ghost inline-flex items-center gap-2">
                        <Play size={16} /> Preview default
                    </Link>
                </div>
            </main>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mb-2 block">{label}</label>
            {children}
        </div>
    );
}

function WordMatchEditor({ content, setContent }) {
    const pairs = content.pairs || [];
    const update = (i, key, val) => {
        const next = pairs.map((p, idx) => idx === i ? { ...p, [key]: val } : p);
        setContent({ pairs: next });
    };
    const add = () => pairs.length < 12 && setContent({ pairs: [...pairs, { word: "", meaning: "" }] });
    const remove = (i) => pairs.length > 4 && setContent({ pairs: pairs.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Word pairs (${pairs.length}/12) · need at least 4`}>
            <div className="space-y-2" data-testid="word-pairs-editor">
                {pairs.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <input
                            type="text"
                            value={p.word}
                            onChange={(e) => update(i, "word", e.target.value)}
                            placeholder="Word"
                            className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold w-40 focus:border-[#4361EE] outline-none"
                            data-testid={`pair-word-${i}`}
                            maxLength={60}
                        />
                        <input
                            type="text"
                            value={p.meaning}
                            onChange={(e) => update(i, "meaning", e.target.value)}
                            placeholder="Meaning"
                            className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold flex-1 focus:border-[#4361EE] outline-none"
                            data-testid={`pair-meaning-${i}`}
                            maxLength={160}
                        />
                        <button onClick={() => remove(i)} disabled={pairs.length <= 4} className="text-[#EF476F] disabled:opacity-30 px-2" data-testid={`pair-remove-${i}`}><X size={16} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={pairs.length >= 12} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="pair-add">
                <Plus size={14} /> Add pair
            </button>
        </Field>
    );
}

function MemoryEditor({ content, setContent }) {
    const items = content.items || [];
    const update = (i, val) => setContent({ items: items.map((x, idx) => idx === i ? val : x) });
    const add = () => items.length < 8 && setContent({ items: [...items, ""] });
    const remove = (i) => items.length > 4 && setContent({ items: items.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Unique items (${items.length}/8) · need at least 4`}>
            <p className="text-xs text-[#4A5568] mb-2">Use a single emoji or short symbol (max 8 chars). Each item will appear twice as a pair.</p>
            <div className="flex flex-wrap gap-2" data-testid="memory-items-editor">
                {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input
                            type="text"
                            value={it}
                            onChange={(e) => update(i, e.target.value)}
                            placeholder="🚀"
                            className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold w-24 text-center text-2xl focus:border-[#4361EE] outline-none"
                            data-testid={`memory-item-${i}`}
                            maxLength={8}
                        />
                        <button onClick={() => remove(i)} disabled={items.length <= 4} className="text-[#EF476F] disabled:opacity-30 px-1" data-testid={`memory-remove-${i}`}><X size={14} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={items.length >= 8} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="memory-add">
                <Plus size={14} /> Add item
            </button>
        </Field>
    );
}

function SentenceEditor({ content, setContent }) {
    const sentences = content.sentences || [];
    const update = (i, val) => setContent({ sentences: sentences.map((x, idx) => idx === i ? val : x) });
    const add = () => sentences.length < 5 && setContent({ sentences: [...sentences, ""] });
    const remove = (i) => sentences.length > 1 && setContent({ sentences: sentences.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Sentences (${sentences.length}/5)`}>
            <p className="text-xs text-[#4A5568] mb-2">Each sentence needs 3–12 words. Words will be shuffled and the kid puts them in order.</p>
            <div className="space-y-2" data-testid="sentence-editor">
                {sentences.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                        <input
                            type="text"
                            value={s}
                            onChange={(e) => update(i, e.target.value)}
                            placeholder="e.g. The brave dog barked at the moon"
                            className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold flex-1 focus:border-[#4361EE] outline-none"
                            data-testid={`sentence-input-${i}`}
                        />
                        <button onClick={() => remove(i)} disabled={sentences.length <= 1} className="text-[#EF476F] disabled:opacity-30 px-2 py-2" data-testid={`sentence-remove-${i}`}><X size={16} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={sentences.length >= 5} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="sentence-add">
                <Plus size={14} /> Add sentence
            </button>
        </Field>
    );
}
