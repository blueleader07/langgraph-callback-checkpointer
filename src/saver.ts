import { BaseCheckpointSaver, CheckpointTuple, CheckpointListOptions } from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { Checkpoint, CheckpointMetadata, PendingWrite } from '@langchain/langgraph-checkpoint'

import {
    CallbackSaverConfig,
    StoredCheckpoint,
    StoredWrite,
    CallbackSaverError,
    ListCheckpointsOptions
} from './types'

/**
 * Callback-based saver that uses callback functions for storage operations.
 * This allows you to use any database or storage backend by providing
 * the appropriate callback functions.
 */
export class CallbackSaver extends BaseCheckpointSaver {
    private config: CallbackSaverConfig

    constructor (config: CallbackSaverConfig) {
        super()
        this.config = {
            namespace: 'default',
            serialize: true,
            ...config
        }
    }

    /**
     * Get a checkpoint tuple by configuration
     */
    async getTuple (config: RunnableConfig): Promise<CheckpointTuple | undefined> {
        try {
            const threadId = config.configurable?.thread_id
            if (!threadId) {
                throw new CallbackSaverError('thread_id is required in config.configurable')
            }

            const namespace = config.configurable?.checkpoint_ns || this.config.namespace || 'default'
            const checkpointId = config.configurable?.checkpoint_id

            // Get the checkpoint
            const storedCheckpoint = await this.config.getCheckpoint(threadId, namespace, checkpointId)
            if (!storedCheckpoint) {
                return undefined
            }

            // Get the writes for this checkpoint
            const writes = await this.config.getWrites(
                storedCheckpoint.threadId,
                storedCheckpoint.namespace,
                storedCheckpoint.checkpointId
            )

            // Convert stored writes to tuple format
            const pendingWrites = writes.map(write => [
                write.taskId,
                write.channel,
                this.config.serialize === false ? write.value : this.deserializeValue(write.value)
            ] as [string, string, any])

            // Create the tuple
            const tuple: CheckpointTuple = {
                config: {
                    configurable: {
                        thread_id: storedCheckpoint.threadId,
                        checkpoint_ns: storedCheckpoint.namespace,
                        checkpoint_id: storedCheckpoint.checkpointId,
                        ...(storedCheckpoint.parentCheckpointId && {
                            checkpoint_parent_id: storedCheckpoint.parentCheckpointId
                        })
                    }
                },
                checkpoint: storedCheckpoint.checkpoint,
                metadata: storedCheckpoint.metadata,
                parentConfig: storedCheckpoint.parentCheckpointId
                    ? {
                        configurable: {
                            thread_id: storedCheckpoint.threadId,
                            checkpoint_ns: storedCheckpoint.namespace,
                            checkpoint_id: storedCheckpoint.parentCheckpointId
                        }
                    }
                    : undefined,
                pendingWrites
            }

            return tuple
        } catch (error) {
            throw new CallbackSaverError(
                `Failed to get checkpoint tuple: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    /**
     * List checkpoints with optional filters
     */
    async * list (
        config: RunnableConfig,
        options?: CheckpointListOptions,
        _before?: RunnableConfig,
        _limit?: number
    ): AsyncGenerator<CheckpointTuple> {
        try {
            const threadId = config.configurable?.thread_id
            if (!threadId) {
                throw new CallbackSaverError('thread_id is required in config.configurable')
            }

            const namespace = config.configurable?.checkpoint_ns || this.config.namespace || 'default'

            const listOptions: ListCheckpointsOptions = {
                threadId,
                namespace,
                limit: _limit || options?.limit,
                before: _before?.configurable?.checkpoint_id,
                filter: options?.filter
            }

            let nextCursor: string | undefined

            do {
                const result = await this.config.listCheckpoints(listOptions)

                for (const storedCheckpoint of result.checkpoints) {
                    // Get writes for this checkpoint
                    const writes = await this.config.getWrites(
                        storedCheckpoint.threadId,
                        storedCheckpoint.namespace,
                        storedCheckpoint.checkpointId
                    )

                    // Convert to PendingWrite tuple format [taskId, channel, value]
                    const pendingWrites = writes.map(write => [
                        write.taskId,
                        write.channel,
                        this.config.serialize === false ? write.value : this.deserializeValue(write.value)
                    ] as [string, string, any])

                    // Create tuple
                    const tuple: CheckpointTuple = {
                        config: {
                            configurable: {
                                thread_id: storedCheckpoint.threadId,
                                checkpoint_ns: storedCheckpoint.namespace,
                                checkpoint_id: storedCheckpoint.checkpointId,
                                ...(storedCheckpoint.parentCheckpointId && {
                                    checkpoint_parent_id: storedCheckpoint.parentCheckpointId
                                })
                            }
                        },
                        checkpoint: storedCheckpoint.checkpoint,
                        metadata: storedCheckpoint.metadata,
                        parentConfig: storedCheckpoint.parentCheckpointId
                            ? {
                                configurable: {
                                    thread_id: storedCheckpoint.threadId,
                                    checkpoint_ns: storedCheckpoint.namespace,
                                    checkpoint_id: storedCheckpoint.parentCheckpointId
                                }
                            }
                            : undefined,
                        pendingWrites
                    }

                    yield tuple
                }

                nextCursor = result.nextCursor
                if (nextCursor) {
                    listOptions.before = nextCursor
                }
            } while (nextCursor)
        } catch (error) {
            throw new CallbackSaverError(
                `Failed to list checkpoints: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    /**
     * Save a checkpoint
     */
    async put (
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        newVersions: Record<string, string | number>
    ): Promise<RunnableConfig> {
        try {
            const threadId = config.configurable?.thread_id
            if (!threadId) {
                throw new CallbackSaverError('thread_id is required in config.configurable')
            }

            const namespace = config.configurable?.checkpoint_ns || this.config.namespace || 'default'
            const checkpointId = checkpoint.id
            const parentCheckpointId = config.configurable?.checkpoint_id

            const storedCheckpoint: StoredCheckpoint = {
                threadId,
                namespace,
                checkpointId,
                parentCheckpointId,
                checkpoint,
                metadata,
                createdAt: new Date()
            }

            await this.config.putCheckpoint(storedCheckpoint)

            return {
                configurable: {
                    thread_id: threadId,
                    checkpoint_ns: namespace,
                    checkpoint_id: checkpointId
                }
            }
        } catch (error) {
            throw new CallbackSaverError(
                `Failed to save checkpoint: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    /**
     * Save pending writes
     */
    async putWrites (
        config: RunnableConfig,
        writes: PendingWrite[],
        taskId: string
    ): Promise<void> {
        try {
            const threadId = config.configurable?.thread_id
            if (!threadId) {
                throw new CallbackSaverError('thread_id is required in config.configurable')
            }

            const namespace = config.configurable?.checkpoint_ns || this.config.namespace || 'default'
            const checkpointId = config.configurable?.checkpoint_id
            if (!checkpointId) {
                throw new CallbackSaverError('checkpoint_id is required in config.configurable')
            }

            const storedWrites: StoredWrite[] = writes.map((write, idx) => {
                const [channel, value] = write
                return {
                    threadId,
                    namespace,
                    checkpointId,
                    taskId,
                    idx,
                    channel,
                    type: 'write',
                    value: this.config.serialize === false ? value : this.serializeValue(value),
                    createdAt: new Date()
                }
            })

            await this.config.putWrites(storedWrites)
        } catch (error) {
            throw new CallbackSaverError(
                `Failed to save writes: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    /**
     * Delete a thread and all its associated data
     */
    async deleteThread (threadId: string): Promise<void> {
        try {
            await this.config.deleteThread(threadId)
        } catch (error) {
            throw new CallbackSaverError(
                `Failed to delete thread: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    /**
     * Serialize a value for storage
     */
    private serializeValue (value: any): any {
        if (this.config.serialize === false) {
            return value
        }

        try {
            const jsonResult = JSON.stringify(value)
            // JSON.stringify returns undefined for undefined, functions, symbols, etc.
            // We need to convert these to strings
            if (jsonResult === undefined) {
                return String(value)
            }
            return jsonResult
        } catch (error) {
            // Fallback to string conversion
            return String(value)
        }
    }

    /**
     * Deserialize a value from storage
     */
    private deserializeValue (value: any): any {
        if (this.config.serialize === false) {
            return value
        }

        if (typeof value !== 'string') {
            return value
        }

        try {
            return JSON.parse(value)
        } catch (error) {
            // Return as-is if parsing fails
            return value
        }
    }
}
