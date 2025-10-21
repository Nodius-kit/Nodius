/**
 * @file clusterMessage.ts
 * @description Message type definitions for cluster node communication
 * @module requests
 *
 * Defines message types for inter-cluster communication:
 * - CM_IManageInstance: Announce instance ownership
 * - CM_IDontManageInstance: Relinquish instance ownership
 *
 * Used by ClusterManager for coordinating which server node
 * manages which graph/nodeconfig instances in distributed setups.
 *
 * Key features:
 * - Simple message protocol for instance management
 * - Used with ZeroMQ pub/sub for cluster coordination
 * - Enables distributed load balancing
 */

export interface CM_IManageInstance {
    type: "CM_IManageInstance",
    instanceKey: string;
}

export interface CM_IDontManageInstance {
    type: "CM_IDontManageInstance",
    instanceKey: string;
}