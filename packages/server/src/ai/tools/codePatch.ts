/**
 * Code patching utilities — surgical code edits via search/replace pairs.
 *
 * Provides types, application logic, and diff computation for code patches.
 * Used by the AI module to allow LLMs to make targeted code changes
 * instead of rewriting entire code blocks.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface CodePatch {
    /** Exact string to search for in the original code. */
    search: string;
    /** Replacement string. Empty string = deletion. */
    replace: string;
}

export interface CodeDiff {
    /** Field name that was patched (e.g. "process"). */
    field: string;
    /** Original code before patches. */
    original: string;
    /** Modified code after patches. */
    modified: string;
    /** The patches that were applied. */
    patches: CodePatch[];
}

export interface DiffLine {
    type: "unchanged" | "added" | "removed";
    content: string;
}

// ─── Patch application ──────────────────────────────────────────────

/**
 * Apply an array of search/replace patches to the original code.
 * Patches are applied sequentially in order.
 *
 * @throws Error if a search string is not found in the code.
 */
export function applyPatches(original: string, patches: CodePatch[]): string {
    let result = original;

    for (let i = 0; i < patches.length; i++) {
        const patch = patches[i];

        if (!patch.search && !result) {
            // Special case: empty original + empty search = insert at beginning
            result = patch.replace;
            continue;
        }

        if (!patch.search) {
            // Empty search on non-empty code: append
            result = result + patch.replace;
            continue;
        }

        const idx = result.indexOf(patch.search);
        if (idx === -1) {
            throw new Error(
                `Patch #${i + 1} failed: search string not found.\n` +
                `Search: "${patch.search.slice(0, 80)}${patch.search.length > 80 ? "..." : ""}"`
            );
        }

        result = result.slice(0, idx) + patch.replace + result.slice(idx + patch.search.length);
    }

    return result;
}

// ─── Diff computation ───────────────────────────────────────────────

/**
 * Compute a line-by-line diff between two strings.
 * Uses LCS (Longest Common Subsequence) for accurate results.
 */
export function computeLineDiff(original: string, modified: string): DiffLine[] {
    const oldLines = original.split("\n");
    const newLines = modified.split("\n");

    // Build LCS table
    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce diff
    const diff: DiffLine[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            diff.push({ type: "unchanged", content: oldLines[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            diff.push({ type: "added", content: newLines[j - 1] });
            j--;
        } else {
            diff.push({ type: "removed", content: oldLines[i - 1] });
            i--;
        }
    }

    return diff.reverse();
}
