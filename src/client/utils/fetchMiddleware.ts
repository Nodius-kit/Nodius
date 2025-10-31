/**
 * @file fetchMiddleware.ts
 * @description Fetch middleware that automatically adds API base URL from environment
 *
 * This module overrides the native window.fetch to automatically prepend the API base URL
 * to relative URLs. This allows all fetch calls to remain unchanged while centralizing
 * the API endpoint configuration.
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
 * Override the native fetch to automatically prepend API base URL to relative URLs
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
            // Call original fetch with the modified Request
            return originalFetch(input, init);
        } else {
            throw new Error('Invalid input type for fetch');
        }

        // Call the original fetch with the potentially modified URL
        return originalFetch(url, init);
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
