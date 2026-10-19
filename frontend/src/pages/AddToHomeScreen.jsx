import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { ArrowLeft, Share, MoreVertical, Zap, LayoutDashboard } from "lucide-react";

export default function AddToHomeScreen() {
    return (
        <div className="min-h-screen" data-testid="add-to-home-page">
            <Navbar />
            <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
                <Link to="/capture" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E]" data-testid="add-to-home-back">
                    <ArrowLeft size={16} /> Back to Quick Log
                </Link>

                <header>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#9A9286]">One-tap tracking</p>
                    <h1 className="font-display font-extrabold text-4xl text-[#201D18] mt-1">Put it on your home screen</h1>
                    <p className="text-[#6E675B] font-semibold mt-2">
                        Add MissionSparks to your phone and the icon opens straight to Quick Log &mdash; tap Positive or Negative, and it&apos;s saved.
                    </p>
                </header>

                <section className="mb-card p-6">
                    <h2 className="font-display font-bold text-2xl text-[#201D18] mb-4">iPhone (Safari)</h2>
                    <ol className="space-y-3 text-[#201D18] font-semibold list-decimal pl-5">
                        <li>Open <b>Safari</b> and go to <b>missionsparks.com</b>.</li>
                        <li>Tap the <b>Share</b> button (the square with an up arrow <Share size={15} className="inline text-[#E4572E] align-text-bottom" />) at the bottom.</li>
                        <li>Scroll the menu and tap <b>Add to Home Screen</b>.</li>
                        <li>Tap <b>Add</b> in the top-right corner.</li>
                    </ol>
                </section>

                <section className="mb-card p-6">
                    <h2 className="font-display font-bold text-2xl text-[#201D18] mb-4">Android (Chrome)</h2>
                    <ol className="space-y-3 text-[#201D18] font-semibold list-decimal pl-5">
                        <li>Open <b>Chrome</b> and go to <b>missionsparks.com</b>.</li>
                        <li>Tap the <b>three-dot menu</b> (<MoreVertical size={15} className="inline text-[#E4572E] align-text-bottom" />) in the top-right.</li>
                        <li>Tap <b>Add to Home screen</b> &mdash; on newer phones it may say <b>Install app</b>.</li>
                        <li>Tap <b>Add</b> (or <b>Install</b>).</li>
                    </ol>
                </section>

                <section className="mb-card p-6 bg-[#FBF6EE]" data-testid="add-to-home-shortcuts">
                    <h2 className="font-display font-bold text-xl text-[#201D18] mb-2">Two ways in</h2>
                    <p className="text-sm text-[#6E675B] font-semibold">
                        Once it&apos;s on your home screen, long-press the MissionSparks icon to jump straight to either:
                    </p>
                    <ul className="mt-3 space-y-2 text-sm font-semibold text-[#201D18]">
                        <li className="flex items-center gap-2"><Zap size={16} className="text-[#E4572E]" /> <b>Log a moment</b> &mdash; the one-tap Positive / Negative screen</li>
                        <li className="flex items-center gap-2"><LayoutDashboard size={16} className="text-[#201D18]" /> <b>Dashboard</b> &mdash; your parent dashboard</li>
                    </ul>
                </section>
            </main>
        </div>
    );
}
