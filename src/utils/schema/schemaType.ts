
export type handleSide = "T" | "D" | "R" | "L" | "0"

export interface Edge {
    source: string;
    sourceHandle: string;

    target: string;
    targetHandle: string;

    style: "curved" | "straight"
}

export interface Node<T> {
    id: string,
    size: {
        width: number,
        height: number
    } | "auto",
    posX: number,
    posY: number,
    handles: Record<handleSide, {
        position: "separate" | "fix",
        point: Array<{
            id: string,
            offset?:number,
            display: string,
        }>
    }>,
    data: T
}