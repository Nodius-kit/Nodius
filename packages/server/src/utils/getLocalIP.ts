/**
 * @file getLocalIP.ts
 * @description Utility to detect the local IP address that can access the internet
 */

import { networkInterfaces } from 'os';

/**
 * Get the local IP address of the network interface that can access the internet.
 * This returns the first non-internal IPv4 address found.
 *
 * @returns The local IP address or 'localhost' as fallback
 */
export function getLocalIP(): string {
    const nets = networkInterfaces();

    // Priority order: prefer typical LAN interfaces
    const priorityPrefixes = ['192.168.', '10.', '172.'];

    let fallbackIP: string | null = null;

    for (const name of Object.keys(nets)) {
        const netInterface = nets[name];
        if (!netInterface) continue;

        for (const net of netInterface) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (net.internal || net.family !== 'IPv4') continue;

            // Check if it's a priority LAN address
            for (const prefix of priorityPrefixes) {
                if (net.address.startsWith(prefix)) {
                    return net.address;
                }
            }

            // Store as fallback if no priority match
            if (!fallbackIP) {
                fallbackIP = net.address;
            }
        }
    }

    return fallbackIP || 'localhost';
}
