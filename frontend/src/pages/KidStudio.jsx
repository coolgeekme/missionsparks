import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import {
    ArrowLeft, Lock, Sparkles, Plus, X, Send, Users, Trash2,
    Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { GAMES, findGameByPackType } from "../games";

const PACK_TYPES = [
    { value: "word_match", label: "Word Match", emoji: "🔤", help: "Pick words your sibling will love and what they mean." },
    { value: "memory_cards", label: "Memory Cards", emoji: "🧠", help: "Choose 4–8 emoji or symbols. They'll pair up!" },
    { value: "sentence_builder", label: "Sentence Builder", emoji: "📝", help: "Write fun sentences for them to rebuild." },
];
const EMPTY = {
    word_match: { pairs: [{ word: "", meaning: "" }, { word: "", meaning: "" }, { word: "", meaning: "" }, { word: "", meaning: "" }] },
    memory_cards: { items: ["", "", "", ""] },
    sentence_builder: { sentences: [""] },
};

export default function KidStudio() {
    const navigate = useNavigate();
    const [status, setStatus] = useState(null);
    const [packs, setPacks] = useState([]);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState("");
    const [gameType, setGameType] = useState("word_match");
    const [content, setContent] = useState(EMPTY.word_match);
    const [shareWith, setShareWith] = useState([]);
    const [showForm, setShowForm] = useState(false);

    const load = async () => {
        try {
            const [s, p] = await Promise.all([
                api.get("/me/studio-status"),
                api.get("/game-packs"),
            ]);
            setStatus(s.data);
            setPacks(p.data || []);
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message));
        }
    };
    useEffect(() => { load(); }, []);

    const myPacks = useMemo(() => packs.filter((p) => p.created_by_role === "student"), [packs]);

    const changeType = (t) => {
        setGameType(t);
        setContent(EMPTY[t]);
    };

    const toggleShare = (sid) => setShareWith((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);

    const submit = async () => {
        setBusy(true);
        try {
            await api.post("/game-packs/student-submit", {
                name: name.trim() || PACK_TYPES.find((t) => t.value === gameType)?.label,
                game_type: gameType,
                content,
                requested_share_with_student_ids: shareWith,
            });
            toast.success("Pack sent to your grown-up for a thumbs-up! 🎉");
            setShowForm(false);
            setName("");
            changeType("word_match");
            setShareWith([]);
            load();
        } catch (e) {
            toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    const del = async (id) => {
        if (!window.confirm("Delete this pack?")) return;
        try {
            await api.delete(`/game-packs/${id}`);
            toast.success("Deleted.");
            load();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message)); }
    };

    if (!status) return <div className="min-h-screen flex items-center justify-center text-[#4361EE] font-bold">Loading…</div>;

    return (
        <div className="min-h-screen" data-testid="kid-studio-page">
            <Navbar />
            <main className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/student" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="studio-back">
                    <ArrowLeft size={16} /> Back to missions
                </Link>

                <header className="mb-card p-6 sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Kid Studio</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#0B132B] mt-1">Make a game for your sibling 🎨</h1>
                    {!status.unlocked ? (
                        <div className="mt-4 rounded-2xl bg-[#E2E8F0]/60 p-4 flex items-start gap-3" data-testid="studio-locked">
                            <Lock className="text-[#4A5568] flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-[#0B132B]">Studio unlocks at a {status.unlock_threshold}-day spark streak ⚡</p>
                                <p className="text-sm font-semibold text-[#4A5568] mt-1">
                                    You're at <span className="text-[#0B132B]">{status.current_streak}</span> day{status.current_streak === 1 ? "" : "s"}.
                                    Keep finishing missions every day to light up your Studio!
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-2xl bg-[#06D6A0]/15 p-4 flex items-start gap-3" data-testid="studio-unlocked">
                            <Sparkles className="text-[#057a5b] flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold text-[#0B132B]">Studio unlocked! 🎉 You've got a {status.current_streak}-day streak.</p>
                                <p className="text-sm font-semibold text-[#4A5568] mt-1">
                                    Build a pack and send it to your grown-up. Once they approve, your siblings can play it!
                                </p>
                            </div>
                            {!showForm && (
                                <button onClick={() => setShowForm(true)} className="btn-pop-primary inline-flex items-center gap-2" data-testid="studio-start">
                                    <Plus size={16} /> New pack
                                </button>
                            )}
                        </div>
                    )}
                </header>

                {showForm && status.unlocked && (
                    <section className="mb-card p-6 space-y-4" data-testid="studio-form">
                        <Field label="Name your pack">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Dragon words!"
                                className="w-full rounded-2xl border-2 border-[#E2E8F0] px-4 py-3 font-bold focus:border-[#4361EE] outline-none"
                                data-testid="studio-name"
                                maxLength={80}
                            />
                        </Field>
                        <Field label="Pick a game type">
                            <div className="grid sm:grid-cols-3 gap-2">
                                {PACK_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => changeType(t.value)}
                                        className={`text-left rounded-2xl border-2 p-3 transition-all ${gameType === t.value ? "border-[#4361EE] bg-[#4361EE]/5" : "border-[#E2E8F0] bg-white hover:border-[#4361EE]"}`}
                                        data-testid={`studio-type-${t.value}`}
                                    >
                                        <div className="text-2xl">{t.emoji}</div>
                                        <p className="font-bold text-sm text-[#0B132B] mt-1">{t.label}</p>
                                        <p className="text-xs text-[#4A5568] mt-1">{t.help}</p>
                                    </button>
                                ))}
                            </div>
                        </Field>

                        {gameType === "word_match" && <WordMatchKid content={content} setContent={setContent} />}
                        {gameType === "memory_cards" && <MemoryKid content={content} setContent={setContent} />}
                        {gameType === "sentence_builder" && <SentenceKid content={content} setContent={setContent} />}

                        {status.siblings.length > 0 && (
                            <Field label={<><Users size={14} className="inline" /> Who should play it?</>}>
                                <p className="text-xs font-semibold text-[#4A5568] mb-2">Pick which sibling. Your grown-up can change this when they approve.</p>
                                <div className="flex flex-wrap gap-2">
                                    {status.siblings.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => toggleShare(s.id)}
                                            className={`px-3 py-1.5 rounded-2xl text-sm font-bold border-2 transition-all ${shareWith.includes(s.id) ? "bg-[#4361EE] border-[#4361EE] text-white" : "bg-white border-[#E2E8F0] text-[#4A5568] hover:border-[#4361EE]"}`}
                                            data-testid={`studio-sib-${s.id}`}
                                        >{s.name}</button>
                                    ))}
                                </div>
                            </Field>
                        )}

                        <div className="flex gap-2">
                            <button onClick={submit} disabled={busy} className="btn-pop-primary inline-flex items-center gap-2 disabled:opacity-50" data-testid="studio-submit">
                                <Send size={16} /> {busy ? "Sending…" : "Send to grown-up"}
                            </button>
                            <button onClick={() => setShowForm(false)} className="btn-pop-ghost">Cancel</button>
                        </div>
                    </section>
                )}

                <section className="space-y-3">
                    <h2 className="font-display font-extrabold text-xl text-[#0B132B]">Your packs</h2>
                    {myPacks.length === 0 ? (
                        <p className="text-sm font-bold text-[#A0AEC0]" data-testid="studio-no-packs">No packs yet. {status.unlocked ? "Tap 'New pack' to make your first one!" : "Unlock the Studio first."}</p>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="studio-packs-list">
                            {myPacks.map((p) => {
                                const g = findGameByPackType(p.game_type);
                                return (
                                    <div key={p.id} className="mb-card p-5" data-testid={`studio-pack-${p.id}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${g?.color || "#4361EE"}1a` }}>
                                                {g?.emoji || "🎮"}
                                            </div>
                                            <StatusChip status={p.status} />
                                        </div>
                                        <h3 className="font-display font-bold text-lg text-[#0B132B] mt-3 leading-snug">{p.name}</h3>
                                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0] mt-1">{g?.name || p.game_type}</p>
                                        {p.rejection_reason && (
                                            <p className="text-xs font-semibold text-[#EF476F] mt-2 italic">"{p.rejection_reason}"</p>
                                        )}
                                        <div className="mt-3 flex gap-2">
                                            {p.status === "approved" && (
                                                <button onClick={() => navigate(`/play/free/${g?.key}?packId=${p.id}`)} className="btn-pop-primary text-sm py-2 flex-1" data-testid={`studio-play-${p.id}`}>
                                                    Play it
                                                </button>
                                            )}
                                            {p.status !== "approved" && (
                                                <button onClick={() => del(p.id)} className="btn-pop-ghost text-sm py-2 text-[#EF476F] flex items-center gap-1" data-testid={`studio-delete-${p.id}`}>
                                                    <Trash2 size={14} /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
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

function StatusChip({ status }) {
    if (status === "approved") return <span className="mb-chip bg-[#06D6A0]/15 text-[#057a5b]"><CheckCircle2 size={12} /> Approved</span>;
    if (status === "pending") return <span className="mb-chip bg-[#FFD166]/30 text-[#876200]"><Clock size={12} /> Waiting</span>;
    if (status === "rejected") return <span className="mb-chip bg-[#EF476F]/15 text-[#EF476F]"><XCircle size={12} /> Sent back</span>;
    return null;
}

function WordMatchKid({ content, setContent }) {
    const pairs = content.pairs || [];
    const update = (i, key, val) => setContent({ pairs: pairs.map((p, idx) => idx === i ? { ...p, [key]: val } : p) });
    const add = () => pairs.length < 12 && setContent({ pairs: [...pairs, { word: "", meaning: "" }] });
    const remove = (i) => pairs.length > 4 && setContent({ pairs: pairs.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Word pairs (${pairs.length}/12)`}>
            <div className="space-y-2">
                {pairs.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <input type="text" value={p.word} onChange={(e) => update(i, "word", e.target.value)} placeholder="Word" className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold w-40 focus:border-[#4361EE] outline-none" data-testid={`kid-pair-word-${i}`} maxLength={60} />
                        <input type="text" value={p.meaning} onChange={(e) => update(i, "meaning", e.target.value)} placeholder="What it means" className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold flex-1 focus:border-[#4361EE] outline-none" data-testid={`kid-pair-meaning-${i}`} maxLength={160} />
                        <button onClick={() => remove(i)} disabled={pairs.length <= 4} className="text-[#EF476F] disabled:opacity-30 px-2"><X size={16} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={pairs.length >= 12} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="kid-pair-add">
                <Plus size={14} /> Add another
            </button>
        </Field>
    );
}

function MemoryKid({ content, setContent }) {
    const items = content.items || [];
    const update = (i, val) => setContent({ items: items.map((x, idx) => idx === i ? val : x) });
    const add = () => items.length < 8 && setContent({ items: [...items, ""] });
    const remove = (i) => items.length > 4 && setContent({ items: items.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Pick items (${items.length}/8) — each appears twice`}>
            <p className="text-xs text-[#4A5568] mb-2">Use a single emoji or short symbol.</p>
            <div className="flex flex-wrap gap-2">
                {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input type="text" value={it} onChange={(e) => update(i, e.target.value)} placeholder="🚀" className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold w-24 text-center text-2xl focus:border-[#4361EE] outline-none" data-testid={`kid-mem-${i}`} maxLength={8} />
                        <button onClick={() => remove(i)} disabled={items.length <= 4} className="text-[#EF476F] disabled:opacity-30 px-1"><X size={14} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={items.length >= 8} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="kid-mem-add">
                <Plus size={14} /> Add another
            </button>
        </Field>
    );
}

function SentenceKid({ content, setContent }) {
    const sentences = content.sentences || [];
    const update = (i, val) => setContent({ sentences: sentences.map((x, idx) => idx === i ? val : x) });
    const add = () => sentences.length < 5 && setContent({ sentences: [...sentences, ""] });
    const remove = (i) => sentences.length > 1 && setContent({ sentences: sentences.filter((_, idx) => idx !== i) });
    return (
        <Field label={`Sentences (${sentences.length}/5)`}>
            <p className="text-xs text-[#4A5568] mb-2">3–12 words each. Use real words.</p>
            <div className="space-y-2">
                {sentences.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                        <input type="text" value={s} onChange={(e) => update(i, e.target.value)} placeholder="The brave dog barked at the moon" className="rounded-xl border-2 border-[#E2E8F0] px-3 py-2 font-bold flex-1 focus:border-[#4361EE] outline-none" data-testid={`kid-sent-${i}`} />
                        <button onClick={() => remove(i)} disabled={sentences.length <= 1} className="text-[#EF476F] disabled:opacity-30 px-2 py-2"><X size={16} /></button>
                    </div>
                ))}
            </div>
            <button onClick={add} disabled={sentences.length >= 5} className="btn-pop-ghost inline-flex items-center gap-2 text-sm mt-2 disabled:opacity-50" data-testid="kid-sent-add">
                <Plus size={14} /> Add another
            </button>
        </Field>
    );
}
