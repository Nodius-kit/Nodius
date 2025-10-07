import {HttpServer, Request, Response} from "../http/HttpServer";
import {api_sync_graph, api_sync_graph_info} from "../../utils/requests/type/api_sync.type";
import {clusterManager, peerHost, peerPort} from "../server";
import {ClusterNode} from "../cluster/clusterManager";

export class RequestSync {

    public static init = async (app: HttpServer) => {
        app.post("/api/sync/graph", async (req: Request, res: Response) => {
            const body = req.body as api_sync_graph;
            if(!body.graphKey) {
                res.status(500).end();
                return;
            }

            let peerId = clusterManager.getGraphPeerId(body.graphKey);
            let peer:ClusterNode|undefined;
            if(!peerId || peerId === "self" || (peer = clusterManager.getPeer(peerId)) == undefined) {
                const output: api_sync_graph_info = {
                    host: peerHost,
                    port: peerPort + 2000
                }
                if(peerId !== "self") {
                    await clusterManager.defineGraphPeer(body.graphKey);
                }
                res.json(output);
            } else {
                const output: api_sync_graph_info = {
                    host: peer.host,
                    port: peer.port + 1000
                }
                res.json(output);
            }
        });
    }
}