/**
 * @file Login.tsx
 * @description Default login page component
 * @module client/pages
 *
 * Default authentication page that allows users to login with username and password.
 * This component is replaceable when the library is imported into other projects.
 *
 * Features:
 * - **Username/Password Auth**: Standard form-based authentication
 * - **JWT Token Storage**: Stores token in localStorage after successful login
 * - **Error Handling**: Displays authentication errors
 * - **Theme Support**: Full dark/light theme integration
 * - **Responsive Design**: Works on all screen sizes
 * - **Loading States**: Shows loading indicator during authentication
 *
 * Token Storage:
 * - Stores JWT token in localStorage as 'authToken'
 * - Automatically adds token to all API requests via fetchMiddleware
 * - Redirects to home page after successful authentication
 *
 * This page can be completely replaced by:
 * 1. Creating a custom AuthProvider
 * 2. Setting a custom login page URL
 * 3. Implementing your own login component/page
 */

import { useState, useContext, FormEvent } from "react";
import { ThemeContext } from "../hooks/contexts/ThemeContext";
import { useDynamicClass } from "../hooks/useDynamicClass";
import { Input } from "../component/form/Input";
import { Button } from "../component/form/Button";
import toast from "react-hot-toast";

export const Login = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const Theme = useContext(ThemeContext);
    const isDark = Theme.state.theme === "dark";
    const background = isDark ? Theme.state.background.dark.default : Theme.state.background.light.default;
    const paperBg = isDark ? Theme.state.background.dark.paper : Theme.state.background.light.paper;
    const textPrimary = isDark ? Theme.state.text.dark.primary : Theme.state.text.light.primary;
    const textSecondary = isDark ? Theme.state.text.dark.secondary : Theme.state.text.light.secondary;

    const containerClass = useDynamicClass(`& {
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: ${background};
    }`);

    const cardClass = useDynamicClass(`& {
        background-color: ${paperBg};
        border-radius: 16px;
        padding: 48px;
        box-shadow: var(--nodius-shadow-4);
        max-width: 400px;
        width: 90%;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }`);

    const titleClass = useDynamicClass(`& {
        font-size: 32px;
        font-weight: 600;
        color: ${textPrimary};
        margin: 0;
        text-align: center;
    }`);

    const subtitleClass = useDynamicClass(`& {
        font-size: 14px;
        color: ${textSecondary};
        margin: 0;
        text-align: center;
        margin-top: -8px;
    }`);

    const formClass = useDynamicClass(`& {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }`);

    const errorClass = useDynamicClass(`& {
        color: ${Theme.state.error[Theme.state.theme].main};
        font-size: 14px;
        text-align: center;
        padding: 12px;
        background-color: ${Theme.state.error[Theme.state.theme].main}20;
        border-radius: 8px;
    }`);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (data.success && data.token) {
                // Store token in localStorage
                localStorage.setItem("authToken", data.token);

                // Show success message
                toast.success("Login successful!");

                // Redirect to home page
                window.location.href = "/";
            } else {
                setError(data.error || "Authentication failed");
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("An error occurred during login. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={containerClass}>
            <div className={cardClass}>
                <h1 className={titleClass}>Nodius</h1>
                <p className={subtitleClass}>Sign in to continue</p>

                <form className={formClass} onSubmit={handleSubmit}>
                    <Input
                        label="Username"
                        type="text"
                        value={username}
                        onChange={setUsername}
                        placeholder="Enter your username"
                        required
                        disabled={loading}
                        autoComplete="username"
                    />

                    <Input
                        label="Password"
                        type="password"
                        value={password}
                        onChange={setPassword}
                        placeholder="Enter your password"
                        required
                        disabled={loading}
                        autoComplete="current-password"
                    />

                    {error && <div className={errorClass}>{error}</div>}

                    <Button
                        type="submit"
                        variant="outlined"
                        color="primary"
                        size="large"
                        fullWidth
                        disabled={loading || !username || !password}
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </Button>
                </form>
            </div>
        </div>
    );
};
