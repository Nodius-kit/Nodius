import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {Dealer, Publisher, Router, Subscriber} from "zeromq";
import { randomUUID } from 'crypto';
import {DocumentCollection} from "arangojs/collections";

export interface ClusterNode {
    _key: string;
    host: string;
    port: number;
    lastRefresh: number;
    status: 'online' | 'offline';
    metadata?: Record<string, any>;
}

export interface Message {
    id: string;
    senderId: string;
    targetId?: string;
    type: 'broadcast' | 'direct' | 'response';
    payload: any;
    timestamp: number;
    responseId?: string;
}

export class ClusterManager {
    private readonly port: number;
    private db_collection: DocumentCollection|undefined;
    private nodeId: string|undefined;
    private readonly host: string;

    private publisher: Publisher;
    private subscriber: Subscriber;
    private router: Router; // Pour les communications directes
    private dealer: Dealer; // Pour envoyer des messages directs

    private connectedPeers = new Map<string, ClusterNode>();
    private pendingResponses = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();
    private refreshInterval: NodeJS.Timeout|undefined = undefined;
    private cleanupInterval: NodeJS.Timeout|undefined = undefined;

    constructor(port: number, host: string = 'localhost') {
        this.port = port;
        this.host = host;


        this.publisher = new Publisher();
        this.subscriber = new Subscriber();
        this.router = new Router();
        this.dealer = new Dealer();
    }

    async initialize(): Promise<void> {
        try {

            this.db_collection = await ensureCollection('nodius_cluster');
            this.nodeId = await createUniqueToken(this.db_collection);
            // Setup ZeroMQ sockets
            await this.setupZeroMQ();

            // Register this node in the database
            await this.registerNode();

            // Start periodic tasks
            this.startPeriodicTasks();

            // Discover and connect to existing peers
            await this.discoverAndConnectPeers();

            console.log(`ClusterManager initialized - Node: ${this.nodeId} on ${this.host}:${this.port}`);
        } catch (error) {
            console.error('Failed to initialize ClusterManager:', error);
            throw error;
        }
    }

    private async setupZeroMQ(): Promise<void> {
        // Publisher for broadcasting
        await this.publisher.bind(`tcp://*:${this.port}`);

        // Router for direct communications (receiving)
        await this.router.bind(`tcp://*:${this.port + 1}`);

        // Subscriber setup - will connect to peers dynamically
        this.subscriber.subscribe(''); // Subscribe to all messages
        this.startSubscriberListener();

        // Dealer setup - will connect to peers dynamically
        this.startRouterListener();
    }

    private startSubscriberListener(): void {
        (async () => {
            for await (const [msg] of this.subscriber) {
                try {
                    const message: Message = JSON.parse(msg.toString());
                    if (message.senderId !== this.nodeId) {
                        await this.handleMessage(message);
                    }
                } catch (error) {
                    console.error('Error parsing subscriber message:', error);
                }
            }
        })();
    }

    private startRouterListener(): void {
        (async () => {
            for await (const [identity, msg] of this.router) {
                try {
                    const message: Message = JSON.parse(msg.toString());
                    if (message.senderId !== this.nodeId) {
                        await this.handleDirectMessage(message, identity);
                    }
                } catch (error) {
                    console.error('Error parsing router message:', error);
                }
            }
        })();
    }

    private async handleMessage(message: Message): Promise<void> {
        switch (message.type) {
            case 'broadcast':
                this.emit('broadcast', message.payload, message.senderId);
                break;
            case 'response':
                this.handleResponse(message);
                break;
        }
    }

    private async handleDirectMessage(message: Message, identity: Buffer): Promise<void> {
        if (message.type === 'direct') {
            try {
                // Emit event for application to handle
                const response = await this.emit('directMessage', message.payload, message.senderId);

                // Send response back
                const responseMessage: Message = {
                    id: randomUUID(),
                    senderId: this.nodeId!,
                    type: 'response',
                    payload: response,
                    timestamp: Date.now(),
                    responseId: message.id
                };

                await this.router.send([identity, JSON.stringify(responseMessage)]);
            } catch (error) {
                console.error('Error handling direct message:', error);
            }
        } else if (message.type === 'response') {
            this.handleResponse(message);
        }
    }

