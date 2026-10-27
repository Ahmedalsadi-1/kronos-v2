// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties, ReactNode } from "react";
import "./phone-frame.css";

export function PhoneFrame({
    platform,
    children,
    onButton,
    screenAspectRatio,
    controlsDisabled = false,
    toolbar,
}: {
    platform?: "android" | "ios";
    children: ReactNode;
    onButton?: (button: "power" | "volume-up" | "volume-down") => void;
    screenAspectRatio?: number;
    controlsDisabled?: boolean;
    toolbar?: ReactNode;
}) {
    if (!platform) return <>{children}</>;
    const ios = platform === "ios";
    const adaptive =
        Number.isFinite(screenAspectRatio) &&
        screenAspectRatio > 0 &&
        Math.abs(screenAspectRatio - (ios ? 389.5 / 843.5 : 360 / 800)) > 0.002;
    return (
        <div className="kt-computers-phone-stage">
            {toolbar && (
                <div className="kt-phone-toolbar" role="toolbar" aria-label="Phone actions">
                    {toolbar}
                </div>
            )}
            <div
                className={`kt-phone-frame kt-phone-frame-${platform}${adaptive ? " kt-phone-frame-adaptive" : ""}`}
                style={adaptive ? ({ "--device-aspect": screenAspectRatio } as CSSProperties) : undefined}
            >
                <div className="kt-phone-screen">{children}</div>
                <svg
                    viewBox={ios ? "0 0 433 882" : "0 0 380 830"}
                    fill="none"
                    aria-hidden="true"
                    className="kt-phone-hardware"
                >
                    {ios ? (
                        <>
                            <path
                                fillRule="evenodd"
                                d="M75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73C2 32.6832 34.6832 0 75 0ZM77 19.25C46.21 19.25 21.25 44.21 21.25 75V807C21.25 837.79 46.21 862.75 77 862.75H355C385.79 862.75 410.75 837.79 410.75 807V75C410.75 44.21 385.79 19.25 355 19.25H77Z"
                                fill="var(--phone-edge)"
                            />
                            <path
                                fillRule="evenodd"
                                d="M76 4H356C394.66 4 426 35.34 426 74V808C426 846.66 394.66 878 356 878H76C37.34 878 6 846.66 6 808V74C6 35.34 37.34 4 76 4ZM77 19.25C46.21 19.25 21.25 44.21 21.25 75V807C21.25 837.79 46.21 862.75 77 862.75H355C385.79 862.75 410.75 837.79 410.75 807V75C410.75 44.21 385.79 19.25 355 19.25H77Z"
                                fill="var(--phone-body)"
                            />
                            <path
                                d="M0 171C0 170.448 .448 170 1 170H3V204H1C.448 204 0 203.552 0 203V171ZM1 234C1 233.448 1.448 233 2 233H3.5V300H2C1.448 300 1 299.552 1 299V234ZM1 319C1 318.448 1.448 318 2 318H3.5V385H2C1.448 385 1 384.552 1 384V319ZM430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z"
                                fill="var(--phone-edge)"
                            />
                            <rect x="154" y="30" width="124" height="37" rx="18.5" fill="var(--phone-body)" />
                            <circle cx="259.5" cy="48.5" r="5.5" fill="var(--phone-edge)" />
                        </>
                    ) : (
                        <>
                            <path
                                d="M376 153H378C379.105 153 380 153.895 380 155V249C380 250.105 379.105 251 378 251H376V153ZM376 301H378C379.105 301 380 301.895 380 303V351C380 352.105 379.105 353 378 353H376V301Z"
                                fill="var(--phone-edge)"
                            />
                            <path
                                fillRule="evenodd"
                                d="M42 0H336C359.196 0 378 18.804 378 42V788C378 811.196 359.196 830 336 830H42C18.804 830 0 811.196 0 788V42C0 18.804 18.804 0 42 0ZM43 14C24.222 14 9 29.222 9 48V780C9 798.778 24.222 814 43 814H335C353.778 814 369 798.778 369 780V48C369 29.222 353.778 14 335 14H43Z"
                                fill="var(--phone-edge)"
                            />
                            <path
                                fillRule="evenodd"
                                d="M40 5H338C358.987 5 376 22.013 376 43V787C376 807.987 358.987 825 338 825H40C19.013 825 2 807.987 2 787V43C2 22.013 19.013 5 40 5ZM43 14C24.222 14 9 29.222 9 48V780C9 798.778 24.222 814 43 814H335C353.778 814 369 798.778 369 780V48C369 29.222 353.778 14 335 14H43Z"
                                fill="var(--phone-body)"
                            />
                            <circle cx="189" cy="28" r="9" fill="var(--phone-body)" />
                            <circle cx="189" cy="28" r="4" fill="var(--phone-edge)" />
                        </>
                    )}
                </svg>
                {onButton && (
                    <>
                        <button
                            className="kt-phone-button kt-phone-power"
                            aria-label="Power button"
                            disabled={controlsDisabled}
                            onClick={() => onButton("power")}
                        />
                        <button
                            className="kt-phone-button kt-phone-volume-up"
                            aria-label="Volume up"
                            disabled={controlsDisabled}
                            onClick={() => onButton("volume-up")}
                        />
                        <button
                            className="kt-phone-button kt-phone-volume-down"
                            aria-label="Volume down"
                            disabled={controlsDisabled}
                            onClick={() => onButton("volume-down")}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
