import { ViewTransform, MotorScene } from "../graphicalMotor";

interface FitOperation {
	type: 'node' | 'area';
	nodeId?: string;
	bounds?: { minX: number; minY: number; maxX: number; maxY: number };
	options?: {
		padding?: number;
		duration?: number;
		easing?: (t: number) => number;
	};
}

export class CameraAnimator {
	private canvas: HTMLCanvasElement;
	private transform: ViewTransform;
	private minZoom: number;
	private maxZoom: number;
	private animationFrameId: number | null = null;
	private lastFitOperation: FitOperation | null = null;
	private userHasMovedManually: boolean = false;
	private interactiveEnabled: boolean = true;
	private onDirty: () => void;
	private onPan: (transform: ViewTransform) => void;
	private onZoom: (transform: ViewTransform) => void;

	constructor(
		canvas: HTMLCanvasElement,
		transform: ViewTransform,
		minZoom: number,
		maxZoom: number,
		callbacks: {
			onDirty: () => void;
			onPan: (transform: ViewTransform) => void;
			onZoom: (transform: ViewTransform) => void;
		}
	) {
		this.canvas = canvas;
		this.transform = transform;
		this.minZoom = minZoom;
		this.maxZoom = maxZoom;
		this.onDirty = callbacks.onDirty;
		this.onPan = callbacks.onPan;
		this.onZoom = callbacks.onZoom;
	}

	public setInteractiveEnabled(enabled: boolean): void {
		this.interactiveEnabled = enabled;
	}

	public setUserHasMovedManually(moved: boolean): void {
		this.userHasMovedManually = moved;
	}

	public smoothTransitionTo(options: {
		x: number;
		y: number;
		zoom: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		const duration = options.duration ?? 500; // Default 500ms
		const easing = options.easing ?? ((t: number) => t * t * (3 - 2 * t)); // Default smooth step

		// Cancel any existing animation
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Calculate target position in screen space
		// We want the world point (x, y) to be at the center of the canvas after transition
		const centerX = this.canvas.width / 2;
		const centerY = this.canvas.height / 2;

		// Store starting values
		const startScale = this.transform.scale;
		const startTranslateX = this.transform.translateX;
		const startTranslateY = this.transform.translateY;

		// Store target values, clamped to valid zoom range
		const targetScale = Math.max(this.minZoom, Math.min(this.maxZoom, options.zoom));

		// Calculate what the translate values should be to center on the target point
		// Use the clamped targetScale instead of options.zoom for accurate positioning
		const targetTranslateX = centerX - options.x * targetScale;
		const targetTranslateY = centerY - options.y * targetScale;

		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
			const easedProgress = easing(progress);

			// Interpolate values
			this.transform.scale = startScale + (targetScale - startScale) * easedProgress;
			this.transform.translateX = startTranslateX + (targetTranslateX - startTranslateX) * easedProgress;
			this.transform.translateY = startTranslateY + (targetTranslateY - startTranslateY) * easedProgress;

			this.onDirty();

			// Emit events
			this.onZoom(this.transform);
			this.onPan(this.transform);

			if (progress < 1) {
				this.animationFrameId = requestAnimationFrame(animate);
			} else {
				this.animationFrameId = null;
				if (options.onComplete) {
					options.onComplete();
				}
			}
		};
		if (duration <= 0) {
			animate(startTime);
		} else {
			this.animationFrameId = requestAnimationFrame(animate);
		}
	}

	public smoothFitToNode(scene: MotorScene | undefined, nodeId: string, options?: {
		padding?: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		if (!scene) return;
		const node = scene.nodes.get(nodeId);
		if (!node || typeof node.size === "string") return;

		// Store this operation for potential re-application on resize
		this.lastFitOperation = {
			type: 'node',
			nodeId: nodeId,
			options: {
				padding: options?.padding,
				duration: options?.duration,
				easing: options?.easing
			}
		};
		this.userHasMovedManually = false;

		const padding = options?.padding ?? 50;

		// Calculate the zoom level to fit the node with padding
		const availableWidth = this.canvas.width - 2 * padding;
		const availableHeight = this.canvas.height - 2 * padding;

		const scaleX = availableWidth / node.size.width;
		const scaleY = availableHeight / node.size.height;
		const targetZoom = Math.min(scaleX, scaleY);

		// Calculate center of the node
		const nodeCenterX = node.posX + node.size.width / 2;
		const nodeCenterY = node.posY + node.size.height / 2;

		this.smoothTransitionTo({
			x: nodeCenterX,
			y: nodeCenterY,
			zoom: targetZoom,
			duration: options?.duration,
			easing: options?.easing,
			onComplete: options?.onComplete
		});
	}

	public smoothFitToArea(bounds: {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	}, options?: {
		padding?: number;
		duration?: number;
		easing?: (t: number) => number;
		onComplete?: () => void;
	}): void {
		// Store this operation for potential re-application on resize
		this.lastFitOperation = {
			type: 'area',
			bounds: { ...bounds },
			options: {
				padding: options?.padding,
				duration: options?.duration,
				easing: options?.easing
			}
		};
		this.userHasMovedManually = false;

		const padding = options?.padding ?? 50;

		const width = bounds.maxX - bounds.minX;
		const height = bounds.maxY - bounds.minY;
		const centerX = (bounds.minX + bounds.maxX) / 2;
		const centerY = (bounds.minY + bounds.maxY) / 2;

		const availableWidth = this.canvas.width - 2 * padding;
		const availableHeight = this.canvas.height - 2 * padding;

		const scaleX = availableWidth / width;
		const scaleY = availableHeight / height;
		const targetZoom = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

		this.smoothTransitionTo({
			x: centerX,
			y: centerY,
			zoom: targetZoom,
			duration: options?.duration,
			easing: options?.easing,
			onComplete: options?.onComplete
		});
	}

	public reapplyFitIfNeeded(scene: MotorScene | undefined): void {
		// Check if all conditions are met to re-apply the fit
		if (!this.interactiveEnabled &&
			this.lastFitOperation &&
			!this.userHasMovedManually) {

			// Re-apply the last fit operation without animation (duration: 0)
			if (this.lastFitOperation.type === 'node' && this.lastFitOperation.nodeId) {
				// Call smoothFitToNode without triggering a new storage
				// We need to temporarily prevent re-storing
				const savedOp = this.lastFitOperation;
				const savedUserMoved = this.userHasMovedManually;

				this.smoothFitToNode(scene, this.lastFitOperation.nodeId, {
					padding: this.lastFitOperation.options?.padding,
					duration: 0, // Instant transition on resize
					easing: this.lastFitOperation.options?.easing
				});

				// Restore the saved state (because smoothFitToNode resets these)
				this.lastFitOperation = savedOp;
				this.userHasMovedManually = savedUserMoved;
			} else if (this.lastFitOperation.type === 'area' && this.lastFitOperation.bounds) {
				// Call smoothFitToArea without triggering a new storage
				const savedOp = this.lastFitOperation;
				const savedUserMoved = this.userHasMovedManually;

				this.smoothFitToArea(this.lastFitOperation.bounds, {
					padding: this.lastFitOperation.options?.padding,
					duration: 0, // Instant transition on resize
					easing: this.lastFitOperation.options?.easing
				});

				// Restore the saved state
				this.lastFitOperation = savedOp;
				this.userHasMovedManually = savedUserMoved;
			}
		}
	}
}
