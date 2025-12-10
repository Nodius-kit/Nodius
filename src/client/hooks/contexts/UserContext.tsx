/**
 * @file UserContext.tsx
 * @description User context for storing authenticated user information
 * @module client/hooks/contexts
 *
 * Provides user information throughout the application after authentication.
 * User data is fetched from /api/auth/me endpoint and stored in this context.
 *
 * Features:
 * - **User Info Storage**: Stores userId, username, email, roles
 * - **Global Access**: Available to all components via useContext
 * - **Type Safety**: Strongly typed user information
 *
 * Usage:
 * ```tsx
 * const User = useContext(UserContext);
 * console.log(User.userId); // Access user ID
 * console.log(User.username); // Access username
 * ```
 */

import { createContext, ReactNode } from "react";

export interface UserInfo {
    userId?: string;
    username: string;
    email?: string;
    roles?: string[];
    [key: string]: any;
}

export interface UserContextType {
    user: UserInfo | null;
    setUser: (user: UserInfo | null) => void;
}

export const UserContext = createContext<UserContextType>({
    user: null,
    setUser: () => {}
});

interface UserProviderProps {
    children: ReactNode;
    user: UserInfo | null;
    setUser: (user: UserInfo | null) => void;
}

export const UserProvider = ({ children, user, setUser }: UserProviderProps) => {
    return (
        <UserContext.Provider value={{ user, setUser }}>
            {children}
        </UserContext.Provider>
    );
};
