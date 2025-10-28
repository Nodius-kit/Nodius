/**
 * @file nodeAnimations.ts
 * @description Handles spring-based position and size animations for graph nodes
 * @module schema
 */

import { Node } from "../../utils/graph/graphType";
import { WebGpuMotor } from "./motor/webGpuMotor/index";

export interface AnimationState {
    id?: number;
    lastTime: number;
    velX: number;
    velY: number;
    velWidth?: number;
    velHeight?: number;
}

export interface AnimationConfig {
    springStiffness?: number;
    damping?: number;
}

/**
 * Manages spring-based animations for node position and size changes
 */
export class NodeAnimationManager {
    private animations: Record<string, AnimationState> = {};
    private springStiffness: number;
    private damping: number;

    constructor(config: AnimationConfig = {}) {
        this.springStiffness = config.springStiffness ?? 100;
        this.damping = config.damping ?? 2 * Math.sqrt(this.springStiffness);
    }

    /**
     * Start animating a node's position and/or size
     */
    startAnimation(
        nodeKey: string,
        getNode: () => (Node<any> & { toPosX?: number; toPosY?: number;size:{ toWidth?: number; toHeight?: number} }) | undefined,
        onUpdate: () => void
    ): void {
        let anim = this.animations[nodeKey];
        if (anim?.id) {
            cancelAnimationFrame(anim.id);
        } else {
            anim = {
                lastTime: performance.now(),
                velX: 0,
                velY: 0,
                velWidth: 0,
                velHeight: 0
            };
        }
        this.animations[nodeKey] = anim;

        const animate = () => {
            const currentNode = getNode();
            if (!currentNode) {
                this.stopAnimation(nodeKey);
                return;
            }

            const now = performance.now();
            const dt = (now - anim.lastTime) / 1000;
            anim.lastTime = now;

            let hasActiveAnimation = false;

            // Animate X position
            if (currentNode.toPosX !== undefined) {
                const deltaX = currentNode.toPosX - currentNode.posX;
                if (Math.abs(deltaX) < 0.1 && Math.abs(anim.velX) < 0.1) {
                    currentNode.posX = currentNode.toPosX;
                    delete currentNode.toPosX;
                    anim.velX = 0;
                } else {
                    const forceX = (this.springStiffness * deltaX) - (this.damping * anim.velX);
                    anim.velX += forceX * dt;
                    currentNode.posX += anim.velX * dt;
                    hasActiveAnimation = true;
                }
            }

            // Animate Y position
            if (currentNode.toPosY !== undefined) {
                const deltaY = currentNode.toPosY - currentNode.posY;
                if (Math.abs(deltaY) < 0.1 && Math.abs(anim.velY) < 0.1) {
                    currentNode.posY = currentNode.toPosY;
                    delete currentNode.toPosY;
                    anim.velY = 0;
                } else {
                    const forceY = (this.springStiffness * deltaY) - (this.damping * anim.velY);
                    anim.velY += forceY * dt;
                    currentNode.posY += anim.velY * dt;
                    hasActiveAnimation = true;
                }
            }

            // Animate width
            if (currentNode.size.toWidth !== undefined) {
                const currentWidth = (currentNode as any).size?.width ?? 0;
                const deltaWidth = currentNode.size.toWidth - currentWidth;
                if (Math.abs(deltaWidth) < 0.1 && Math.abs(anim.velWidth!) < 0.1) {
                    if (!(currentNode as any).size) (currentNode as any).size = {};
                    (currentNode as any).size.width = currentNode.size.toWidth;
                    delete currentNode.size.toWidth;
                    anim.velWidth = 0;
                } else {
                    const forceWidth = (this.springStiffness * deltaWidth) - (this.damping * anim.velWidth!);
                    anim.velWidth = (anim.velWidth ?? 0) + forceWidth * dt;
                    if (!(currentNode as any).size) (currentNode as any).size = {};
                    (currentNode as any).size.width = currentWidth + anim.velWidth * dt;
                    hasActiveAnimation = true;
                }
            }

            // Animate height
            if (currentNode.size.toHeight !== undefined) {
                const currentHeight = (currentNode as any).size?.height ?? 0;
                const deltaHeight = currentNode.size.toHeight - currentHeight;
                if (Math.abs(deltaHeight) < 0.1 && Math.abs(anim.velHeight!) < 0.1) {
                    if (!(currentNode as any).size) (currentNode as any).size = {};
                    (currentNode as any).size.height = currentNode.size.toHeight;
                    delete currentNode.size.toHeight;
                    anim.velHeight = 0;
                } else {
                    const forceHeight = (this.springStiffness * deltaHeight) - (this.damping * anim.velHeight!);
                    anim.velHeight = (anim.velHeight ?? 0) + forceHeight * dt;
                    if (!(currentNode as any).size) (currentNode as any).size = {};
                    (currentNode as any).size.height = currentHeight + anim.velHeight * dt;
                    hasActiveAnimation = true;
                }
            }

            onUpdate();

            if (hasActiveAnimation) {
                anim.id = requestAnimationFrame(animate);
            } else {
                this.stopAnimation(nodeKey);
            }
        };

        anim.id = requestAnimationFrame(animate);
    }

    /**
     * Stop animation for a specific node
     */
    stopAnimation(nodeKey: string): void {
        const anim = this.animations[nodeKey];
        if (anim?.id) {
            cancelAnimationFrame(anim.id);
        }
        delete this.animations[nodeKey];
    }

    /**
     * Stop all animations
     */
    stopAllAnimations(): void {
        Object.keys(this.animations).forEach(key => this.stopAnimation(key));
    }

    /**
     * Check if a node is currently animating
     */
    isAnimating(nodeKey: string): boolean {
        return !!this.animations[nodeKey]?.id;
    }
}
