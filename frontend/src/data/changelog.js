/**
 * Static changelog feed surfaced on /changelog. Keep entries short and
 * parent-friendly — parents read this, not engineers.
 * Newest entry first.
 */
export const CHANGELOG = [
    {
        version: "0.9",
        date: "2026-02",
        title: "Brand & landing",
        tag: "Release",
        items: [
            "Renamed MissionBoard → MissionSparks ⚡",
            "New public landing page with research-credibility band",
            "Streak counter rebranded to 'Sparks' across the kid view",
            "Public waitlist + dynamic citation count",
        ],
    },
    {
        version: "0.8",
        date: "2026-02",
        title: "Research-backed everything",
        tag: "Big update",
        items: [
            "31-citation research library at /parent/research",
            "Evidence badges on every skill, strategy, moment type, trigger, and AI-drafted mission",
            "AI mission drafting now attaches peer-reviewed citations automatically",
            "Curated mix of peer-reviewed papers + CDC / AAP / NIMH / CHADD guidance",
        ],
    },
    {
        version: "0.7",
        date: "2026-02",
        title: "P0 compliance sprint",
        tag: "Privacy",
        items: [
            "COPPA-style parental consent flow before linking a student",
            "Right-to-delete endpoint and downloadable JSON export",
            "Audit log of every consent change and data action (parent-visible)",
            "Privacy & Terms pages, with 'discard audio after transcription' toggle",
        ],
    },
    {
        version: "0.6",
        date: "2026-02",
        title: "Moments & behavior tracking",
        tag: "Feature",
        items: [
            "Tap-or-talk Moments tracker with 14 moment types and 18 triggers",
            "Voice logging via AI transcription — natural-language → structured moment",
            "Parent insights dashboard with charts and CSV export",
        ],
    },
    {
        version: "0.5",
        date: "2026-02",
        title: "Daily streaks + mini-games",
        tag: "Feature",
        items: [
            "6 educational mini-games unlocked after each completed mission",
            "Count-up mission timer (time-blindness friendly)",
            "Daily streaks with personal-best tracking",
        ],
    },
    {
        version: "0.4",
        date: "2026-02",
        title: "AI mission drafting",
        tag: "Feature",
        items: [
            "AI drafts personalized missions from parent notes",
            "'AI draft day' suggests 3 varied missions in one click",
            "Skills + strategies auto-tagged from a controlled vocabulary",
        ],
    },
    {
        version: "0.3",
        date: "2026-02",
        title: "Parent & kid dashboards",
        tag: "Foundation",
        items: [
            "Mission CRUD with steps, time estimates, and difficulty",
            "Kid-friendly student dashboard with progress bar",
            "Parent insights — logs, feelings, and difficulty trends",
        ],
    },
    {
        version: "0.2",
        date: "2026-02",
        title: "Accounts & roles",
        tag: "Foundation",
        items: [
            "JWT cookie auth with parent + student roles",
            "Parent links to one or more linked learners",
            "Per-account audio-discard and notification prefs",
        ],
    },
];
