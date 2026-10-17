import { Link } from "react-router-dom";
import SparkMark from "../components/SparkMark";
import { ArrowRight } from "lucide-react";

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

            <main className="flex-1 flex items-center justify-center px-6 pb-16">
                <div className="text-center max-w-2xl space-y-6" data-testid="landing-hero">
                    <div className="flex justify-center">
                        <SparkMark size={80} />
                    </div>
                    <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-[#201D18] leading-[1.05]">
                        Light their spark.
                    </h1>
                    <p className="text-lg text-[#6E675B] font-semibold max-w-xl mx-auto">
                        Daily missions and one-tap moment notes for your family — see what's working over time.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link to="/login" className="btn-pop-primary text-base flex items-center gap-2" data-testid="landing-cta-login">
                            Sign in <ArrowRight size={18} />
                        </Link>
                        <Link to="/register" className="btn-pop-ghost text-base" data-testid="landing-cta-register">
                            Create an account
                        </Link>
                    </div>
                    <p className="text-xs font-semibold text-[#9A9286]">
                        Private by default. Your family's data stays yours.
                    </p>
                </div>
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
