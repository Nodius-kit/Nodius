/**
 * Error classifier for LLM API errors.
 *
 * Extracts HTTP status codes, provider info, and produces user-friendly
 * error messages with retryable hints.
 */

export interface ClassifiedError {
    /** User-friendly message safe to display in the UI. */
    userMessage: string;
    /** Machine-readable error code. */
    code: "rate_limit" | "server_error" | "auth_error" | "timeout" | "network" | "content_filter" | "context_length" | "internal";
    /** Whether the client should offer a retry button. */
    retryable: boolean;
    /** HTTP status code if available. */
    statusCode?: number;
    /** Provider name if detectable. */
    provider?: string;
    /** Model name if detectable. */
    model?: string;
    /** Original error for logging. */
    originalError: Error;
}

/**
 * Classify an unknown error from an LLM SDK into a structured error.
 */
export function classifyLLMError(err: unknown): ClassifiedError {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message ?? "";
    const statusCode = extractStatusCode(error);
    const provider = detectProvider(error);

    // Rate limit (429)
    if (statusCode === 429 || /rate.?limit|too many requests/i.test(message)) {
        return {
            userMessage: "Le service IA est temporairement surchargé. Réessayez dans quelques secondes.",
            code: "rate_limit",
            retryable: true,
            statusCode: statusCode ?? 429,
            provider,
            originalError: error,
        };
    }

    // Server errors (500, 502, 503)
    if (statusCode && statusCode >= 500) {
        return {
            userMessage: "Le service IA est temporairement indisponible. Réessayez dans un instant.",
            code: "server_error",
            retryable: true,
            statusCode,
            provider,
            originalError: error,
        };
    }

    // Authentication errors (401, 403)
    if (statusCode === 401 || statusCode === 403 || /authentication|unauthorized|invalid.*api.*key|permission/i.test(message)) {
        return {
            userMessage: "Erreur d'authentification avec le service IA. Vérifiez la clé API.",
            code: "auth_error",
            retryable: false,
            statusCode,
            provider,
            originalError: error,
        };
    }

    // Timeout
    if (/timeout|timed?\s*out|ETIMEDOUT|ECONNRESET/i.test(message)) {
        return {
            userMessage: "La requête IA a expiré. Réessayez avec un message plus court.",
            code: "timeout",
            retryable: true,
            provider,
            originalError: error,
        };
    }

    // Network errors
    if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message)) {
        return {
            userMessage: "Impossible de contacter le service IA. Vérifiez la connexion réseau.",
            code: "network",
            retryable: true,
            provider,
            originalError: error,
        };
    }

    // Content filter (OpenAI/Anthropic moderation)
    if (/content.*filter|content.*policy|flagged|moderation|safety/i.test(message)) {
        return {
            userMessage: "Le message a été filtré par la politique de contenu du service IA.",
            code: "content_filter",
            retryable: false,
            provider,
            originalError: error,
        };
    }

    // Context length exceeded
    if (/context.*length|maximum.*token|too.*long|max_tokens/i.test(message)) {
        return {
            userMessage: "La conversation est trop longue. Essayez de démarrer un nouveau fil.",
            code: "context_length",
            retryable: false,
            provider,
            originalError: error,
        };
    }

    // Fallback
    return {
        userMessage: "Une erreur inattendue est survenue avec le service IA.",
        code: "internal",
        retryable: false,
        statusCode,
        provider,
        originalError: error,
    };
}

/** Try to extract an HTTP status code from an SDK error. */
function extractStatusCode(error: Error): number | undefined {
    // OpenAI SDK: error.status
    const errObj = error as unknown as Record<string, unknown>;
    const status = errObj.status;
    if (typeof status === "number") return status;

    // Anthropic SDK: error.statusCode or error.status_code
    const code = errObj.statusCode ?? errObj.status_code;
    if (typeof code === "number") return code;

    // Match "HTTP 429" or "status 502" patterns in message
    const match = error.message?.match(/(?:HTTP|status)\s*(\d{3})/i);
    if (match) return parseInt(match[1], 10);

    return undefined;
}

/** Try to detect the LLM provider from the error object. */
function detectProvider(error: Error): string | undefined {
    const name = error.constructor?.name ?? "";
    if (/anthropic/i.test(name)) return "anthropic";
    if (/openai/i.test(name)) return "openai";

    const msg = error.message ?? "";
    if (/anthropic/i.test(msg)) return "anthropic";
    if (/openai/i.test(msg)) return "openai";
    if (/deepseek/i.test(msg)) return "deepseek";

    return undefined;
}
