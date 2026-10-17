export function normalizePreviewNavigationInput(input: string): string {
    const value = input.trim();
    if (!value) {
        return "";
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)) {
        return `http://${value}`;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
        return value;
    }
    return `https://${value}`;
}
