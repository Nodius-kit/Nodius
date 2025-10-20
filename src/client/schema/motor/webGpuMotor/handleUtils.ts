import { handleSide, Node } from "../../../../utils/graph/graphType";
import { HandleInfo, Point } from "./types";

export function getHandleInfo(node: Node<any>, handleId: string): HandleInfo | undefined {
	for (const [side, handle] of Object.entries(node.handles)) {
		const index = handle.point.findIndex((p) => p.id === handleId);
		if (index !== -1) {
			const point = handle.point[index]!;
			let offset = point.offset;
			if (handle.position === "separate" && offset === undefined) {
				offset = (index + 0.5) / handle.point.length;
			} else if (offset === undefined) {
				offset = 0.5;
			}
			return {
				side: side as handleSide,
				offset,
				point,
			};
		}
	}
	return undefined;
}

export function getHandlePosition(node: Node<any>, handleId: string): Point | undefined {
	const info = getHandleInfo(node, handleId);
	if (!info || typeof node.size === "string") return undefined;

	const { width, height } = node.size;
	const { side, offset } = info;
	const config = node.handles[side]!;

	if (config.position === "fix") {
		let x = node.posX;
		let y = node.posY;
		switch (side) {
			case "T":
				x += offset;
				break;
			case "D":
				y += height;
				x += offset;
				break;
			case "L":
				y += offset;
				break;
			case "R":
				x += width;
				y += offset;
				break;
			case "0":
				x += width / 2;
				y += height / 2;
				break;
		}
		return { x, y };
	} else {
		switch (side) {
			case "L":
				return { x: node.posX, y: node.posY + offset * height };
			case "R":
				return { x: node.posX + width, y: node.posY + offset * height };
			case "T":
				return { x: node.posX + offset * width, y: node.posY };
			case "D":
				return { x: node.posX + offset * width, y: node.posY + height };
			case "0":
				return { x: node.posX + 0.5 * width, y: node.posY + 0.5 * height };
		}
	}
}

export function getDir(side: handleSide): { dx: number; dy: number } {
	switch (side) {
		case "L":
			return { dx: -1, dy: 0 };
		case "R":
			return { dx: 1, dy: 0 };
		case "T":
			return { dx: 0, dy: -1 };
		case "D":
			return { dx: 0, dy: 1 };
		case "0":
			return { dx: 0, dy: 0 };
	}
}
