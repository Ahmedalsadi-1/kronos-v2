export type DesktopGrabPayload = {
    application: string;
    bundleId: string;
    window: string;
    role: string;
    name: string;
    value: string;
    bounds: { x: number; y: number; width: number; height: number };
    screenshot?: string;
    screenshotOmitted?: "sensitive-content";
};

export type DesktopGrabResult = { status: "selected"; payload: DesktopGrabPayload } | { status: "cancelled" };
