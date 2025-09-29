# LangGraph Callback Saver

A flexible checkpoint implementation for [LangGraph](https://github.com/langchain-ai/langgraph) that allows you to implement your own storage backend through callback functions. This package provides a `CallbackSaver` that can work with any database or storage system by providing the appropriate callback functions.

## Features

- 🔌 **Pluggable Storage**: Use any database or storage backend
- 🚀 **TypeScript Support**: Full type safety and IntelliSense
- 🔄 **Async Operations**: All operations are fully asynchronous
- 📝 **Serialization**: Optional automatic JSON serialization
- 🧪 **Well Tested**: Comprehensive test suite
- 📚 **Easy to Use**: Simple callback-based API

## Installation

```bash
npm install langgraph-callback-checkpointer
```

## Quick Start

```typescript
import { CallbackSaver, CallbackSaverConfig } from 'langgraph-callback-checkpointer'

// Define your storage callbacks
const config: CallbackSaverConfig = {
  getCheckpoint: async (threadId, namespace, checkpointId) => {
    // Your logic to retrieve a checkpoint from your database
    return await db.getCheckpoint(threadId, namespace, checkpointId)
  },
  
  putCheckpoint: async (checkpoint) => {
    // Your logic to save a checkpoint to your database
    await db.saveCheckpoint(checkpoint)
  },
  
  getWrites: async (threadId, namespace, checkpointId) => {
    // Your logic to retrieve writes for a checkpoint
    return await db.getWrites(threadId, namespace, checkpointId)
  },
  
  putWrites: async (writes) => {
    // Your logic to save writes to your database
    await db.saveWrites(writes)
  },
  
  listCheckpoints: async (options) => {
    // Your logic to list checkpoints with optional filtering
    const results = await db.listCheckpoints(options)
    return { checkpoints: results }
  },
  
  deleteThread: async (threadId) => {
    // Your logic to delete all data for a thread
    await db.deleteThread(threadId)
  }
}

// Create the saver
const saver = new CallbackSaver(config)

// Use with your LangGraph workflow
const workflow = new StateGraph(...)
  .addNode(...)
  .compile({ checkpointer: saver })
```

## Configuration Options

The `CallbackSaverConfig` interface requires the following callback functions:

### Required Callbacks

#### `getCheckpoint(threadId, namespace, checkpointId?)`
Retrieves a checkpoint from storage.
- `threadId`: Unique identifier for the conversation thread
- `namespace`: Checkpoint namespace (for multi-tenant scenarios)
- `checkpointId`: Specific checkpoint ID, or undefined to get the latest

Returns: `Promise<StoredCheckpoint | undefined>`

#### `putCheckpoint(checkpoint)`
Saves a checkpoint to storage.
- `checkpoint`: The checkpoint data to store

Returns: `Promise<void>`

#### `getWrites(threadId, namespace, checkpointId)`
Retrieves pending writes for a checkpoint.
- `threadId`: Thread identifier
- `namespace`: Checkpoint namespace
- `checkpointId`: Checkpoint identifier

Returns: `Promise<StoredWrite[]>`

#### `putWrites(writes)`
Saves pending writes to storage.
- `writes`: Array of write operations to store

Returns: `Promise<void>`

#### `listCheckpoints(options)`
Lists checkpoints with optional filtering and pagination.
- `options`: Filtering and pagination options

Returns: `Promise<{ checkpoints: StoredCheckpoint[], nextCursor?: string }>`

#### `deleteThread(threadId)`
Deletes all data associated with a thread.
- `threadId`: Thread identifier to delete

Returns: `Promise<void>`

### Optional Configuration

- `namespace?: string` - Default namespace (default: "default")
- `serialize?: boolean` - Enable automatic JSON serialization (default: true)

## Data Types

### StoredCheckpoint

```typescript
interface StoredCheckpoint {
  threadId: string
  namespace: string
  checkpointId: string
  parentCheckpointId?: string
  checkpoint: Checkpoint
  metadata: CheckpointMetadata
  createdAt: Date
  expiresAt?: Date
}
```

### StoredWrite

```typescript
interface StoredWrite {
  threadId: string
  namespace: string
  checkpointId: string
  taskId: string
  idx: number
  channel: string
  type: string
  value: any
  createdAt: Date
  expiresAt?: Date
}
```

## Examples

### In-Memory Implementation

```typescript
import { CallbackSaver, CallbackSaverConfig } from 'langgraph-callback-checkpointer'

// Simple in-memory storage
const checkpoints = new Map<string, StoredCheckpoint>()
const writes = new Map<string, StoredWrite[]>()

const memoryConfig: CallbackSaverConfig = {
  getCheckpoint: async (threadId, namespace, checkpointId) => {
    const key = checkpointId 
      ? `${threadId}:${namespace}:${checkpointId}`
      : findLatestCheckpoint(threadId, namespace)
    return checkpoints.get(key)
  },
  
  putCheckpoint: async (checkpoint) => {
    const key = `${checkpoint.threadId}:${checkpoint.namespace}:${checkpoint.checkpointId}`
    checkpoints.set(key, checkpoint)
  },
  
  // ... other callbacks
}

const saver = new CallbackSaver(memoryConfig)
```

### Database Implementation (PostgreSQL)

```typescript
import { Pool } from 'pg'
import { CallbackSaver } from 'langgraph-callback-checkpointer'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

const postgresConfig: CallbackSaverConfig = {
  getCheckpoint: async (threadId, namespace, checkpointId) => {
    const query = checkpointId
      ? 'SELECT * FROM checkpoints WHERE thread_id = $1 AND namespace = $2 AND checkpoint_id = $3'
      : 'SELECT * FROM checkpoints WHERE thread_id = $1 AND namespace = $2 ORDER BY created_at DESC LIMIT 1'
    
    const params = checkpointId ? [threadId, namespace, checkpointId] : [threadId, namespace]
    const result = await pool.query(query, params)
    
    return result.rows[0] ? mapRowToStoredCheckpoint(result.rows[0]) : undefined
  },
  
  putCheckpoint: async (checkpoint) => {
    await pool.query(
      'INSERT INTO checkpoints (thread_id, namespace, checkpoint_id, checkpoint_data, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [checkpoint.threadId, checkpoint.namespace, checkpoint.checkpointId, JSON.stringify(checkpoint.checkpoint), JSON.stringify(checkpoint.metadata), checkpoint.createdAt]
    )
  },
  
  // ... other callbacks
}

const saver = new CallbackSaver(postgresConfig)
```

### MongoDB Implementation

```typescript
import { MongoClient } from 'mongodb'
import { CallbackSaver } from 'langgraph-callback-checkpointer'

const client = new MongoClient(process.env.MONGODB_URL)
const db = client.db('langgraph')

const mongoConfig: CallbackSaverConfig = {
  getCheckpoint: async (threadId, namespace, checkpointId) => {
    const collection = db.collection('checkpoints')
    const query = { threadId, namespace }
    
    if (checkpointId) {
      query.checkpointId = checkpointId
    }
    
    const checkpoint = await collection.findOne(
      query,
      { sort: { createdAt: -1 } }
    )
    
    return checkpoint ? mapDocumentToStoredCheckpoint(checkpoint) : undefined
  },
  
  putCheckpoint: async (checkpoint) => {
    await db.collection('checkpoints').insertOne(checkpoint)
  },
  
  // ... other callbacks
}

const saver = new CallbackSaver(mongoConfig)
```

## Error Handling

The library provides a `CallbackSaverError` class for error handling:

```typescript
import { CallbackSaverError } from 'langgraph-callback-checkpointer'

try {
  await saver.getTuple(config)
} catch (error) {
  if (error instanceof CallbackSaverError) {
    console.error('Saver error:', error.message)
    console.error('Caused by:', error.cause)
  }
}
```

## Best Practices

1. **Index Your Database**: Ensure proper indexes on `thread_id`, `namespace`, and `checkpoint_id` fields
2. **Handle Serialization**: Consider the `serialize` option based on your storage capabilities
3. **Implement Pagination**: Use the `nextCursor` in `listCheckpoints` for large result sets
4. **Error Handling**: Wrap database operations in try-catch blocks
5. **Connection Pooling**: Use connection pooling for database implementations
6. **TTL/Cleanup**: Implement cleanup logic for expired checkpoints using the `expiresAt` field

## Migration from Other Checkpointers

If you're migrating from another checkpointer implementation:

1. **From MemorySaver**: Replace with in-memory callback implementation
2. **From PostgresSaver**: Use your existing PostgreSQL schema with callback functions
3. **From Custom Implementation**: Wrap your existing logic in the callback interface

## API Reference

For detailed API documentation, see the TypeScript definitions included with this package.

## Contributing

Contributions are welcome! Please see the [contributing guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [LangGraph](https://github.com/langchain-ai/langgraph) - The main LangGraph library
- [@langchain/langgraph-checkpoint](https://www.npmjs.com/package/@langchain/langgraph-checkpoint) - Official checkpoint implementations

## Support

If you encounter any issues or have questions:

1. Check the [examples](src/example.ts) in this repository
2. Open an issue on [GitHub](https://github.com/blueleader07/langgraph-callback-checkpointer/issues)
3. Refer to the [LangGraph documentation](https://langchain-ai.github.io/langgraph/)
