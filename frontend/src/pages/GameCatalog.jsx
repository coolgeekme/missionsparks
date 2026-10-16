import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { GAMES, findGameByPackType } from "../games";
import {
    Play, Plus, Sparkles, Lock, CheckCircle2, Clock, XCircle, Trash2,
    Pencil, ArrowLeft, Wand2, Users,
} from "lucide-react";

export default function GameCatalog() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isParent = user?.role === "parent";
    const [packs, setPacks] = useState([]);
    const [students, setStudents] = useState([]);
    const [studio, setStudio] = useState(null);
    const [tab, setTab] = useState("builtin"); // builtin | packs | pending
    const [err, setErr] = useState("");
    const [busyId, setBusyId] = useState("");

    const load = async () => {
        try {
            const calls = [api.get("/game-packs")];
            if (isParent) calls.push(api.get("/students"));
            else calls.push(api.get("/me/studio-status"));
            const [p, second] = await Promise.all(calls);
            setPacks(p.data || []);
            if (isParent) setStudents(second.data || []);
            else setStudio(second.data || null);
        } catch (e) {
            setErr(formatApiErrorDetail(e.response?.data?.detail || e.message));
        }
    };
    useEffect(() => { load(); }, [user?.id]);

    const studentMap = useMemo(
        () => Object.fromEntries((students || []).map((s) => [s.id, s.name])),
        [students],
    );

    const approvedPacks = packs.filter((p) => p.status === "approved");
    const pendingPacks = packs.filter((p) => p.status === "pending");
    const rejectedPacks = packs.filter((p) => p.status === "rejected");

    const approve = async (id) => {
        setBusyId(id);
        try {
            await api.put(`/game-packs/${id}/approve`, {});
            toast.success("Pack approved!");
            load();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message)); }
        finally { setBusyId(""); }
    };
    const reject = async (id) => {
        const reason = window.prompt("Add a short note for your kid (optional):") || "";
        setBusyId(id);
        try {
            await api.put(`/game-packs/${id}/reject`, { reason });
            toast.info("Pack sent back.");
            load();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message)); }
        finally { setBusyId(""); }
    };
    const del = async (id) => {
        if (!window.confirm("Delete this pack? This can't be undone.")) return;
        setBusyId(id);
        try {
            await api.delete(`/game-packs/${id}`);
            toast.success("Deleted.");
            load();
        } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail || e.message)); }
        finally { setBusyId(""); }
    };

    const playPack = (p) => {
        const g = findGameByPackType(p.game_type);
        if (!g) return;
        navigate(`/play/free/${g.key}?packId=${p.id}`);
    };

    const previewBuiltIn = (g) => navigate(`/play/preview/${g.key}`);

    return (
        <div className="min-h-screen" data-testid="game-catalog-page">
            <Navbar />
            <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
                <Link to={isParent ? "/parent" : "/student"} className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="catalog-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <header className="mb-card p-6 sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Family games</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#201D18] mt-1">Mini-game library 🎮</h1>
                    <p className="text-[#6E675B] font-semibold mt-2 max-w-2xl">
                        {isParent
                            ? "Browse every mini-game, build custom packs your kids can play after missions, and approve creations from your kid's Studio."
                            : "Play any built-in mini-game, or jump into a pack your parent or sibling made. Earn a spark streak to unlock your own Studio."}
                    </p>
                    {isParent ? (
                        <div className="flex flex-wrap gap-3 mt-5">
                            <Link to="/parent/games/new" className="btn-pop-primary inline-flex items-center gap-2" data-testid="catalog-new-pack">
                                <Plus size={16} /> Build a pack
                            </Link>
                            {pendingPacks.length > 0 && (
                                <button
                                    onClick={() => setTab("pending")}
                                    className="btn-pop-secondary inline-flex items-center gap-2"
                                    data-testid="catalog-pending-cta"
                                >
                                    <Clock size={16} /> {pendingPacks.length} pending kid pack{pendingPacks.length === 1 ? "" : "s"}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            {studio && (
                                <div
                                    className={`mb-chip ${studio.unlocked ? "bg-[#3F8C5E]/15 text-[#2F6B47]" : "bg-[#E8E0D2] text-[#6E675B]"}`}
                                    data-testid="catalog-studio-chip"
                                >
                                    {studio.unlocked
                                        ? <><Sparkles size={14} /> Studio unlocked</>
                                        : <><Lock size={14} /> Studio unlocks at {studio.unlock_threshold}-day spark streak ({studio.current_streak}/{studio.unlock_threshold})</>}
                                </div>
                            )}
                            <Link to="/student/studio" className="btn-pop-primary inline-flex items-center gap-2" data-testid="catalog-studio-link">
                                <Wand2 size={16} /> Go to Kid Studio
                            </Link>
                        </div>
                    )}
                </header>

                {err && <p className="text-sm font-bold text-[#BC4B32]" data-testid="catalog-error">{err}</p>}

                <div className="flex gap-2 flex-wrap" data-testid="catalog-tabs">
                    <TabBtn active={tab === "builtin"} onClick={() => setTab("builtin")} testid="tab-builtin">Built-in games ({GAMES.length})</TabBtn>
                    <TabBtn active={tab === "packs"} onClick={() => setTab("packs")} testid="tab-packs">Custom packs ({approvedPacks.length})</TabBtn>
                    {isParent && <TabBtn active={tab === "pending"} onClick={() => setTab("pending")} testid="tab-pending">Pending ({pendingPacks.length})</TabBtn>}
                </div>

                {tab === "builtin" && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="builtin-grid">
                        {GAMES.map((g) => (
                            <div key={g.key} className="mb-card p-5" data-testid={`builtin-card-${g.key}`}>
                                <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${g.color}1a` }}>
                                    {g.emoji}
                                </div>
                                <div className="flex items-center gap-2 mt-3">
                                    <h3 className="font-display font-bold text-xl text-[#201D18]">{g.name}</h3>
                                    {g.customizable && (
                                        <span className="mb-chip text-xs py-0.5 px-2 bg-[#E8A33D]/30 text-[#8A6413]">
                                            <Wand2 size={10} /> Custom
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-[#6E675B] mt-1">{g.blurb}</p>
                                <span className="mb-chip mt-3 text-xs py-0.5 px-2" style={{ background: `${g.color}1a`, color: g.color }}>{g.tag}</span>
                                <div className="mt-4 flex gap-2">
                                    <button onClick={() => previewBuiltIn(g)} className="btn-pop-ghost text-sm py-2 flex-1 flex items-center justify-center gap-1" data-testid={`builtin-play-${g.key}`}>
                                        <Play size={14} /> {isParent ? "Preview" : "Play"}
                                    </button>
                                    {isParent && g.customizable && (
                                        <Link to={`/parent/games/new?type=${g.packType}`} className="btn-pop-secondary text-sm py-2 flex items-center justify-center gap-1" data-testid={`builtin-build-${g.key}`}>
                                            <Plus size={14} /> Pack
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === "packs" && (
                    <PackList
                        packs={approvedPacks}
                        emptyText={isParent ? "No custom packs yet. Tap 'Build a pack' to make one." : "No custom packs shared with you yet. Ask your grown-up to build one!"}
                        isParent={isParent}
                        studentMap={studentMap}
                        onPlay={playPack}
                        onEdit={isParent ? ((p) => navigate(`/parent/games/${p.id}/edit`)) : null}
                        onDelete={isParent ? del : null}
                        busyId={busyId}
                    />
                )}

                {tab === "pending" && isParent && (
                    <>
                        <PackList
                            heading="Waiting for your approval"
                            packs={pendingPacks}
                            emptyText="No pending packs from your kid right now."
                            isParent
                            studentMap={studentMap}
                            onApprove={approve}
                            onReject={reject}
                            onDelete={del}
                            busyId={busyId}
                        />
                        {rejectedPacks.length > 0 && (
                            <PackList
                                heading="Sent back"
                                packs={rejectedPacks}
                                emptyText=""
                                isParent
                                studentMap={studentMap}
                                onDelete={del}
                                busyId={busyId}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

function TabBtn({ active, onClick, children, testid }) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className={`px-4 py-2 rounded-2xl font-bold text-sm border-2 transition-all ${active ? "bg-[#E4572E] border-[#E4572E] text-white" : "bg-white border-[#E8E0D2] text-[#6E675B] hover:border-[#E4572E]"}`}
        >{children}</button>
    );
}

function StatusChip({ status }) {
    if (status === "approved") return <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]"><CheckCircle2 size={12} /> Approved</span>;
    if (status === "pending") return <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]"><Clock size={12} /> Pending</span>;
    if (status === "rejected") return <span className="mb-chip bg-[#BC4B32]/15 text-[#BC4B32]"><XCircle size={12} /> Sent back</span>;
    return null;
}

function PackList({ heading, packs, emptyText, isParent, studentMap, onPlay, onApprove, onReject, onEdit, onDelete, busyId }) {
    if (!packs?.length && !emptyText) return null;
    return (
        <section className="space-y-3" data-testid={heading ? `pack-section-${heading.replace(/\s+/g, "-").toLowerCase()}` : "pack-section"}>
            {heading && <h2 className="font-display font-extrabold text-xl text-[#201D18]">{heading}</h2>}
            {!packs.length ? (
                <p className="text-sm font-bold text-[#9A9286]" data-testid="pack-empty">{emptyText}</p>
            ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {packs.map((p) => {
                        const g = findGameByPackType(p.game_type);
                        return (
                            <div key={p.id} className="mb-card p-5" data-testid={`pack-card-${p.id}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${g?.color || "#E4572E"}1a` }}>
                                        {g?.emoji || "🎮"}
                                    </div>
                                    <StatusChip status={p.status} />
                                </div>
                                <h3 className="font-display font-bold text-lg text-[#201D18] mt-3 leading-snug" data-testid={`pack-name-${p.id}`}>{p.name}</h3>
                                <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286] mt-1">{g?.name || p.game_type}</p>
                                <p className="text-xs font-semibold text-[#6E675B] mt-2">
                                    By <span className="text-[#201D18]">{p.creator_name || (p.created_by_role === "parent" ? "Parent" : "Kid")}</span>
                                </p>
                                {p.share_with_student_ids?.length > 0 && (
                                    <p className="text-xs font-semibold text-[#6E675B] mt-1 inline-flex items-center gap-1">
                                        <Users size={11} /> {p.share_with_student_ids.map((id) => studentMap[id] || "?").join(", ")}
                                    </p>
                                )}
                                {p.rejection_reason && (
                                    <p className="text-xs font-semibold text-[#BC4B32] mt-2 italic">"{p.rejection_reason}"</p>
                                )}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {onPlay && (
                                        <button onClick={() => onPlay(p)} className="btn-pop-primary text-sm py-2 flex-1 flex items-center justify-center gap-1" data-testid={`pack-play-${p.id}`}>
                                            <Play size={14} /> Play
                                        </button>
                                    )}
                                    {onApprove && (
                                        <button onClick={() => onApprove(p.id)} disabled={busyId === p.id} className="btn-pop-primary text-sm py-2 flex-1 flex items-center justify-center gap-1 disabled:opacity-50" data-testid={`pack-approve-${p.id}`}>
                                            <CheckCircle2 size={14} /> Approve
                                        </button>
                                    )}
                                    {onReject && (
                                        <button onClick={() => onReject(p.id)} disabled={busyId === p.id} className="btn-pop-ghost text-sm py-2 flex items-center justify-center gap-1 disabled:opacity-50" data-testid={`pack-reject-${p.id}`}>
                                            <XCircle size={14} /> Send back
                                        </button>
                                    )}
                                    {onEdit && (
                                        <button onClick={() => onEdit(p)} className="btn-pop-ghost text-sm py-2 flex items-center justify-center gap-1" data-testid={`pack-edit-${p.id}`}>
                                            <Pencil size={14} /> Edit
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button onClick={() => onDelete(p.id)} disabled={busyId === p.id} className="btn-pop-ghost text-sm py-2 flex items-center justify-center text-[#BC4B32] disabled:opacity-50" data-testid={`pack-delete-${p.id}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
