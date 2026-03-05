import { useState, useEffect, useCallback } from "preact/hooks";
import copyIcon from "../../assets/icons/copy.svg?raw";

const COMMAND = "npx -y ccpoke";
const TYPING_SPEED_MS = 65;
const TYPING_START_DELAY_MS = 500;

interface Props {
  copyLabel: string;
  copiedLabel: string;
}

export default function TerminalWidget({ copyLabel, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [started, setStarted] = useState(false);

  const typingComplete = charCount >= COMMAND.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCharCount(COMMAND.length);
      return;
    }
    const timer = setTimeout(() => setStarted(true), TYPING_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!started || typingComplete) return;
    const timer = setTimeout(() => setCharCount((c) => c + 1), TYPING_SPEED_MS);
    return () => clearTimeout(timer);
  }, [started, charCount, typingComplete]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, []);

  return (
    <div class="bg-bg-code rounded-xl overflow-hidden max-w-[600px] mx-auto w-full">
      <div class="flex items-center justify-between px-4 py-2.5 bg-bg-code-2">
        <div class="flex gap-[7px]">
          <i class="w-2.5 h-2.5 rounded-full block bg-[#FF5F57]" />
          <i class="w-2.5 h-2.5 rounded-full block bg-[#FEBC2E]" />
          <i class="w-2.5 h-2.5 rounded-full block bg-[#28C840]" />
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 px-5 py-4">
        <div class="font-mono text-[0.88rem] text-term-text min-w-0">
          <span class="text-accent select-none mr-2.5">$</span>
          <span>{COMMAND.slice(0, charCount)}</span>
          {!typingComplete && <span class="terminal-cursor">▎</span>}
        </div>
        <button
          onClick={handleCopy}
          aria-label={copied ? copiedLabel : copyLabel}
          class={`inline-flex items-center gap-1.5 rounded-[7px] border font-sans text-[0.78rem] font-semibold cursor-pointer shrink-0 transition-all duration-200 px-3.5 py-2.5 min-w-[44px] min-h-[44px] ${
            !typingComplete
              ? "opacity-0 pointer-events-none"
              : copied
                ? "bg-[rgba(46,139,87,0.2)] text-emerald border-[rgba(46,139,87,0.3)] opacity-100"
                : "bg-white/[0.06] border-white/10 text-term-dim hover:bg-white/10 hover:text-term-dim-hover opacity-100"
          }`}
        >
          <span
            class="w-[15px] h-[15px] inline-flex"
            dangerouslySetInnerHTML={{ __html: copyIcon }}
          />
          <span class="hidden sm:inline">
            {copied ? copiedLabel : copyLabel}
          </span>
        </button>
      </div>
      <div aria-live="polite" class="sr-only">
        {copied ? copiedLabel : ""}
      </div>
    </div>
  );
}
