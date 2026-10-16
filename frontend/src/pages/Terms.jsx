import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
    return (
        <div className="min-h-screen mb-dots p-6" data-testid="terms-page">
            <main className="max-w-3xl mx-auto bg-white rounded-3xl border-2 border-[#E8E0D2] p-6 sm:p-10">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] mb-4" data-testid="terms-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#201D18]">Terms of Service</h1>
                <p className="text-sm text-[#9A9286] mt-1">Plain-English draft. Last updated: Feb 2026.</p>

                <Section title="Who can use this">
                    <p>You must be at least 13 to create your own account. Children under 13 may use the app only via an account linked to a consenting parent or legal guardian.</p>
                </Section>

                <Section title="What this app is — and isn't">
                    <p>MissionSparks helps families create daily learning missions and capture behavior observations. <strong>It is not a medical device, not a diagnostic tool, and not a substitute for therapy, education plans, or medical care.</strong> Insights are pattern summaries, not clinical findings.</p>
                </Section>

                <Section title="Your content">
                    <p>You retain ownership of the data you create. By using the app you grant us a limited license to process it (e.g., to transcribe a voice note) only to operate the app for you.</p>
                </Section>

                <Section title="Acceptable use">
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Don't log other people's protected information without their consent.</li>
                        <li>Don't try to scrape, reverse-engineer, or attack the service.</li>
                        <li>Don't upload illegal content.</li>
                    </ul>
                </Section>

                <Section title="Termination">
                    <p>You can delete your account from <Link to="/account" className="text-[#E4572E] underline">account settings</Link> at any time. We may suspend accounts that abuse the service.</p>
                </Section>

                <Section title="Disclaimer & limits">
                    <p>The service is provided "as is". To the maximum extent permitted by law, we disclaim warranties and limit liability for indirect or consequential damages.</p>
                </Section>

                <Section title="Contact">
                    <p>Questions: support@missionsparks.example.</p>
                </Section>
            </main>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="mt-6">
            <h2 className="font-display font-bold text-xl text-[#201D18]">{title}</h2>
            <div className="text-sm text-[#201D18] font-semibold mt-2 space-y-2 leading-relaxed">{children}</div>
        </section>
    );
}
