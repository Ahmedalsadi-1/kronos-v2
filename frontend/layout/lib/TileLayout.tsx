// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getSettingsKeyAtom } from "@/app/store/global";
import clsx from "clsx";
import { toPng } from "html-to-image";
import { Atom, useAtomValue, useSetAtom } from "jotai";
import React, {
    CSSProperties,
    ReactNode,
    Suspense,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { DropTargetMonitor, XYCoord, useDrag, useDragLayer, useDrop } from "react-dnd";
import { debounce, throttle } from "throttle-debounce";
import { useDevicePixelRatio } from "use-device-pixel-ratio";
import { shouldIncludeDragPreviewNode } from "./drag-preview";
import { LayoutModel } from "./layoutModel";
import { useNodeModel, useTileLayout } from "./layoutModelHooks";
import "./tilelayout.scss";
import {
    FlexDirection,
    LayoutNode,
    LayoutTreeActionType,
    LayoutTreeComputeMoveNodeAction,
    ResizeHandleProps,
    TileLayoutContents,
} from "./types";
import { determineDropDirection } from "./utils";

const tileItemType = "TILE_ITEM";

export interface TileLayoutProps {
    /**
     * The atom containing the layout tree state.
     */
    tabAtom: Atom<Tab>;

    /**
     * callbacks and information about the contents (or styling) of the TileLayout or contents
     */
    contents: TileLayoutContents;

    /**
     * A callback for getting the cursor point in reference to the current window. This removes Electron as a runtime dependency, allowing for better integration with Storybook.
     * @returns The cursor position relative to the current window.
     */
    getCursorPoint?: () => Point;
}

const DragPreviewWidth = 300;
const DragPreviewHeight = 300;
const KeyboardResizeStepPx = 16;

function TileLayoutComponent({ tabAtom, contents, getCursorPoint }: TileLayoutProps) {
    const layoutModel = useTileLayout(tabAtom, contents);
    const overlayTransform = useAtomValue(layoutModel.overlayTransform);
    const setActiveDrag = useSetAtom(layoutModel.activeDrag);
    const setReady = useSetAtom(layoutModel.ready);
    const isResizing = useAtomValue(layoutModel.isResizing);
    const numLeafs = useAtomValue(layoutModel.numLeafs);

    const { activeDrag, dragClientOffset, dragItemType } = useDragLayer((monitor) => ({
        activeDrag: monitor.isDragging(),
        dragClientOffset: monitor.getClientOffset(),
        dragItemType: monitor.getItemType(),
    }));

    useEffect(() => {
        const activeTileDrag = activeDrag && dragItemType == tileItemType;
        setActiveDrag(activeTileDrag);
    }, [activeDrag, dragItemType]);

    const checkForCursorBounds = useMemo(
        () =>
            debounce(100, (dragClientOffset: XYCoord) => {
                const cursorPoint = dragClientOffset ?? getCursorPoint?.();
                if (cursorPoint && layoutModel.displayContainerRef?.current) {
                    const displayContainerRect = layoutModel.displayContainerRef.current.getBoundingClientRect();
                    const normalizedX = cursorPoint.x - displayContainerRect.x;
                    const normalizedY = cursorPoint.y - displayContainerRect.y;
                    if (
                        normalizedX <= 0 ||
                        normalizedX >= displayContainerRect.width ||
                        normalizedY <= 0 ||
                        normalizedY >= displayContainerRect.height
                    ) {
                        layoutModel.treeReducer({ type: LayoutTreeActionType.ClearPendingAction });
                    }
                }
            }),
        [getCursorPoint, layoutModel]
    );

    // Effect to detect when the cursor leaves the TileLayout hit trap so we can remove any placeholders. This cannot be done using pointer capture
    // because that conflicts with the DnD layer.
    useEffect(() => {
        if (activeDrag && dragItemType === tileItemType) checkForCursorBounds(dragClientOffset);
        return () => checkForCursorBounds.cancel({ upcomingOnly: true });
    }, [activeDrag, checkForCursorBounds, dragClientOffset, dragItemType]);

    // Ensure that we don't see any jostling in the layout when we're rendering it the first time.
    // `animate` will be disabled until after the transforms have all applied the first time.
    const [animate, setAnimate] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => {
            setAnimate(true);
            setReady(true);
        }, 50);
        return () => clearTimeout(timer);
    }, [setReady]);

    const gapSizePx = useAtomValue(layoutModel.gapSizePx);
    const animationTimeS = useAtomValue(layoutModel.animationTimeS);
    const tileStyle = useMemo(
        () =>
            ({
                "--gap-size-px": `${gapSizePx}px`,
                "--animation-time-s": `${animationTimeS}s`,
            }) as CSSProperties,
        [gapSizePx, animationTimeS]
    );

    return (
        <Suspense>
            <div
                className={clsx("tile-layout", contents.className, {
                    animate: animate && !isResizing,
                    "has-splits": numLeafs > 1,
                })}
                style={tileStyle}
            >
                <div key="display" ref={layoutModel.displayContainerRef} className="display-container">
                    <DisplayNodesWrapper layoutModel={layoutModel} />
                    <NodeBackdrops layoutModel={layoutModel} />
                </div>
                <ResizeHandleWrapper layoutModel={layoutModel} />
                <Placeholder key="placeholder" layoutModel={layoutModel} style={{ top: 10000, ...overlayTransform }} />
                <OverlayNodeWrapper layoutModel={layoutModel} />
            </div>
        </Suspense>
    );
}
export const TileLayout = memo(TileLayoutComponent) as typeof TileLayoutComponent;

