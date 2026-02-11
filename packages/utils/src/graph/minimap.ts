import { Node, Edge } from './graphType';

interface Bounds {
    minX: number;
    minY: number;
    width: number;
    height: number;
}

// Calcule les limites du graphe (Bounding Box)
export const getGraphBounds = (nodes: Node<any>[], padding = 50): Bounds => {
    if (nodes.length === 0) return { minX: 0, minY: 0, width: 100, height: 100 };

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
        if (node.posX < minX) minX = node.posX;
        if (node.posY < minY) minY = node.posY;
        const right = node.posX + node.size.width;
        const bottom = node.posY + node.size.height;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
    }

    return {
        minX: minX - padding,
        minY: minY - padding,
        width: (maxX - minX) + (padding * 2),
        height: (maxY - minY) + (padding * 2),
    };
};

// Génère le SVG du graphe UNIQUEMENT (sans le viewport rouge/bleu)
// Retourne une chaîne SVG prête à être encodée ou sauvegardée
export const generateGraphSVGString = (
    nodes: Node<any>[],
    edges: Edge[],
    bounds: Bounds,
    theme: 'light' | 'dark' = 'light'
): string => {
    const isDark = theme === 'dark';

    // Couleurs (hardcodées pour la perf, ou passées en options)
    const c = {
        bg: isDark ? '#1e1e1e' : '#f3f4f6',
        edge: isDark ? '#444' : '#d1d5db',
        node: isDark ? '#555' : '#fff',
        stroke: isDark ? '#777' : '#ccc'
    };

    // Optimisation: Map pour accès rapide
    const nodeMap = new Map<string, Node<any>>();
    nodes.forEach(n => nodeMap.set(n._key, n));

    const fmt = (n: number) => Math.round(n * 10) / 10; // Réduit la taille du string

    let content = '';

    // 1. Edges
    for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (src && tgt) {
            const x1 = src.posX + src.size.width / 2;
            const y1 = src.posY + src.size.height / 2;
            const x2 = tgt.posX + tgt.size.width / 2;
            const y2 = tgt.posY + tgt.size.height / 2;
            content += `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${c.edge}" stroke-width="2" />`;
        }
    }

    // 2. Nodes
    for (const node of nodes) {
        content += `<rect x="${fmt(node.posX)}" y="${fmt(node.posY)}" width="${fmt(node.size.width)}" height="${fmt(node.size.height)}" fill="${c.node}" stroke="${c.stroke}" stroke-width="1" rx="4" />`;
    }

    // On retourne un SVG avec viewBox calé sur les coordonnées réelles du monde
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" style="background-color:${c.bg}">${content}</svg>`;
};