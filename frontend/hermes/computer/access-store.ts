import { atom } from "nanostores";
export const $sandboxComputerAccess = atom<{ enabled: boolean; desktopId: string }>({ enabled: false, desktopId: "" });
