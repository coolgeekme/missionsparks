import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useResearch } from "../contexts/ResearchContext";
import { ArrowLeft, BookOpen, ExternalLink, Search, Filter } from "lucide-react";

const SOURCE_TYPE_LABEL = {
    peer_reviewed: "Peer-reviewed",
    org: "Authoritative org",
    guideline: "Guideline",
    book: "Book",
};

const SOURCE_TYPE_TONE = {
    peer_reviewed: "bg-[#E4572E]/10 text-[#E4572E]",
    org: "bg-[#3F8C5E]/15 text-[#2F6B47]",
    guideline: "bg-[#E8A33D]/30 text-[#8A6413]",
    book: "bg-[#BC4B32]/10 text-[#BC4B32]",
};

/**
 * Parent-facing library of every citation backing the app.
 * Searchable + filterable by source type and tag.
 */
export default function Research() {
    const { citations, ready } = useResearch();
    const [q, setQ] = useState("");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [tagFilter, setTagFilter] = useState("all");

    const allTags = useMemo(() => {
        const s = new Set();
        citations.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
        return Array.from(s).sort();
    }, [citations]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return citations.filter((c) => {
            if (sourceFilter !== "all" && c.source_type !== sourceFilter) return false;
            if (tagFilter !== "all" && !(c.tags || []).includes(tagFilter)) return false;
            if (!needle) return true;
            const hay = `${c.title} ${c.authors} ${c.summary} ${c.source} ${(c.tags || []).join(" ")}`.toLowerCase();
            return hay.includes(needle);
        });
    }, [citations, q, sourceFilter, tagFilter]);

    const counts = useMemo(() => {
        const c = { peer_reviewed: 0, org: 0, guideline: 0, book: 0 };
        citations.forEach((x) => {
            if (c[x.source_type] !== undefined) c[x.source_type] += 1;
        });
        return c;
    }, [citations]);

    return (
        <div className="min-h-screen" data-testid="research-page">
            <Navbar />
            <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="research-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>

                <header className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-2xl bg-[#E8A33D] flex items-center justify-center text-[#8A6413] shadow-[0_4px_0_0_#C98A2E]">
                            <BookOpen size={20} />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Evidence library</p>
                    </div>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#201D18]">Why this app works</h1>
                    <p className="text-[#6E675B] font-semibold max-w-2xl">
                        Every skill, strategy, mini-game, and behavior tag in MissionSparks is grounded in
                        peer-reviewed research or authoritative health-organization guidance. Browse the full
                        library below — share with your child's therapist or teacher.
                    </p>
                </header>

                <section className="mb-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="research-stats">
                    <Stat label="Peer-reviewed" value={counts.peer_reviewed} tone="bg-[#E4572E]/10 text-[#E4572E]" />
                    <Stat label="Authoritative orgs" value={counts.org} tone="bg-[#3F8C5E]/15 text-[#2F6B47]" />
                    <Stat label="Guidelines" value={counts.guideline} tone="bg-[#E8A33D]/30 text-[#8A6413]" />
                    <Stat label="Total citations" value={citations.length} tone="bg-[#201D18] text-white" />
                </section>

                <section className="mb-card p-4 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9286]" />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search title, author, keyword…"
                            className="mb-input pl-9"
                            data-testid="research-search"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <Filter size={14} className="text-[#6E675B]" />
                        <span className="text-[#6E675B] mr-1">Source:</span>
                        {["all", "peer_reviewed", "org", "guideline"].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setSourceFilter(t)}
                                className={`mb-chip border-2 ${sourceFilter === t ? "bg-[#201D18] text-white border-[#201D18]" : "bg-white text-[#6E675B] border-[#E8E0D2]"}`}
                                data-testid={`research-source-${t}`}
                            >
                                {t === "all" ? "All" : SOURCE_TYPE_LABEL[t]}
                            </button>
                        ))}
                    </div>
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                            <span className="text-[#6E675B] mr-1">Topic:</span>
                            <button
                                onClick={() => setTagFilter("all")}
                                className={`mb-chip border-2 ${tagFilter === "all" ? "bg-[#201D18] text-white border-[#201D18]" : "bg-white text-[#6E675B] border-[#E8E0D2]"}`}
                                data-testid="research-tag-all"
                            >
                                All
                            </button>
                            {allTags.map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTagFilter(t)}
                                    className={`mb-chip border-2 ${tagFilter === t ? "bg-[#E4572E] text-white border-[#E4572E]" : "bg-white text-[#E4572E] border-[#E8E0D2]"}`}
                                    data-testid={`research-tag-${t}`}
                                >
                                    {t.replaceAll("_", " ")}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-3" data-testid="research-list">
                    {!ready && <p className="text-center text-[#6E675B] font-semibold py-8">Loading library…</p>}
                    {ready && filtered.length === 0 && (
                        <p className="text-center text-[#6E675B] font-semibold py-8" data-testid="research-empty">
                            No citations match your filters.
                        </p>
                    )}
                    {filtered.map((c) => (
                        <article
                            key={c.id}
                            className="mb-card mb-card-hover p-5 space-y-2"
                            data-testid={`research-item-${c.key}`}
                        >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <h3 className="font-display font-bold text-lg text-[#201D18] leading-snug">{c.title}</h3>
                                <span className={`mb-chip text-[10px] py-0.5 px-2 ${SOURCE_TYPE_TONE[c.source_type] || ""}`}>
                                    {SOURCE_TYPE_LABEL[c.source_type] || c.source_type}
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-[#6E675B]">
                                {c.authors} · {c.year} · <span className="italic">{c.source}</span>
                            </p>
                            <p className="text-sm text-[#201D18]">{c.summary}</p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {(c.tags || []).map((t) => (
                                    <span key={t} className="mb-chip text-[10px] py-0.5 px-2 bg-[#FBF6EE] text-[#E4572E]">
                                        {t.replaceAll("_", " ")}
                                    </span>
                                ))}
                                {c.url && (
                                    <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#E4572E] hover:underline"
                                        data-testid={`research-link-${c.key}`}
                                    >
                                        Read source <ExternalLink size={12} />
                                    </a>
                                )}
                            </div>
                        </article>
                    ))}
                </section>

                <footer className="text-xs text-[#6E675B] font-semibold pt-6 border-t-2 border-[#E8E0D2]">
                    <p>
                        <strong>How to read this library:</strong> Peer-reviewed papers (PubMed-indexed) form the
                        clinical backbone. Authoritative-org sources (CDC, NIMH, AAP, CHADD) reflect the current
                        consensus most therapists and pediatricians defer to. We update this library as the
                        evidence base evolves.
                    </p>
                    <p className="mt-2">
                        <em>MissionSparks is a consumer wellness product, not a medical device. Use this library
                        to talk with your child's clinician — not as a substitute for one.</em>
                    </p>
                </footer>
            </main>
        </div>
    );
}

function Stat({ label, value, tone }) {
    return (
        <div className={`rounded-2xl p-3 ${tone}`}>
            <p className="text-2xl font-display font-extrabold">{value}</p>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</p>
        </div>
    );
}
