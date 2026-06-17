import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, PenLine, Mic, Send, Square, Loader2, Sparkles, ListChecks } from "lucide-react";

/**
 * Kid-facing guided writing. Renders the AI-generated prompt, paragraph scaffold,
 * and sentence starters. Kid writes by typing OR voice (Whisper). On submit, AI
 * returns warm, specific feedback (no grading, no spelling correction).
 */
export default function WritingPractice() {
    const { pieceId } = useParams();
    const navigate = useNavigate();
    const [piece, setPiece] = useState(null);
    const [draft, setDraft] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const recorderRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/writing/piece/${pieceId}`);
                setPiece(data);
                setDraft(data.draft || "");
            } catch (err) {
                toast.error(formatApiErrorDetail(err));
                navigate("/");
            }
        })();
    }, [pieceId, navigate]);

    const startVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            const chunks = [];
            mr.ondataavailable = (e) => chunks.push(e.data);
            mr.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunks, { type: "audio/webm" });
                setTranscribing(true);
                try {
                    const form = new FormData();
                    form.append("audio", blob, "writing.webm");
                    const { data } = await api.post("/audio/transcribe", form, {
                        headers: { "Content-Type": "multipart/form-data" },
                    });
                    setDraft((d) => (d ? d.trimEnd() + " " : "") + (data.transcript || ""));
                } catch (err) {
                    toast.error(formatApiErrorDetail(err));
                } finally {
                    setTranscribing(false);
                    setRecording(false);
                }
            };
            recorderRef.current = mr;
            mr.start();
            setRecording(true);
        } catch (err) {
            toast.error("Couldn't access your mic. Check permissions and try again.");
        }
    };

    const stopVoice = () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
            recorderRef.current.stop();
        }
    };

    const submit = async () => {
        if (!draft.trim()) return;
        setSubmitting(true);
        try {
            const { data } = await api.post(`/writing/piece/${pieceId}/submit`, { draft });
            setPiece(data);
        } catch (err) {
            toast.error(formatApiErrorDetail(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (!piece) {
        return <div className="min-h-screen"><Navbar /><div className="p-10 text-center font-bold text-[#4A5568]">Loading…</div></div>;
    }

    const submitted = !!piece.submitted_at;

    return (
        <div className="min-h-screen" data-testid="writing-practice-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE]" data-testid="writing-back">
                    <ArrowLeft size={16} /> Back
                </Link>

                <header className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-2xl bg-[#06D6A0] flex items-center justify-center text-white"><PenLine size={18} /></div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#A0AEC0]">Guided writing</p>
                    </div>
                    <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#0B132B]" data-testid="writing-prompt">{piece.prompt}</h1>
                </header>

                <section className="mb-card p-5 space-y-2" data-testid="writing-scaffold">
                    <h2 className="font-display font-bold text-base text-[#0B132B] flex items-center gap-2"><ListChecks size={16} className="text-[#4361EE]" /> Plan it out</h2>
                    <ol className="space-y-1.5 list-decimal pl-5">
                        {piece.scaffold.map((s, i) => <li key={i} className="text-sm font-semibold text-[#0B132B]">{s}</li>)}
                    </ol>
                </section>

                {piece.sentence_starters?.length > 0 && (
                    <section className="mb-card p-5 space-y-2" data-testid="writing-starters">
                        <h2 className="font-display font-bold text-base text-[#0B132B]">Sentence starters · tap to drop one in</h2>
                        <div className="flex flex-wrap gap-2">
                            {piece.sentence_starters.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setDraft((d) => (d ? d.trimEnd() + " " : "") + s + " ")}
                                    disabled={submitted}
                                    className="mb-chip border-2 border-dashed border-[#06D6A0]/40 text-[#057a5b] hover:bg-[#06D6A0]/10 text-sm"
                                    data-testid={`writing-starter-${i}`}
                                >
                                    + {s}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                <section className="mb-card p-5 space-y-3" data-testid="writing-editor">
                    <h2 className="font-display font-bold text-base text-[#0B132B]">Your turn</h2>
                    <textarea
                        className="mb-input min-h-[180px] text-base leading-relaxed"
                        placeholder="Start writing here…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={submitted}
                        data-testid="writing-textarea"
                    />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs font-bold text-[#A0AEC0]">{draft.trim().split(/\s+/).filter(Boolean).length} words</p>
                        {!submitted && (
                            recording ? (
                                <button onClick={stopVoice} className="btn-pop-ghost text-sm flex items-center gap-1.5" data-testid="writing-mic-stop">
                                    <Square size={14} /> Stop & transcribe
                                </button>
                            ) : (
                                <button onClick={startVoice} disabled={transcribing} className="btn-pop-ghost text-sm flex items-center gap-1.5" data-testid="writing-mic">
                                    <Mic size={14} /> {transcribing ? "Transcribing…" : "Speak it instead"}
                                </button>
                            )
                        )}
                    </div>
                </section>

                {!submitted ? (
                    <button onClick={submit} disabled={submitting || !draft.trim()} className="btn-pop-primary w-full text-base flex items-center justify-center gap-2" data-testid="writing-submit">
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Get feedback
                    </button>
                ) : (
                    <div className="mb-card p-6 bg-gradient-to-br from-[#06D6A0] to-[#057a5b] text-white" data-testid="writing-feedback">
                        <Sparkles size={20} className="mb-2 text-[#FFD166]" />
                        <p className="font-display font-extrabold text-lg mb-1">Coach feedback</p>
                        <p className="font-semibold whitespace-pre-line">{piece.feedback}</p>
                    </div>
                )}
            </main>
        </div>
    );
}
