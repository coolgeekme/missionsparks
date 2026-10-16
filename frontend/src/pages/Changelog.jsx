import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SparkMark from "../components/SparkMark";
import { CHANGELOG } from "../data/changelog";

const TAG_TONE = {
    Release: "bg-[#E8A33D]/40 text-[#8A6413]",
    "Big update": "bg-[#E4572E]/10 text-[#E4572E]",
    Feature: "bg-[#3F8C5E]/15 text-[#2F6B47]",
    Privacy: "bg-[#BC4B32]/10 text-[#BC4B32]",
    Foundation: "bg-[#E8E0D2] text-[#6E675B]",
};

export default function Changelog() {
    return (
        <div className="min-h-screen bg-[#FBF6EE]" data-testid="changelog-page">
            <header className="bg-white border-b-2 border-[#E8E0D2]">
                <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-sm font-bold text-[#6E675B] hover:text-[#201D18]" data-testid="changelog-home-link">
                        <ArrowLeft size={16} /> Home
                    </Link>
                    <Link to="/" className="flex items-center gap-2">
                        <SparkMark size={22} />
                        <span className="font-display font-extrabold text-lg text-[#201D18]">Mission<span className="text-[#E4572E]">Sparks</span></span>
                    </Link>
                </div>
            </header>
            <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
                <header className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#E4572E]">Changelog</p>
                    <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[#201D18]">{"What's new"}</h1>
                    <p className="text-[#6E675B] font-semibold">{"Every release we ship — features, research updates, privacy changes. Newest first."}</p>
                </header>

                <ol className="relative border-l-2 border-[#E8E0D2] pl-6 space-y-8" data-testid="changelog-list">
                    {CHANGELOG.map((entry) => (
                        <li key={entry.version} className="relative" data-testid={`changelog-entry-${entry.version}`}>
                            <span className="absolute -left-[33px] top-1 h-5 w-5 rounded-full bg-[#E4572E] ring-4 ring-[#FBF6EE]" aria-hidden />
                            <article className="mb-card p-5 space-y-3 bg-white">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-display font-extrabold text-xl text-[#201D18]">v{entry.version}</span>
                                    <span className={`mb-chip text-xs ${TAG_TONE[entry.tag] || "bg-[#E8E0D2] text-[#6E675B]"}`}>{entry.tag}</span>
                                    <span className="text-xs font-bold text-[#9A9286] ml-auto">{entry.date}</span>
                                </div>
                                <h2 className="font-display font-bold text-lg text-[#201D18]">{entry.title}</h2>
                                <ul className="space-y-1.5 text-sm text-[#6E675B] font-semibold">
                                    {entry.items.map((it, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="text-[#E4572E] mt-1">▸</span>
                                            <span>{it}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        </li>
                    ))}
                </ol>

                <footer className="text-center text-xs font-semibold text-[#6E675B] pt-6">
                    <Link to="/#waitlist" className="text-[#E4572E] hover:underline">Join the waitlist</Link> to get release notes in your inbox.
                </footer>
            </main>
        </div>
    );
}
