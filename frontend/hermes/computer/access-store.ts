import { atom } from "nanostores";
import type { SandboxComputerAccess } from "../../types/linux-desktops";

export const $sandboxComputerAccess = atom<SandboxComputerAccess>({
    enabled: false,
    desktopId: "",
});
