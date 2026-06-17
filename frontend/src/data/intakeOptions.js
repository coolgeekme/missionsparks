/**
 * Vanderbilt-style parent ADHD screen — 18 items, 0–3 Likert.
 *
 * This is a simplified parent-report instrument inspired by the AAP-endorsed
 * NICHQ Vanderbilt Diagnostic Rating Scale (Wolraich 2003). It is NOT a
 * diagnostic tool — clinicians use the full Vanderbilt with comorbidity and
 * performance items. We use this short form purely to give the AI mission
 * drafter a sense of profile leaning.
 */
export const VANDERBILT_SCALE = [
    { value: 0, label: "Never" },
    { value: 1, label: "Occasionally" },
    { value: 2, label: "Often" },
    { value: 3, label: "Very often" },
];

export const VANDERBILT_INATTENTION = [
    "Fails to give close attention to details or makes careless mistakes in schoolwork",
    "Has difficulty sustaining attention to tasks or activities",
    "Does not seem to listen when spoken to directly",
    "Does not follow through on instructions and fails to finish schoolwork (not due to defiance)",
    "Has difficulty organizing tasks and activities",
    "Avoids, dislikes, or is reluctant to engage in tasks that require sustained mental effort",
    "Loses things necessary for tasks or activities (school assignments, pencils, books)",
    "Is easily distracted by extraneous stimuli",
    "Is forgetful in daily activities",
];

export const VANDERBILT_HYPERACTIVITY = [
    "Fidgets with hands or feet or squirms in seat",
    "Leaves seat in classroom or in other situations in which remaining seated is expected",
    "Runs about or climbs excessively in situations in which it is inappropriate",
    "Has difficulty playing or engaging in leisure activities quietly",
    "Is 'on the go' or often acts as if 'driven by a motor'",
    "Talks excessively",
    "Blurts out answers before questions have been completed",
    "Has difficulty awaiting turn",
    "Interrupts or intrudes on others (e.g., butts into conversations or games)",
];

/**
 * Suggested-domain dropdowns. Free-text-style chips the parent can pick from
 * or add to. Sourced from common ADHD parent-coaching scaffolds + our own
 * citation library (sensory: Ghanizadeh; sleep: Hvolby; reward: Luman).
 */
export const SUGGESTED_INTERESTS = [
    "minecraft", "dinosaurs", "sports", "drawing", "lego",
    "video games", "music", "reading", "animals", "space",
    "cooking", "building", "crafts", "puzzles", "outdoors",
];

export const SUGGESTED_SENSITIVITIES = [
    "loud noises", "bright lights", "clothing textures",
    "smells", "crowds", "unexpected change", "being touched",
    "strong flavors", "temperature",
];

export const SUGGESTED_TRIGGERS = [
    "hunger", "tiredness", "screen time ending",
    "homework", "math", "reading aloud", "writing",
    "transitions", "peer conflict", "time pressure",
];

export const SUGGESTED_STRENGTHS = [
    "creative", "curious", "kind", "funny", "persistent",
    "empathetic", "observant", "loyal", "energetic", "imaginative",
];

export const SUGGESTED_MOTIVATORS = [
    "praise", "small rewards", "stickers", "screen time",
    "one-on-one time", "novelty", "choosing the next activity",
    "movement breaks", "leveling up",
];

export const PEAK_HOUR_OPTIONS = [
    { value: "early_morning", label: "Early morning" },
    { value: "morning", label: "Morning" },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening", label: "Evening" },
];

export const ADHD_SUBTYPE_OPTIONS = [
    { value: "combined", label: "Combined" },
    { value: "inattentive", label: "Inattentive" },
    { value: "hyperactive", label: "Hyperactive-impulsive" },
    { value: "uncertain", label: "Not sure / not diagnosed" },
];

export const READING_LEVEL_OPTIONS = [
    { value: "below", label: "Below grade level" },
    { value: "on", label: "On grade level" },
    { value: "above", label: "Above grade level" },
];

export const GRADE_OPTIONS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
