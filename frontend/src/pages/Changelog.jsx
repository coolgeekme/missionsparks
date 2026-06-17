import { Link } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";
import { CHANGELOG } from "../data/changelog";

const TAG_TONE = {
    Release: "bg-[#FFD166]/40 text-[#876200]",
    "Big update": "bg-[#4361EE]/10 text-[#4361EE]",
    Feature: "bg-[#06D6A0]/15 text-[#057a5b]",
    Privacy: "bg-[#EF476F]/10 text-[#EF476F]",
    Foundation: "bg-[#E2E8F0] text-[#4A5568]",
};

export default function Changelog() {
    return (
        <div className="min-h-screen bg-[#F0F8FF]" data-testid="changelog-page">
            <header className="bg-white border-b-2 border-[#E2E8F0]">
                <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-sm font-bold text-[#4A5568] hover:text-[#0B132B]" data-testid="changelog-home-link">
                        <ArrowLeft size={16} /> Home
                    </Link>
                    <Link to="/" className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-[#4361EE] flex items-center justify-center text-white">
                            <Zap size={16} fill="currentColor" />
                        </div>
                        <span className="font-display font-extrabold text-lg text-[#0B132B]">MissionSparks</span>
                    </Link>
                </div>
            </header>
            <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
                <header className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#4361EE]">Changelog</p>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#0B132B]">{"What's new"}</h1>
                    <p className="text-[#4A5568] font-semibold">{"Every release we ship — features, research updates, privacy changes. Newest first."}</p>
                </header>

                <ol className="relative border-l-2 border-[#E2E8F0] pl-6 space-y-8" data-testid="changelog-list">
                    {CHANGELOG.map((entry) => (
                        <li key={entry.version} className="relative" data-testid={`changelog-entry-${entry.version}`}>
                            <span className="absolute -left-[33px] top-1 h-5 w-5 rounded-full bg-[#4361EE] ring-4 ring-[#F0F8FF]" aria-hidden />
                            <article className="mb-card p-5 space-y-3 bg-white">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-display font-extrabold text-xl text-[#0B132B]">v{entry.version}</span>
                                    <span className={`mb-chip text-xs ${TAG_TONE[entry.tag] || "bg-[#E2E8F0] text-[#4A5568]"}`}>{entry.tag}</span>
                                    <span className="text-xs font-bold text-[#A0AEC0] ml-auto">{entry.date}</span>
                                </div>
                                <h2 className="font-display font-bold text-lg text-[#0B132B]">{entry.title}</h2>
                                <ul className="space-y-1.5 text-sm text-[#4A5568] font-semibold">
                                    {entry.items.map((it, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="text-[#4361EE] mt-1">▸</span>
                                            <span>{it}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        </li>
                    ))}
                </ol>

                <footer className="text-center text-xs font-semibold text-[#4A5568] pt-6">
                    <Link to="/#waitlist" className="text-[#4361EE] hover:underline">Join the waitlist</Link> to get release notes in your inbox.
                </footer>
            </main>
        </div>
    );
}
