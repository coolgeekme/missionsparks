import { Link } from "react-router-dom";
import SparkMark from "../components/SparkMark";
import { ArrowRight, ListChecks, Trophy, TrendingUp, Clock, Sparkles, ShieldCheck, BellOff, Trash2 } from "lucide-react";

function Step({ n, icon: Icon, title, body }) {
    return (
        <div className="mb-card p-6 text-left" data-testid={`landing-step-${n}`}>
            <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-full bg-[#E4572E] text-white font-display font-bold flex items-center justify-center text-sm">
                    {n}
                </span>
                <Icon size={20} className="text-[#E4572E]" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#201D18]">{title}</h3>
            <p className="text-sm text-[#6E675B] font-semibold mt-1.5 leading-relaxed">{body}</p>
        </div>
    );
}

function Feature({ icon: Icon, title, body }) {
    return (
        <div className="mb-card p-6 text-left">
            <Icon size={22} className="text-[#E4572E] mb-3" />
            <h3 className="font-display font-bold text-lg text-[#201D18]">{title}</h3>
            <p className="text-sm text-[#6E675B] font-semibold mt-1.5 leading-relaxed">{body}</p>
        </div>
    );
}

export default function Landing() {
    return (
        <div className="min-h-screen bg-[#FBF6EE] flex flex-col" data-testid="landing-page">
            <header className="max-w-5xl mx-auto px-6 py-6 w-full flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2.5" data-testid="landing-nav-logo">
                    <SparkMark size={30} />
                    <span className="font-display font-extrabold text-2xl text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                </Link>
                <Link to="/login" className="btn-pop-primary text-sm" data-testid="landing-nav-login">Sign in</Link>
            </header>

            <main className="flex-1">
                {/* Hero */}
                <section className="px-6 pt-4 pb-16">
                    <div className="text-center max-w-2xl mx-auto space-y-6" data-testid="landing-hero">
                        <div className="flex justify-center">
                            <SparkMark size={80} />
                        </div>
                        <div>
                            <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-[#201D18] leading-[1.05]">
                                Light their spark.
                            </h1>
                            <p className="font-display font-semibold text-xl text-[#E4572E] mt-3">
                                Tiny daily wins, every day.
                            </p>
                        </div>
                        <p className="text-lg text-[#6E675B] font-semibold max-w-xl mx-auto">
                            Designed for families raising kids with ADHD. Turn the small stuff &mdash; &ldquo;read two pages,&rdquo; &ldquo;pack your backpack&rdquo; &mdash; into short missions your kid actually wants to finish, with a spark streak and mini-games on the other side.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <Link to="/register" className="btn-pop-primary text-base flex items-center gap-2" data-testid="landing-cta-register">
                                Create an account <ArrowRight size={18} />
                            </Link>
                            <Link to="/login" className="btn-pop-ghost text-base" data-testid="landing-cta-login">
                                Sign in
                            </Link>
                        </div>
                        <p className="text-xs font-semibold text-[#9A9286]">
                            Private by default. Your family&apos;s data stays yours.
                        </p>
                    </div>
                </section>

                {/* How it works */}
                <section className="px-6 pb-16">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="font-display font-extrabold text-3xl text-center text-[#201D18]">
                            Three steps, every day
                        </h2>
                        <div className="grid sm:grid-cols-3 gap-5 mt-8">
                            <Step n={1} icon={ListChecks} title="Draft a mission" body="Turn one real thing into a short, time-boxed mission. Small enough to start, clear enough to finish." />
                            <Step n={2} icon={Trophy} title="They finish it" body="Your kid checks it off and keeps their spark streak alive — missions end in a mini-game as the reward." />
                            <Step n={3} icon={TrendingUp} title="See what's working" body="Watch streaks and patterns build over time so you can see what's clicking, not just what's due." />
                        </div>
                    </div>
                </section>

                {/* Why it works */}
                <section className="px-6 pb-16">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="font-display font-extrabold text-3xl text-center text-[#201D18]">
                            Built for real family life
                        </h2>
                        <div className="grid sm:grid-cols-3 gap-5 mt-8">
                            <Feature icon={Sparkles} title="Small steps" body="Chunk the task down &mdash; &ldquo;read two pages,&rdquo; not &ldquo;do your reading.&rdquo; Less to dread, easier to start." />
                            <Feature icon={Clock} title="Time-boxed" body="Five to twenty-five minutes with a clear start and end. No more &ldquo;how long is this going to take.&rdquo;" />
                            <Feature icon={Trophy} title="A real reason to finish" body="The spark streak and mini-game give your kid a reason to check the box &mdash; on their own." />
                        </div>
                    </div>
                </section>

                {/* Privacy */}
                <section className="px-6 pb-20">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="font-display font-extrabold text-3xl text-center text-[#201D18]">
                            Your family, your rules
                        </h2>
                        <div className="grid sm:grid-cols-3 gap-5 mt-8">
                            <Feature icon={BellOff} title="No ads" body="We never show behavioral or targeted ads. This is your family&apos;s space, not a billboard." />
                            <Feature icon={Trash2} title="Delete any time" body="Delete your account and everything it owns, permanently, whenever you want." />
                            <Feature icon={ShieldCheck} title="Audio, your call" body="Flip on &ldquo;discard audio after transcription&rdquo; and voice recordings are deleted the moment they&apos;re transcribed." />
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t-2 border-[#E8E0D2]">
                <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-semibold text-[#6E675B]">
                    <div className="flex items-center gap-2">
                        <SparkMark size={20} />
                        <span className="font-display font-bold text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                    </div>
                    <div className="flex items-center gap-5">
                        <Link to="/privacy" className="hover:text-[#201D18]" data-testid="footer-privacy">Privacy</Link>
                        <Link to="/terms" className="hover:text-[#201D18]" data-testid="footer-terms">Terms</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
