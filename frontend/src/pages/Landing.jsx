import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import SparkMark from "../components/SparkMark";
import {
    Zap, Sparkles, ClipboardList, Activity, BookOpen, Shield,
    ArrowRight, Check, Clock, Mic, BarChart3, Lock,
} from "lucide-react";

const ANCHORS = {
    HERO: "hero",
    FEATURES: "features",
    RESEARCH: "research",
    HOW: "how-it-works",
    PRIVACY: "privacy",
    WAITLIST: "waitlist",
};

export default function Landing() {
    const [stats, setStats] = useState({ citations: 31, skills: 8, strategies: 9, waitlist: 0 });
    const [email, setEmail] = useState("");
    const [waitRole, setWaitRole] = useState("parent");
    const [waitSrc, setWaitSrc] = useState("landing_hero");
    const [waitState, setWaitState] = useState({ loading: false, ok: false, dup: false, error: "" });

    useEffect(() => {
        api.get("/public/stats")
            .then(({ data }) => setStats(data))
            .catch(() => {});
    }, []);

    const submitWaitlist = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setWaitState({ loading: true, ok: false, dup: false, error: "" });
        try {
            const { data } = await api.post("/public/waitlist", {
                email: email.trim(),
                role: waitRole,
                source: waitSrc,
            });
            setWaitState({ loading: false, ok: true, dup: !!data.already_on_waitlist, error: "" });
            setEmail("");
        } catch (err) {
            setWaitState({ loading: false, ok: false, dup: false, error: "Couldn't save your email. Try again?" });
        }
    };

    return (
        <div className="min-h-screen bg-[#FBF6EE]" data-testid="landing-page">
            <LandingNav />

            {/* ---------- HERO ---------- */}
            <section id={ANCHORS.HERO} className="max-w-6xl mx-auto px-6 pt-12 pb-20 grid md:grid-cols-12 gap-8 items-center" data-testid="landing-hero">
                <div className="md:col-span-7 space-y-6">
                    <span className="inline-flex items-center gap-2 mb-chip bg-[#E8A33D]/30 text-[#8A6413] border-2 border-[#C98A2E]/40" data-testid="landing-hero-eyebrow">
                        <Zap size={14} fill="currentColor" /> Built for ADHD families · Backed by {stats.citations}+ peer-reviewed citations
                    </span>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-[#201D18] leading-[1.05]">
                        Tiny daily wins.
                        <br />
                        <span className="relative inline-block">
                            <span className="relative z-10">Real research.</span>
                            <span className="absolute left-0 right-0 bottom-1 h-3 bg-[#E8A33D] -z-0 rounded-sm" aria-hidden />
                        </span>
                    </h1>
                    <p className="text-lg text-[#6E675B] font-semibold max-w-xl">
                        MissionSparks turns scattered afternoons into small, doable missions for kids with ADHD — and gives parents and therapists the data and evidence to back every choice the app makes.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            to="/register"
                            className="btn-pop-primary text-base flex items-center gap-2"
                            data-testid="landing-cta-register"
                            onClick={() => setWaitSrc("landing_hero")}
                        >
                            Get started free <ArrowRight size={18} />
                        </Link>
                        <a
                            href={`#${ANCHORS.HOW}`}
                            className="btn-pop-ghost text-base"
                            data-testid="landing-cta-howit"
                        >
                            See how it works
                        </a>
                    </div>
                    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-[#6E675B] pt-2">
                        <li className="inline-flex items-center gap-2"><Check size={16} className="text-[#3F8C5E]" /> Free during beta</li>
                        <li className="inline-flex items-center gap-2"><Check size={16} className="text-[#3F8C5E]" /> COPPA-style consent</li>
                        <li className="inline-flex items-center gap-2"><Check size={16} className="text-[#3F8C5E]" /> No ads, no resale</li>
                    </ul>
                </div>

                <div className="md:col-span-5 relative" aria-hidden>
                    <div className="absolute -top-6 -left-6 h-24 w-24 rounded-3xl bg-[#E8A33D] rotate-[-8deg] shadow-[0_6px_0_0_#C98A2E]" />
                    <div className="absolute -bottom-8 -right-4 h-28 w-28 rounded-3xl bg-[#3F8C5E]/30 rotate-[6deg]" />
                    <div className="relative mb-card p-6 bg-white space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-[#E4572E] flex items-center justify-center text-white shadow-[0_4px_0_0_#C4471F]">
                                <Zap size={22} fill="currentColor" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">{"Today's mission"}</p>
                                <p className="font-display font-bold text-lg text-[#201D18]">Read 2 pages, pick a clue</p>
                            </div>
                        </div>
                        <ol className="space-y-2 text-sm font-semibold text-[#201D18]">
                            <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-[#3F8C5E] text-white inline-flex items-center justify-center"><Check size={12} /></span>Open your book to page 14</li>
                            <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-[#3F8C5E] text-white inline-flex items-center justify-center"><Check size={12} /></span>Read 2 pages out loud</li>
                            <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-[#E8E0D2]"></span>Underline one clue you find</li>
                        </ol>
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6E675B] border-t-2 border-[#E8E0D2] pt-3">
                            <Clock size={12} /> 8 minutes left
                            <span className="ml-auto mb-chip bg-[#E8A33D]/30 text-[#8A6413] py-0.5">
                                <Zap size={10} fill="currentColor" /> 5-day spark streak
                            </span>
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#9A9286] flex items-center gap-1.5 border-t-2 border-[#E8E0D2] pt-2">
                            <BookOpen size={11} /> Backed by NRP 2000, Marzano 2001
                        </div>
                    </div>
                </div>
            </section>

            {/* ---------- FEATURES ---------- */}
            <section id={ANCHORS.FEATURES} className="bg-white border-y-2 border-[#E8E0D2]">
                <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
                    <header className="space-y-2 max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#E4572E]">{"What's inside"}</p>
                        <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[#201D18]">Three things, done well.</h2>
                        <p className="text-[#6E675B] font-semibold">{"Not a kitchen sink. The handful of features ADHD families actually use, day after day."}</p>
                    </header>
                    <div className="grid md:grid-cols-3 gap-5" data-testid="landing-features">
                        <FeatureCard
                            icon={<Sparkles size={22} />}
                            tint="bg-[#E4572E]/10 text-[#E4572E]"
                            title="AI mission drafter"
                            body={"Tell our AI what your kid's working on. Get a chunked, time-boxed mission with research-tagged steps in 5 seconds."}
                            tag="AI-drafted, research-tagged"
                        />
                        <FeatureCard
                            icon={<Zap size={22} fill="currentColor" />}
                            tint="bg-[#E8A33D]/40 text-[#8A6413]"
                            title="Sparks streaks"
                            body={"Each completed mission earns a spark. ADHD reward sensitivity (Luman 2010) is real — your kid feels it, the streak makes it stick."}
                            tag="Daily habit loop"
                        />
                        <FeatureCard
                            icon={<Activity size={22} />}
                            tint="bg-[#BC4B32]/10 text-[#BC4B32]"
                            title="Moments tracker"
                            body="Tap or talk to log meltdowns, hyperfocus, sensory overload — with 18 evidence-tagged triggers. Export CSV for your therapist."
                            tag="Voice → structured log"
                        />
                    </div>
                </div>
            </section>

            {/* ---------- RESEARCH BAND ---------- */}
            <section id={ANCHORS.RESEARCH} className="bg-[#201D18] text-white" data-testid="landing-research-band">
                <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-12 gap-8 items-center">
                    <div className="md:col-span-7 space-y-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#E8A33D]">Evidence-informed</p>
                        <h2 className="font-display font-extrabold text-3xl sm:text-4xl leading-tight">
                            Every skill, strategy, and behavior tag in MissionSparks is linked to a peer-reviewed paper or authoritative guideline.
                        </h2>
                        <p className="text-base font-semibold text-white/70">
                            {"Open the library and you'll find Diamond on executive function, Klingberg on working-memory training, Luman on ADHD reward sensitivity, AAP's clinical guideline, CDC, NIMH, CHADD — the canonical sources your child's therapist already trusts."}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-2 text-xs font-bold">
                            {["CDC", "AAP", "NIMH", "CHADD", "JAACAP", "Pediatrics", "NICHD"].map((src) => (
                                <span key={src} className="mb-chip bg-white/10 text-white border-2 border-white/20" data-testid={`landing-source-${src.toLowerCase()}`}>{src}</span>
                            ))}
                        </div>
                    </div>
                    <div className="md:col-span-5 grid grid-cols-2 gap-3">
                        <StatTile big={stats.citations} suffix="+" label="Peer-reviewed & guideline citations" tone="bg-[#E8A33D] text-[#201D18]" testId="landing-stat-citations" />
                        <StatTile big={stats.skills} label="Evidence-tagged skills" tone="bg-[#E4572E] text-white" />
                        <StatTile big={stats.strategies} label="Strategies you can drop into any mission" tone="bg-[#3F8C5E] text-[#201D18]" />
                        <Link
                            to="/register"
                            className="rounded-2xl bg-white text-[#201D18] p-4 flex flex-col justify-between hover:scale-[1.02] transition-transform"
                            data-testid="landing-research-cta"
                        >
                            <BookOpen size={28} />
                            <span className="font-display font-extrabold text-lg leading-tight mt-2">Open the research library →</span>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ---------- HOW IT WORKS ---------- */}
            <section id={ANCHORS.HOW} className="max-w-6xl mx-auto px-6 py-16 space-y-10" data-testid="landing-how">
                <header className="space-y-2 max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#E4572E]">How it works</p>
                    <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[#201D18]">Three steps, every day.</h2>
                </header>
                <div className="grid md:grid-cols-3 gap-5">
                    <StepCard step={1} title="Parent drafts" body={"Type a topic or hit 'AI draft day' to get 3 tiny missions personalized to your kid's profile."} />
                    <StepCard step={2} title="Kid completes" body={"Each mission takes 5–25 minutes, ends with a mini-game, and lights up the day's spark."} />
                    <StepCard step={3} title="Insights flow" body={"Behavior, feelings, and triggers feed a parent dashboard you can export straight to your therapist."} />
                </div>
            </section>

            {/* ---------- PRIVACY ---------- */}
            <section id={ANCHORS.PRIVACY} className="bg-white border-y-2 border-[#E8E0D2]" data-testid="landing-privacy">
                <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-12 gap-8 items-start">
                    <div className="md:col-span-5 space-y-3">
                        <div className="inline-flex items-center gap-2 mb-chip bg-[#3F8C5E]/15 text-[#2F6B47]">
                            <Shield size={14} /> Privacy first
                        </div>
                        <h2 className="font-display font-extrabold text-3xl text-[#201D18] leading-tight">{"Built for parents who actually read the privacy policy."}</h2>
                        <p className="text-[#6E675B] font-semibold">{"Kids' data is sensitive. We treat it like our own children's data — because that's how this got built."}</p>
                    </div>
                    <ul className="md:col-span-7 grid sm:grid-cols-2 gap-3 text-sm font-semibold text-[#201D18]">
                        <PrivacyTile icon={<Shield size={16} />} title="COPPA-style consent" body="Explicit parental consent before any student account is linked, with an audit log of who consented when." />
                        <PrivacyTile icon={<Mic size={16} />} title="Audio discarded by default" body={"Voice notes are transcribed and the original audio is deleted unless you explicitly opt in to keep it."} />
                        <PrivacyTile icon={<Lock size={16} />} title="Right to delete" body={"Wipe everything with one click. Account, missions, moments, audio — gone."} />
                        <PrivacyTile icon={<BarChart3 size={16} />} title="No ads, no resale" body={"We don't sell anonymized behavior data. Ever. Therapist-channel pricing funds the product."} />
                    </ul>
                </div>
            </section>

            {/* ---------- WAITLIST ---------- */}
            <section id={ANCHORS.WAITLIST} className="max-w-6xl mx-auto px-6 py-20" data-testid="landing-waitlist">
                <div className="mb-card p-8 sm:p-10 bg-gradient-to-br from-[#E4572E] to-[#C4471F] text-white relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#E8A33D]/30 blur-2xl" aria-hidden />
                    <div className="relative grid md:grid-cols-12 gap-8 items-center">
                        <div className="md:col-span-6 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-[#E8A33D]">Therapist & parent waitlist</p>
                            <h2 className="font-display font-extrabold text-3xl sm:text-4xl leading-tight">{"Get early access + the latest citations as we add them."}</h2>
                            <p className="text-base font-semibold text-white/80">
                                {"We send "}<strong>one short email a month</strong>{". New mini-games, new research, no marketing fluff. "}{stats.waitlist > 0 && (<span className="opacity-80">{stats.waitlist} {stats.waitlist === 1 ? "person has" : "people have"} joined so far.</span>)}
                            </p>
                        </div>
                        <form onSubmit={submitWaitlist} className="md:col-span-6 space-y-3" data-testid="landing-waitlist-form">
                            <div className="grid sm:grid-cols-3 gap-2">
                                <select
                                    value={waitRole}
                                    onChange={(e) => setWaitRole(e.target.value)}
                                    className="mb-input text-[#201D18]"
                                    data-testid="landing-waitlist-role"
                                >
                                    <option value="parent">{"I'm a parent"}</option>
                                    <option value="therapist">{"I'm a therapist"}</option>
                                    <option value="teacher">{"I'm a teacher"}</option>
                                    <option value="other">Other</option>
                                </select>
                                <input
                                    type="email"
                                    required
                                    placeholder="you@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mb-input text-[#201D18] sm:col-span-2"
                                    data-testid="landing-waitlist-email"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={waitState.loading}
                                className="w-full rounded-2xl bg-[#E8A33D] text-[#201D18] font-bold py-3 hover:brightness-105 transition disabled:opacity-60 shadow-[0_4px_0_0_#C98A2E]"
                                data-testid="landing-waitlist-submit"
                            >
                                {waitState.loading ? "Saving…" : "Join the waitlist"}
                            </button>
                            {waitState.ok && (
                                <p className="text-sm font-bold text-[#E8A33D] flex items-center gap-2" data-testid="landing-waitlist-ok">
                                    <Check size={14} /> {waitState.dup ? "You're already on the list — we've got you." : "You're in! Watch your inbox."}
                                </p>
                            )}
                            {waitState.error && (
                                <p className="text-sm font-bold text-[#E8A33D]" data-testid="landing-waitlist-error">{waitState.error}</p>
                            )}
                            <p className="text-[10px] font-semibold text-white/60">{"One email a month. Unsubscribe with one click. We never sell your email."}</p>
                        </form>
                    </div>
                </div>
            </section>

            {/* ---------- FOOTER ---------- */}
            <footer className="bg-[#201D18] text-white/80" data-testid="landing-footer">
                <div className="max-w-6xl mx-auto px-6 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8 text-sm">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <SparkMark size={26} primary="#F4EEE3" accent="#E4572E" />
                            <span className="font-display font-extrabold text-xl text-white">Mission<span className="text-[#E4572E]">Sparks</span></span>
                        </div>
                        <p className="mt-3 text-xs text-white/60">
                            Small daily wins. Real research. Built for ADHD families.
                        </p>
                    </div>
                    <FooterCol title="Product">
                        <Link to="/login" className="hover:text-white" data-testid="footer-login">Log in</Link>
                        <Link to="/register" className="hover:text-white" data-testid="footer-register">Create account</Link>
                        <a href={`#${ANCHORS.FEATURES}`} className="hover:text-white">Features</a>
                        <a href={`#${ANCHORS.HOW}`} className="hover:text-white">How it works</a>
                    </FooterCol>
                    <FooterCol title="Evidence">
                        <a href={`#${ANCHORS.RESEARCH}`} className="hover:text-white">Methodology</a>
                        <Link to="/login?next=/parent/research" className="hover:text-white">Research library</Link>
                        <Link to="/changelog" className="hover:text-white" data-testid="footer-changelog">Changelog</Link>
                    </FooterCol>
                    <FooterCol title="Legal">
                        <Link to="/privacy" className="hover:text-white">Privacy</Link>
                        <Link to="/terms" className="hover:text-white">Terms</Link>
                        <Link to="/sub-processors" className="hover:text-white" data-testid="footer-subprocessors">Sub-processors</Link>
                        <a href="mailto:support@missionsparks.example" className="hover:text-white">Contact</a>
                    </FooterCol>
                </div>
                <div className="border-t border-white/10 text-xs text-white/40 text-center py-4">
                    © {new Date().getFullYear()} MissionSparks · Not a medical device. Use alongside, not instead of, your clinician.
                </div>
            </footer>
        </div>
    );
}

function LandingNav() {
    return (
        <header className="sticky top-0 z-30 bg-[#FBF6EE]/85 backdrop-blur-md border-b-2 border-[#E8E0D2]">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2.5" data-testid="landing-nav-logo">
                    <SparkMark size={30} />
                    <span className="font-display font-extrabold text-2xl text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                </Link>
                <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-[#6E675B]">
                    <a href={`#${ANCHORS.FEATURES}`} className="hover:text-[#201D18]">Features</a>
                    <a href={`#${ANCHORS.RESEARCH}`} className="hover:text-[#201D18]">Research</a>
                    <a href={`#${ANCHORS.HOW}`} className="hover:text-[#201D18]">How it works</a>
                    <Link to="/changelog" className="hover:text-[#201D18]">Changelog</Link>
                </nav>
                <div className="flex items-center gap-2">
                    <Link to="/login" className="btn-pop-ghost text-sm" data-testid="landing-nav-login">Log in</Link>
                    <Link to="/register" className="btn-pop-primary text-sm" data-testid="landing-nav-register">Get started</Link>
                </div>
            </div>
        </header>
    );
}

function FeatureCard({ icon, tint, title, body, tag }) {
    return (
        <article className="mb-card mb-card-hover p-5 space-y-3 bg-white" data-testid={`landing-feature-${title.toLowerCase().replaceAll(" ", "-")}`}>
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${tint}`}>{icon}</div>
            <h3 className="font-display font-extrabold text-xl text-[#201D18]">{title}</h3>
            <p className="text-sm font-semibold text-[#6E675B]">{body}</p>
            {tag && <span className="mb-chip bg-[#FBF6EE] text-[#E4572E] text-xs">{tag}</span>}
        </article>
    );
}

function StatTile({ big, suffix = "", label, tone, testId }) {
    return (
        <div className={`rounded-2xl p-4 ${tone}`} data-testid={testId}>
            <p className="font-display font-extrabold text-4xl leading-none">{big}{suffix}</p>
            <p className="text-xs font-bold mt-2 opacity-80">{label}</p>
        </div>
    );
}

function StepCard({ step, title, body }) {
    return (
        <article className="mb-card p-5 space-y-2 bg-white relative">
            <span className="absolute -top-3 -left-3 h-9 w-9 rounded-2xl bg-[#201D18] text-white font-display font-extrabold flex items-center justify-center shadow-[0_3px_0_0_#000]">{step}</span>
            <h3 className="font-display font-extrabold text-xl text-[#201D18] pt-2">{title}</h3>
            <p className="text-sm font-semibold text-[#6E675B]">{body}</p>
        </article>
    );
}

function PrivacyTile({ icon, title, body }) {
    return (
        <li className="rounded-2xl border-2 border-[#E8E0D2] p-4 bg-white flex gap-3">
            <span className="text-[#E4572E] mt-0.5">{icon}</span>
            <div>
                <p className="font-bold text-[#201D18]">{title}</p>
                <p className="text-xs text-[#6E675B] font-semibold mt-0.5">{body}</p>
            </div>
        </li>
    );
}

function FooterCol({ title, children }) {
    return (
        <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-white mb-3">{title}</p>
            <div className="flex flex-col gap-2">{children}</div>
        </div>
    );
}
