import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Mic, Send, Square, Loader2, Sparkles } from "lucide-react";

/**
 * Kid-facing reading practice. Renders a passage, then 4 comprehension questions
 * with text + voice input. On submit, shows playful, kind feedback from the AI.
 */
export default function ReadingPractice() {
    const { passageId } = useParams();
    const navigate = useNavigate();
    const [passage, setPassage] = useState(null);
    const [answers, setAnswers] = useState({});
    const [feedback, setFeedback] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [activeVoiceQ, setActiveVoiceQ] = useState(null);
    const [transcribing, setTranscribing] = useState(false);
    const recorderRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/reading/passage/${passageId}`);
                setPassage(data);
                if (data.feedback) {
                    setFeedback(data.feedback);
                    setAnswers(data.answers || {});
                }
            } catch (err) {
                toast.error(formatApiErrorDetail(err));
                navigate("/");
            }
        })();
    }, [passageId, navigate]);

    const setAnswer = (qid, text) => setAnswers((a) => ({ ...a, [qid]: text }));

    const startVoice = async (qid) => {
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
                    form.append("audio", blob, "answer.webm");
                    const { data } = await api.post("/audio/transcribe", form, {
                        headers: { "Content-Type": "multipart/form-data" },
                    });
                    setAnswer(qid, ((answers[qid] || "") + " " + (data.transcript || "")).trim());
                } catch (err) {
                    toast.error(formatApiErrorDetail(err));
                } finally {
                    setTranscribing(false);
                    setActiveVoiceQ(null);
                }
            };
            recorderRef.current = mr;
            mr.start();
            setActiveVoiceQ(qid);
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
        setSubmitting(true);
        try {
            const { data } = await api.post(`/reading/passage/${passageId}/answer`, { answers });
            setFeedback(data);
        } catch (err) {
            toast.error(formatApiErrorDetail(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (!passage) {
        return <div className="min-h-screen"><Navbar /><div className="p-10 text-center font-bold text-[#6E675B]">Loading…</div></div>;
    }

    return (
        <div className="min-h-screen" data-testid="reading-practice-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="reading-back">
                    <ArrowLeft size={16} /> Back
                </Link>

                <header className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-2xl bg-[#E4572E] flex items-center justify-center text-white"><BookOpen size={18} /></div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">Reading practice · {passage.grade_target}</p>
                    </div>
                    <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#201D18]">{passage.title}</h1>
                </header>

                <article className="mb-card p-6 space-y-2" data-testid="reading-passage-body">
                    <p className="text-base text-[#201D18] font-semibold leading-relaxed whitespace-pre-line">{passage.body}</p>
                    <p className="text-xs text-[#9A9286] font-bold mt-2">{passage.word_count} words</p>
                </article>

                <section className="space-y-4" data-testid="reading-questions">
                    <h2 className="font-display font-extrabold text-xl text-[#201D18]">Questions</h2>
                    {passage.questions.map((q, i) => {
                        const fb = feedback && feedback.per_question.find((f) => f.question_id === q.id);
                        return (
                            <div key={q.id} className="mb-card p-5 space-y-2" data-testid={`reading-q-${i}`}>
                                <div className="flex items-start gap-2">
                                    <span className="mb-chip text-[10px] bg-[#E8A33D]/30 text-[#8A6413]">{q.type}</span>
                                    <p className="font-bold text-[#201D18]">{i + 1}. {q.text}</p>
                                </div>
                                {!feedback ? (
                                    <>
                                        <textarea
                                            className="mb-input min-h-[60px]"
                                            placeholder="Type your answer…"
                                            value={answers[q.id] || ""}
                                            onChange={(e) => setAnswer(q.id, e.target.value)}
                                            data-testid={`reading-q-input-${i}`}
                                        />
                                        <div className="flex items-center gap-2">
                                            {activeVoiceQ === q.id ? (
                                                <button onClick={stopVoice} className="btn-pop-ghost text-xs flex items-center gap-1" data-testid={`reading-q-mic-stop-${i}`}>
                                                    <Square size={12} /> Stop recording
                                                </button>
                                            ) : (
                                                <button onClick={() => startVoice(q.id)} disabled={transcribing || !!activeVoiceQ} className="btn-pop-ghost text-xs flex items-center gap-1" data-testid={`reading-q-mic-${i}`}>
                                                    <Mic size={12} /> {transcribing ? "Transcribing…" : "Speak your answer"}
                                                </button>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-sm text-[#201D18] font-semibold italic">{answers[q.id] || "(no answer)"}</p>
                                        <div className={`rounded-2xl p-3 ${fb?.correct ? "bg-[#3F8C5E]/15 text-[#2F6B47]" : "bg-[#E8A33D]/30 text-[#8A6413]"}`} data-testid={`reading-q-feedback-${i}`}>
                                            <p className="text-sm font-bold">{fb?.correct ? "✓ Got it!" : "Almost — try this lens"} </p>
                                            <p className="text-sm">{fb?.feedback}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>

                {!feedback ? (
                    <button onClick={submit} disabled={submitting} className="btn-pop-primary w-full text-base flex items-center justify-center gap-2" data-testid="reading-submit">
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Submit answers
                    </button>
                ) : (
                    <div className="mb-card p-6 bg-gradient-to-br from-[#E4572E] to-[#C4471F] text-white" data-testid="reading-overall">
                        <Sparkles size={20} className="mb-2 text-[#E8A33D]" />
                        <p className="font-display font-extrabold text-2xl mb-1">Score: {feedback.score}/{feedback.total}</p>
                        <p className="font-semibold">{feedback.overall}</p>
                    </div>
                )}
            </main>
        </div>
    );
}