    private handleResponse(message: Message): void {
        if (message.responseId) {
            const pending = this.pendingResponses.get(message.responseId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingResponses.delete(message.responseId);
                pending.resolve(message.payload);
            }
        }
    }

    private async registerNode(): Promise<void> {
        const nodeData: ClusterNode = {
            _key: this.nodeId!,
            host: this.host,
            port: this.port,
            lastRefresh: Date.now(),
            status: 'online'
        };

        try {
            await this.db_collection!.save(nodeData, { overwriteMode: 'replace' });
        } catch (error) {
            console.error('Failed to register node:', error);
            throw error;
        }
    }

    private async refreshNodeStatus(): Promise<void> {
        try {
            const updateData = {
                lastRefresh: Date.now(),
                status: 'online'
            };

            await this.db_collection!.update(this.nodeId!, updateData);

            console.log(`Node ${this.nodeId} status refreshed`);
        } catch (error) {
            console.error('Failed to refresh node status:', error);
        }
    }

    private async discoverAndConnectPeers(): Promise<void> {
        try {
            const twoMinutesAgo = Date.now() - (2 * 60 * 1000);

            const cursor = await this.db_collection!.database.query({
                query: `
                FOR doc IN @@collection
                    FILTER doc._key != @selfId
                    FILTER doc.lastRefresh > @twoMinutesAgo
                    FILTER doc.status == "online"
                RETURN doc
            `,
                bindVars: {
                    '@collection': this.db_collection!.name,
                    selfId: this.nodeId,
                    twoMinutesAgo
                }
            });

            const onlineNodes: ClusterNode[] = await cursor.all();

            // Connect to new peers
            for (const node of onlineNodes) {
                if (!this.connectedPeers.has(node._key!)) {
                    await this.connectToPeer(node);
                }
            }

            // Disconnect from peers no longer online
            for (const [peerId, peer] of this.connectedPeers) {
                if (!onlineNodes.find(n => n._key === peerId)) {
                    await this.disconnectFromPeer(peerId);
                }
            }
        } catch (error) {
            console.error('Failed to discover peers:', error);
        }
    }

    private async connectToPeer(node: ClusterNode): Promise<void> {
        try {
            // Connect subscriber to peer's publisher
            await this.subscriber.connect(`tcp://${node.host}:${node.port}`);

            // Connect dealer to peer's router for direct communication
            await this.dealer.connect(`tcp://${node.host}:${node.port + 1}`);

            this.connectedPeers.set(node._key, node);
            console.log(`Connected to peer: ${node._key} at ${node.host}:${node.port}`);

            this.emit('peerConnected', node);
        } catch (error) {
            console.error(`Failed to connect to peer ${node._key}:`, error);
        }
    }

    private async disconnectFromPeer(peerId: string): Promise<void> {
        const peer = this.connectedPeers.get(peerId);
        if (peer) {
            try {
                // ZeroMQ doesn't have explicit disconnect for specific endpoints
                // In a production environment, you might want to track connections
                // and recreate sockets when needed

                this.connectedPeers.delete(peerId);
                console.log(`Disconnected from peer: ${peerId}`);

                this.emit('peerDisconnected', peer);
            } catch (error) {
                console.error(`Failed to disconnect from peer ${peerId}:`, error);
            }
        }
    }

    private startPeriodicTasks(): void {
        // Refresh status every minute
        this.refreshInterval = setInterval(async () => {
            await this.refreshNodeStatus();
        }, 60 * 1000);

        // Discover and cleanup every 30 seconds
        this.cleanupInterval = setInterval(async () => {
            await this.discoverAndConnectPeers();
        }, 30 * 1000);
    }

