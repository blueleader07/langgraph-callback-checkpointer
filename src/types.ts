import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint'

/**
 * Simplified checkpoint data for storage
 */
export interface StoredCheckpoint {
    /** Unique identifier for the thread */
    threadId: string
    /** Checkpoint namespace */
    namespace: string
    /** Checkpoint ID */
    checkpointId: string
    /** Parent checkpoint ID if any */
    parentCheckpointId?: string
    /** Serialized checkpoint data */
    checkpoint: Checkpoint
    /** Checkpoint metadata */
    metadata: CheckpointMetadata
    /** Creation timestamp */
    createdAt: Date
    /** Optional TTL timestamp */
    expiresAt?: Date
}

/**
 * Simplified write data for storage
 */
export interface StoredWrite {
    /** Unique identifier for the thread */
    threadId: string
    /** Checkpoint namespace */
    namespace: string
    /** Checkpoint ID this write belongs to */
    checkpointId: string
    /** Task ID within the checkpoint */
    taskId: string
    /** Index of the write within the task */
    idx: number
    /** Channel name */
    channel: string
    /** Write type */
    type: string
    /** Serialized write value */
    value: any
    /** Creation timestamp */
    createdAt: Date
    /** Optional TTL timestamp */
    expiresAt?: Date
}

/**
 * Options for listing checkpoints
 */
export interface ListCheckpointsOptions {
    /** Thread ID to filter by */
    threadId: string
    /** Namespace to filter by */
    namespace: string
    /** Maximum number of results */
    limit?: number
    /** Cursor for pagination */
    before?: string
    /** Filter options */
    filter?: Record<string, any>
}

/**
 * Callback function for getting a checkpoint by ID
 */
export type GetCheckpointCallback = (
    threadId: string,
    namespace: string,
    checkpointId?: string
) => Promise<StoredCheckpoint | undefined>

/**
 * Callback function for saving a checkpoint
 */
export type PutCheckpointCallback = (
    checkpoint: StoredCheckpoint
) => Promise<void>

/**
 * Callback function for getting writes for a checkpoint
 */
export type GetWritesCallback = (
    threadId: string,
    namespace: string,
    checkpointId: string
) => Promise<StoredWrite[]>

/**
 * Callback function for saving writes
 */
export type PutWritesCallback = (
    writes: StoredWrite[]
) => Promise<void>

/**
 * Callback function for listing checkpoints
 */
export type ListCheckpointsCallback = (
    options: ListCheckpointsOptions
) => Promise<{
    checkpoints: StoredCheckpoint[]
    nextCursor?: string
}>

/**
 * Callback function for deleting a thread and all its data
 */
export type DeleteThreadCallback = (
    threadId: string
) => Promise<void>

/**
 * Configuration for the callback saver
 */
export interface CallbackSaverConfig {
    /** Callback for getting checkpoints */
    getCheckpoint: GetCheckpointCallback
    /** Callback for saving checkpoints */
    putCheckpoint: PutCheckpointCallback
    /** Callback for getting writes */
    getWrites: GetWritesCallback
    /** Callback for saving writes */
    putWrites: PutWritesCallback
    /** Callback for listing checkpoints */
    listCheckpoints: ListCheckpointsCallback
    /** Callback for deleting threads */
    deleteThread: DeleteThreadCallback
    /** Default namespace */
    namespace?: string
    /** Whether to serialize values (default: true) */
    serialize?: boolean
}

/**
 * Error thrown by callback saver operations
 */
export class CallbackSaverError extends Error {
    constructor (message: string, public readonly cause?: Error) {
        super(message)
        this.name = 'CallbackSaverError'
    }
}
