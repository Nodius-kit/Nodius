import WebSocket, { WebSocketServer } from 'ws';

/**
 * WebSocketManager class to handle WebSocket server in Node.js.
 * It opens a WebSocket server on the specified port in the constructor,
 * manages incoming messages as JSON, and provides utility functions for sending messages.
 */
export class WebSocketManager {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set(); // Set to store connected clients

    /**
     * Constructor to initialize the WebSocket server.
     * @param port - The port number on which to start the WebSocket server.
     */
    constructor(port: number) {
        this.wss = new WebSocketServer({ port });

        // Set up connection event listener
        this.wss.on('connection', (ws: WebSocket) => {
            this.clients.add(ws); // Add new client to the set
            console.log('WS: New client connected');

            // Handle incoming messages
            ws.on('message', (message: string) => {
                this.handleIncomingMessage(ws, message);
            });

            // Handle client disconnection
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log('WS: Client disconnected');
            });
        });

        // Log when the server is listening
        this.wss.on('listening', () => {
            console.log(`WebSocket server is listening on port ${port}`);
        });
    }

    /**
     * Handles incoming messages by parsing them as JSON.
     * @param ws - The WebSocket client that sent the message.
     * @param message - The raw message string received.
     */
    private handleIncomingMessage(ws: WebSocket, message: string): void {
        try {
            const jsonData = JSON.parse(message);
            console.log('Received JSON message:', jsonData);
            // Here you can add custom logic to process the JSON data
            // For example, respond based on jsonData.type or something similar
        } catch (error) {
            console.error('Failed to parse message as JSON:', error);
            // Optionally, send an error response back to the client
            this.sendMessage(ws, { error: 'Invalid JSON' });
        }
    }

    /**
     * Utility function to send a message to a specific client.
     * @param ws - The WebSocket client to send the message to.
     * @param data - The data object to send as JSON.
     */
    public sendMessage(ws: WebSocket, data: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } else {
            console.warn('Cannot send message: WebSocket is not open');
        }
    }

    /**
     * Utility function to broadcast a message to all connected clients.
     * @param data - The data object to broadcast as JSON.
     */
    public broadcastMessage(data: any): void {
        this.clients.forEach((client) => {
            this.sendMessage(client, data);
        });
    }

    /**
     * Utility function to get the number of connected clients.
     * @returns The count of currently connected clients.
     */
    public getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Utility function to close the WebSocket server.
     */
    public closeServer(): void {
        this.wss.close(() => {
            console.log('WebSocket server closed');
        });
    }
}

// Example usage:
// const manager = new WebSocketManager(8080);