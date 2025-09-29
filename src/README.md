# Custom Checkpointer for LangGraph

A flexible checkpointer implementation that allows you to use any database or storage backend through callback functions.

## Overview

The Custom Checkpointer provides a way to integrate LangGraph checkpointing with any storage system by implementing simple callback functions. This gives you complete control over how and where checkpoint data is stored.

## Features

- **Database Agnostic**: Works with any storage backend (SQL databases, NoSQL, file systems, etc.)
- **Callback-Based**: Simple interface using callback functions
- **TypeScript Support**: Full type safety with comprehensive interfaces
- **Flexible Serialization**: Optional automatic JSON serialization or custom handling
- **Thread Management**: Support for organizing checkpoints by thread
- **Namespace Support**: Logical separation of checkpoint groups

## Installation

```typescript
import { CustomCheckpointer } from '../checkpointers/custom'
```

## Basic Usage

### 1. Implement Callback Functions

```typescript
import { 
    CustomCheckpointer, 
    CustomCheckpointerConfig,
    StoredCheckpoint,
    StoredWrite 
} from '../checkpointers/custom'

// Example using an in-memory store (replace with your database)
const checkpoints = new Map<string, StoredCheckpoint>()
const writes = new Map<string, StoredWrite[]>()

const config: CustomCheckpointerConfig = {
    // Get a specific checkpoint
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        const key = checkpointId 
            ? `${threadId}:${namespace}:${checkpointId}`
            : Array.from(checkpoints.keys())
                .filter(k => k.startsWith(`${threadId}:${namespace}:`))
                .sort()
                .pop()
        
        return key ? checkpoints.get(key) : undefined
    },

    // Save a checkpoint
    putCheckpoint: async (checkpoint) => {
        const key = `${checkpoint.threadId}:${checkpoint.namespace}:${checkpoint.checkpointId}`
        checkpoints.set(key, checkpoint)
    },

    // Get writes for a checkpoint
    getWrites: async (threadId, namespace, checkpointId) => {
        const key = `${threadId}:${namespace}:${checkpointId}`
        return writes.get(key) || []
    },

    // Save writes
    putWrites: async (writesToSave) => {
        for (const write of writesToSave) {
            const key = `${write.threadId}:${write.namespace}:${write.checkpointId}`
            const existing = writes.get(key) || []
            existing.push(write)
            writes.set(key, existing)
        }
    },

    // List checkpoints for a thread
    listCheckpoints: async (options) => {
        const prefix = `${options.threadId}:${options.namespace}:`
        const matchingKeys = Array.from(checkpoints.keys())
            .filter(key => key.startsWith(prefix))
            .sort()
            .slice(0, options.limit || 100)

        const results = matchingKeys
            .map(key => checkpoints.get(key)!)
            .filter(Boolean)

        return { checkpoints: results }
    },

    // Delete all data for a thread
    deleteThread: async (threadId) => {
        const keysToDelete = Array.from(checkpoints.keys())
            .filter(key => key.startsWith(`${threadId}:`))
        
        keysToDelete.forEach(key => {
            checkpoints.delete(key)
            writes.delete(key)
        })
    }
}

// Create the checkpointer
const checkpointer = new CustomCheckpointer(config)
```

### 2. Use with LangGraph

```typescript
import { StateGraph } from '@langchain/langgraph'

// Create your workflow
const workflow = new StateGraph(/* your state annotation */)
// ... add nodes and edges

// Compile with the custom checkpointer
const app = workflow.compile({ checkpointer })

// Use normally
const result = await app.invoke(
    { input: "Hello!" },
    { 
        configurable: { 
            thread_id: "conversation-123",
            checkpoint_ns: "my-app"
        } 
    }
)
```

## Database Integration Examples

### PostgreSQL Example

