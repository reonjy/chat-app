"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SettingsModal from "./SettingsModal";
import {
  Attachment,
  Message,
  ChatSession,
  saveSession,
  loadSessions,
  deleteSession,
} from "../lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const readAsText = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsText(file);
  });

/** Resize & compress images so the payload stays within API limits */
const compressImage = (
  dataUrl: string,
  maxDim = 2048,
  quality = 0.85
): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });

/** Extract text from a PDF using pdfjs-dist */
const extractPdfText = async (file: File): Promise<string> => {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
      .promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join("");
      if (text.trim()) pages.push(`[Page ${i}]\n${text}`);
    }

    return pages.length
      ? pages.join("\n\n")
      : "[PDF contained no extractable text — it may be a scanned/image-based PDF]";
  } catch (err) {
    console.error("PDF extraction failed:", err);
    return `[Failed to extract text from PDF: ${file.name}]`;
  }
};

const fmtSize = (b: number) =>
  b < 1024
    ? `${b} B`
    : b < 1_048_576
      ? `${(b / 1024).toFixed(1)} KB`
      : `${(b / 1_048_576).toFixed(1)} MB`;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/* Build the OpenAI-compatible messages array */
function buildApiMessages(msgs: Message[]) {
  return msgs.map((msg) => {
    if (msg.role === "assistant") {
      return { role: "assistant" as const, content: msg.content };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];

    // Append file text contents
    const textFiles = msg.attachments?.filter((a) => a.textContent) ?? [];
    if (textFiles.length) {
      const ctx = textFiles
        .map((a) => `--- File: ${a.name} ---\n${a.textContent}`)
        .join("\n\n");
      parts.push({ type: "text", text: ctx });
    }

    // Append images as image_url
    const images = msg.attachments?.filter((a) => a.dataUrl) ?? [];
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
    }

    // Append the user's text (or a default prompt when only files are attached)
    if (msg.content) {
      parts.push({ type: "text", text: msg.content });
    } else if (parts.length > 0) {
      parts.push({
        type: "text",
        text: "Please analyze the attached file(s) and describe what you see.",
      });
    }

    // Simplify to a plain string if no multimodal content
    if (parts.length === 1 && parts[0].type === "text") {
      return { role: "user" as const, content: parts[0].text };
    }

    return { role: "user" as const, content: parts };
  });
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ThinkingBlock({
  thinking,
  isStreaming,
}: {
  thinking: string;
  isStreaming: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Auto-open while streaming, auto-close when done
  useEffect(() => {
    setIsOpen(isStreaming);
  }, [isStreaming]);

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors group"
      >
        {/* Brain icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isStreaming ? "animate-pulse text-violet-400" : "text-gray-400 group-hover:text-gray-500"}
        >
          <path d="M12 2a4 4 0 0 0-4 4v1a4 4 0 0 0-1 7.87V16a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-1.13A4 4 0 0 0 16 7V6a4 4 0 0 0-4-4z" />
          <path d="M10 10h.01" />
          <path d="M14 10h.01" />
          <path d="M10 14a3.5 3.5 0 0 0 4 0" />
        </svg>
        <span>
          {isStreaming ? "Thinking…" : "Thinking"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="mt-1.5 pl-3 border-l-2 border-violet-200/60 text-xs text-gray-500 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {thinking}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-violet-300 rounded-sm ml-0.5 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      onClick={onRetry}
      className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-white/60 transition-all"
      title="Retry response"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 1 0 2.62-6.38L21 8" />
      </svg>
    </button>
  );
}

function CodeCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: ignore */
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 bg-gray-100/80 hover:bg-white rounded-md transition-all shadow-sm z-10"
      title="Copy code"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: ignore */
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-white/60 transition-all"
      title="Copy response"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatApp() {
  /* ---- state ---- */
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settings, setSettings] = useState<Settings>({
    baseUrl: "",
    apiKey: "",
    model: "claude-opus-5-thinking",
  });
  const [dragOver, setDragOver] = useState(false);

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadSessions().then((loaded) => {
      setSessions(loaded);
      if (loaded.length > 0) {
        setCurrentSessionId(loaded[0].id);
        setMessages(loaded[0].messages);
      }
    });
  }, []);

  // Save session automatically when messages change and it's not empty
  useEffect(() => {
    if (messages.length === 0) {
      // If we just cleared it, don't create a blank session in DB, just wait for user to send.
      return;
    }

    const save = async () => {
      let id = currentSessionId;
      if (!id) {
        id = uid();
        setCurrentSessionId(id);
      }
      
      const title =
        messages[0].content.slice(0, 30) +
        (messages[0].content.length > 30 ? "..." : "") || "New Chat";

      const session: ChatSession = {
        id,
        title,
        updatedAt: Date.now(),
        messages,
      };

      await saveSession(session);
      
      setSessions((prev) => {
        const existing = prev.findIndex((s) => s.id === session.id);
        if (existing !== -1) {
          const next = [...prev];
          next[existing] = session;
          return next.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return [session, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
      });
    };
    save();
  }, [messages, currentSessionId]);

  /* ---- refs ---- */
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ---- load settings from localStorage ---- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("chat-settings");
      if (saved) setSettings(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  /* ---- auto-scroll ---- */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- auto-resize textarea ---- */
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [input]);

  /* ---- file handling ---- */
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const result: Attachment[] = [];
    for (const file of Array.from(files)) {
      const att: Attachment = {
        name: file.name,
        type: file.type,
        size: file.size,
      };
      if (file.type.startsWith("image/")) {
        // Read and compress image to avoid exceeding API payload limits
        const rawDataUrl = await readAsDataUrl(file);
        att.dataUrl = await compressImage(rawDataUrl);
      } else if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        // Extract actual text from PDF using pdfjs-dist
        att.textContent = await extractPdfText(file);
      } else {
        // Plain text / code files
        try {
          att.textContent = await readAsText(file);
        } catch {
          att.textContent = `[Could not read file: ${file.name}]`;
        }
      }
      result.push(att);
    }
    setAttachments((prev) => [...prev, ...result]);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) await processFiles(e.target.files);
      if (fileRef.current) fileRef.current.value = "";
    },
    [processFiles]
  );

  const removeAttachment = (i: number) =>
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  /* ---- drag & drop ---- */
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) await processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  /* ---- stream reading ---- */
  const runChatApi = async (chatHistory: Message[], assistantId: string) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: buildApiMessages(chatHistory),
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${err.error || "Something went wrong."}` }
              : m
          )
        );
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      let accumulatedThinking = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            if (!delta) continue;

            const thinkingDelta =
              delta.reasoning_content ?? delta.thinking ?? null;
            if (thinkingDelta) {
              accumulatedThinking += thinkingDelta;
              const snapT = accumulatedThinking;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, thinking: snapT } : m
                )
              );
            }

            const contentDelta = delta.content;
            if (contentDelta) {
              accumulated += contentDelta;
              const snap = accumulated;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: snap } : m
                )
              );
            }
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  /* ---- send message ---- */
  const handleSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text,
      attachments: attachments.length ? [...attachments] : undefined,
    };

    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
    };

    const updated = [...messages, userMsg];
    setMessages([...updated, assistantMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";
    
    await runChatApi(updated, assistantMsg.id);
  };

  const handleRetry = async (msgId: string) => {
    if (isLoading) return;
    const msgIndex = messages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    let lastUserIndex = msgIndex - 1;
    while (lastUserIndex >= 0 && messages[lastUserIndex].role !== "user") {
      lastUserIndex--;
    }
    if (lastUserIndex === -1) return;

    const updated = messages.slice(0, lastUserIndex + 1);
    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
    };

    setMessages([...updated, assistantMsg]);
    setIsLoading(true);
    await runChatApi(updated, assistantMsg.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewChat = () => {
    if (isLoading) return;
    setMessages([]);
    setCurrentSessionId(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const loadChat = (id: string) => {
    if (isLoading) return;
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setMessages(session.messages);
      setCurrentSessionId(id);
    }
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const removeChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isLoading) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setMessages([]);
      setCurrentSessionId(null);
    }
  };

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div className="flex h-svh overflow-hidden bg-gray-50 font-sans">
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 text-gray-700 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-3">
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 w-full px-3 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition-colors text-sm font-medium border border-sky-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-xs text-gray-400 px-3 py-4 text-center">
              No previous chats
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadChat(s.id)}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                  s.id === currentSessionId ? "bg-gray-100/80 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <div className="truncate flex-1">{s.title}</div>
                <button
                  onClick={(e) => removeChat(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all shrink-0"
                  title="Delete chat"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        className="flex-1 flex flex-col min-w-0 h-full relative bg-gradient-to-br from-rose-50/60 via-white to-sky-50/60"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* ---- Drag overlay ---- */}
        {dragOver && (
          <div className="absolute inset-0 z-40 bg-white/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-rose-100 to-sky-100 flex items-center justify-center">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Drop files here</p>
            </div>
          </div>
        )}

        {/* ======== HEADER ======== */}
        <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-100/80 bg-white/70 backdrop-blur-lg flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-200 to-sky-200 flex items-center justify-center shadow-sm">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1 className="text-[15px] font-semibold text-gray-700">Chat</h1>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={startNewChat}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all md:hidden"
              title="New chat"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            title="Settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* ======== MESSAGES ======== */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        <div className="w-full mx-auto space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center space-y-3 select-none">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-100 to-sky-100 flex items-center justify-center">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">
                Start a conversation
              </p>
              {(!settings.baseUrl || !settings.apiKey) && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-xs text-rose-400 hover:text-rose-500 transition-colors"
                >
                  Configure your API in Settings first →
                </button>
              )}
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-full px-4 py-3 shadow-sm overflow-x-hidden ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-rose-100 to-rose-50 rounded-2xl rounded-br-lg"
                    : "bg-gradient-to-br from-sky-50 to-sky-100/60 rounded-2xl rounded-bl-lg"
                }`}
              >
                {/* Attachment chips */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-white/70 rounded-lg px-2 py-1"
                      >
                        {att.dataUrl ? (
                          <img
                            src={att.dataUrl}
                            alt={att.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        )}
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">
                          {att.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Content */}
                {msg.role === "assistant" ? (
                  msg.content || msg.thinking ? (
                    <div>
                      {/* Thinking block */}
                      {msg.thinking && (
                        <ThinkingBlock thinking={msg.thinking} isStreaming={isLoading && !msg.content && !!msg.thinking} />
                      )}
                      {/* Response */}
                      {msg.content && (
                        <div className="chat-markdown text-sm text-gray-800 leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props) {
                                const { children, className, node, ...rest } = props;
                                const match = /language-(\w+)/.exec(className || "");
                                if (match) {
                                  return (
                                    <>
                                      <CodeCopyButton text={String(children).replace(/\n$/, "")} />
                                      <code className={className} {...rest}>
                                        {children}
                                      </code>
                                    </>
                                  );
                                }
                                return <code className={className} {...rest}>{children}</code>;
                              },
                              table(props) {
                                const { node, ...rest } = props;
                                return (
                                  <div className="overflow-x-auto overflow-y-auto max-h-[60vh] max-w-full my-3 border border-gray-200 rounded-lg shadow-sm">
                                    <table className="w-full border-collapse" {...rest} />
                                  </div>
                                );
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                      {/* Actions */}
                      {msg.content && !isLoading && (
                        <div className="flex justify-end gap-1 mt-2">
                          <RetryButton onRetry={() => handleRetry(msg.id)} />
                          <CopyButton text={msg.content} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <span
                        className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  )
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ======== ATTACHMENT BAR ======== */}
      {attachments.length > 0 && (
        <div className="px-3 sm:px-6 py-2 border-t border-gray-100/80 bg-white/50 flex-shrink-0">
          <div className="w-full mx-auto flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 group"
              >
                {att.dataUrl ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-7 h-7 rounded object-cover"
                  />
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
                <span className="truncate max-w-[90px]">{att.name}</span>
                <span className="text-gray-400">{fmtSize(att.size)}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======== INPUT BAR ======== */}
      <div className="border-t border-gray-100/80 bg-white/70 backdrop-blur-lg px-3 sm:px-6 py-3 flex-shrink-0">
        <div className="w-full mx-auto flex items-end gap-2">
          {/* Attach button */}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
            title="Attach files or images"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.yaml,.yml,.log,.pdf,.sql,.sh,.bat,.ps1,.c,.cpp,.h,.java,.rb,.go,.rs,.swift,.kt"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all leading-relaxed"
            style={{ maxHeight: 180 }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && attachments.length === 0)}
            className="flex-shrink-0 p-2.5 bg-gradient-to-r from-rose-300 to-sky-300 hover:from-rose-400 hover:to-sky-400 disabled:from-gray-200 disabled:to-gray-200 text-white rounded-xl transition-all shadow-sm disabled:shadow-none"
            title="Send"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      </div>

      {/* ======== SETTINGS MODAL ======== */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}
