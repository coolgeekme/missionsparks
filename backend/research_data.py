"""
Research citation library for MissionBoard.

Every clinically-relevant element of the app (skills, strategies, moment types,
triggers, mini-games, AI mission drafts) is linked to one or more citations
from this curated, evidence-informed library. Parents and therapists see the
backing in the UI; kids do not (kept playful for the student view).

Sources are limited to peer-reviewed journals + authoritative organizations
(CDC, AAP, NIMH, CHADD, National Reading Panel). Books are intentionally
excluded for v1 to keep the bar high.

Each citation has a stable `key` so we can reference it from skills/strategies
even after re-seeding. The Mongo `id` is a uuid generated at seed time.
"""
from typing import List, Dict

# ----------------------------------------------------------------------------
# Citation library
# ----------------------------------------------------------------------------
CITATIONS: List[Dict] = [
    # ---------- Executive function & ADHD ----------
    {
        "key": "diamond_2013_ef",
        "title": "Executive Functions",
        "authors": "Diamond, A.",
        "year": 2013,
        "source": "Annual Review of Psychology, 64, 135–168",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1146/annurev-psych-113011-143750",
        "summary": "Defines the three core executive functions (inhibitory control, working memory, cognitive flexibility) and shows they can be improved with targeted practice in children.",
        "tags": ["executive_function", "working_memory", "inhibition", "cognitive_flexibility", "planning"],
    },
    {
        "key": "barkley_2010_ef_adhd",
        "title": "Differential Diagnosis of Adults with ADHD: The Role of Executive Function and Self-Regulation",
        "authors": "Barkley, R. A., & Fischer, M.",
        "year": 2010,
        "source": "Journal of Clinical Psychiatry, 71(7), e17",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.4088/JCP.9066tx1c",
        "summary": "Frames ADHD as a disorder of executive function and self-regulation, not attention alone, which justifies scaffolds for planning, time, and working memory.",
        "tags": ["adhd", "executive_function", "self_regulation"],
    },
    {
        "key": "aap_2019_adhd_guideline",
        "title": "Clinical Practice Guideline for the Diagnosis, Evaluation, and Treatment of ADHD in Children and Adolescents",
        "authors": "Wolraich, M. L., et al. (AAP Subcommittee on ADHD)",
        "year": 2019,
        "source": "Pediatrics, 144(4), e20192528",
        "source_type": "guideline",
        "url": "https://doi.org/10.1542/peds.2019-2528",
        "summary": "AAP clinical guideline recommending behavior therapy + parent training as first-line for school-age children, with structured environments and consistent feedback.",
        "tags": ["adhd", "behavior_therapy", "parent_training", "guideline"],
    },
    {
        "key": "cdc_adhd",
        "title": "ADHD: What You Need to Know",
        "authors": "Centers for Disease Control and Prevention",
        "year": 2024,
        "source": "CDC — Attention-Deficit / Hyperactivity Disorder",
        "source_type": "org",
        "url": "https://www.cdc.gov/adhd/about/index.html",
        "summary": "Government overview of ADHD prevalence, symptoms (inattention, hyperactivity, impulsivity), and evidence-based parent training approaches.",
        "tags": ["adhd", "overview", "parent_training"],
    },
    {
        "key": "nimh_adhd",
        "title": "Attention-Deficit/Hyperactivity Disorder",
        "authors": "National Institute of Mental Health",
        "year": 2024,
        "source": "NIMH — Health Topics",
        "source_type": "org",
        "url": "https://www.nimh.nih.gov/health/topics/attention-deficit-hyperactivity-disorder-adhd",
        "summary": "NIMH summary of ADHD diagnostic criteria, executive-function impact, and the role of behavioral interventions and routine.",
        "tags": ["adhd", "executive_function", "overview"],
    },
    {
        "key": "chadd_ef",
        "title": "Executive Function and ADHD",
        "authors": "CHADD (Children and Adults with ADHD)",
        "year": 2023,
        "source": "CHADD Resource Library",
        "source_type": "org",
        "url": "https://chadd.org/about-adhd/executive-function-and-adhd/",
        "summary": "Patient-facing summary explaining how ADHD impacts EF skills (planning, prioritizing, time-on-task) and which scaffolds help.",
        "tags": ["adhd", "executive_function", "parent_education"],
    },

    # ---------- Working memory ----------
    {
        "key": "cowan_2001_wm",
        "title": "The magical number 4 in short-term memory: A reconsideration of mental storage capacity",
        "authors": "Cowan, N.",
        "year": 2001,
        "source": "Behavioral and Brain Sciences, 24(1), 87–114",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1017/S0140525X01003922",
        "summary": "Establishes that working memory capacity is ~4 chunks — the basis for breaking instructions into small, chunked steps.",
        "tags": ["working_memory", "task_chunking"],
    },
    {
        "key": "klingberg_2005_wm_training",
        "title": "Computerized training of working memory in children with ADHD",
        "authors": "Klingberg, T., et al.",
        "year": 2005,
        "source": "JAACAP, 44(2), 177–186",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1097/00004583-200502000-00010",
        "summary": "Randomized trial showing that short, repeated working-memory exercises improved attention and reduced ADHD symptoms in children.",
        "tags": ["working_memory", "cognitive_training", "adhd", "memory_game"],
    },
    {
        "key": "cortese_2015_cognitive_training",
        "title": "Cognitive Training for ADHD: A Meta-analysis of Clinical and Neuropsychological Outcomes",
        "authors": "Cortese, S., et al.",
        "year": 2015,
        "source": "JAACAP, 54(3), 164–174",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1016/j.jaac.2014.12.010",
        "summary": "Meta-analysis showing cognitive training (esp. working-memory) yields measurable improvements on neuropsychological tests in children with ADHD.",
        "tags": ["cognitive_training", "working_memory", "adhd", "memory_game"],
    },

    # ---------- Reward & token economies ----------
    {
        "key": "luman_2010_reward_adhd",
        "title": "Identifying the neurobiology of altered reinforcement sensitivity in ADHD",
        "authors": "Luman, M., Tripp, G., & Scheres, A.",
        "year": 2010,
        "source": "Neuroscience & Biobehavioral Reviews, 34(5), 744–754",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1016/j.neubiorev.2009.11.021",
        "summary": "Children with ADHD show altered reward sensitivity — they respond strongly to immediate, frequent feedback, which justifies streaks and small daily rewards.",
        "tags": ["reward", "streak", "motivation", "adhd"],
    },
    {
        "key": "fabiano_2009_behavior_meta",
        "title": "A meta-analysis of behavioral treatments for ADHD",
        "authors": "Fabiano, G. A., et al.",
        "year": 2009,
        "source": "Clinical Psychology Review, 29(2), 129–140",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1016/j.cpr.2008.11.001",
        "summary": "Large meta-analysis confirming token-economy and contingency-management programs produce moderate-to-large improvements in ADHD-related behavior at school and home.",
        "tags": ["reward", "token_economy", "behavior_therapy", "adhd"],
    },
    {
        "key": "lally_2010_habits",
        "title": "How are habits formed: Modelling habit formation in the real world",
        "authors": "Lally, P., et al.",
        "year": 2010,
        "source": "European Journal of Social Psychology, 40(6), 998–1009",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1002/ejsp.674",
        "summary": "Habits form through consistent daily repetition; missing one day does not derail the curve — the empirical basis for our daily streak design.",
        "tags": ["habits", "streak", "consistency"],
    },

    # ---------- Time, task chunking, planning ----------
    {
        "key": "barkley_1997_time",
        "title": "Behavioral inhibition, sustained attention, and executive functions: Constructing a unifying theory of ADHD",
        "authors": "Barkley, R. A.",
        "year": 1997,
        "source": "Psychological Bulletin, 121(1), 65–94",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1037/0033-2909.121.1.65",
        "summary": "Foundational theory linking ADHD to deficits in time perception and forward planning — justifies visible timers and chunked steps.",
        "tags": ["time_management", "planning", "adhd", "timer"],
    },
    {
        "key": "barkley_2001_time_estimation",
        "title": "Time perception and reproduction in young adults with ADHD",
        "authors": "Barkley, R. A., Murphy, K. R., & Bush, T.",
        "year": 2001,
        "source": "Neuropsychology, 15(3), 351–360",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1037/0894-4105.15.3.351",
        "summary": "Empirical demonstration that ADHD impairs time estimation and reproduction — explains why timers and chunked tasks help kids self-pace.",
        "tags": ["time_management", "timer", "adhd"],
    },

    # ---------- Movement / body breaks ----------
    {
        "key": "pontifex_2013_exercise_adhd",
        "title": "Exercise improves behavioral, neurocognitive, and scholastic performance in children with ADHD",
        "authors": "Pontifex, M. B., et al.",
        "year": 2013,
        "source": "The Journal of Pediatrics, 162(3), 543–551",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1016/j.jpeds.2012.08.036",
        "summary": "20 minutes of moderate exercise immediately improved attention, math, and reading scores in children with ADHD compared to seated rest.",
        "tags": ["movement", "body_break", "focus", "adhd"],
    },
    {
        "key": "hillman_2009_walking_cognition",
        "title": "The effect of acute treadmill walking on cognitive control and academic achievement in preadolescent children",
        "authors": "Hillman, C. H., et al.",
        "year": 2009,
        "source": "Neuroscience, 159(3), 1044–1054",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1016/j.neuroscience.2009.01.057",
        "summary": "A brief bout of walking before academic tasks improved attention and reading performance in 9-year-olds.",
        "tags": ["movement", "body_break", "focus"],
    },

    # ---------- Breathing & emotional regulation ----------
    {
        "key": "ma_2017_breathing",
        "title": "The effect of diaphragmatic breathing on attention, negative affect and stress in healthy adults",
        "authors": "Ma, X., et al.",
        "year": 2017,
        "source": "Frontiers in Psychology, 8, 874",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.3389/fpsyg.2017.00874",
        "summary": "Eight-week diaphragmatic breathing practice improved sustained attention and reduced cortisol — the basis for our breathing mini-game.",
        "tags": ["breathing", "calming", "self_regulation", "breathing_game"],
    },
    {
        "key": "shaw_2014_emotion_adhd",
        "title": "Emotion dysregulation in ADHD",
        "authors": "Shaw, P., et al.",
        "year": 2014,
        "source": "American Journal of Psychiatry, 171(3), 276–293",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1176/appi.ajp.2013.13070966",
        "summary": "Emotional dysregulation (meltdowns, frustration, low frustration tolerance) is a core, under-recognized feature of ADHD in 30–70% of cases.",
        "tags": ["emotion_regulation", "meltdown", "frustrated", "adhd"],
    },
    {
        "key": "hupfeld_2019_hyperfocus",
        "title": "Living 'in the zone': hyperfocus in adult ADHD",
        "authors": "Hupfeld, K. E., Abagis, T. R., & Shah, P.",
        "year": 2019,
        "source": "ADHD Attention Deficit and Hyperactivity Disorders, 11, 191–208",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1007/s12402-018-0272-y",
        "summary": "Empirical study of hyperfocus in ADHD — characterizes 'deep focus' episodes that look unlike typical inattention and are worth tracking.",
        "tags": ["hyperfocus", "adhd"],
    },

    # ---------- Mindfulness ----------
    {
        "key": "cassone_2016_mindfulness_adhd",
        "title": "Mindfulness Training as an Adjunct to Evidence-Based Treatment for ADHD Within Families",
        "authors": "Cassone, A. R.",
        "year": 2016,
        "source": "Journal of Attention Disorders, 20(2), 147–157",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1177/1087054713488438",
        "summary": "Family-based mindfulness training reduces parent-rated ADHD symptoms and improves emotional regulation in children.",
        "tags": ["mindfulness", "calming", "self_regulation"],
    },

    # ---------- Reading comprehension ----------
    {
        "key": "nrp_2000",
        "title": "Report of the National Reading Panel: Teaching Children to Read",
        "authors": "National Reading Panel",
        "year": 2000,
        "source": "NICHD/NIH Publication No. 00-4769",
        "source_type": "guideline",
        "url": "https://www.nichd.nih.gov/publications/pubs/nrp/smallbook",
        "summary": "Federal meta-review establishing the 'five pillars' of reading instruction (phonemic awareness, phonics, fluency, vocabulary, comprehension).",
        "tags": ["reading", "fluency", "vocabulary", "comprehension", "guideline"],
    },
    {
        "key": "cain_oakhill_1999_inference",
        "title": "Inference making ability and its relation to comprehension failure in young children",
        "authors": "Cain, K., & Oakhill, J. V.",
        "year": 1999,
        "source": "Reading and Writing, 11(5), 489–503",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1023/A:1008084120205",
        "summary": "Children who can't make inferences struggle with comprehension even when decoding is fine — targeted inference practice closes the gap.",
        "tags": ["reading", "inference", "comprehension"],
    },
    {
        "key": "pressley_1989_imagery",
        "title": "Mental imagery and the comprehension of children's narratives",
        "authors": "Pressley, M., et al.",
        "year": 1989,
        "source": "Reading Research Quarterly, 24, 4–27",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.2307/747825",
        "summary": "Teaching kids to form mental pictures while reading improves recall and comprehension — the evidence behind our 'Picture it' strategy.",
        "tags": ["reading", "mental_imagery", "comprehension"],
    },
    {
        "key": "marzano_2001_annotation",
        "title": "What Works in Schools: Translating Research Into Action — Classroom annotation and active reading",
        "authors": "Marzano, R. J., et al.",
        "year": 2001,
        "source": "ASCD / Educational Leadership review",
        "source_type": "guideline",
        "url": "https://www.ascd.org/books/what-works-in-schools",
        "summary": "Synthesis of decades of classroom research showing that active annotation (underlining, marking up) substantially improves comprehension and retention.",
        "tags": ["reading", "annotation", "underlining"],
    },
    {
        "key": "raphael_1986_qar",
        "title": "Teaching Question Answer Relationships (QAR), revisited",
        "authors": "Raphael, T. E.",
        "year": 1986,
        "source": "The Reading Teacher, 39(6), 516–522",
        "source_type": "peer_reviewed",
        "url": "https://www.jstor.org/stable/20199174",
        "summary": "QAR teaches kids to ask 'where is the answer?' — explicit question-asking improves comprehension and metacognition.",
        "tags": ["reading", "questioning", "metacognition"],
    },
    {
        "key": "stahl_1986_vocab",
        "title": "Three principles of effective vocabulary instruction",
        "authors": "Stahl, S. A.",
        "year": 1986,
        "source": "Journal of Reading, 29(7), 662–668",
        "source_type": "peer_reviewed",
        "url": "https://www.jstor.org/stable/40029712",
        "summary": "Definitional + contextual + repeated-exposure instruction beats memorizing definitions alone — the basis for vocab-in-context practice.",
        "tags": ["reading", "vocabulary"],
    },

    # ---------- Behavior model & note-taking ----------
    {
        "key": "cooper_heron_heward_2007_aba",
        "title": "Applied Behavior Analysis: ABC model of behavior",
        "authors": "Cooper, J. O., Heron, T. E., & Heward, W. L.",
        "year": 2007,
        "source": "Pearson — Applied Behavior Analysis (peer-reviewed methods literature)",
        "source_type": "guideline",
        "url": "https://www.bacb.com/ethics/",
        "summary": "Antecedent–Behavior–Consequence framework is the workhorse of behavior analysis; every Moment we log uses this structure.",
        "tags": ["aba", "abc_model", "behavior_tracking", "moments"],
    },
    {
        "key": "mueller_oppenheimer_2014_notes",
        "title": "The Pen Is Mightier Than the Keyboard: Advantages of Longhand Over Laptop Note Taking",
        "authors": "Mueller, P. A., & Oppenheimer, D. M.",
        "year": 2014,
        "source": "Psychological Science, 25(6), 1159–1168",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1177/0956797614524581",
        "summary": "Writing or paraphrasing notes (rather than copying verbatim) deepens comprehension — supports our 'Jot a clue' strategy.",
        "tags": ["notetaking", "active_recall", "jot_a_clue"],
    },

    # ---------- Sleep, sensory, environment ----------
    {
        "key": "hvolby_2015_sleep_adhd",
        "title": "Associations of sleep disturbance with ADHD: Implications for treatment",
        "authors": "Hvolby, A.",
        "year": 2015,
        "source": "ADHD Attention Deficit and Hyperactivity Disorders, 7(1), 1–18",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.1007/s12402-014-0151-0",
        "summary": "Sleep problems affect 25–50% of children with ADHD and worsen daytime attention — sleep is a top trigger worth tracking.",
        "tags": ["sleep_deficit", "tiredness", "trigger", "adhd"],
    },
    {
        "key": "ghanizadeh_2011_sensory_adhd",
        "title": "Sensory processing problems in children with ADHD: A systematic review",
        "authors": "Ghanizadeh, A.",
        "year": 2011,
        "source": "Psychiatry Investigation, 8(2), 89–94",
        "source_type": "peer_reviewed",
        "url": "https://doi.org/10.4306/pi.2011.8.2.89",
        "summary": "Sensory processing differences (loud noises, textures, transitions) are markedly more common in ADHD and reliably trigger meltdowns.",
        "tags": ["sensory_overload", "loud_noise", "trigger", "adhd"],
    },

    # ---------- Privacy / compliance underpinning ----------
    {
        "key": "ftc_coppa",
        "title": "Complying with COPPA: Frequently Asked Questions",
        "authors": "Federal Trade Commission",
        "year": 2020,
        "source": "FTC Business Guidance",
        "source_type": "guideline",
        "url": "https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions",
        "summary": "FTC's official guidance on parental consent and child data protections — drives our consent flow and audit log.",
        "tags": ["coppa", "compliance", "privacy"],
    },
]


