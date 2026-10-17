// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/util/util";

const systemButtonVariants = cva("kt-system-button", {
    variants: {
        variant: {
            plain: "is-plain",
            filled: "is-filled",
            tinted: "is-tinted",
            destructive: "is-destructive",
        },
        size: {
            small: "is-small",
            regular: "is-regular",
            large: "is-large",
        },
        selected: {
            true: "is-selected",
            false: "",
        },
    },
    defaultVariants: { variant: "plain", size: "regular", selected: false },
});

type SystemButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof systemButtonVariants> & { asChild?: boolean };

const SystemButton = forwardRef<HTMLButtonElement, SystemButtonProps>(
    ({ asChild, className, size, selected, variant, ...props }, ref) => {
        const Component = asChild ? Slot : "button";
        return (
            <Component
                ref={ref}
                className={cn(systemButtonVariants({ size, selected, variant }), className)}
                {...props}
            />
        );
    }
);
SystemButton.displayName = "SystemButton";

type SystemMaterialProps = HTMLAttributes<HTMLDivElement> & { material?: SystemMaterialRole };

const SystemMaterial = forwardRef<HTMLDivElement, SystemMaterialProps>(
    ({ className, material = "content", ...props }, ref) => (
        <div ref={ref} className={cn("kt-system-material", `is-${material}`, className)} {...props} />
    )
);
SystemMaterial.displayName = "SystemMaterial";

const SystemToolbar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("kt-system-toolbar", className)} role="toolbar" {...props} />
));
SystemToolbar.displayName = "SystemToolbar";

const SystemSidebar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
    <aside ref={ref} className={cn("kt-system-sidebar", className)} {...props} />
));
SystemSidebar.displayName = "SystemSidebar";

const SystemPopover = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
    <section
        ref={ref}
        className={cn("kt-system-popover", className)}
        role="dialog"
        data-live-block-occluder=""
        {...props}
    />
));
SystemPopover.displayName = "SystemPopover";

const SystemMenu = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("kt-system-menu", className)} role="menu" data-live-block-occluder="" {...props} />
));
SystemMenu.displayName = "SystemMenu";

const SystemSegmentedControl = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
    <nav ref={ref} className={cn("kt-system-segmented", className)} {...props} />
));
SystemSegmentedControl.displayName = "SystemSegmentedControl";

type SystemToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
};

const SystemToggle = forwardRef<HTMLButtonElement, SystemToggleProps>(
    ({ checked, className, onCheckedChange, onClick, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            role="switch"
            aria-checked={checked}
            className={cn("kt-system-toggle", checked && "is-checked", className)}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) onCheckedChange?.(!checked);
            }}
            {...props}
        >
            <span aria-hidden="true" />
        </button>
    )
);
SystemToggle.displayName = "SystemToggle";

type SystemListRowProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    title: ReactNode;
    detail?: ReactNode;
    trailing?: ReactNode;
};

const SystemListRow = forwardRef<HTMLButtonElement, SystemListRowProps>(
    ({ className, detail, icon, title, trailing, type = "button", ...props }, ref) => (
        <button ref={ref} type={type} className={cn("kt-system-list-row", className)} {...props}>
            {icon != null && <span className="kt-system-list-row-icon">{icon}</span>}
            <span className="kt-system-list-row-copy">
                <strong>{title}</strong>
                {detail != null && <small>{detail}</small>}
            </span>
            {trailing != null && <span className="kt-system-list-row-trailing">{trailing}</span>}
        </button>
    )
);
SystemListRow.displayName = "SystemListRow";

const SystemStatusBadge = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
    ({ className, ...props }, ref) => <span ref={ref} className={cn("kt-system-status-badge", className)} {...props} />
);
SystemStatusBadge.displayName = "SystemStatusBadge";

const SystemProgress = forwardRef<HTMLOutputElement, HTMLAttributes<HTMLOutputElement> & { value: number }>(
    ({ className, value, ...props }, ref) => (
        <output
            ref={ref}
            className={cn("kt-system-progress", className)}
            aria-label={`${Math.round(value)}%`}
            {...props}
        >
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </output>
    )
);
SystemProgress.displayName = "SystemProgress";

const SystemDock = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("kt-system-dock", className)} role="toolbar" {...props} />
));
SystemDock.displayName = "SystemDock";

function SystemWindowFrame({
    children,
    className,
    titlebar,
}: {
    children: ReactNode;
    className?: string;
    titlebar: ReactNode;
}) {
    return (
        <div className={cn("kt-system-window-frame", className)}>
            {titlebar}
            <div className="kt-system-window-content">{children}</div>
        </div>
    );
}

export {
    SystemButton,
    systemButtonVariants,
    SystemDock,
    SystemListRow,
    SystemMaterial,
    SystemMenu,
    SystemPopover,
    SystemProgress,
    SystemSegmentedControl,
    SystemSidebar,
    SystemStatusBadge,
    SystemToggle,
    SystemToolbar,
    SystemWindowFrame,
    type SystemButtonProps,
};
