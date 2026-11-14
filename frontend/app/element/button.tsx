// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button as HermesButton } from "@hermes/components/ui/button";
import { ButtonAppearance } from "@hermes/shared/button-appearance";
import { forwardRef, memo, ReactNode, useImperativeHandle, useRef } from "react";

import "./button.scss";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    className?: string;
    children?: ReactNode;
    variant?: keyof typeof ButtonAppearance;
    as?: keyof React.JSX.IntrinsicElements | React.ComponentType<any>;
}

const Button = memo(
    forwardRef<HTMLButtonElement, ButtonProps>(
        ({ children, disabled, className = "", variant, as: Component = "button", ...props }: ButtonProps, ref) => {
            const btnRef = useRef<HTMLButtonElement>(null);
            useImperativeHandle(ref, () => btnRef.current as HTMLButtonElement);

            const classes = className.split(/\s+/);
            const appearance =
                variant ??
                (classes.includes("ghost")
                    ? "ghost"
                    : classes.includes("outlined") || classes.includes("outline")
                      ? "outline"
                      : classes.includes("red")
                        ? "destructive"
                        : classes.includes("grey")
                          ? "secondary"
                          : "default");

            return (
                <HermesButton asChild variant={appearance} className={`wave-button ${className}`}>
                    <Component ref={btnRef} tabIndex={disabled ? -1 : 0} disabled={disabled} {...props}>
                        {children}
                    </Component>
                </HermesButton>
            );
        }
    )
);

Button.displayName = "Button";

export { Button };
