/**
 * @file CodeDiffView.tsx
 * @description Visual diff component for code changes, git-style.
 * Shows added lines in green, removed lines in red, with line numbers.
 */

import { memo, useMemo, useState } from "react";
import { useDynamicClass } from "../../hooks/useDynamicClass";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";

// ─── Diff computation (LCS-based) ──────────────────────────────────

interface DiffLine {
    type: "unchanged" | "added" | "removed";
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
}

function computeLineDiff(original: string, modified: string): DiffLine[] {
    const oldLines = original.split("\n");
    const newLines = modified.split("\n");
    const m = oldLines.length;
    const n = newLines.length;

    // LCS table
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

    // Backtrack
    const raw: DiffLine[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            raw.push({ type: "unchanged", content: oldLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            raw.push({ type: "added", content: newLines[j - 1] });
            j--;
        } else {
            raw.push({ type: "removed", content: oldLines[i - 1] });
            i--;
        }
    }
    raw.reverse();

    // Assign line numbers
    let oldNo = 1, newNo = 1;
    for (const line of raw) {
        if (line.type === "unchanged") {
            line.oldLineNo = oldNo++;
            line.newLineNo = newNo++;
        } else if (line.type === "removed") {
            line.oldLineNo = oldNo++;
        } else {
            line.newLineNo = newNo++;
        }
    }

    return raw;
}

// ─── Component ──────────────────────────────────────────────────────

interface CodeDiffViewProps {
    field: string;
    original: string;
    modified: string;
    defaultExpanded?: boolean;
}

export const CodeDiffView = memo(({ field, original, modified, defaultExpanded = true }: CodeDiffViewProps) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const diffLines = useMemo(() => computeLineDiff(original, modified), [original, modified]);

    const addedCount = diffLines.filter(l => l.type === "added").length;
    const removedCount = diffLines.filter(l => l.type === "removed").length;

    const containerClass = useDynamicClass(`
        & {
            border: 1px solid var(--nodius-grey-300);
            border-radius: 8px;
            overflow: hidden;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            margin: 8px 0;
        }
    `);

    const headerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--nodius-grey-100);
            border-bottom: 1px solid var(--nodius-grey-300);
            cursor: pointer;
            user-select: none;
        }
        &:hover {
            background: var(--nodius-grey-200);
        }
    `);

    const bodyClass = useDynamicClass(`
        & {
            max-height: 400px;
            overflow-y: auto;
            background: var(--nodius-background-default);
        }
    `);

    const lineClass = useDynamicClass(`
        & {
            display: flex;
            line-height: 20px;
            white-space: pre;
        }
    `);

    const lineNoClass = useDynamicClass(`
        & {
            width: 40px;
            min-width: 40px;
            text-align: right;
            padding-right: 8px;
            color: var(--nodius-text-disabled);
            user-select: none;
            border-right: 1px solid var(--nodius-grey-200);
        }
    `);

    const lineContentClass = useDynamicClass(`
        & {
            flex: 1;
            padding-left: 8px;
            overflow-x: auto;
        }
    `);

    const addedBg = useDynamicClass(`& { background: rgba(46, 160, 67, 0.15); }`);
    const removedBg = useDynamicClass(`& { background: rgba(248, 81, 73, 0.15); }`);
    const addedText = useDynamicClass(`& { color: #2ea043; }`);
    const removedText = useDynamicClass(`& { color: #f85149; }`);

    return (
        <div className={containerClass}>
            <div className={headerClass} onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <FileCode size={14} color="var(--nodius-primary-main)" />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{field}</span>
                <span style={{ color: "#2ea043", fontSize: 12, fontWeight: 500 }}>+{addedCount}</span>
                <span style={{ color: "#f85149", fontSize: 12, fontWeight: 500 }}>-{removedCount}</span>
            </div>
            {expanded && (
                <div className={bodyClass}>
                    {diffLines.map((line, idx) => {
                        const bgClass = line.type === "added" ? addedBg
                            : line.type === "removed" ? removedBg
                            : "";
                        const txtClass = line.type === "added" ? addedText
                            : line.type === "removed" ? removedText
                            : "";
                        const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
                        const lineNo = line.type === "removed" ? line.oldLineNo : line.newLineNo;

                        return (
                            <div key={idx} className={`${lineClass} ${bgClass}`}>
                                <div className={lineNoClass}>
                                    {lineNo ?? ""}
                                </div>
                                <div className={`${lineContentClass} ${txtClass}`}>
                                    {prefix} {line.content}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
CodeDiffView.displayName = "CodeDiffView";