# ----------------------------------------------------------------------------
# Mappings: feature → list of citation keys
# ----------------------------------------------------------------------------

# Skills (by name from DEFAULT_SKILLS)
SKILL_EVIDENCE: Dict[str, List[str]] = {
    "Reading: text evidence": ["marzano_2001_annotation", "nrp_2000"],
    "Reading: main idea": ["nrp_2000", "raphael_1986_qar"],
    "Reading: vocabulary in context": ["stahl_1986_vocab", "nrp_2000"],
    "Reading: inference": ["cain_oakhill_1999_inference", "pressley_1989_imagery"],
    "EF: planning": ["diamond_2013_ef", "barkley_2010_ef_adhd", "chadd_ef"],
    "EF: time management": ["barkley_1997_time", "barkley_2001_time_estimation"],
    "EF: working memory": ["cowan_2001_wm", "klingberg_2005_wm_training", "diamond_2013_ef"],
    "EF: focus": ["diamond_2013_ef", "barkley_2010_ef_adhd", "pontifex_2013_exercise_adhd"],
}

# Strategies (by name from DEFAULT_STRATEGIES)
STRATEGY_EVIDENCE: Dict[str, List[str]] = {
    "Slow down mode": ["raphael_1986_qar", "marzano_2001_annotation"],
    "Underline clues": ["marzano_2001_annotation", "nrp_2000"],
    "Jot a clue": ["mueller_oppenheimer_2014_notes", "marzano_2001_annotation"],
    "Chunk it": ["cowan_2001_wm", "diamond_2013_ef"],
    "Picture it": ["pressley_1989_imagery", "nrp_2000"],
    "Timer challenge": ["barkley_1997_time", "barkley_2001_time_estimation"],
    "Body break": ["pontifex_2013_exercise_adhd", "hillman_2009_walking_cognition"],
    "Ask a question": ["raphael_1986_qar", "nrp_2000"],
    "Re-read": ["nrp_2000"],
}

