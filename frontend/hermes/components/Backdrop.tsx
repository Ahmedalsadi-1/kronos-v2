import { FluidCanvas } from "@hermes/components/fluid-canvas";
import { $backdrop } from "@hermes/store/backdrop";
import { useStore } from "@nanostores/react";

export function Backdrop() {
    const on = useStore($backdrop);
    if (!on) return null;
    return (
        <FluidCanvas
            className="hermes-fluid-backdrop pointer-events-none absolute inset-0 z-2 opacity-[0.12]"
            quality="low"
            glow={0}
            curl={16}
            colors={["#5c837e", "#7e8279", "#54666c", "#898272"]}
            listenOnParent
        />
    );
}
