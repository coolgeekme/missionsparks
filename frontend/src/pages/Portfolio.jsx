import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, PenLine, ExternalLink, Award } from "lucide-react";

/**
 * Parent-facing portfolio view of all reading practice + writing pieces
 * generated for a student. Sharable with a therapist / teacher.
 */
export default function Portfolio() {
    const { studentId } = useParams();
    const [data, setData] = useState({ reading: [], writing: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get(`/students/${studentId}/portfolio`);
                setData(res.data);
            } catch (err) {
                toast.error(formatApiErrorDetail(err));
            } finally {
                setLoading(false);
            }
        })();
    }, [studentId]);

    const completed = {
        reading: data.reading.filter((p) => p.score !== undefined).length,
        writing: data.writing.filter((p) => p.submitted_at).length,
    };

    return (
        <div className="min-h-screen" data-testid="portfolio-page">
            <Navbar />
            <main className="max-w-4xl mx-auto p-6 sm:p-10 space-y-6">
                <Link to="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="portfolio-back">
                    <ArrowLeft size={16} /> Back to dashboard
                </Link>

                <header className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-2xl bg-[#E8A33D] flex items-center justify-center text-[#8A6413]"><Award size={18} /></div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Practice portfolio</p>
                    </div>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#201D18]">Reading & Writing Library</h1>
                    <p className="text-[#6E675B] font-semibold max-w-2xl">
                        Every passage and writing piece generated for your child, ready to share with their therapist or teacher.
                    </p>
                </header>

                <section className="mb-card p-5 grid grid-cols-2 gap-4">
                    <Stat label="Reading passages" total={data.reading.length} completed={completed.reading} tone="bg-[#E4572E]/10 text-[#E4572E]" testId="stat-reading" />
                    <Stat label="Writing pieces" total={data.writing.length} completed={completed.writing} tone="bg-[#3F8C5E]/15 text-[#2F6B47]" testId="stat-writing" />
                </section>

                <section className="space-y-3" data-testid="portfolio-reading">
                    <h2 className="font-display font-extrabold text-2xl text-[#201D18] flex items-center gap-2">
                        <BookOpen size={20} className="text-[#E4572E]" /> Reading passages
                    </h2>
                    {loading && <p className="text-center text-[#6E675B] font-bold py-6">Loading…</p>}
                    {!loading && data.reading.length === 0 && <p className="text-center text-[#6E675B] font-semibold py-6" data-testid="portfolio-reading-empty">No reading passages yet. Generate one from the dashboard.</p>}
                    {data.reading.map((p) => (
                        <article key={p.id} className="mb-card mb-card-hover p-5" data-testid={`portfolio-reading-${p.id}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex-1">
                                    <h3 className="font-display font-bold text-lg text-[#201D18]">{p.title}</h3>
                                    <p className="text-xs font-bold text-[#6E675B]">{p.grade_target} · {p.word_count} words · {new Date(p.created_at).toLocaleDateString()}</p>
                                </div>
                                {p.score !== undefined ? (
                                    <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]">Score {p.score}/{p.total}</span>
                                ) : (
                                    <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]">Not yet started</span>
                                )}
                                <Link to={`/student/practice/reading/${p.id}`} className="btn-pop-ghost text-xs flex items-center gap-1">
                                    Open <ExternalLink size={12} />
                                </Link>
                            </div>
                        </article>
                    ))}
                </section>

                <section className="space-y-3" data-testid="portfolio-writing">
                    <h2 className="font-display font-extrabold text-2xl text-[#201D18] flex items-center gap-2">
                        <PenLine size={20} className="text-[#3F8C5E]" /> Writing pieces
                    </h2>
                    {!loading && data.writing.length === 0 && <p className="text-center text-[#6E675B] font-semibold py-6" data-testid="portfolio-writing-empty">No writing pieces yet.</p>}
                    {data.writing.map((p) => (
                        <article key={p.id} className="mb-card mb-card-hover p-5" data-testid={`portfolio-writing-${p.id}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex-1">
                                    <h3 className="font-display font-bold text-lg text-[#201D18]">{p.prompt}</h3>
                                    <p className="text-xs font-bold text-[#6E675B]">{new Date(p.created_at).toLocaleDateString()}</p>
                                </div>
                                {p.submitted_at ? (
                                    <span className="mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]">Submitted</span>
                                ) : (
                                    <span className="mb-chip bg-[#E8A33D]/30 text-[#8A6413]">Not yet started</span>
                                )}
                                <Link to={`/student/practice/writing/${p.id}`} className="btn-pop-ghost text-xs flex items-center gap-1">
                                    Open <ExternalLink size={12} />
                                </Link>
                            </div>
                            {p.feedback && <p className="text-sm text-[#6E675B] font-semibold italic mt-2 line-clamp-2">Coach: {p.feedback}</p>}
                        </article>
                    ))}
                </section>
            </main>
        </div>
    );
}

function Stat({ label, total, completed, tone, testId }) {
    return (
        <div className={`rounded-2xl p-4 ${tone}`} data-testid={testId}>
            <p className="font-display font-extrabold text-3xl">{total}</p>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">{label} · {completed} completed</p>
        </div>
    );
}