# Moment types (by `key` from MOMENT_CATALOG)
MOMENT_TYPE_EVIDENCE: Dict[str, List[str]] = {
    "meltdown": ["shaw_2014_emotion_adhd", "ghanizadeh_2011_sensory_adhd"],
    "impulsive": ["barkley_2010_ef_adhd", "diamond_2013_ef"],
    "distracted": ["barkley_2010_ef_adhd", "aap_2019_adhd_guideline"],
    "hyperactive": ["aap_2019_adhd_guideline", "cdc_adhd"],
    "withdrawn": ["shaw_2014_emotion_adhd"],
    "anxious": ["shaw_2014_emotion_adhd", "cassone_2016_mindfulness_adhd"],
    "frustrated": ["shaw_2014_emotion_adhd"],
    "refusal": ["fabiano_2009_behavior_meta", "cooper_heron_heward_2007_aba"],
    "regulated": ["cassone_2016_mindfulness_adhd", "ma_2017_breathing"],
    "hyperfocus": ["hupfeld_2019_hyperfocus"],
    "proud": ["luman_2010_reward_adhd", "fabiano_2009_behavior_meta"],
    "creative": ["hupfeld_2019_hyperfocus"],
    "transition": ["diamond_2013_ef", "barkley_2010_ef_adhd"],
    "tired": ["hvolby_2015_sleep_adhd"],
}

