import { useEffect, useState } from "react";

export function useThemeVersion() {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const observer = new MutationObserver(() => setVersion((value) => value + 1));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
        });
        return () => observer.disconnect();
    }, []);
    return version;
}
