import { describe, it, expect } from "vitest";
import { classifyLLMError } from "./errorClassifier.js";

describe("classifyLLMError", () => {
    it("classifies a 429 rate limit error", () => {
        const err = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
        const result = classifyLLMError(err);
        expect(result.code).toBe("rate_limit");
        expect(result.retryable).toBe(true);
        expect(result.statusCode).toBe(429);
        expect(result.userMessage).toContain("surchargé");
    });

    it("classifies a rate limit error by message pattern", () => {
        const err = new Error("Too many requests, please slow down");
        const result = classifyLLMError(err);
        expect(result.code).toBe("rate_limit");
        expect(result.retryable).toBe(true);
    });

    it("classifies a 502 server error", () => {
        const err = Object.assign(new Error("Bad Gateway"), { status: 502 });
        const result = classifyLLMError(err);
        expect(result.code).toBe("server_error");
        expect(result.retryable).toBe(true);
        expect(result.statusCode).toBe(502);
        expect(result.userMessage).toContain("indisponible");
    });

    it("classifies a 503 server error", () => {
        const err = Object.assign(new Error("Service Unavailable"), { status: 503 });
        const result = classifyLLMError(err);
        expect(result.code).toBe("server_error");
        expect(result.retryable).toBe(true);
    });

    it("classifies a 500 internal server error", () => {
        const err = Object.assign(new Error("Internal Server Error"), { status: 500 });
        const result = classifyLLMError(err);
        expect(result.code).toBe("server_error");
        expect(result.retryable).toBe(true);
    });

    it("classifies a 401 auth error", () => {
        const err = Object.assign(new Error("Unauthorized"), { status: 401 });
        const result = classifyLLMError(err);
        expect(result.code).toBe("auth_error");
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toContain("clé API");
    });

    it("classifies an invalid API key error by message", () => {
        const err = new Error("Invalid API key provided");
        const result = classifyLLMError(err);
        expect(result.code).toBe("auth_error");
        expect(result.retryable).toBe(false);
    });

    it("classifies a timeout error", () => {
        const err = new Error("Request timed out after 30000ms");
        const result = classifyLLMError(err);
        expect(result.code).toBe("timeout");
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain("expiré");
    });

    it("classifies ETIMEDOUT", () => {
        const err = new Error("connect ETIMEDOUT 1.2.3.4:443");
        const result = classifyLLMError(err);
        expect(result.code).toBe("timeout");
        expect(result.retryable).toBe(true);
    });

    it("classifies ECONNREFUSED as network error", () => {
        const err = new Error("connect ECONNREFUSED 127.0.0.1:443");
        const result = classifyLLMError(err);
        expect(result.code).toBe("network");
        expect(result.retryable).toBe(true);
        expect(result.userMessage).toContain("connexion");
    });

    it("classifies a content filter error", () => {
        const err = new Error("Your request was flagged by our content filter");
        const result = classifyLLMError(err);
        expect(result.code).toBe("content_filter");
        expect(result.retryable).toBe(false);
    });

    it("classifies context length exceeded", () => {
        const err = new Error("This model's maximum context length is 128000 tokens");
        const result = classifyLLMError(err);
        expect(result.code).toBe("context_length");
        expect(result.retryable).toBe(false);
        expect(result.userMessage).toContain("longue");
    });

    it("falls back to internal for unknown errors", () => {
        const err = new Error("Something completely unexpected");
        const result = classifyLLMError(err);
        expect(result.code).toBe("internal");
        expect(result.retryable).toBe(false);
    });

    it("handles non-Error input", () => {
        const result = classifyLLMError("raw string error");
        expect(result.code).toBe("internal");
        expect(result.originalError).toBeInstanceOf(Error);
        expect(result.originalError.message).toBe("raw string error");
    });

    it("detects provider from error constructor name", () => {
        class OpenAIError extends Error { constructor(msg: string) { super(msg); this.name = "OpenAIError"; } }
        const err = Object.assign(new OpenAIError("Rate limit"), { status: 429 });
        const result = classifyLLMError(err);
        expect(result.provider).toBe("openai");
    });

    it("detects provider from error message", () => {
        const err = new Error("Anthropic API error: overloaded");
        const result = classifyLLMError(err);
        expect(result.provider).toBe("anthropic");
    });

    it("extracts status code from message pattern", () => {
        const err = new Error("Request failed with HTTP 502");
        const result = classifyLLMError(err);
        expect(result.statusCode).toBe(502);
        expect(result.code).toBe("server_error");
    });
});