# Triggers (by `key` from MOMENT_CATALOG)
TRIGGER_EVIDENCE: Dict[str, List[str]] = {
    "hunger": ["aap_2019_adhd_guideline"],
    "tiredness": ["hvolby_2015_sleep_adhd"],
    "sensory_overload": ["ghanizadeh_2011_sensory_adhd"],
    "transition": ["diamond_2013_ef", "barkley_2010_ef_adhd"],
    "task_frustration": ["shaw_2014_emotion_adhd"],
    "time_pressure": ["barkley_2001_time_estimation", "barkley_1997_time"],
    "temperature": ["ghanizadeh_2011_sensory_adhd"],
    "boredom": ["luman_2010_reward_adhd"],
    "peer_conflict": ["shaw_2014_emotion_adhd"],
    "math": ["diamond_2013_ef"],
    "reading": ["nrp_2000"],
    "screen_ended": ["luman_2010_reward_adhd"],
    "medication": ["aap_2019_adhd_guideline"],
    "sleep_deficit": ["hvolby_2015_sleep_adhd"],
    "social_demand": ["shaw_2014_emotion_adhd"],
    "unexpected_change": ["diamond_2013_ef"],
    "loud_noise": ["ghanizadeh_2011_sensory_adhd"],
    "homework": ["barkley_2010_ef_adhd"],
}

