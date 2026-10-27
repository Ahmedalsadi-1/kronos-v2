// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";
import "./dock-nav.css";

const DockEase = [0.16, 1, 0.3, 1] as const;
const DockWidths = ["4rem", "3.5rem", "3rem"];
const dockNavVariants = cva("kt-dock-nav", {
    variants: { align: { center: "is-center", start: "is-start", end: "is-end" } },
    defaultVariants: { align: "center" },
});

export interface DockNavItem {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    running?: boolean;
    active?: boolean;
}

export interface DockNavProps
    extends Omit<ComponentPropsWithoutRef<"nav">, "children">, VariantProps<typeof dockNavVariants> {
    duration?: number;
    items: DockNavItem[];
}

export function DockNav({ align = "center", className, duration = 0.5, items, ...props }: DockNavProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(null);
    const reducedMotion = useReducedMotion();
    const selectedIndex = hoveredIndex ?? focusedIndex;
    const transition = reducedMotion ? { duration: 0 } : { duration, ease: DockEase };

    return (
        <nav className={cn(dockNavVariants({ align }), className)} {...props}>
            <ul className="kt-dock-nav-list" onMouseLeave={() => setHoveredIndex(null)}>
                {items.map((item, index) => {
                    const selected = selectedIndex === index;
                    const distance = selectedIndex == null ? 3 : Math.abs(index - selectedIndex);
                    return (
                        <motion.li
                            key={item.id}
                            className="kt-dock-nav-item"
                            data-expanded={selected || undefined}
                            initial={false}
                            animate={{ width: DockWidths[distance] ?? "2.5rem" }}
                            transition={transition}
                            onMouseEnter={() => setHoveredIndex(index)}
                        >
                            <button
                                type="button"
                                className={cn(
                                    "kt-dock-nav-button",
                                    item.running && "is-running",
                                    item.active && "is-active"
                                )}
                                aria-label={item.label}
                                aria-current={item.active ? "true" : undefined}
                                onClick={item.onClick}
                                onFocus={() => setFocusedIndex(index)}
                                onBlur={() => setFocusedIndex(null)}
                            >
                                <span className="kt-dock-nav-icon" aria-hidden="true">
                                    {item.icon}
                                </span>
                            </button>
                            <motion.div
                                className="kt-dock-nav-tooltip"
                                aria-hidden="true"
                                initial={false}
                                animate={{ opacity: selected ? 1 : 0, y: selected ? "-140%" : "-80%" }}
                                transition={transition}
                            >
                                {item.label}
                            </motion.div>
                        </motion.li>
                    );
                })}
            </ul>
        </nav>
    );
}