    // Utility function to send JSON to all peers
    async broadcastJson(payload: any): Promise<void> {
        const message: Message = {
            id: randomUUID(),
            senderId: this.nodeId!,
            type: 'broadcast',
            payload,
            timestamp: Date.now()
        };

        try {
            await this.publisher.send(JSON.stringify(message));
            console.log('Broadcast sent to all peers');
        } catch (error) {
            console.error('Failed to broadcast message:', error);
            throw error;
        }
    }

    // Utility function to send JSON to a specific peer with response
    async sendJsonToPeer(peerId: string, payload: any, timeoutMs: number = 10000): Promise<any> {
        const peer = this.connectedPeers.get(peerId);
        if (!peer) {
            throw new Error(`Peer ${peerId} not found or not connected`);
        }

        const message: Message = {
            id: randomUUID(),
            senderId: this.nodeId!,
            targetId: peerId,
            type: 'direct',
            payload,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingResponses.delete(message.id);
                reject(new Error(`Timeout waiting for response from peer ${peerId}`));
            }, timeoutMs);

            this.pendingResponses.set(message.id, { resolve, reject, timeout });

            this.dealer.send(JSON.stringify(message)).catch(error => {
                clearTimeout(timeout);
                this.pendingResponses.delete(message.id);
                reject(error);
            });
        });
    }

    // Get list of connected peers
    getConnectedPeers(): ClusterNode[] {
        return Array.from(this.connectedPeers.values());
    }

    // Get peer count
    getPeerCount(): number {
        return this.connectedPeers.size;
    }

    // Event emitter functionality
    private eventListeners = new Map<string, Function[]>();

    private emit(event: string, ...args: any[]): any {
        const listeners = this.eventListeners.get(event) || [];
        let result;
        for (const listener of listeners) {
            result = listener(...args);
        }
        return result;
    }

    on(event: string, listener: Function): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(listener);
    }

    off(event: string, listener: Function): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // Cleanup and shutdown
    async shutdown(): Promise<void> {
        try {
            // Clear intervals
            if (this.refreshInterval) clearInterval(this.refreshInterval);
            if (this.cleanupInterval) clearInterval(this.cleanupInterval);

            // Clear pending responses
            for (const [id, pending] of this.pendingResponses) {
                clearTimeout(pending.timeout);
                pending.reject(new Error('ClusterManager shutting down'));
            }
            this.pendingResponses.clear();

            // Update status to offline
            await this.db_collection!.update(this.nodeId!, {
                status: 'offline',
                lastRefresh: Date.now()
            });

            // Close ZeroMQ sockets
            await this.publisher.close();
            await this.subscriber.close();
            await this.router.close();
            await this.dealer.close();

            console.log(`ClusterManager ${this.nodeId} shut down gracefully`);
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}

// Usage example:
/*
const cluster = new ClusterManager(5000, 'localhost');

// Handle incoming broadcast messages
cluster.on('broadcast', (payload, senderId) => {
  console.log('Received broadcast from', senderId, ':', payload);
});

// Handle incoming direct messages
cluster.on('directMessage', (payload, senderId) => {
  console.log('Received direct message from', senderId, ':', payload);

  // Return response
  return {
    status: 'received',
    processedAt: Date.now(),
    echo: payload
  };
});

// Handle peer events
cluster.on('peerConnected', (peer) => {
  console.log('New peer connected:', peer.nodeId);
});

cluster.on('peerDisconnected', (peer) => {
  console.log('Peer disconnected:', peer.nodeId);
});

// Initialize
await cluster.initialize();

// Send broadcast
await cluster.broadcastJson({ type: 'hello', message: 'Hello cluster!' });

// Send direct message to specific peer
try {
  const response = await cluster.sendJsonToPeer('peer-id', {
    action: 'getData',
    params: { id: 123 }
  });
  console.log('Response from peer:', response);
} catch (error) {
  console.error('Failed to send message to peer:', error);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await cluster.shutdown();
  process.exit(0);
});
*/