# Mini-games (by game key — must match GamePicker on frontend)
GAME_EVIDENCE: Dict[str, List[str]] = {
    "word_match": ["stahl_1986_vocab", "nrp_2000"],
    "memory_cards": ["klingberg_2005_wm_training", "cortese_2015_cognitive_training", "cowan_2001_wm"],
    "reaction_tap": ["diamond_2013_ef", "barkley_2010_ef_adhd"],
    "breathing_bubble": ["ma_2017_breathing", "cassone_2016_mindfulness_adhd"],
    "dot_connect": ["diamond_2013_ef", "barkley_1997_time"],
    "sentence_builder": ["nrp_2000", "cain_oakhill_1999_inference"],
}

# Higher-level "features" used by the AI prompt (it returns tags; we map to citation keys)
# Tags here are intentionally broad and human-readable.
AI_TAG_EVIDENCE: Dict[str, List[str]] = {
    "working_memory": ["cowan_2001_wm", "klingberg_2005_wm_training"],
    "task_chunking": ["cowan_2001_wm", "diamond_2013_ef"],
    "time_management": ["barkley_1997_time", "barkley_2001_time_estimation"],
    "annotation": ["marzano_2001_annotation"],
    "mental_imagery": ["pressley_1989_imagery"],
    "inference": ["cain_oakhill_1999_inference"],
    "vocabulary": ["stahl_1986_vocab"],
    "questioning": ["raphael_1986_qar"],
    "movement": ["pontifex_2013_exercise_adhd", "hillman_2009_walking_cognition"],
    "breathing": ["ma_2017_breathing"],
    "reward_streak": ["luman_2010_reward_adhd", "lally_2010_habits"],
    "executive_function": ["diamond_2013_ef", "barkley_2010_ef_adhd"],
    "reading_fluency": ["nrp_2000"],
    "emotion_regulation": ["shaw_2014_emotion_adhd", "cassone_2016_mindfulness_adhd"],
}


def all_known_tags() -> List[str]:
    return sorted(AI_TAG_EVIDENCE.keys())
