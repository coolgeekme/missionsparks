// Mini-game registry. Each entry exports a default React component with
// signature: ({ onComplete, content? }) => JSX, where onComplete(score:number)
// is called when the game ends. Pack-customizable games accept a `content` prop.
import WordMatch from "./WordMatch";
import MemoryCards from "./MemoryCards";
import ReactionTap from "./ReactionTap";
import BreathingBubble from "./BreathingBubble";
import DotConnect from "./DotConnect";
import SentenceBuilder from "./SentenceBuilder";

export const GAMES = [
    { key: "word-match", packType: "word_match", customizable: true, name: "Word Match", emoji: "🔤", blurb: "Match words to their meanings.", color: "#E4572E", tag: "Vocabulary", component: WordMatch },
    { key: "memory-cards", packType: "memory_cards", customizable: true, name: "Memory Cards", emoji: "🧠", blurb: "Flip and find matching pairs.", color: "#3F8C5E", tag: "Working memory", component: MemoryCards },
    { key: "sentence-builder", packType: "sentence_builder", customizable: true, name: "Sentence Builder", emoji: "📝", blurb: "Drag words into the right order.", color: "#BC4B32", tag: "Reading", component: SentenceBuilder },
    { key: "reaction-tap", packType: null, customizable: false, name: "Reaction Tap", emoji: "⚡", blurb: "Tap the target as fast as you can!", color: "#E8A33D", tag: "Focus", component: ReactionTap },
    { key: "dot-connect", packType: null, customizable: false, name: "Dot Connect", emoji: "🔢", blurb: "Connect the dots in order — length varies each round.", color: "#C4471F", tag: "Planning", component: DotConnect },
    { key: "breathing", packType: null, customizable: false, name: "Breathing Bubble", emoji: "🫧", blurb: "60 seconds of calm breaths.", color: "#3F8C5E", tag: "Calm", component: BreathingBubble },
];

export const findGame = (key) => GAMES.find((g) => g.key === key);

export const findGameByPackType = (packType) => GAMES.find((g) => g.packType === packType);
