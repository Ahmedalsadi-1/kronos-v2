import { cn } from "@/util/util";
import { memo } from "react";
import { acpAgentLogo } from "./acp-agent-logos";

type AcpAgentMarkProps = {
    backend: string;
    className?: string;
};

export const AcpAgentMark = memo(({ backend, className }: AcpAgentMarkProps) => {
    const normalizedBackend = backend.toLowerCase();
    const logo = acpAgentLogo(normalizedBackend);
    if (logo) {
        return (
            <img
                src={logo}
                alt=""
                draggable={false}
                className={cn(
                    "h-6 w-6 shrink-0 object-contain",
                    normalizedBackend === "hermes" && "brightness-0 invert",
                    className
                )}
                aria-hidden="true"
            />
        );
    }

    return (
        <span
            className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#3b3936] bg-[#242321] text-[11px] font-semibold uppercase text-[#b8b3ac]",
                className
            )}
            aria-hidden="true"
        >
            {backend.slice(0, 1)}
        </span>
    );
});

AcpAgentMark.displayName = "AcpAgentMark";