function NodeBackdrops({ layoutModel }: { layoutModel: LayoutModel }) {
    const [blockBlurAtom] = useState(() => getSettingsKeyAtom("window:magnifiedblockblursecondarypx"));
    const blockBlur = useAtomValue(blockBlurAtom);
    const ephemeralNode = useAtomValue(layoutModel.ephemeralNode);
    const magnifiedNodeId = useAtomValue(layoutModel.magnifiedNodeIdAtom);

    const [showMagnifiedBackdrop, setShowMagnifiedBackdrop] = useState(!!ephemeralNode);
    const [showEphemeralBackdrop, setShowEphemeralBackdrop] = useState(!!magnifiedNodeId);

    const debouncedSetMagnifyBackdrop = useCallback(
        debounce(100, () => setShowMagnifiedBackdrop(true)),
        []
    );

    useEffect(() => {
        if (magnifiedNodeId && !showMagnifiedBackdrop) {
            debouncedSetMagnifyBackdrop();
        }
        if (!magnifiedNodeId) {
            setShowMagnifiedBackdrop(false);
        }
        if (ephemeralNode && !showEphemeralBackdrop) {
            setShowEphemeralBackdrop(true);
        }
        if (!ephemeralNode) {
            setShowEphemeralBackdrop(false);
        }
    }, [ephemeralNode, magnifiedNodeId]);

    const blockBlurStr = `${blockBlur}px`;

    return (
        <>
            {showMagnifiedBackdrop && (
                <div
                    className="magnified-node-backdrop"
                    onClick={() => {
                        layoutModel.magnifyNodeToggle(magnifiedNodeId);
                    }}
                    style={{ "--block-blur": blockBlurStr } as CSSProperties}
                />
            )}
            {showEphemeralBackdrop && (
                <div
                    className="ephemeral-node-backdrop"
                    onClick={() => {
                        layoutModel.closeNode(ephemeralNode?.id);
                    }}
                    style={{ "--block-blur": blockBlurStr } as CSSProperties}
                />
            )}
        </>
    );
}

interface DisplayNodesWrapperProps {
    /**
     * The layout tree state.
     */
    layoutModel: LayoutModel;
}

const DisplayNodesWrapper = ({ layoutModel }: DisplayNodesWrapperProps) => {
    const leafs = useAtomValue(layoutModel.leafs);

    return useMemo(
        () =>
            leafs.map((node) => {
                return <DisplayNode key={node.id} layoutModel={layoutModel} node={node} />;
            }),
        [leafs]
    );
};

interface DisplayNodeProps {
    layoutModel: LayoutModel;
    /**
     * The leaf node object, containing the data needed to display the leaf contents to the user.
     */
    node: LayoutNode;
}

/**
 * The draggable and displayable portion of a leaf node in a layout tree.
 */