```typescript
import { Pool } from 'pg'

const pool = new Pool({ /* your connection config */ })

const config: CustomCheckpointerConfig = {
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        let query, params
        if (checkpointId) {
            query = `
                SELECT * FROM checkpoints 
                WHERE thread_id = $1 AND namespace = $2 AND checkpoint_id = $3
            `
            params = [threadId, namespace, checkpointId]
        } else {
            query = `
                SELECT * FROM checkpoints 
                WHERE thread_id = $1 AND namespace = $2 
                ORDER BY created_at DESC LIMIT 1
            `
            params = [threadId, namespace]
        }
        
        const result = await pool.query(query, params)
        return result.rows[0] || undefined
    },

    putCheckpoint: async (checkpoint) => {
        await pool.query(`
            INSERT INTO checkpoints (
                thread_id, namespace, checkpoint_id, parent_checkpoint_id,
                checkpoint, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (thread_id, namespace, checkpoint_id) 
            DO UPDATE SET 
                checkpoint = EXCLUDED.checkpoint,
                metadata = EXCLUDED.metadata
        `, [
            checkpoint.threadId,
            checkpoint.namespace, 
            checkpoint.checkpointId,
            checkpoint.parentCheckpointId,
            JSON.stringify(checkpoint.checkpoint),
            JSON.stringify(checkpoint.metadata),
            checkpoint.createdAt
        ])
    },

    // ... implement other callbacks
}
```

### MongoDB Example

```typescript
import { MongoClient } from 'mongodb'

const client = new MongoClient('your-connection-string')
const db = client.db('your-database')

const config: CustomCheckpointerConfig = {
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

    putCheckpoint: async (checkpoint) => {
        const collection = db.collection('checkpoints')
        await collection.replaceOne(
            { 
                threadId: checkpoint.threadId,
                namespace: checkpoint.namespace,
                checkpointId: checkpoint.checkpointId
            },
            checkpoint,
            { upsert: true }
        )
    },

    // ... implement other callbacks
}
```

## Configuration Options

```typescript
interface CustomCheckpointerConfig {
    getCheckpoint: GetCheckpointCallback       // Required: Get checkpoint by ID
    putCheckpoint: PutCheckpointCallback       // Required: Save checkpoint
    getWrites: GetWritesCallback              // Required: Get writes for checkpoint  
    putWrites: PutWritesCallback              // Required: Save writes
    listCheckpoints: ListCheckpointsCallback   // Required: List checkpoints
    deleteThread: DeleteThreadCallback        // Required: Delete thread data
    namespace?: string                        // Optional: Default namespace
    serialize?: boolean                       // Optional: Auto JSON serialization (default: true)
}
```

## Data Structures

### StoredCheckpoint
```typescript
interface StoredCheckpoint {
    threadId: string              // Unique thread identifier
    namespace: string             // Logical grouping namespace  
    checkpointId: string          // Unique checkpoint ID
    parentCheckpointId?: string   // Parent checkpoint if any
    checkpoint: Checkpoint        // LangGraph checkpoint data
    metadata: CheckpointMetadata  // Associated metadata
    createdAt: Date              // Timestamp
    expiresAt?: Date             // Optional expiration
}
```

### StoredWrite
```typescript
interface StoredWrite {
    threadId: string        // Thread this write belongs to
    namespace: string       // Namespace for organization
    checkpointId: string    // Associated checkpoint
    taskId: string          // Task within checkpoint
    idx: number            // Write index within task
    channel: string        // Channel name
    type: string           // Write type identifier
    value: any             // Write value (serialized if enabled)
    createdAt: Date        // Timestamp
    expiresAt?: Date       // Optional expiration
}
```

## Best Practices

### 1. Database Schema Design
- Use composite indexes on `(threadId, namespace, checkpointId)`
- Consider partitioning by threadId for large datasets
- Implement TTL/expiration if needed

### 2. Error Handling
```typescript
const config: CustomCheckpointerConfig = {
    getCheckpoint: async (threadId, namespace, checkpointId) => {
        try {
            // Your database operation
            return await db.getCheckpoint(threadId, namespace, checkpointId)
        } catch (error) {
            console.error('Database error:', error)
            throw new Error(`Failed to get checkpoint: ${error.message}`)
        }
    },
    // ... other callbacks
}
```

### 3. Connection Pooling
Use connection pooling for production databases:
```typescript
// PostgreSQL example
const pool = new Pool({
    host: 'localhost',
    database: 'myapp',
    max: 20,  // Maximum connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
})
```

### 4. Serialization Control
```typescript
// Automatic JSON serialization (default)
const checkpointer = new CustomCheckpointer({ 
    serialize: true,  // Default
    // ... callbacks
})

// Custom serialization
const checkpointer = new CustomCheckpointer({ 
    serialize: false,
    putCheckpoint: async (checkpoint) => {
        // Handle your own serialization
        const serialized = {
            ...checkpoint,
            checkpoint: msgpack.encode(checkpoint.checkpoint),
            metadata: msgpack.encode(checkpoint.metadata)
        }
        await db.save(serialized)
    },
    // ... other callbacks
})
```

## Testing

```typescript
import { CustomCheckpointer } from '../checkpointers/custom'

// Test with in-memory storage
const testCheckpointer = new CustomCheckpointer({
    getCheckpoint: async () => testData.checkpoint,
    putCheckpoint: async (cp) => { testData.checkpoint = cp },
    getWrites: async () => testData.writes,
    putWrites: async (writes) => { testData.writes = writes },
    listCheckpoints: async () => ({ checkpoints: [testData.checkpoint] }),
    deleteThread: async () => { /* cleanup */ }
})
```

## Migration from Other Checkpointers

### From MemorySaver
```typescript
// Old
import { MemorySaver } from '@langchain/langgraph-checkpoint'
const checkpointer = new MemorySaver()

// New - with persistent storage
const checkpointer = new CustomCheckpointer({
    // Implement callbacks to save to your database
    // instead of memory
})
```

### From DynamoDBSaver
```typescript
// Old
import { DynamoDBSaver } from '../checkpointers/dynamodb'
const checkpointer = new DynamoDBSaver(config)

// New - with custom database
const checkpointer = new CustomCheckpointer({
    // Implement callbacks using your preferred database
    // while maintaining the same checkpoint functionality
})
```

## Error Handling

The Custom Checkpointer throws `CustomCheckpointerError` for all operational errors:

```typescript
import { CustomCheckpointerError } from '../checkpointers/custom'

try {
    await checkpointer.getTuple(config)
} catch (error) {
    if (error instanceof CustomCheckpointerError) {
        console.error('Checkpointer error:', error.message)
        console.error('Caused by:', error.cause)
    }
}
```