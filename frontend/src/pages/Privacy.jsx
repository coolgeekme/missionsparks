import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const UPDATED = "October 21, 2026";
const CONTACT = "hello@missionsparks.com";

export default function Privacy() {
    return (
        <div className="min-h-screen mb-dots p-6" data-testid="privacy-page">
            <main className="max-w-3xl mx-auto bg-white rounded-3xl border-2 border-[#E8E0D2] p-6 sm:p-10">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] mb-4" data-testid="privacy-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#201D18]">Privacy Policy</h1>
                <p className="text-sm text-[#6E675B] mt-1">Last updated: {UPDATED}</p>

                <p className="mt-4 text-sm font-semibold rounded-2xl border-2 border-[#E8E0D2] bg-[#FBF6EE] text-[#201D18] p-4 leading-relaxed">
                    The short version: we collect what we need to run your family&apos;s account, we
                    don&apos;t sell it, we don&apos;t show ads, and a parent can export or delete
                    everything at any time. Everything below is the detail behind that.
                </p>

                <Section title="Who we are">
                    <p>
                        MissionSparks is a family app operated by Cool Geek Media (&ldquo;we&rdquo;,
                        &ldquo;us&rdquo;). This policy covers the app at missionsparks.com and the
                        emails we send you. It applies to parents and guardians who create an account,
                        and to the children a parent adds to it.
                    </p>
                </Section>

                <Section title="What we collect">
                    <List items={[
                        <><strong>Account details</strong> — your name, email address, a password (stored only as a bcrypt hash, never in readable form), your role, your timezone, and when you accepted the Terms.</>,
                        <><strong>Family details</strong> — a family name, who belongs to it, and the email address of anyone you invite.</>,
                        <><strong>Child details you enter</strong> — a first name or nickname, grade, reading level, interests, and any preferences you choose to record. A child does not enter their own email address.</>,
                        <><strong>Missions and completions</strong> — mission titles, steps, due dates, and the record of what was completed and when.</>,
                        <><strong>Moments</strong> — the observations you (or your child) log: moment type, intensity, triggers, short notes, and optional voice recordings with their transcripts.</>,
                        <><strong>Daily check-in</strong> — the context you record each day for a child: whether medication was taken and roughly when, how they slept, and which meals they ate. This exists so a hard day can be compared with a calm one. We record what you enter; we never assess whether a medication is working or recommend any change to it.</>,
                        <><strong>Settings</strong> — digest preferences, whether to discard audio after transcription, and notification subscriptions if you enable them.</>,
                        <><strong>Activity log</strong> — a record of actions taken inside your account (sign-ins, edits, exports, deletions), kept so a parent can see what happened.</>,
                    ]} />
                    <p className="mt-3">
                        We do <strong>not</strong> collect advertising identifiers, your location,
                        your contacts, your photos, or data from other apps on your phone.
                    </p>
                </Section>

                <Section title="Why we collect it">
                    <List items={[
                        "To run the app — create missions, log moments, and show you the patterns.",
                        "To send family digest emails, but only if you turn them on.",
                        "To keep accounts secure and to show a parent what happened in their own account.",
                        "To answer you when you contact us.",
                    ]} />
                    <p className="mt-3">We don&apos;t use your data for advertising, and we don&apos;t sell it.</p>
                </Section>

                <Section title="Children and parental consent">
                    <p>
                        A child&apos;s account is created and controlled by a parent or guardian. When
                        you add a child, you confirm that you are their parent or legal guardian, and we
                        record your name, your relationship to the child, and the time you confirmed it.
                    </p>
                    <List items={[
                        "We collect from a child only what the app needs: a first name or nickname, which missions were completed, and the moments a parent logs.",
                        "We do not show ads to children, do not build advertising profiles, and do not sell any data.",
                        "A parent can review, export, correct, or delete a child's information at any time from the account page.",
                        "If you believe a child's account was created without parental consent, email us and we will delete it.",
                    ]} />
                </Section>

                <Section title="How AI is used">
                    <p>
                        Two features use third-party AI: voice capture and mission drafting. When you
                        record a voice note, the recording goes to a transcription provider and the
                        resulting text goes to a language model that pulls out the fields (moment type,
                        intensity, triggers, notes). Mission drafting works the same way, on the text
                        you give it.
                    </p>
                    <List items={[
                        <>We do not use your content to train our own models, and we require providers to process it only to return the result we asked for.</>,
                        <>Audio is discarded after transcription by default. You can change that in your account settings.</>,
                        <>AI output can be wrong. Treat any drafted or extracted field as a suggestion and correct it before saving.</>,
                    ]} />
                </Section>

                <Section title="Who we share it with">
                    <p>
                        We share data with service providers who help us run the app, and with nobody
                        else for their own purposes. These are our current providers:
                    </p>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-left text-[#6E675B] uppercase text-[11px] tracking-wider">
                                    <th className="py-2 pr-3 border-b-2 border-[#E8E0D2]">Provider</th>
                                    <th className="py-2 pr-3 border-b-2 border-[#E8E0D2]">What it does</th>
                                    <th className="py-2 border-b-2 border-[#E8E0D2]">What it receives</th>
                                </tr>
                            </thead>
                            <tbody>
                                <Row p="Emergent" d="Application hosting and AI gateway" r="All app data, and AI requests" />
                                <Row p="MongoDB Atlas" d="Database" r="All stored app data" />
                                <Row p="Resend" d="Email delivery" r="Your email address and the email content" />
                                <Row p="AI model providers" d="Transcription and text extraction, via our gateway" r="Only the audio or text sent for that one request" />
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3">
                        We do not sell your data, we do not share it with advertising networks or data
                        brokers, and we do not use third-party analytics or tracking pixels.
                    </p>
                    <p className="mt-2">
                        We may disclose information if the law requires it. Where we are legally able to,
                        we will tell you first.
                    </p>
                </Section>

                <Section title="How long we keep it">
                    <List items={[
                        "Account and family data: while your account exists.",
                        "Voice recordings: discarded after transcription unless you have turned that off.",
                        "Deleted accounts: removed from the live system, and rolled off our backups on their normal cycle.",
                        "Activity log: kept while the account exists, because its purpose is accountability inside your own family.",
                    ]} />
                </Section>

                <Section title="Your choices and rights">
                    <List items={[
                        <><strong>Export</strong> — download a complete JSON copy of your data from the account page.</>,
                        <><strong>Delete</strong> — permanently erase your account and everything it owns.</>,
                        <><strong>Correct</strong> — edit or remove any mission, log, or moment.</>,
                        <><strong>Turn things off</strong> — digests, notifications, and audio retention are all switchable in settings.</>,
                        <><strong>Remove a child</strong> — you can revoke a child&apos;s access and delete their data at any time.</>,
                    ]} />
                    <p className="mt-3">
                        For anything not covered by a button in the app, email{" "}
                        <a href={`mailto:${CONTACT}`} className="text-[#C4471F] underline">{CONTACT}</a>{" "}
                        and we will respond.
                    </p>
                </Section>

                <Section title="Security">
                    <p>
                        Data is transmitted over TLS. Passwords are stored as bcrypt hashes. Sessions use
                        httpOnly, secure cookies, and access to your family&apos;s data is scoped to the
                        accounts in that family. No system is perfectly secure, but we work to keep this
                        one tight and to tell you if something goes wrong.
                    </p>
                </Section>

                <Section title="Cookies">
                    <p>
                        We set one cookie: a session cookie that keeps you signed in. It is httpOnly, so
                        scripts on the page cannot read it. We do not use advertising or analytics
                        cookies.
                    </p>
                </Section>

                <Section title="Beta">
                    <p>
                        MissionSparks is in beta and free to use during it. Features will change, and we
                        may occasionally need to reset something to fix a problem. If we ever have to do
                        that, we will tell you before or as it happens — never silently.
                    </p>
                </Section>

                <Section title="Changes to this policy">
                    <p>
                        If we make a material change, we will email you or show it in the app before it
                        takes effect. The date at the top always reflects the current version.
                    </p>
                </Section>

                <Section title="What this app is not">
                    <p>
                        MissionSparks records observations you enter and summarizes patterns in them. It
                        does not diagnose, treat, or manage a medical or psychological condition, and it
                        is not a substitute for care from a qualified professional. If you have questions
                        about your child&apos;s health or development, talk to a doctor or clinician.
                    </p>
                </Section>

                <Section title="Contact">
                    <p>
                        Privacy questions or requests:{" "}
                        <a href={`mailto:${CONTACT}`} className="text-[#C4471F] underline">{CONTACT}</a>.
                    </p>
                </Section>
            </main>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="mt-7">
            <h2 className="font-display font-bold text-xl text-[#201D18]">{title}</h2>
            <div className="text-sm text-[#201D18] font-semibold mt-2 space-y-2 leading-relaxed">{children}</div>
        </section>
    );
}

function List({ items }) {
    return <ul className="list-disc pl-6 space-y-2">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}

function Row({ p, d, r }) {
    return (
        <tr className="align-top">
            <td className="py-2 pr-3 border-b border-[#E8E0D2] font-bold whitespace-nowrap">{p}</td>
            <td className="py-2 pr-3 border-b border-[#E8E0D2]">{d}</td>
            <td className="py-2 border-b border-[#E8E0D2] text-[#6E675B]">{r}</td>
        </tr>
    );
}