const DisplayNode = ({ layoutModel, node }: DisplayNodeProps) => {
    const nodeModel = useNodeModel(layoutModel, node);
    const tileNodeRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const addlProps = useAtomValue(nodeModel.additionalProps);
    const devicePixelRatio = useDevicePixelRatio();
    const isEphemeral = useAtomValue(nodeModel.isEphemeral);
    const isMagnified = useAtomValue(nodeModel.isMagnified);

    const [{ isDragging }, drag, dragPreview] = useDrag(
        () => ({
            type: tileItemType,
            canDrag: () => !(isEphemeral || isMagnified),
            item: () => node,
            collect: (monitor) => ({
                isDragging: monitor.isDragging(),
            }),
        }),
        [node, addlProps, isEphemeral, isMagnified]
    );

    const previewElement = useMemo(() => {
        return (
            <div key="preview" className="tile-preview-container" aria-hidden="true">
                <div
                    className="tile-preview"
                    ref={previewRef}
                    style={{
                        width: DragPreviewWidth,
                        height: DragPreviewHeight,
                        transform: `scale(${1 / devicePixelRatio})`,
                    }}
                >
                    {layoutModel.renderPreview?.(nodeModel)}
                </div>
            </div>
        );
    }, [devicePixelRatio, nodeModel]);

    const leafContent = useMemo(() => {
        return (
            <div key="leaf" className="tile-leaf">
                {layoutModel.renderContent(nodeModel)}
            </div>
        );
    }, [nodeModel]);

    useEffect(() => {
        drag(nodeModel.dragHandleRef);
        const handle = nodeModel.dragHandleRef.current;
        if (!handle || isEphemeral || isMagnified || !layoutModel.renderPreview) return;

        let cancelled = false;
        let capturing = false;
        const generatePreviewImage = async () => {
            if (capturing || !previewRef.current) return;
            capturing = true;
            try {
                const url = await toPng(previewRef.current, { filter: shouldIncludeDragPreviewNode, skipFonts: true });
                if (cancelled) return;
                const img = new Image();
                img.src = url;
                dragPreview(img, {
                    offsetX: (DragPreviewWidth * devicePixelRatio - DragPreviewWidth) / 2 + 10,
                    offsetY: (DragPreviewHeight * devicePixelRatio - DragPreviewHeight) / 2 + 10,
                });
            } catch {
                // The browser's native drag image is available if rasterizing the preview fails.
            } finally {
                capturing = false;
            }
        };
        // Hovering file and media content is much more common than dragging a widget header.
        handle.addEventListener("pointerenter", generatePreviewImage);
        return () => {
            cancelled = true;
            handle.removeEventListener("pointerenter", generatePreviewImage);
        };
    }, [devicePixelRatio, drag, dragPreview, isEphemeral, isMagnified, layoutModel, nodeModel]);

    return (
        <div
            className={clsx("tile-node", {
                dragging: isDragging,
            })}
            key={node.id}
            ref={tileNodeRef}
            id={node.id}
            style={addlProps?.transform}
            onPointerOver={(event) => event.stopPropagation()}
        >
            {leafContent}
            {previewElement}
        </div>
    );
};

interface OverlayNodeWrapperProps {
    layoutModel: LayoutModel;
}

const OverlayNodeWrapper = memo(({ layoutModel }: OverlayNodeWrapperProps) => {
    const leafs = useAtomValue(layoutModel.leafs);
    const overlayTransform = useAtomValue(layoutModel.overlayTransform);

    const overlayNodes = useMemo(
        () =>
            leafs.map((node) => {
                return <OverlayNode key={node.id} layoutModel={layoutModel} node={node} />;
            }),
        [leafs]
    );

    return (
        <div key="overlay" className="overlay-container" style={{ top: 10000, ...overlayTransform }}>
            {overlayNodes}
        </div>
    );
});

interface OverlayNodeProps {
    /**
     * The layout tree state.
     */
    layoutModel: LayoutModel;
    node: LayoutNode;
}

/**
 * An overlay representing the true flexbox layout of the LayoutTreeState. This holds the drop targets for moving around nodes and is used to calculate the
 * dimensions of the corresponding DisplayNode for each LayoutTreeState leaf.
 */
const OverlayNode = memo(({ node, layoutModel }: OverlayNodeProps) => {
    const nodeModel = useNodeModel(layoutModel, node);
    const additionalProps = useAtomValue(nodeModel.additionalProps);
    const overlayRef = useRef<HTMLDivElement>(null);

    const [, drop] = useDrop(
        () => ({
            accept: tileItemType,
            canDrop: (_, monitor) => {
                const dragItem = monitor.getItem<LayoutNode>();
                if (monitor.isOver({ shallow: true }) && dragItem.id !== node.id) {
                    return true;
                }
                return false;
            },
            drop: (_, monitor) => {
                if (!monitor.didDrop()) {
                    layoutModel.onDrop();
                }
            },
            hover: throttle(50, (_, monitor: DropTargetMonitor<unknown, unknown>) => {
                if (monitor.isOver({ shallow: true })) {
                    if (monitor.canDrop() && layoutModel.displayContainerRef?.current && additionalProps?.rect) {
                        const dragItem = monitor.getItem<LayoutNode>();
                        // console.log("computing operation", layoutNode, dragItem, additionalProps.rect);
                        const offset = monitor.getClientOffset();
                        const containerRect = layoutModel.displayContainerRef.current.getBoundingClientRect();
                        offset.x -= containerRect.x;
                        offset.y -= containerRect.y;
                        layoutModel.treeReducer({
                            type: LayoutTreeActionType.ComputeMove,
                            nodeId: node.id,
                            nodeToMoveId: dragItem.id,
                            direction: determineDropDirection(additionalProps.rect, offset),
                        } as LayoutTreeComputeMoveNodeAction);
                    } else {
                        layoutModel.treeReducer({
                            type: LayoutTreeActionType.ClearPendingAction,
                        });
                    }
                }
            }),
        }),
        [node.id, additionalProps?.rect, layoutModel.displayContainerRef, layoutModel.onDrop, layoutModel.treeReducer]
    );

    // Register the overlay node as a drop target
    useEffect(() => {
        drop(overlayRef);
    }, []);

    return <div ref={overlayRef} className="overlay-node" id={node.id} style={additionalProps?.transform} />;
});

