import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
    return (
        <div className="min-h-screen mb-dots p-6" data-testid="privacy-page">
            <main className="max-w-3xl mx-auto bg-white rounded-3xl border-2 border-[#E2E8F0] p-6 sm:p-10">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#4361EE] mb-4" data-testid="privacy-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#0B132B]">Privacy Policy</h1>
                <p className="text-sm text-[#A0AEC0] mt-1">Plain-English draft. Last updated: Feb 2026.</p>

                <p className="mt-4 text-sm font-bold rounded-2xl border-2 border-[#FFD166] bg-[#FFD166]/15 text-[#876200] p-3">
                    ⚠️ This app is a consumer wellness tool. It is <strong>not a medical device</strong>, <strong>not HIPAA-covered</strong>, and is not a substitute for clinical care. Please consult a licensed professional for diagnosis or treatment decisions.
                </p>

                <Section title="What we collect">
                    <ul className="list-disc pl-6 space-y-1">
                        <li>Account: your name, email, and password (hashed with bcrypt).</li>
                        <li>If you are a parent: who you've linked as your student and the consent record (your name, relationship, age check, timestamp).</li>
                        <li>Mission data: titles, steps, descriptions, due dates, reflections.</li>
                        <li>Moments: behavior observations you (or your child) log, including triggers, intensity, optional voice recordings and transcripts.</li>
                        <li>Audit log: timestamped record of who did what in your account.</li>
                    </ul>
                </Section>

                <Section title="How AI is used">
                    <p>To make logging faster we send your <em>voice recording</em> to an AI provider for transcription, then send the <em>transcript text</em> to another AI provider to extract structured fields. Our current list of AI vendors and what data they receive is maintained on our <Link to="/sub-processors" className="text-[#4361EE] underline" data-testid="privacy-link-subprocessors">sub-processors page</Link>. We do not currently have Business Associate Agreements (BAAs) with these vendors, which means data is processed on consumer-tier endpoints. Don't put protected health information here unless and until those agreements are in place.</p>
                    <p className="mt-2">You can turn off audio retention with the "Discard audio after transcription" toggle in <Link to="/account" className="text-[#4361EE] underline">your account settings</Link>. When on, recordings are deleted after transcription — only the text is kept.</p>
                </Section>

                <Section title="Children and COPPA">
                    <p>If your child is under 13, you must complete the parental consent form when linking their account. We collect only what's needed to operate the app. We never show behavioral or targeted ads. You can revoke consent and delete all of your child's data at any time from <Link to="/account" className="text-[#4361EE] underline">your account settings</Link>.</p>
                </Section>

                <Section title="Your rights">
                    <ul className="list-disc pl-6 space-y-1">
                        <li><strong>Access & export</strong> — Download a full JSON copy of your data from the account page.</li>
                        <li><strong>Delete</strong> — Tap "Delete my account" to permanently erase your account and everything it owns.</li>
                        <li><strong>Correct</strong> — Edit or remove individual missions, logs, and moments at any time.</li>
                    </ul>
                </Section>

                <Section title="Security">
                    <p>Data is transmitted over TLS. Passwords are hashed with bcrypt. Sessions use httpOnly secure cookies. Production data storage (MongoDB) is single-tenant per environment.</p>
                </Section>

                <Section title="Contact">
                    <p>Questions or requests: privacy@missionsparks.example.</p>
                </Section>
            </main>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="mt-6">
            <h2 className="font-display font-bold text-xl text-[#0B132B]">{title}</h2>
            <div className="text-sm text-[#0B132B] font-semibold mt-2 space-y-2 leading-relaxed">{children}</div>
        </section>
    );
}
