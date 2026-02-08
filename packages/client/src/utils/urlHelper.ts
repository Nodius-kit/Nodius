export function setSearchParam(
    key: string,
    value: string | number | boolean | null,
    options?: { replace?: boolean }
) {
    const url = new URL(window.location.toString());

    if (value == null) {
        url.searchParams.delete(key);
    } else {
        url.searchParams.set(key, String(value));
    }

    const method = options?.replace
        ? "replaceState"
        : "pushState";

    window.history[method]({}, "", url);
}


export function getSearchParam(
    key: string,
    defaultValue?: string
): string | null {
    const value = new URL(window.location.href).searchParams.get(key);
    return value ?? defaultValue ?? null;
}

export function getAllSearchParams() {
    return Object.fromEntries(
        new URL(window.location.href).searchParams.entries()
    );
}

