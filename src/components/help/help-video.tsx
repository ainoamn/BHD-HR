"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Maximize, Minimize, Play, Volume2, VolumeX } from "lucide-react";
import type { HelpVideo as Video } from "@/lib/help";
import { cn } from "@/lib/utils";
import { useLang } from "../lang-provider";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Best voice for the language: an Omani or Gulf voice, then a natural/online one, then any. */
function pickVoice(lang: "ar" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  if (!voices.length) return null;
  const score = (voice: SpeechSynthesisVoice) => {
    const name = `${voice.name} ${voice.lang}`.toLowerCase();
    let value = 0;
    if (lang === "ar" && /om|sa|ae|kw|qa|bh/.test(voice.lang.toLowerCase().split("-")[1] || "")) value += 4;
    if (lang === "en" && /gb|us/.test(voice.lang.toLowerCase())) value += 2;
    if (/natural|online|neural|premium|enhanced/.test(name)) value += 3;
    if (voice.localService) value += 1;
    return value;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

export function HelpVideo({ src, poster, video, title }: { src: string; poster: string; video: Video; title: string }) {
  const { t, lang } = useLang();
  const frame = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(-1);
  const [captions, setCaptions] = useState(true);
  const [narrate, setNarrate] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voicesChecked, setVoicesChecked] = useState(false);
  const [full, setFull] = useState(false);
  const [started, setStarted] = useState(false);
  const spoken = useRef(-1);
  const waiting = useRef<number | null>(null);
  const held = useRef(false);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setVoicesChecked(true);
      return;
    }
    const load = () => {
      setVoice(pickVoice(lang));
      setVoicesChecked(true);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const stopSpeech = () => {
    waiting.current = null;
    held.current = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const say = (index: number) => {
    const cue = video.cues[index];
    if (!cue || !voice) return;
    const utterance = new SpeechSynthesisUtterance(cue[lang]);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = lang === "ar" ? 1 : 1.05;
    utterance.onend = () => {
      if (waiting.current !== null) {
        const next = waiting.current;
        waiting.current = null;
        say(next);
      } else if (held.current) {
        held.current = false;
        void player.current?.play();
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  const onTime = () => {
    const element = player.current;
    if (!element) return;
    const now = element.currentTime;
    const index = video.cues.findIndex((cue) => now >= cue.start && now < cue.end);
    setActive(index);
    if (!narrate || !voice || index < 0 || index === spoken.current || element.paused) return;
    spoken.current = index;
    if (window.speechSynthesis.speaking) {
      // Hold the picture until the previous sentence is finished, so voice and screen stay together.
      waiting.current = index;
      held.current = true;
      element.pause();
    } else {
      say(index);
    }
  };

  const seek = (index: number) => {
    const element = player.current;
    if (!element) return;
    stopSpeech();
    spoken.current = -1;
    element.currentTime = video.cues[index].start + 0.05;
    void element.play();
  };

  const toggleNarration = () => {
    const next = !narrate;
    setNarrate(next);
    stopSpeech();
    spoken.current = -1;
    if (next && player.current?.paused) void player.current.play();
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  };

  const cue = active >= 0 ? video.cues[active] : null;
  const noVoice = voicesChecked && !voice;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <div
          ref={frame}
          className={cn(
            "relative mx-auto overflow-hidden rounded-2xl bg-ink-950 shadow-raised ring-1 ring-slate-200",
            video.phone ? "aspect-[9/16] max-w-[22rem]" : "aspect-video w-full",
            full && "flex max-w-none items-center justify-center rounded-none",
          )}
        >
          <video
            ref={player}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            controlsList="nofullscreen nodownload"
            disablePictureInPicture
            className="size-full bg-ink-950 object-contain"
            aria-label={title}
            onPlay={() => setStarted(true)}
            onTimeUpdate={onTime}
            onSeeking={() => {
              if (!held.current) {
                stopSpeech();
                spoken.current = -1;
              }
            }}
            onPause={() => {
              if (!held.current && "speechSynthesis" in window) {
                waiting.current = null;
                window.speechSynthesis.cancel();
                spoken.current = -1;
              }
            }}
            onEnded={() => {
              setActive(-1);
              spoken.current = -1;
            }}
          />
          {!started ? (
            <button
              type="button"
              onClick={() => void player.current?.play()}
              className="absolute inset-0 flex items-center justify-center bg-ink-950/25 transition hover:bg-ink-950/15"
              aria-label={t("تشغيل الفيديو", "Play video")}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-surface/95 text-teal-700 shadow-float ring-1 ring-white/40">
                <Play size={28} className="ml-1" fill="currentColor" />
              </span>
            </button>
          ) : null}
          {captions && cue ? (
            <p
              dir={lang === "ar" ? "rtl" : "ltr"}
              className={cn(
                "pointer-events-none absolute inset-x-3 mx-auto w-fit max-w-[92%] rounded-xl bg-ink-950/85 px-3.5 py-2 text-center font-semibold leading-7 text-white shadow-float",
                video.phone ? "bottom-16 text-sm" : "bottom-14 text-sm sm:text-base",
              )}
              aria-live="polite"
            >
              {cue[lang]}
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleNarration}
            disabled={noVoice}
            aria-pressed={narrate}
            title={noVoice ? t("لا يتوفر صوت بهذه اللغة في متصفحك؛ تابع الشرح المكتوب على الفيديو.", "No voice for this language in your browser; follow the captions instead.") : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 ring-inset transition",
              narrate ? "bg-teal-700 text-white ring-teal-700 hover:bg-teal-800" : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
              noVoice && "opacity-60",
            )}
          >
            {narrate ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {narrate ? t("الشرح الصوتي يعمل", "Voice-over on") : t("تشغيل الشرح الصوتي", "Turn on voice-over")}
          </button>
          <button
            type="button"
            onClick={() => setCaptions((value) => !value)}
            aria-pressed={captions}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
          >
            {captions ? <Captions size={16} /> : <CaptionsOff size={16} />}
            {captions ? t("إخفاء الشرح المكتوب", "Hide captions") : t("إظهار الشرح المكتوب", "Show captions")}
          </button>
          <button
            type="button"
            onClick={toggleFull}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
          >
            {full ? <Minimize size={16} /> : <Maximize size={16} />}
            {full ? t("تصغير", "Exit full screen") : t("ملء الشاشة", "Full screen")}
          </button>
          <span className="tabular ms-auto text-xs text-slate-500">{clock(video.duration)}</span>
        </div>
        {noVoice ? (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {t(
              "الشرح الصوتي يستخدم صوت متصفحك. إن لم يظهر صوت عربي فافتح الصفحة في Microsoft Edge أو Chrome على الهاتف.",
              "The voice-over uses your browser's voice. If none is available, open the page in Microsoft Edge or Chrome on a phone.",
            )}
          </p>
        ) : null}
      </div>

      <ol className="thin-scroll max-h-[28rem] space-y-1 overflow-y-auto rounded-2xl border border-slate-200/90 bg-surface p-2 shadow-card" aria-label={t("مراحل الفيديو", "Video chapters")}>
        {video.cues.map((item, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => seek(index)}
              aria-current={index === active ? "step" : undefined}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm leading-6 transition",
                index === active ? "bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className="tabular mt-0.5 shrink-0 rounded-md bg-slate-100 px-1.5 text-xs font-semibold leading-5 text-slate-600">{clock(item.start)}</span>
              <span className="min-w-0">{item[lang]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
