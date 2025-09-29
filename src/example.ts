import {
    CallbackSaver,
    CallbackSaverConfig,
    StoredCheckpoint,
    StoredWrite
} from './index'

/**
 * Example implementation using in-memory storage
 * Replace with your actual database operations
 */

// In-memory storage (replace with your database)
const checkpoints = new Map<string, StoredCheckpoint>()
const writes = new Map<string, StoredWrite[]>()

// Helper function to create storage keys
function makeCheckpointKey (threadId: string, namespace: string, checkpointId: string): string {
    return `${threadId}:${namespace}:${checkpointId}`
}

function makeWriteKey (threadId: string, namespace: string, checkpointId: string): string {
    return `${threadId}:${namespace}:${checkpointId}`
}

// Configuration with callback implementations
const config: CallbackSaverConfig = {
    // Get a checkpoint by ID or latest if no ID provided
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        if (checkpointId) {
            // Get specific checkpoint
            const key = makeCheckpointKey(threadId, namespace, checkpointId)
            return checkpoints.get(key)
        } else {
            // Get latest checkpoint for thread/namespace
            const prefix = `${threadId}:${namespace}:`
            const matchingKeys = Array.from(checkpoints.keys())
                .filter(key => key.startsWith(prefix))
                .sort() // Sort by key (includes timestamp-like checkpoint IDs)

            if (matchingKeys.length === 0) {
                return undefined
            }

            const latestKey = matchingKeys[matchingKeys.length - 1]
            return checkpoints.get(latestKey)
        }
    },

    // Save a checkpoint
    putCheckpoint: async (checkpoint) => {
        const key = makeCheckpointKey(
            checkpoint.threadId,
            checkpoint.namespace,
            checkpoint.checkpointId
        )
        checkpoints.set(key, checkpoint)
        console.log(`Saved checkpoint: ${key}`)
    },

    // Get writes for a specific checkpoint
    getWrites: async (threadId, namespace, checkpointId) => {
        const key = makeWriteKey(threadId, namespace, checkpointId)
        return writes.get(key) || []
    },

    // Save writes for a checkpoint
    putWrites: async (writesToSave) => {
        // Group writes by checkpoint
        const writesByCheckpoint = new Map<string, StoredWrite[]>()

        for (const write of writesToSave) {
            const key = makeWriteKey(write.threadId, write.namespace, write.checkpointId)
            if (!writesByCheckpoint.has(key)) {
                writesByCheckpoint.set(key, [])
            }
            writesByCheckpoint.get(key)!.push(write)
        }

        // Save grouped writes
        for (const [key, checkpointWrites] of writesByCheckpoint) {
            const existing = writes.get(key) || []
            writes.set(key, [...existing, ...checkpointWrites])
            console.log(`Saved ${checkpointWrites.length} writes for: ${key}`)
        }
    },

    // List checkpoints for a thread with optional filtering
    listCheckpoints: async (options) => {
        const prefix = `${options.threadId}:${options.namespace}:`
        let matchingKeys = Array.from(checkpoints.keys())
            .filter(key => key.startsWith(prefix))
            .sort() // Chronological order

        // Apply before cursor if specified (this filters out keys after the cursor)
        if (options.before) {
            const beforeKey = `${options.threadId}:${options.namespace}:${options.before}`
            const beforeIndex = matchingKeys.indexOf(beforeKey)
            if (beforeIndex >= 0) {
                matchingKeys = matchingKeys.slice(0, beforeIndex)
            }
        }

        // Apply limit if specified
        if (options.limit) {
            matchingKeys = matchingKeys.slice(0, options.limit)
        }

        const results = matchingKeys
            .map(key => checkpoints.get(key)!)
            .filter(Boolean)

        // Only return nextCursor if there are more results beyond the current page
        let nextCursor: string | undefined
        if (options.limit && results.length === options.limit) {
            // Check if there are more results after this page
            const allKeysAfterCursor = Array.from(checkpoints.keys())
                .filter(key => key.startsWith(prefix))
                .sort()

            const lastResultKey = matchingKeys[matchingKeys.length - 1]
            const lastResultIndex = allKeysAfterCursor.indexOf(lastResultKey)

            if (lastResultIndex >= 0 && lastResultIndex < allKeysAfterCursor.length - 1) {
                const lastCheckpoint = results[results.length - 1]
                nextCursor = lastCheckpoint.checkpointId
            }
        }

        return {
            checkpoints: results,
            nextCursor
        }
    },

    // Delete all data for a thread
    deleteThread: async (threadId) => {
        const checkpointKeysToDelete = Array.from(checkpoints.keys())
            .filter(key => key.startsWith(`${threadId}:`))

        const writeKeysToDelete = Array.from(writes.keys())
            .filter(key => key.startsWith(`${threadId}:`))

        // Delete checkpoints
        checkpointKeysToDelete.forEach(key => {
            checkpoints.delete(key)
        })

        // Delete writes
        writeKeysToDelete.forEach(key => {
            writes.delete(key)
        })

        console.log(`Deleted thread ${threadId}: ${checkpointKeysToDelete.length} checkpoints, ${writeKeysToDelete.length} write groups`)
    },

    // Optional configuration
    namespace: 'default',
    serialize: true // Enable automatic JSON serialization
}

