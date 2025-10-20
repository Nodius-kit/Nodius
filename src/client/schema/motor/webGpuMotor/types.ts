import { handleSide } from "../../../../utils/graph/graphType";

export interface HandleInfo {
	side: handleSide;
	offset: number;
	point: { id: string; offset?: number; display?: string };
}

export interface Point {
	x: number;
	y: number;
}

export type KeyState = {
	[key: string]: number | undefined; // stores interval IDs
};
