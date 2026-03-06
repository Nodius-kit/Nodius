/**
 * Code detection utilities.
 *
 * Detects whether a string is JavaScript/TypeScript code, and maintains
 * a registry of field paths that are always considered code regardless of content.
 */

// ─── Known code fields ──────────────────────────────────────────────

/**
 * Field paths that are always considered code, even if empty or containing
 * non-obvious content. Keyed by context (tool/action type).
 */
const KNOWN_CODE_FIELDS: Record<string, string[]> = {
    configure_node_type: ["process"],
    update_node: [],
};

/**
 * Check if a field is a known code field for a given context.
 */
export function isKnownCodeField(context: string, fieldName: string): boolean {
    return KNOWN_CODE_FIELDS[context]?.includes(fieldName) ?? false;
}

// ─── Heuristic code detection ───────────────────────────────────────

/** Patterns that strongly indicate JavaScript/TypeScript code. */
const CODE_PATTERNS: RegExp[] = [
    // Function declarations/expressions
    /\bfunction\s+\w+\s*\(/,
    /\bconst\s+\w+\s*=\s*(?:\(|async\s|function)/,
    /\b(?:let|var|const)\s+\w+\s*=/,
    /=>\s*\{/,
    /=>\s*[^{]/,

    // Control flow
    /\bif\s*\(/,
    /\bfor\s*\(/,
    /\bwhile\s*\(/,
    /\bswitch\s*\(/,
    /\btry\s*\{/,
    /\bcatch\s*\(/,

    // Keywords
    /\breturn\b/,
    /\bawait\b/,
    /\basync\b/,
    /\bimport\s+/,
    /\bexport\s+/,
    /\bclass\s+\w+/,
    /\bnew\s+\w+/,
    /\bthrow\s+/,
    /\btypeof\s+/,

    // Common method calls / patterns
    /\bconsole\.\w+\(/,
    /\.\w+\s*\(/,
    /\bJSON\.\w+\(/,
    /\bMath\.\w+\(/,
    /\bPromise\./,

    // Operators and syntax
    /===|!==|&&|\|\|/,
    /\?\./,
    /\?\?/,
    /\.\.\.[\w[]/,

    // Nodius workflow-specific patterns
    /\bnext\s*\(/,
    /\bbranch\s*\(/,
    /\blog\s*\(/,
    /\bnode\.\w+/,
    /\bnodeMap\b/,
    /\bedgeMap\b/,
    /\bincoming\b/,
    /\bglobal\.\w+/,
    /\binitHtml\s*\(/,
    /\bgetHtmlRenderWithId\s*\(/,
    /\bHtmlRender\b/,
];

/** Patterns that suggest the string is NOT code (prose, plain text). */
const NON_CODE_PATTERNS: RegExp[] = [
    /^[A-Z][a-z].*\.\s/,           // Starts with a sentence
    /\b(the|is|are|was|were|has|have|this|that|with|from|into)\b/i,
];

/**
 * Heuristic detection: is the given string likely JavaScript or TypeScript code?
 *
 * Returns true if enough code patterns are detected relative to the string length.
 * Returns false for empty strings, very short strings, or prose-like content.
 */
export function isCodeString(value: string): boolean {
    if (!value || value.trim().length < 5) return false;

    const trimmed = value.trim();

    // Quick checks: single-word or very short → not code
    if (!trimmed.includes(" ") && !trimmed.includes("\n") && !trimmed.includes(";") && !trimmed.includes("(")) {
        return false;
    }

    let codeScore = 0;
    let proseScore = 0;

    for (const pattern of CODE_PATTERNS) {
        if (pattern.test(trimmed)) codeScore++;
    }

    for (const pattern of NON_CODE_PATTERNS) {
        if (pattern.test(trimmed)) proseScore++;
    }

    // Structural indicators
    if (trimmed.includes("{") && trimmed.includes("}")) codeScore += 2;
    if (trimmed.includes(";")) codeScore++;
    if (/^\s*(\/\/|\/\*|\*)/.test(trimmed)) codeScore += 2; // comment syntax

    // Lines analysis: code tends to have short indented lines
    const lines = trimmed.split("\n");
    if (lines.length > 1) {
        const indentedLines = lines.filter(l => /^\s{2,}/.test(l)).length;
        if (indentedLines / lines.length > 0.3) codeScore += 2;
    }

    // Need a meaningful signal over noise
    return codeScore >= 3 && codeScore > proseScore * 2;
}

/**
 * Check if a value should be treated as code, considering both
 * heuristic detection and known code fields.
 */
export function isCodeValue(value: string, context?: string, fieldName?: string): boolean {
    if (context && fieldName && isKnownCodeField(context, fieldName)) {
        return true;
    }
    return isCodeString(value);
}