// Create the saver instance
export const exampleSaver = new CallbackSaver(config)

// Example usage with LangGraph
export async function createExampleWorkflow () {
    // This would be used with your actual LangGraph workflow
    console.log('Callback saver created and ready to use!')
    return exampleSaver
}

// Utility functions for testing/debugging
export function getStorageStats () {
    return {
        checkpointCount: checkpoints.size,
        writeGroupCount: writes.size,
        totalWrites: Array.from(writes.values()).reduce((sum, writes) => sum + writes.length, 0)
    }
}

export function clearStorage () {
    checkpoints.clear()
    writes.clear()
}

/*
// PostgreSQL example:
const config: CallbackSaverConfig = {
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        const client = await pool.connect()
        try {
            let query, params
            if (checkpointId) {
                query = 'SELECT * FROM checkpoints WHERE thread_id = $1 AND namespace = $2 AND checkpoint_id = $3'
                params = [threadId, namespace, checkpointId]
            } else {
                query = 'SELECT * FROM checkpoints WHERE thread_id = $1 AND namespace = $2 ORDER BY created_at DESC LIMIT 1'
                params = [threadId, namespace]
            }
            const result = await client.query(query, params)
            return result.rows[0] || undefined
        } finally {
            client.release()
        }
    },
    // ... other callbacks
}

// MongoDB example:
const config: CallbackSaverConfig = {
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        const filter = { threadId, namespace }
        if (checkpointId) {
            filter.checkpointId = checkpointId
        }

        const collection = db.collection('checkpoints')
        const result = checkpointId
            ? await collection.findOne(filter)
            : await collection.findOne(filter, { sort: { createdAt: -1 } })

        return result || undefined
    },
    // ... other callbacks
}
*/

