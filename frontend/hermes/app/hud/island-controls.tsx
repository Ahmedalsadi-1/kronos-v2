import { TitlebarIcon } from "@hermes/app/shell/titlebar-icon";
import { Button } from "@hermes/components/ui/button";
import { Tip } from "@hermes/components/ui/tooltip";

export function HudComposerSurfaceControls() {
    if (new URLSearchParams(window.location.search).get("nativeNotch") === "1") return null;
    return (
        <div className="flex shrink-0 items-center gap-1" data-hud-surface-controls="">
            <span className="flex items-center" data-hud-island-controls-slot="" />
            <Tip label="Dock KronOS Agent in the workspace">
                <Button
                    aria-label="Dock KronOS Agent in the workspace"
                    className="cursor-pointer"
                    onClick={() => void window.hermesDesktop?.hud?.dock?.()}
                    size="icon-titlebar"
                    type="button"
                    variant="ghost"
                >
                    <TitlebarIcon name="layout-sidebar-left" />
                </Button>
            </Tip>
        </div>
    );
}
