import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/app/store/jotaiStore", () => ({ globalStore: {} }));
vi.mock("@/app/store/wos", () => ({}));
vi.mock("@/store/global", () => ({}));

import { captureNativeNotchFrame } from "./use-native-notch-preview";

afterEach(() => vi.unstubAllGlobals());

describe("live notch stream frames", () => {
    test("uses video pixels even when the stream is outside the visible workspace viewport", () => {
        class Video {
            videoWidth = 1920;
            videoHeight = 1080;
            readyState = 4;
        }
        vi.stubGlobal("HTMLVideoElement", Video);
        const video = new Video();
        const drawImage = vi.fn();
        const thumbnail = {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage }),
            toDataURL: () => "data:image/jpeg;base64,YWJj",
        };
        vi.stubGlobal("document", { createElement: () => thumbnail });
        const element = { querySelector: () => video, querySelectorAll: () => [] } as unknown as HTMLElement;
        expect(captureNativeNotchFrame(element)).toBe("YWJj");
        expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 960, 540);
    });
    test("uses the sandbox canvas while video is unavailable, and falls back safely on tainted frames", () => {
        vi.stubGlobal("HTMLVideoElement", class {});
        const canvas = { width: 1024, height: 768 };
        const drawImage = vi.fn();
        const toDataURL = vi.fn(() => "data:image/jpeg;base64,ZnJhbWU=");
        vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage }), toDataURL }) });
        const element = { querySelector: () => null, querySelectorAll: () => [canvas] } as unknown as HTMLElement;
        expect(captureNativeNotchFrame(element)).toBe("ZnJhbWU=");
        expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0, 960, 720);
        toDataURL.mockImplementation(() => {
            throw new Error("SecurityError");
        });
        expect(captureNativeNotchFrame(element)).toBeUndefined();
    });
});
