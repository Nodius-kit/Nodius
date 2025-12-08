/**
 * @file AuthWrapper.tsx
 * @description Authentication wrapper component that conditionally renders login or app
 * @module client
 *
 * This component wraps the main application and handles authentication state:
 * - Checks for valid auth token in localStorage
 * - Shows login page if no valid token exists
 * - Shows main app if user is authenticated
 * - Provides a way to logout
 *
 * Features:
 * - **Token Validation**: Validates token on mount by calling /api/auth/me
 * - **Automatic Redirect**: Redirects to login if token is invalid
 * - **Loading State**: Shows loading indicator while validating token
 * - **Error Handling**: Handles token validation errors gracefully
 *
 * This wrapper can be bypassed or replaced when the library is imported
 * into other projects by providing a custom auth provider.
 */

import { useState, useEffect, ReactNode } from "react";
import { Login } from "./pages/Login";

interface AuthWrapperProps {
    children: ReactNode;
}

export const AuthWrapper = ({ children }: AuthWrapperProps) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        validateToken();
    }, []);

    const validateToken = async () => {
        const token = localStorage.getItem("authToken");

        if (!token) {
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
        }

        try {
            // Validate token with server
            const response = await fetch("/api/auth/me", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setIsAuthenticated(true);
                } else {
                    // Token invalid
                    localStorage.removeItem("authToken");
                    setIsAuthenticated(false);
                }
            } else {
                // Token invalid or expired
                localStorage.removeItem("authToken");
                setIsAuthenticated(false);
            }
        } catch (error) {
            console.error("Token validation error:", error);
            // On error, assume not authenticated
            localStorage.removeItem("authToken");
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Loading state
    if (isLoading) {
        return (
            <div style={{
                width: "100vw",
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#121212"
            }}>
                <div style={{
                    fontSize: "18px",
                    color: "#ffffff",
                    fontFamily: "Roboto, sans-serif"
                }}>
                    Loading...
                </div>
            </div>
        );
    }

    // Show login page if not authenticated
    if (!isAuthenticated) {
        return <Login />;
    }

    // Show main app if authenticated
    return <>{children}</>;
};