/*
// DynamoDB example:
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { CallbackSaverConfig } from './types'

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    // Credentials will be loaded from environment or IAM role
})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

// Table names - customize for your setup
const CHECKPOINTS_TABLE = process.env.CHECKPOINTS_TABLE || 'langgraph-checkpoints'
const WRITES_TABLE = process.env.WRITES_TABLE || 'langgraph-writes'

const dynamoConfig: CallbackSaverConfig = {
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        try {
            if (checkpointId) {
                // Get specific checkpoint
                const result = await docClient.send(new GetCommand({
                    TableName: CHECKPOINTS_TABLE,
                    Key: {
                        pk: `${threadId}:${namespace}`,
                        sk: checkpointId
                    }
                }))

                return result.Item ? mapDynamoItemToStoredCheckpoint(result.Item) : undefined
            } else {
                // Get latest checkpoint for thread/namespace
                const result = await docClient.send(new QueryCommand({
                    TableName: CHECKPOINTS_TABLE,
                    KeyConditionExpression: 'pk = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `${threadId}:${namespace}`
                    },
                    ScanIndexForward: false, // Sort descending to get latest first
                    Limit: 1
                }))

                return result.Items && result.Items.length > 0
                    ? mapDynamoItemToStoredCheckpoint(result.Items[0])
                    : undefined
            }
        } catch (error) {
            console.error('Error getting checkpoint from DynamoDB:', error)
            throw error
        }
    },

    putCheckpoint: async (checkpoint) => {
        try {
            const item = {
                pk: `${checkpoint.threadId}:${checkpoint.namespace}`,
                sk: checkpoint.checkpointId,
                threadId: checkpoint.threadId,
                namespace: checkpoint.namespace,
                checkpointId: checkpoint.checkpointId,
                parentCheckpointId: checkpoint.parentCheckpointId,
                checkpoint: checkpoint.checkpoint,
                metadata: checkpoint.metadata,
                createdAt: checkpoint.createdAt.toISOString(),
                expiresAt: checkpoint.expiresAt?.toISOString(),
                // Add TTL for automatic cleanup (optional)
                ttl: checkpoint.expiresAt ? Math.floor(checkpoint.expiresAt.getTime() / 1000) : undefined
            }

            await docClient.send(new PutCommand({
                TableName: CHECKPOINTS_TABLE,
                Item: item
            }))

            console.log(`Saved checkpoint to DynamoDB: ${checkpoint.threadId}:${checkpoint.namespace}:${checkpoint.checkpointId}`)
        } catch (error) {
            console.error('Error saving checkpoint to DynamoDB:', error)
            throw error
        }
    },

    getWrites: async (threadId, namespace, checkpointId) => {
        try {
            const result = await docClient.send(new QueryCommand({
                TableName: WRITES_TABLE,
                KeyConditionExpression: 'pk = :pk',
                ExpressionAttributeValues: {
                    ':pk': `${threadId}:${namespace}:${checkpointId}`
                },
                ScanIndexForward: true // Sort by sort key (task:idx)
            }))

            return result.Items?.map(item => mapDynamoItemToStoredWrite(item)) || []
        } catch (error) {
            console.error('Error getting writes from DynamoDB:', error)
            throw error
        }
    },

    putWrites: async (writes) => {
        try {
            // Group writes by checkpoint for batch operations
            const writesByCheckpoint = new Map<string, StoredWrite[]>()

            for (const write of writes) {
                const key = `${write.threadId}:${write.namespace}:${write.checkpointId}`
                if (!writesByCheckpoint.has(key)) {
                    writesByCheckpoint.set(key, [])
                }
                writesByCheckpoint.get(key)!.push(write)
            }

            // Save each write individually (DynamoDB batch operations have limitations)
            for (const [checkpointKey, checkpointWrites] of writesByCheckpoint) {
                for (const write of checkpointWrites) {
                    const item = {
                        pk: checkpointKey,
                        sk: `${write.taskId}:${write.idx.toString().padStart(3, '0')}`, // Ensure proper sorting
                        threadId: write.threadId,
                        namespace: write.namespace,
                        checkpointId: write.checkpointId,
                        taskId: write.taskId,
                        idx: write.idx,
                        channel: write.channel,
                        type: write.type,
                        value: write.value,
                        createdAt: write.createdAt.toISOString(),
                        expiresAt: write.expiresAt?.toISOString(),
                        // Add TTL for automatic cleanup (optional)
                        ttl: write.expiresAt ? Math.floor(write.expiresAt.getTime() / 1000) : undefined
                    }

                    await docClient.send(new PutCommand({
                        TableName: WRITES_TABLE,
                        Item: item
                    }))
                }

                console.log(`Saved ${checkpointWrites.length} writes to DynamoDB for: ${checkpointKey}`)
            }
        } catch (error) {
            console.error('Error saving writes to DynamoDB:', error)
            throw error
        }
    },

    listCheckpoints: async (options) => {
        try {
            const params: any = {
                TableName: CHECKPOINTS_TABLE,
                KeyConditionExpression: 'pk = :pk',
                ExpressionAttributeValues: {
                    ':pk': `${options.threadId}:${options.namespace}`
                },
                ScanIndexForward: true // Sort ascending to get checkpoint ID
            }

            // Handle pagination with before cursor
            if (options.before) {
                params.ExclusiveStartKey = {
                    pk: `${options.threadId}:${options.namespace}`,
                    sk: options.before
                }
            }

            // Apply limit
            if (options.limit) {
                params.Limit = options.limit
            }

            const result = await docClient.send(new QueryCommand(params))

            const checkpoints = result.Items?.map(item => mapDynamoItemToStoredCheckpoint(item)) || []

            // Determine if there are more results for pagination
            const nextCursor = result.LastEvaluatedKey ? result.LastEvaluatedKey.sk : undefined

            return {
                checkpoints,
                nextCursor
            }
        } catch (error) {
            console.error('Error listing checkpoints from DynamoDB:', error)
            throw error
        }
    },

    deleteThread: async (threadId) => {
        try {
            // First, get all items for this thread across all namespaces
            const checkpointScanResult = await docClient.send(new ScanCommand({
                TableName: CHECKPOINTS_TABLE,
                FilterExpression: 'begins_with(pk, :threadPrefix)',
                ExpressionAttributeValues: {
                    ':threadPrefix': `${threadId}:`
                }
            }))

            const writeScanResult = await docClient.send(new ScanCommand({
                TableName: WRITES_TABLE,
                FilterExpression: 'begins_with(pk, :threadPrefix)',
                ExpressionAttributeValues: {
                    ':threadPrefix': `${threadId}:`
                }
            }))

            // Delete checkpoints
            if (checkpointScanResult.Items && checkpointScanResult.Items.length > 0) {
                for (const item of checkpointScanResult.Items) {
                    await docClient.send(new DeleteCommand({
                        TableName: CHECKPOINTS_TABLE,
                        Key: {
                            pk: item.pk,
                            sk: item.sk
                        }
                    }))
                }
            }

            // Delete writes
            if (writeScanResult.Items && writeScanResult.Items.length > 0) {
                for (const item of writeScanResult.Items) {
                    await docClient.send(new DeleteCommand({
                        TableName: WRITES_TABLE,
                        Key: {
                            pk: item.pk,
                            sk: item.sk
                        }
                    }))
                }
            }

            console.log(`Deleted thread ${threadId}: ${checkpointScanResult.Items?.length || 0} checkpoints, ${writeScanResult.Items?.length || 0} writes`)
        } catch (error) {
            console.error('Error deleting thread from DynamoDB:', error)
            throw error
        }
    },

    // Configuration
    namespace: 'langgraph-agents',
    serialize: true // Enable automatic JSON serialization
}

// Helper functions to map between DynamoDB items and StoredCheckpoint/StoredWrite
function mapDynamoItemToStoredCheckpoint(item: any): StoredCheckpoint {
    return {
        threadId: item.threadId,
        namespace: item.namespace,
        checkpointId: item.checkpointId,
        parentCheckpointId: item.parentCheckpointId,
        checkpoint: item.checkpoint,
        metadata: item.metadata,
        createdAt: new Date(item.createdAt),
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined
    }
}

function mapDynamoItemToStoredWrite(item: any): StoredWrite {
    return {
        threadId: item.threadId,
        namespace: item.namespace,
        checkpointId: item.checkpointId,
        taskId: item.taskId,
        idx: item.idx,
        channel: item.channel,
        type: item.type,
        value: item.value,
        createdAt: new Date(item.createdAt),
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined
    }
}

// Create the DynamoDB saver instance
export const dynamoSaver = new CallbackSaver(dynamoConfig)

// Example usage with your graph executor
export async function createDynamoWorkflow() {
    console.log('DynamoDB saver created and ready to use!')
    return dynamoSaver
}

// DynamoDB Table Creation Scripts (CloudFormation/CDK):
//
// Checkpoints Table:
// - Partition Key: pk (String) - Format: "threadId:namespace"
// - Sort Key: sk (String) - Format: checkpointId
// - TTL Attribute: ttl (Number) - Optional for automatic cleanup
// - Point-in-time Recovery: Recommended
// - On-demand billing or provisioned based on your needs
//
// Writes Table:
// - Partition Key: pk (String) - Format: "threadId:namespace:checkpointId"
// - Sort Key: sk (String) - Format: "taskId:idx" (padded for proper sorting)
// - TTL Attribute: ttl (Number) - Optional for automatic cleanup
// - Point-in-time Recovery: Recommended
// - On-demand billing or provisioned based on your needs
//
// Environment Variables:
// - AWS_REGION: Your AWS region
// - CHECKPOINTS_TABLE: Name of your checkpoints table
// - WRITES_TABLE: Name of your writes table
// - AWS credentials should be configured via IAM role or environment variables

*/
