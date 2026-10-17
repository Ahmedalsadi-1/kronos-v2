import { ChatLayoutButton } from "@hermes/components/chat-layout-button";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router";

import { appViewForPath, sessionRoute } from "@hermes/app/routes";
import { $selectedStoredSessionId } from "@hermes/store/session";

export function HudNavigation() {
    const location = useLocation();
    const navigate = useNavigate();
    const chatRoute = useRef(sessionRoute($selectedStoredSessionId.get() ?? ""));
    const isChat = appViewForPath(location.pathname) === "chat";
    if (isChat) chatRoute.current = location.pathname;

    const nativeNotch = new URLSearchParams(window.location.search).get("nativeNotch") === "1";
    if (isChat && !nativeNotch) return null;

    return (
        <nav data-hud-navigation="" aria-label="HUD sections">
            <ChatLayoutButton />
            {!nativeNotch && !isChat && (
                <button
                    type="button"
                    aria-label="Return to HUD chat"
                    onClick={() => navigate(chatRoute.current)}
                    className="cursor-pointer rounded-md px-2 py-1 text-xs hover:bg-white/10 focus-visible:outline-2"
                >
                    Chat
                </button>
            )}
        </nav>
    );
}
