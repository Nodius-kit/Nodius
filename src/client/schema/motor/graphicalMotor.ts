import {Edge, Node} from "../../../utils/graph/graphType";

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
	nodeClick: (node: Node<any>, nodeId: string) => void;
	edgeClick: (edge: Edge, edgeId: string) => void;
	nodeChange: (node: Node<any>, nodeId: string) => void;
	edgeChange: (edge: Edge, edgeId: string) => void;
	nodeEnter: (node: Node<any>, nodeId: string) => void;
	nodeLeave: (node: Node<any> | undefined, nodeId: string) => void; // node will be undefined if the node have been removed
	reset: () => void;
};

export const backgroundType = ["solid", "dotted"] as const;

export interface GraphicalMotor {
	init(container: HTMLElement, convas:HTMLCanvasElement, options?: GraphicalMotorOptions): Promise<void>;
	dispose(): void;
	setScene(scene: MotorScene): void;
	getScene(): MotorScene | undefined;
	setTransform(transform: Partial<ViewTransform>): void;
	getTransform(): ViewTransform;
	on<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void;
	off<K extends keyof MotorEventMap>(event: K, cb: MotorEventMap[K]): void;
	worldToScreen(point: { x: number; y: number }): { x: number; y: number };
	screenToWorld(point: { x: number; y: number }): { x: number; y: number };
	requestRedraw(): void;
	// HTML overlay support: returns node's screen-space rect for syncing DOM overlays
	getNodeScreenRect?(nodeId: string): { x: number; y: number; width: number; height: number } | undefined;
	getContainerDraw():HTMLElement;
	enableInteractive(value:boolean): void;
	resetViewport(): void;
}


