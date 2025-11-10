/**
 * @file graphicalMotor.ts
 * @description GraphicalMotor interface definition - Contract for all rendering engines
 * @module motor
 *
 * This file defines the interface that all graph rendering motors must implement,
 * allowing for swappable rendering backends (WebGPU, Canvas2D, WebGL, HTML, etc.)
 *
 * Key interfaces:
 * - GraphicalMotor: Main interface for rendering motors
 * - MotorScene: Graph data structure (nodes and edges)
 * - ViewTransform: Camera transform (scale, translate)
 * - MotorEventMap: Event system for user interactions
 * - GraphicalMotorOptions: Configuration options for motor initialization
 *
 * This abstraction enables:
 * - Rendering backend flexibility (can swap WebGPU for Canvas2D without changing app code)
 * - Consistent API across different rendering technologies
 * - Testing with mock motors
 * - Platform-specific optimizations while maintaining same interface
 */

import {Edge, Node} from "../../../utils/graph/graphType";
import {Point, Rect} from "../../../utils/objectUtils";

/**
 * Scene data structure containing nodes and edges to be rendered
 */
export interface MotorScene {
    nodes: Map<string, Node<any>>;
    edges: Map<string, Edge[]>;
}

export interface GraphicalMotorOptions {
    devicePixelRatio?: number;
    backgroundType?: typeof backgroundType[number];
    maxZoom?: number;
    minZoom?: number;
}

export interface ViewTransform {
    scale: number;
    translateX: number;
    translateY: number;
}

export type MotorEventMap = {
    zoom: (transform: ViewTransform) => void;
    pan: (transform: ViewTransform) => void;
    nodeClick: (node: Node<any>, nodeId: string, ctrlKey: boolean) => void;
    edgeClick: (edge: Edge, edgeId: string, ctrlKey: boolean) => void;
    nodeChange: (node: Node<any>, nodeId: string) => void;
    edgeChange: (edge: Edge, edgeId: string) => void;
    nodeEnter: (node: Node<any>, nodeId: string) => void;
    nodeLeave: (node: Node<any> | undefined, nodeId: string) => void; // node will be undefined if the node have been removed
    canvasClick: () => void;
    reset: () => void;
};

export const backgroundType = ["solid", "dotted"] as const;

export interface GraphicalMotor {
    init(container: HTMLElement, convas:HTMLCanvasElement, options?: GraphicalMotorOptions): Promise<void>;
    dispose(): void;
    setScene(scene: MotorScene): void;
    resetScene(): void;
    getScene(): MotorScene | undefined;
    updateNode(id: string, updates: Partial<Pick<Node<any>, 'posX' | 'posY' | 'size'>>): void;
    setTransform(transform: Partial<ViewTransform>): void;
    getTransform(): ViewTransform;
    on<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void;
    off<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void;
    worldToScreen(point: Point):Point;
    screenToWorld(point: Point): Point;
    requestRedraw(): void;
    initKeyboardShortcut(): void;
    disposeKeyboardShortcut(): void;
    // HTML overlay support: returns node's screen-space rect for syncing DOM overlays
    getNodeScreenRect?(nodeId: string): Rect | undefined;
    getContainerDraw():HTMLElement;
    enableInteractive(value:boolean): void;
    isInteractive(): boolean;
    resetViewport(): void;
    smoothTransitionTo(options: {
        x: number;
        y: number;
        zoom: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void;
    smoothFitToNode(nodeId: string, options?: {
        padding?: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void;
    smoothFitToArea(bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    }, options?: {
        padding?: number;
        duration?: number;
        easing?: (t: number) => number;
        onComplete?: () => void;
    }): void;
    removeCameraAreaLock(): void;
    lockCameraToArea(bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    }): void;
}


