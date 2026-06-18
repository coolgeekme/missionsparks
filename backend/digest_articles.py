"""Curated, evergreen ADHD parenting articles surfaced in the family digest.

Sources are reputable: CHADD, ADDitude, Harvard Health, American Academy of
Pediatrics, NIMH, ADHD Foundation UK, etc. Each entry has a stable URL,
a short blurb the digest can quote, and tags used for rotation. Add or
prune entries freely.
"""
from __future__ import annotations

CURATED_ARTICLES = [
    {
        "id": "chadd-school-routines",
        "source": "CHADD",
        "title": "Helping Children with ADHD Build Daily Routines",
        "url": "https://chadd.org/for-parents/overview/",
        "blurb": "How predictable morning + bedtime sequences reduce overwhelm and free up the executive function kids need for the harder parts of the day.",
        "tags": ["routine", "school", "ages-5-12"],
    },
    {
        "id": "chadd-homework",
        "source": "CHADD",
        "title": "Homework Strategies That Actually Work for ADHD Kids",
        "url": "https://chadd.org/for-parents/parenting-a-child-with-adhd/",
        "blurb": "Why 25-minute working blocks, body-doubling, and the 'two-foot rule' beat threats and lectures every time.",
        "tags": ["homework", "executive-function", "ages-7-14"],
    },
    {
        "id": "additude-praise",
        "source": "ADDitude",
        "title": "The Praise That Works (and the Praise That Backfires)",
        "url": "https://www.additudemag.com/praise-for-adhd-children/",
        "blurb": "Specific, effort-focused praise rewires the brain's reward system. Vague 'good job' does not.",
        "tags": ["motivation", "self-esteem", "all-ages"],
    },
    {
        "id": "additude-screen-time",
        "source": "ADDitude",
        "title": "Screen Time and the ADHD Brain: What Parents Should Know",
        "url": "https://www.additudemag.com/screen-time-adhd-kids/",
        "blurb": "Not all screen time is equal. Active, social, and creative screen use is very different from passive consumption — here's how to tell the difference.",
        "tags": ["screen-time", "regulation", "all-ages"],
    },
    {
        "id": "harvard-sleep-adhd",
        "source": "Harvard Health",
        "title": "Sleep and ADHD: A Two-Way Street",
        "url": "https://www.health.harvard.edu/blog/sleep-and-adhd-2017092612418",
        "blurb": "Most ADHD kids run a sleep deficit, and sleep deprivation mimics ADHD itself. Small, consistent bedtime moves move the needle fast.",
        "tags": ["sleep", "health", "all-ages"],
    },
    {
        "id": "aap-emotional-regulation",
        "source": "AAP HealthyChildren",
        "title": "Helping Children Manage Big Emotions",
        "url": "https://www.healthychildren.org/English/healthy-living/emotional-wellness/Pages/default.aspx",
        "blurb": "The 'name it to tame it' technique gives kids language for what's happening in their bodies — backed by neuroscience.",
        "tags": ["emotional-regulation", "self-awareness", "ages-5-12"],
    },
    {
        "id": "nimh-overview",
        "source": "NIMH",
        "title": "Attention-Deficit/Hyperactivity Disorder in Children & Teens",
        "url": "https://www.nimh.nih.gov/health/publications/attention-deficit-hyperactivity-disorder-in-children-and-teens-what-you-need-to-know",
        "blurb": "The clearest, most up-to-date official overview of ADHD, including how diagnosis and treatment really work.",
        "tags": ["overview", "research", "all-ages"],
    },
    {
        "id": "additude-exercise",
        "source": "ADDitude",
        "title": "Exercise: The Most Underused ADHD Treatment",
        "url": "https://www.additudemag.com/exercise-and-the-adhd-brain/",
        "blurb": "Just 20 minutes of aerobic activity primes the brain for focus for up to two hours afterwards. The 'movement snack' is your friend.",
        "tags": ["movement", "regulation", "all-ages"],
    },
    {
        "id": "chadd-iep-504",
        "source": "CHADD",
        "title": "504 Plans and IEPs: What Every Parent Should Know",
        "url": "https://chadd.org/for-parents/educational-rights/",
        "blurb": "Knowing the difference, and which one fits your child, can change their school experience overnight.",
        "tags": ["school", "advocacy", "all-ages"],
    },
    {
        "id": "additude-rsd",
        "source": "ADDitude",
        "title": "Rejection Sensitive Dysphoria: The Hidden Side of ADHD",
        "url": "https://www.additudemag.com/rejection-sensitive-dysphoria-and-adhd/",
        "blurb": "Why a small correction can feel devastating — and what to say (and not say) in those moments.",
        "tags": ["emotional-regulation", "self-esteem", "ages-7-14"],
    },
    {
        "id": "adhd-foundation-friendships",
        "source": "ADHD Foundation",
        "title": "Helping Your ADHD Child Make and Keep Friends",
        "url": "https://www.adhdfoundation.org.uk/",
        "blurb": "Social misreads and impulsivity make friendships extra-hard. Coachable scripts and play-date scaffolds help.",
        "tags": ["social", "friendships", "ages-5-12"],
    },
    {
        "id": "additude-mindfulness",
        "source": "ADDitude",
        "title": "Mindfulness for ADHD Kids: The 5-Minute Reset",
        "url": "https://www.additudemag.com/mindfulness-for-kids-with-adhd/",
        "blurb": "Research-backed micro-practices that build the focus muscle without asking your kid to 'just sit still'.",
        "tags": ["mindfulness", "regulation", "all-ages"],
    },
]


def article_by_id(article_id: str) -> dict | None:
    return next((a for a in CURATED_ARTICLES if a["id"] == article_id), None)


def pick_article_for_parent(seen_ids: list[str]) -> dict:
    """Pick the first article the parent hasn't seen. Rotates back to start once
    the full library has cycled."""
    unseen = [a for a in CURATED_ARTICLES if a["id"] not in (seen_ids or [])]
    return (unseen or CURATED_ARTICLES)[0]
