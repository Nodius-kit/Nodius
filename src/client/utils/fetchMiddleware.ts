/**
 * @file fetchMiddleware.ts
 * @description Fetch middleware that automatically adds API base URL and authentication token
 *
 * This module overrides the native window.fetch to:
 * - Automatically prepend the API base URL to relative URLs
 * - Add Authorization header with JWT token from localStorage
 * - Handle 401 responses by redirecting to login page
 *
 * This allows all fetch calls to remain unchanged while centralizing:
 * - API endpoint configuration
 * - Authentication token management
 * - Unauthorized access handling
 */

// Store the original fetch function before overriding
const originalFetch = window.fetch;

/**
 * Get the API base URL from environment variables
 */
const getApiBaseUrl = (): string => {
    const apiUrl = (import.meta as any).env.VITE_API_URL;
    if (!apiUrl) {
        console.error('VITE_API_URL is not defined in environment variables');
        return 'http://localhost:8426'; // Fallback to default
    }
    return apiUrl;
};

/**
 * Check if a URL is relative (doesn't have a protocol/host)
 */
const isRelativeUrl = (url: string): boolean => {
    // Check if it starts with http://, https://, //, or is a data/blob URL
    return !url.startsWith('http://') &&
           !url.startsWith('https://') &&
           !url.startsWith('//') &&
           !url.startsWith('data:') &&
           !url.startsWith('blob:');
};

/**
 * Get the authentication token from localStorage
 */
const getAuthToken = (): string | null => {
    return localStorage.getItem('authToken');
};

/**
 * Override the native fetch to automatically prepend API base URL to relative URLs
 * and add Authorization header with JWT token
 */
export const initializeFetchMiddleware = (): void => {
    window.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> => {
        const apiBaseUrl = getApiBaseUrl();
        let url: string;

        // Handle different input types
        if (typeof input === 'string') {
            // If it's a relative URL, prepend the API base URL
            if (isRelativeUrl(input)) {
                url = `${apiBaseUrl}${input.startsWith('/') ? input : '/' + input}`;
            } else {
                url = input;
            }
        } else if (input instanceof URL) {
            url = input.href;
        } else if (input instanceof Request) {
            // For Request objects, check if the URL is relative
            if (isRelativeUrl(input.url)) {
                url = `${apiBaseUrl}${input.url.startsWith('/') ? input.url : '/' + input.url}`;
                // Create a new Request with the updated URL
                input = new Request(url, input);
            }
            // Add auth token to Request headers if available
            const token = getAuthToken();
            if (token && !input.headers.has('Authorization')) {
                const headers = new Headers(input.headers);
                headers.set('Authorization', `Bearer ${token}`);
                input = new Request(input, { headers });
            }
            // Call original fetch with the modified Request
            return originalFetch(input, init);
        } else {
            throw new Error('Invalid input type for fetch');
        }

        // Add Authorization header if token exists and not already set
        const token = getAuthToken();
        if (token) {
            init = init || {};
            init.headers = init.headers || {};

            // Handle different header types
            if (init.headers instanceof Headers) {
                if (!init.headers.has('Authorization')) {
                    init.headers.set('Authorization', `Bearer ${token}`);
                }
            } else if (Array.isArray(init.headers)) {
                // Check if Authorization is already in array
                const hasAuth = init.headers.some(([key]) => key.toLowerCase() === 'authorization');
                if (!hasAuth) {
                    init.headers.push(['Authorization', `Bearer ${token}`]);
                }
            } else {
                // Plain object
                const headers = init.headers as Record<string, string>;
                if (!headers['Authorization'] && !headers['authorization']) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
        }

        // Call the original fetch with the potentially modified URL and headers
        const response = await originalFetch(url, init);

        // Handle 401 Unauthorized - redirect to login
        if (response.status === 401) {
            // Check if we're already on the login page to avoid infinite redirects
            if (!window.location.pathname.includes('/login')) {
                console.warn('Unauthorized access - redirecting to login');
                // Clear invalid token
                localStorage.removeItem('authToken');
                // Redirect to login
                window.location.href = '/login';
            }
        }

        return response;
    };
};

/**
 * Restore the original fetch function (useful for testing or cleanup)
 */
export const restoreFetch = (): void => {
    window.fetch = originalFetch;
};

/**
 * Export the API base URL getter for use in WebSocket connections
 */
export const getApiUrl = getApiBaseUrl;

/**
 * Export the original fetch for cases where you need to bypass the middleware
 */
export const nativeFetch = originalFetch;
