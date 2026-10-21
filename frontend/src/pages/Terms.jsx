import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const UPDATED = "October 21, 2026";
const CONTACT = "hello@missionsparks.com";

export default function Terms() {
    return (
        <div className="min-h-screen mb-dots p-6" data-testid="terms-page">
            <main className="max-w-3xl mx-auto bg-white rounded-3xl border-2 border-[#E8E0D2] p-6 sm:p-10">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#E4572E] mb-4" data-testid="terms-back">
                    <ArrowLeft size={16} /> Back
                </Link>
                <h1 className="font-display font-extrabold text-4xl text-[#201D18]">Terms of Service</h1>
                <p className="text-sm text-[#6E675B] mt-1">Last updated: {UPDATED}</p>

                <p className="mt-4 text-sm font-semibold rounded-2xl border-2 border-[#E8E0D2] bg-[#FBF6EE] text-[#201D18] p-4 leading-relaxed">
                    The short version: use the app for your own family, don&apos;t abuse it, keep your
                    account secure, and understand that it&apos;s a beta tool for organizing daily
                    routines — not medical care. You own your data and can delete it whenever you want.
                </p>

                <Section title="1. Agreeing to these terms">
                    <p>
                        By creating an account or using MissionSparks, you agree to these Terms and to our{" "}
                        <Link to="/privacy" className="text-[#C4471F] underline">Privacy Policy</Link>. If you
                        don&apos;t agree, don&apos;t use the app. MissionSparks is operated by Cool Geek
                        Media (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
                    </p>
                </Section>

                <Section title="2. Who can use it">
                    <List items={[
                        "You must be at least 18 years old, or the age of majority where you live, to create a parent account.",
                        "A child uses the app only through an account created and controlled by their parent or legal guardian.",
                        "By adding a child, you confirm you are their parent or legal guardian and that you consent to their use of the app on these Terms.",
                        "You are responsible for activity that happens under your account, including a child's use of it.",
                    ]} />
                </Section>

                <Section title="3. Beta, and what it costs">
                    <p>
                        MissionSparks is in beta and is free to use during the beta period. Beta means
                        the app is still changing: features may be added, changed, or removed, and
                        something may break.
                    </p>
                    <List items={[
                        "We do not guarantee uptime, availability, or that any particular feature will remain.",
                        "We will not start charging you without telling you first, in the app or by email, and giving you a chance to export your data.",
                        "If we ever need to reset data to fix a serious problem, we will tell you before or as it happens.",
                    ]} />
                </Section>

                <Section title="4. Your account">
                    <List items={[
                        "Give accurate information when you sign up, and keep your password to yourself.",
                        "One account per adult. Don't share your login with people outside your household.",
                        "Tell us promptly if you think someone else has access to your account.",
                    ]} />
                </Section>

                <Section title="5. Families and children">
                    <p>
                        A family account can include more than one adult and one or more children. The
                        adult who creates the family is responsible for who is added to it and for what
                        is recorded about each child. Co-parents and viewers you invite can see the
                        family&apos;s activity, so only invite people you trust with that.
                    </p>
                </Section>

                <Section title="6. Your content">
                    <p>
                        You keep ownership of everything you put into the app — missions, notes, moments,
                        recordings, and transcripts. You give us permission to store and process that
                        content only to run the app for you: showing it back to you, generating your
                        insights, transcribing a voice note, and sending a digest if you&apos;ve turned
                        that on. That permission ends when you delete the content or your account.
                    </p>
                    <p>
                        You are responsible for having the right to record and upload what you submit.
                        Don&apos;t enter information about another person without their consent.
                    </p>
                </Section>

                <Section title="7. Acceptable use">
                    <List items={[
                        "Don't use the app to harass, monitor, or record anyone outside your family.",
                        "Don't upload unlawful content, or content that sexualizes or endangers a child.",
                        "Don't scrape, reverse-engineer, overload, or attempt to break the service.",
                        "Don't use it to provide care to other people's children as a business.",
                        "Don't attempt to access another family's data.",
                    ]} />
                    <p className="mt-3">We may suspend or close an account that breaks these rules.</p>
                </Section>

                <Section title="8. Not medical care">
                    <p>
                        MissionSparks is a family organization tool. It records observations you enter
                        and summarizes patterns in them. <strong>It is not a medical device, it does not
                        diagnose or treat any condition, and it is not a substitute for care from a
                        doctor, therapist, or other qualified professional.</strong> Insights are
                        descriptions of your own logged data, not clinical findings or advice. Decisions
                        about a child&apos;s health, education, or treatment belong with you and your
                        professionals.
                    </p>
                </Section>

                <Section title="9. AI-assisted features">
                    <p>
                        Some features use third-party AI: transcribing a voice note, extracting fields
                        from it, and drafting mission ideas. These can be wrong, incomplete, or
                        surprising. Review anything an AI feature produces before you rely on it. If you
                        don&apos;t want a recording sent for transcription, don&apos;t record one.
                    </p>
                </Section>

                <Section title="10. Our property">
                    <p>
                        The app itself — its design, name, logo, and code — belongs to us. These Terms
                        don&apos;t give you any right to copy, resell, or rebrand it. Your content stays
                        yours.
                    </p>
                </Section>

                <Section title="11. Ending your account">
                    <p>
                        You can delete your account at any time from the{" "}
                        <Link to="/account" className="text-[#C4471F] underline">account page</Link>, which
                        removes your data as described in the Privacy Policy. If you created a family with
                        other adults in it, deleting your account does not delete theirs.
                    </p>
                    <p>
                        We may suspend or close an account if it breaks these Terms or exposes us or
                        another family to harm. Where it&apos;s reasonable to do so, we&apos;ll tell you
                        why and give you a chance to export your data first.
                    </p>
                </Section>

                <Section title="12. Disclaimers">
                    <p>
                        The app is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
                        warranties of any kind, express or implied, including fitness for a particular
                        purpose and non-infringement. We don&apos;t promise the app will be uninterrupted,
                        error-free, or that it will produce any particular result for your family.
                    </p>
                    <p>
                        Some jurisdictions don&apos;t allow certain warranty exclusions, so parts of this
                        section may not apply to you.
                    </p>
                </Section>

                <Section title="13. Limit of liability">
                    <p>
                        To the maximum extent permitted by law, we are not liable for indirect,
                        incidental, special, consequential, or punitive damages, or for lost data,
                        profits, or opportunities, arising from your use of the app. Our total liability
                        for any claim relating to the app is limited to the greater of the amount you
                        paid us in the twelve months before the claim, or $100.
                    </p>
                    <p>
                        Nothing in these Terms limits liability that cannot be limited by law, and
                        nothing here takes away consumer rights you have in your jurisdiction.
                    </p>
                </Section>

                <Section title="14. Indemnity">
                    <p>
                        If a third party brings a claim against us because of content you submitted or
                        because you broke these Terms, you agree to cover our reasonable costs of
                        responding to it.
                    </p>
                </Section>

                <Section title="15. Governing law">
                    <p>
                        These Terms are governed by the laws of the State of Arizona, United States,
                        without regard to its conflict-of-laws rules. If we end up in court, the state or
                        federal courts located in Maricopa County, Arizona will hear it, and both of us
                        agree to that. If you live somewhere with consumer protections that give you the
                        right to sue locally, this section doesn&apos;t take that away.
                    </p>
                </Section>

                <Section title="16. Changes to these Terms">
                    <p>
                        We may update these Terms as the app changes. If a change is material, we&apos;ll
                        tell you in the app or by email before it takes effect. Continuing to use the app
                        after that means you accept the updated Terms.
                    </p>
                </Section>

                <Section title="17. Contact">
                    <p>
                        Questions about these Terms:{" "}
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