interface ResizeHandleWrapperProps {
    layoutModel: LayoutModel;
}

const ResizeHandleWrapper = memo(({ layoutModel }: ResizeHandleWrapperProps) => {
    const resizeHandles = useAtomValue(layoutModel.resizeHandles) as Atom<ResizeHandleProps>[];
    const magnifiedNodeId = useAtomValue(layoutModel.magnifiedNodeIdAtom);
    const ephemeralNode = useAtomValue(layoutModel.ephemeralNode);
    if (magnifiedNodeId || ephemeralNode) return null;

    return resizeHandles.map((resizeHandleAtom) => (
        <ResizeHandle key={String(resizeHandleAtom)} layoutModel={layoutModel} resizeHandleAtom={resizeHandleAtom} />
    ));
});
ResizeHandleWrapper.displayName = "ResizeHandleWrapper";

interface ResizeHandleComponentProps {
    resizeHandleAtom: Atom<ResizeHandleProps>;
    layoutModel: LayoutModel;
}

const ResizeHandle = memo(({ resizeHandleAtom, layoutModel }: ResizeHandleComponentProps) => {
    const resizeHandleProps = useAtomValue(resizeHandleAtom);
    const pointer = useRef<number>(undefined);
    const pendingPoint = useRef<Point>(undefined);
    const frame = useRef<number>(undefined);
    const row = resizeHandleProps.flexDirection === FlexDirection.Row;

    const flushPointerMove = () => {
        if (frame.current != null) cancelAnimationFrame(frame.current);
        frame.current = undefined;
        const point = pendingPoint.current;
        pendingPoint.current = undefined;
        if (point) layoutModel.onResizeMove(resizeHandleProps, point.x, point.y);
    };

    useEffect(
        () => () => {
            if (frame.current != null) cancelAnimationFrame(frame.current);
            if (pointer.current != null) layoutModel.onResizeEnd();
        },
        [layoutModel]
    );

    return (
        <div
            className={clsx("resize-handle", `flex-${resizeHandleProps.flexDirection}`)}
            role="separator"
            tabIndex={0}
            aria-label="Resize adjacent widgets"
            aria-orientation={row ? "vertical" : "horizontal"}
            aria-valuemin={resizeHandleProps.minPercentage}
            aria-valuemax={resizeHandleProps.maxPercentage}
            aria-valuenow={resizeHandleProps.beforePercentage}
            onKeyDown={(event) => {
                const backwards = row ? "ArrowLeft" : "ArrowUp";
                const forwards = row ? "ArrowRight" : "ArrowDown";
                if (event.key !== backwards && event.key !== forwards) return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? KeyboardResizeStepPx * 3 : KeyboardResizeStepPx;
                layoutModel.nudgeResizeHandle(resizeHandleProps, event.key === forwards ? step : -step);
            }}
            onPointerDown={(event) => {
                if (event.button !== 0 || event.isPrimary === false || pointer.current != null) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                pointer.current = event.pointerId;
            }}
            onLostPointerCapture={(event) => {
                if (pointer.current !== event.pointerId) return;
                flushPointerMove();
                pointer.current = undefined;
                layoutModel.onResizeEnd();
            }}
            style={resizeHandleProps.transform}
            onPointerMove={(event) => {
                if (pointer.current !== event.pointerId) return;
                pendingPoint.current = { x: event.clientX, y: event.clientY };
                if (frame.current == null) frame.current = requestAnimationFrame(flushPointerMove);
            }}
        >
            <div className="line" />
        </div>
    );
});
ResizeHandle.displayName = "ResizeHandle";

interface PlaceholderProps {
    /**
     * The layout tree state.
     */
    layoutModel: LayoutModel;
    /**
     * Any styling to apply to the placeholder container div.
     */
    style: React.CSSProperties;
}

/**
 * An overlay to preview pending actions on the layout tree.
 */
const Placeholder = memo(({ layoutModel, style }: PlaceholderProps) => {
    const [placeholderOverlay, setPlaceholderOverlay] = useState<ReactNode>(null);
    const placeholderTransform = useAtomValue(layoutModel.placeholderTransform);

    useEffect(() => {
        if (placeholderTransform) {
            setPlaceholderOverlay(<div className="placeholder" style={placeholderTransform} />);
        } else {
            setPlaceholderOverlay(null);
        }
    }, [placeholderTransform]);

    return (
        <div className="placeholder-container" style={style}>
            {placeholderOverlay}
        </div>
    );
});
