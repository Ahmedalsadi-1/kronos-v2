import { HermesChatMount } from "@/app/view/hermes/hermes-chat-mount";
import { HermesHudFrame } from "@/app/view/hermes/hermes-hud-overlay";
import { useHudComposerDrag } from "@hermes/app/hud/composer-drag";
import { HudComposerSurfaceControls } from "@hermes/app/hud/island-controls";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import "@hermes/styles.css";

function Composer() {
    const { onPointerDown } = useHudComposerDrag(true);
    return (
        <div
            data-slot="composer-surface"
            onPointerDown={onPointerDown}
            className="pointer-events-auto flex flex-col gap-2 border border-neutral-600 bg-neutral-950 p-3 text-white"
        >
            <div className="h-6 text-xs text-neutral-400">Hold here and drag</div>
            <textarea aria-label="Draft" defaultValue="Preserve this draft" className="bg-transparent text-sm" />
            <HudComposerSurfaceControls />
        </div>
    );
}

export function HudDragPreview() {
    return (
        <RootTooltipProvider>
            <HermesChatMount targetId="preview-hud-drag">
                <Composer />
            </HermesChatMount>
            <HermesHudFrame placement="shell" geometry={{ x: 40, y: 80, width: 580, height: 400 }}>
                <div id="preview-hud-drag" className="pointer-events-auto h-full" />
            </HermesHudFrame>
        </RootTooltipProvider>
    );
}
