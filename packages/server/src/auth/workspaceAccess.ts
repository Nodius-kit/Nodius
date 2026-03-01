import { UserInfo } from "./AuthProvider";
import type { Request } from "../http/HttpServer";

/**
 * Check if a user has access to a workspace.
 * If the user has no workspaces defined (custom provider), allow all access.
 */
export function hasWorkspaceAccess(user: UserInfo, workspace: string): boolean {
    if (!user.workspaces || user.workspaces.length === 0) return true;
    return user.workspaces.includes(workspace);
}

/**
 * Verify workspace access and return a structured result.
 */
export function verifyWorkspaceAccess(user: UserInfo, workspace: string): { allowed: boolean; error?: string } {
    if (!workspace) {
        return { allowed: false, error: "Missing workspace parameter" };
    }
    if (!hasWorkspaceAccess(user, workspace)) {
        return { allowed: false, error: `Access denied to workspace '${workspace}'` };
    }
    return { allowed: true };
}

/**
 * Extract the authenticated user from a request.
 * Returns the user and their workspaces, or throws a 401-ready error.
 */
export function getUserWorkspace(req: Request): { user: UserInfo; workspaces: string[] } {
    const user = (req as any).user as UserInfo | undefined;
    if (!user) {
        throw new WorkspaceAccessError(401, "Not authenticated");
    }
    return { user, workspaces: user.workspaces ?? [] };
}

/**
 * Structured error for workspace access failures.
 */
export class WorkspaceAccessError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = "WorkspaceAccessError";
    }
}
