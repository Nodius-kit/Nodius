/**
 * @file AIToolLimitBanner.tsx
 * @description Inline banner shown when the AI hits the tool round limit.
 * Offers the user a choice: continue with more rounds or get a summary now.
 */

import { memo } from "react";
import { AlertTriangle, Play, FileText } from "lucide-react";
import { useDynamicClass } from "../../hooks/useDynamicClass";

interface AIToolLimitBannerProps {
    roundsUsed: number;
    maxExtended: number;
    threadId: string;
    onResume: (threadId: string, approved: boolean) => void;
}

export const AIToolLimitBanner = memo(({ roundsUsed, maxExtended, threadId, onResume }: AIToolLimitBannerProps) => {
    const bannerClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px 12px;
            margin-top: 6px;
            border-radius: 8px;
            border: 1px solid var(--nodius-warning-main, #f59e0b);
            background: var(--nodius-warning-light, #fef3c7);
            color: var(--nodius-text-primary);
            font-size: 12px;
        }
    `);

    const headerClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            font-size: 12px;
        }
    `);

    const btnGroupClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
        }
    `);

    const btnClass = useDynamicClass(`
        & {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 12px;
            border-radius: 6px;
            border: 1px solid var(--nodius-grey-300);
            background: var(--nodius-background-paper);
            color: var(--nodius-text-primary);
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
            font-weight: 500;
        }
        &:hover {
            background: var(--nodius-grey-100);
        }
    `);

    const btnPrimaryClass = useDynamicClass(`
        & {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 12px;
            border-radius: 6px;
            border: 1px solid var(--nodius-primary-main);
            background: var(--nodius-primary-main);
            color: white;
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
            font-weight: 500;
        }
        &:hover {
            opacity: 0.9;
        }
    `);

    const extraRounds = maxExtended - roundsUsed;

    return (
        <div className={bannerClass}>
            <div className={headerClass}>
                <AlertTriangle size={14} color="var(--nodius-warning-main, #f59e0b)" />
                Tool call limit reached ({roundsUsed} rounds)
            </div>
            <div style={{ fontSize: 11, color: "var(--nodius-text-secondary)" }}>
                Continue for {extraRounds} more rounds, or get a summary now?
            </div>
            <div className={btnGroupClass}>
                <button className={btnPrimaryClass} onClick={() => onResume(threadId, true)}>
                    <Play size={12} />
                    Continue ({extraRounds} more)
                </button>
                <button className={btnClass} onClick={() => onResume(threadId, false)}>
                    <FileText size={12} />
                    Summarize now
                </button>
            </div>
        </div>
    );
});
AIToolLimitBanner.displayName = "AIToolLimitBanner";
