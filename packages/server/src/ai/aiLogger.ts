/**
 * Structured AI observability logger.
 *
 * Emits JSON-structured log entries for:
 * - LLM errors (502, 429, timeout, etc.)
 * - Malformed JSON from LLM (auto-corrected)
 * - Token usage per request
 * - Client disconnections mid-stream
 *
 * Outputs to stderr in structured JSON format, ready for ingestion by
 * Sentry, Datadog, or any log aggregator that parses JSON lines.
 */

export type AILogLevel = "info" | "warn" | "error";

export interface AILogEntry {
    timestamp: string;
    level: AILogLevel;
    event: string;
    [key: string]: unknown;
}

/** Pluggable sink — defaults to `console.error` (stderr) for JSON lines. */
type LogSink = (entry: AILogEntry) => void;

let _sink: LogSink = (entry) => {
    console.error(JSON.stringify(entry));
};

/** Replace the default log sink (useful for tests or external services). */
export function setAILogSink(sink: LogSink): void {
    _sink = sink;
}

/** Reset to the default stderr JSON sink. */
export function resetAILogSink(): void {
    _sink = (entry) => console.error(JSON.stringify(entry));
}

function emit(level: AILogLevel, event: string, data: Record<string, unknown> = {}): void {
    _sink({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...data,
    });
}

// ─── Debug logging ───────────────────────────────────────────────────

let _debugEnabled = false;

/** Enable or disable AI debug logging. Called from aiConfig initialization. */
export function setAIDebug(enabled: boolean): void {
    _debugEnabled = enabled;
}

/** Check whether AI debug logging is currently enabled. */
export function isAIDebugEnabled(): boolean {
    return _debugEnabled;
}

/**
 * Emit a debug log entry (only when AI debug is enabled).
 * Use this to trace the AI pipeline step by step.
 */
export function debugAI(event: string, data?: Record<string, unknown>): void {
    if (!_debugEnabled) return;
    emit("info", `debug:${event}`, data ?? {});
}

// ─── Public logging functions ────────────────────────────────────────

/**
 * Log an LLM API error (502, 429, timeout, network, etc.).
 */
export function logLLMError(opts: {
    provider: string;
    model: string;
    error: Error | string;
    statusCode?: number;
    sessionId?: number;
    threadId?: string;
}): void {
    const errMsg = opts.error instanceof Error ? opts.error.message : opts.error;
    const errName = opts.error instanceof Error ? opts.error.name : undefined;
    emit("error", "llm_error", {
        provider: opts.provider,
        model: opts.model,
        error: errMsg,
        errorName: errName,
        statusCode: opts.statusCode,
        sessionId: opts.sessionId,
        threadId: opts.threadId,
    });
}

/**
 * Log a malformed JSON response from the LLM that was auto-corrected.
 */
export function logMalformedJSON(opts: {
    provider?: string;
    model?: string;
    raw: string;
    corrected?: unknown;
    context: string;
}): void {
    emit("warn", "malformed_json", {
        provider: opts.provider,
        model: opts.model,
        raw: opts.raw.length > 500 ? opts.raw.slice(0, 500) + "…" : opts.raw,
        corrected: opts.corrected !== undefined ? String(opts.corrected).slice(0, 200) : undefined,
        context: opts.context,
    });
}

/**
 * Log a client disconnection that aborted an active AI stream.
 */
export function logClientDisconnect(opts: {
    sessionId: number;
    threadId?: string;
    tokensStreamed?: number;
}): void {
    emit("warn", "client_disconnect_abort", {
        sessionId: opts.sessionId,
        threadId: opts.threadId,
        tokensStreamed: opts.tokensStreamed,
    });
}

/**
 * Log token usage for a completed AI request.
 */
export function logTokenUsage(opts: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    threadId?: string;
    label?: string;
}): void {
    emit("info", "token_usage", {
        provider: opts.provider,
        model: opts.model,
        promptTokens: opts.promptTokens,
        completionTokens: opts.completionTokens,
        cachedTokens: opts.cachedTokens ?? 0,
        totalTokens: opts.promptTokens + opts.completionTokens,
        threadId: opts.threadId,
        label: opts.label,
    });
}
