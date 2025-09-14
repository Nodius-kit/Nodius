import {backgroundType, MotorScene} from "./graphicalMotor";
import { WebGpuMotor } from './webGpuMotor';
import {useEffect, useRef} from "nodius_jsx/jsx-runtime";
import {Edge, Node} from "../../../utils/schema/schemaType";

type Data = { title: string };

export const WebGpuExample = () => {
	const modelListToMap = (nodes: Node<any>[], edges: Edge[]): MotorScene => {
		const start = Date.now();
		const nodeMap = new Map<string, Node<any>>();
		const edgeMap = new Map<string, Edge[]>();

		nodes.forEach((n) => {
			// if(n.type === "placeholderNode"){
			//   return; // faster to do this than apply filter to nodes
			// }
			nodeMap.set(n.id, n);
		});

		edges.forEach((edge) => {
			const sourceKey = `source:${edge.source}:${edge.sourceHandle}`;
			const targetKey = `target:${edge.target}:${edge.targetHandle}`;

			if (!edgeMap.has(sourceKey)) edgeMap.set(sourceKey, []);
			if (!edgeMap.has(targetKey)) edgeMap.set(targetKey, []);

			edgeMap.get(sourceKey)!.push(edge);
			edgeMap.get(targetKey)!.push(edge);
		});

		console.log("Mapping node/edge took " + (Date.now() - start) + "ms");

		return {
			nodes: nodeMap,
			edges: edgeMap,
		};
	};

	const scene: MotorScene = modelListToMap([
			{
				id: "a",
				size: { width: 200, height: 100 },
				posX: 100,
				posY: 100,
				handles: {
					T: { position: "separate", point: [{ id: "t", display: "top" }] },
					D: { position: "separate", point: [{ id: "d", display: "bottom" }] },
					L: { position: "separate", point: [{ id: "l", display: "left" }] },
					R: { position: "separate", point: [{ id: "r", display: "right" }] },
					0: { position: "separate", point: [{ id: "c", display: "0" }] }
				},
				data: { title: "Node A" }
			},
			{
				id: "b",
				size: { width: 180, height: 80 },
				posX: 820,
				posY: 260,
				handles: {
					T: { position: "separate", point: [{ id: "t", display: "top" }] },
					D: { position: "separate", point: [{ id: "d", display: "bottom" }] },
					L: { position: "separate", point: [{ id: "l", display: "left" }] },
					R: { position: "separate", point: [{ id: "r", display: "right" }] },
					0: { position: "separate", point: [{ id: "c", display: "0" }] }
				},
				data: { title: "Node B" }
			}
		],
		[
			{
				source: "a",
				sourceHandle: "r",
				target: "b",
				targetHandle: "l",
				style: "curved"
			},
			/*{
				source: "a",
				sourceHandle: "l",
				target: "b",
				targetHandle: "r",
				style: "curved"
			}*/
		]);

	const containerRef = useRef<HTMLDivElement|null>(null);
	const motorRef = useRef<WebGpuMotor | null>(null);
	const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	useEffect(() => {

		const container = containerRef.current;
		if (!container) return;

		const motor = new WebGpuMotor();
		motor.init(container, null, { backgroundType:"dotted"}).then(() => {
			motor.setScene(scene);
			console.log(scene);

			// Create overlays for node content
			scene.nodes.forEach((node) => {
				const overlay = document.createElement('div');
				overlay.style.position = 'absolute';
				//overlay.style.pointerEvents = 'none';
				overlay.style.backgroundColor = 'transparent';
				overlay.style.display = 'flex';
				overlay.style.alignItems = 'center';
				overlay.style.justifyContent = 'center';
				overlay.style.fontSize = '16px';
				overlay.style.color = 'black';
				overlay.innerText = node.data.title;
				container.appendChild(overlay);
				overlayRefs.current.set(node.id, overlay);
			});

			const updateOverlays = () => {
				const transform = motor.getTransform();
				scene.nodes.forEach((node) => {
					const rect = motor.getNodeScreenRect?.(node.id);
					if (rect) {
						const overlay = overlayRefs.current.get(node.id);
						if (overlay) {
							overlay.style.zoom = transform.scale+"";
							const reverseZoom = 1 - transform.scale;
							overlay.style.left = `${rect.x / transform.scale}px`;
							overlay.style.top = `${rect.y / transform.scale}px`;
							overlay.style.width = `${rect.width / transform.scale}px`;
							overlay.style.height = `${rect.height / transform.scale}px`;
						}
					}
				});
			};

			updateOverlays();
			motor.on('zoom', updateOverlays);
			motor.on('pan', updateOverlays);
			motor.on('nodeChange', updateOverlays);
		});

		motorRef.current = motor;

		let currentPosX = 800;
		setInterval(() => {
			motor.updateNode("b", {
				posX: currentPosX,
			})
			currentPosX+=0.5;
		}, 20);

		return () => {
			motor.dispose();
			overlayRefs.current.forEach((overlay) => overlay.remove());
			overlayRefs.current.clear();
		};
	}, [scene]);

	return (
		<div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }} />
	);
};