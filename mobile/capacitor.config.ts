import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

const config: CapacitorConfig = {
    appId: "dev.kronterm.iphone",
    appName: "KronTerm",
    webDir: "dist",
    server: {
        iosScheme: "kronterm",
    },
    ios: {
        contentInset: "never",
        backgroundColor: "#ffffff",
        preferredContentMode: "mobile",
    },
    plugins: {
        StatusBar: {
            style: "DARK",
            overlaysWebView: true,
        },
        Keyboard: {
            resize: KeyboardResize.Native,
            style: KeyboardStyle.Light,
        },
    },
};

export { config as default };
