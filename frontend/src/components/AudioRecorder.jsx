import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Trash2, Play, Pause } from "lucide-react";
import { api } from "../lib/api";

const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Reusable audio recorder.
 * Props:
 *   onParsed({ transcript, audio_data, audio_mime, parsed }) — called after upload+parse
 *   maxSeconds (default 120)
 */
export default function AudioRecorder({ onParsed, maxSeconds = 120, autoUpload = true }) {
    const [supported, setSupported] = useState(true);
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [blob, setBlob] = useState(null);
    const [blobUrl, setBlobUrl] = useState(null);
    const [playing, setPlaying] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState("");

    const mediaRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const streamRef = useRef(null);
    const audioRef = useRef(null);

    useEffect(() => {
        if (!navigator.mediaDevices || !window.MediaRecorder) setSupported(false);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const start = async () => {
        setErr("");
        setBlob(null);
        setBlobUrl(null);
        setElapsed(0);
        chunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
                MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
            const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            mediaRef.current = mr;
            mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                const b = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
                setBlob(b);
                setBlobUrl(URL.createObjectURL(b));
                if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            };
            mr.start();
            setRecording(true);
            timerRef.current = setInterval(() => {
                setElapsed((e) => {
                    if (e + 1 >= maxSeconds) {
                        if (mediaRef.current && mediaRef.current.state === "recording") mediaRef.current.stop();
                        clearInterval(timerRef.current);
                        setRecording(false);
                        return maxSeconds;
                    }
                    return e + 1;
                });
            }, 1000);
        } catch (e) {
            setErr("Couldn't access your microphone. Check browser permissions.");
            setRecording(false);
        }
    };

    const stop = () => {
        if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
    };

    const togglePlay = () => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) { a.play(); setPlaying(true); }
        else { a.pause(); setPlaying(false); }
    };

    const reset = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        setBlob(null);
        setBlobUrl(null);
        setElapsed(0);
        setErr("");
    };

    const upload = async () => {
        if (!blob || !onParsed) return;
        setUploading(true);
        setErr("");
        try {
            const fd = new FormData();
            const ext = (blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : "webm");
            fd.append("audio", blob, `moment.${ext}`);
            const { data } = await api.post("/moments/parse-audio", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            onParsed(data);
        } catch (e) {
            const msg = e.response?.data?.detail || e.message;
            setErr(typeof msg === "string" ? msg : "Could not process audio.");
        } finally {
            setUploading(false);
        }
    };

    // Auto-upload after recording stops if requested.
    useEffect(() => {
        if (blob && autoUpload && onParsed && !uploading) {
            upload();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blob]);

    if (!supported) {
        return (
            <div className="rounded-2xl border-2 border-[#EF476F] bg-[#EF476F]/10 p-4 text-sm font-bold text-[#9b1c3c]" data-testid="audio-not-supported">
                Voice recording isn't supported in this browser. Try Chrome, Edge, or Safari.
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="audio-recorder">
            {!blob && !recording && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={start}
                        className="h-24 w-24 mx-auto rounded-full bg-[#EF476F] text-white shadow-[0_8px_0_0_#a82a4d] hover:translate-y-[-2px] hover:shadow-[0_10px_0_0_#a82a4d] active:translate-y-1 active:shadow-[0_2px_0_0_#a82a4d] transition-all flex items-center justify-center"
                        data-testid="audio-record-start"
                        aria-label="Start recording"
                    >
                        <Mic size={36} />
                    </button>
                    <p className="text-sm font-bold text-[#4A5568] mt-3">Tap to start recording</p>
                    <p className="text-xs text-[#A0AEC0] mt-1">Up to {fmt(maxSeconds)}. Speak naturally — AI will fill in the details.</p>
                </div>
            )}

            {recording && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={stop}
                        className="h-24 w-24 mx-auto rounded-full bg-[#EF476F] text-white animate-pulse flex items-center justify-center shadow-[0_8px_0_0_#a82a4d]"
                        data-testid="audio-record-stop"
                        aria-label="Stop recording"
                    >
                        <Square size={28} fill="currentColor" />
                    </button>
                    <p className="font-display font-extrabold text-3xl text-[#EF476F] mt-3" data-testid="audio-elapsed">{fmt(elapsed)}</p>
                    <p className="text-sm font-bold text-[#4A5568]">Recording… tap to stop</p>
                </div>
            )}

            {blob && !uploading && (
                <div className="rounded-2xl border-2 border-[#E2E8F0] bg-white p-4" data-testid="audio-preview">
                    <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="btn-pop-ghost p-3" aria-label={playing ? "pause" : "play"} data-testid="audio-play">
                            {playing ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <audio
                            ref={audioRef}
                            src={blobUrl}
                            onEnded={() => setPlaying(false)}
                            preload="metadata"
                            className="flex-1"
                            controls
                            data-testid="audio-element"
                        />
                        <button onClick={reset} className="p-2 rounded-xl hover:bg-[#EF476F]/10" aria-label="discard" data-testid="audio-discard">
                            <Trash2 size={16} className="text-[#EF476F]" />
                        </button>
                    </div>
                    {!autoUpload && (
                        <button onClick={upload} className="btn-pop-primary w-full mt-3" data-testid="audio-upload">
                            ✨ Use this recording
                        </button>
                    )}
                </div>
            )}

            {uploading && (
                <div className="flex items-center justify-center gap-3 rounded-2xl border-2 border-[#4361EE] bg-[#F0F8FF] p-5" data-testid="audio-uploading">
                    <Loader2 className="animate-spin text-[#4361EE]" />
                    <p className="font-bold text-[#0B132B]">Listening + understanding… (5–15 sec)</p>
                </div>
            )}

            {err && <p className="text-sm font-bold text-[#EF476F] bg-[#EF476F]/10 rounded-xl px-3 py-2" data-testid="audio-error">{err}</p>}
        </div>
    );
}
