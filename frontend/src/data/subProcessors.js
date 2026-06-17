/**
 * Sub-processors — current list of third-party services that may process
 * MissionSparks customer data. Add or remove entries here as the vendor
 * stack changes. The Privacy Policy links to this page rather than naming
 * vendors inline, so updates here don't require a policy revision.
 *
 * Categories:
 *   ai_text         — text generation (mission drafting, structured extraction)
 *   ai_voice        — speech-to-text transcription
 *   ai_image        — image / video generation (none in use yet)
 *   infrastructure  — hosting, database, CDN
 *   communications  — email, SMS, push
 *
 * Last reviewed: Feb 2026
 */
export const SUB_PROCESSORS = [
    {
        vendor: "Anthropic",
        product: "Claude (Sonnet)",
        category: "ai_text",
        purpose: "AI mission drafting; turning a parent's prompt into a chunked, time-boxed mission. Also used to extract structured fields from voice-note transcripts.",
        data_shared: "Parent's prompt text, student profile notes, and voice transcripts.",
        region: "United States",
        baa: false,
        added: "Feb 2026",
        url: "https://www.anthropic.com/legal/privacy",
    },
    {
        vendor: "OpenAI",
        product: "Whisper API",
        category: "ai_voice",
        purpose: "Transcribing parent or student voice notes into text for the Moments tracker.",
        data_shared: "The raw audio recording. (Audio is deleted from our servers after transcription if the user has the default 'Discard audio after transcription' setting enabled.)",
        region: "United States",
        baa: false,
        added: "Feb 2026",
        url: "https://openai.com/policies/privacy-policy",
    },
    {
        vendor: "MongoDB",
        product: "Atlas (managed database)",
        category: "infrastructure",
        purpose: "Primary application database — stores accounts, missions, moments, citations, audit log.",
        data_shared: "All application data (encrypted at rest by MongoDB).",
        region: "United States",
        baa: false,
        added: "Feb 2026",
        url: "https://www.mongodb.com/legal/privacy-policy",
    },
];

export const CATEGORY_LABEL = {
    ai_text: "AI · Text generation",
    ai_voice: "AI · Voice transcription",
    ai_image: "AI · Image/Video generation",
    infrastructure: "Infrastructure",
    communications: "Communications",
};

export const CATEGORY_TONE = {
    ai_text: "bg-[#4361EE]/10 text-[#4361EE]",
    ai_voice: "bg-[#06D6A0]/15 text-[#057a5b]",
    ai_image: "bg-[#EF476F]/10 text-[#EF476F]",
    infrastructure: "bg-[#0B132B] text-white",
    communications: "bg-[#FFD166]/40 text-[#876200]",
};
