/**
 * @file requestSync.ts
 * @description REST API endpoint for distributed synchronization and instance routing
 * @module server/request
 *
 * Handles client requests to discover which server instance manages their WebSocket connection
 * for real-time synchronization. Critical for distributed/clustered deployments where multiple
 * server instances share the workload.
 *
 * Endpoints:
 * - POST /api/sync: Get WebSocket connection info for a specific instance
 *
 * Features:
 * - **Instance Routing**: Maps instanceId to the appropriate cluster node
 * - **Self-Hosting Detection**: Identifies when current server handles the instance
 * - **Peer Discovery**: Returns connection info for remote cluster peers
 * - **Port Mapping**: WebSocket ports are calculated as basePort + offset (1000 or 2000)
 * - **Cluster Integration**: Works with ClusterManager for distributed state
 *
 * Architecture:
 * - Uses ClusterManager to track which peer owns which instance
 * - If peer is "self" or not found, client connects to current server
 * - If peer exists, client is redirected to that peer's WebSocket port
 * - Port calculation: HTTP port + 2000 for self, peer.port + 1000 for remote
 *
 * Response Format (api_sync_info):
 * - host: Hostname/IP to connect to
 * - port: WebSocket port number
 *
 * Use Cases:
 * - Initial client connection setup
 * - Reconnection after network interruption
 * - Load balancing across cluster nodes
 * - Session affinity for real-time collaboration
 */

import {HttpServer, Request, Response} from "../http/HttpServer";
import {api_sync, api_sync_info} from "../../utils/requests/type/api_sync.type";
import {clusterManager, peerHost, peerPort} from "../server";
import {ClusterNode} from "../cluster/clusterManager";

export class RequestSync {

    public static init = async (app: HttpServer) => {
        app.post("/api/sync", async (req: Request, res: Response) => {
            const body = req.body as api_sync;
            if(!body.instanceId) {
                res.status(500).end();
                return;
            }

            let peerId = clusterManager.getInstancehPeerId(body.instanceId);
            let peer: ClusterNode | undefined;
            if (!peerId || peerId === "self" || (peer = clusterManager.getPeer(peerId)) == undefined) {
                const output: api_sync_info = {
                    host: peerHost,
                    port: peerPort + 2000
                }
                if (peerId !== "self") {
                    await clusterManager.defineInstancePeer(body.instanceId);
                }
                res.json(output);
            } else {
                const output: api_sync_info = {
                    host: peer.host,
                    port: peer.port + 1000
                }
                res.json(output);
            }

        });
    }
}