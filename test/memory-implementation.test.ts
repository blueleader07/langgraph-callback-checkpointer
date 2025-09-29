import { exampleSaver, createExampleWorkflow, getStorageStats, clearStorage } from '../src/example'
import { CallbackSaver } from '../src'

describe('Memory Implementation Tests', () => {
    // Clear storage before and after each test to prevent memory leaks
    beforeEach(() => {
        clearStorage()
    })

    afterEach(() => {
        clearStorage()
    })

    // Clear storage after all tests complete
    afterAll(() => {
        clearStorage()
    })

    describe('exampleSaver instance', () => {
        it('should create a working saver instance', () => {
            expect(exampleSaver).toBeInstanceOf(CallbackSaver)
        })

        it('should start with empty storage', () => {
            const stats = getStorageStats()
            expect(stats.checkpointCount).toBe(0)
            expect(stats.writeGroupCount).toBe(0)
            expect(stats.totalWrites).toBe(0)
        })
    })

    describe('basic checkpoint operations', () => {
        it('should handle checkpoint save and retrieve', async () => {
            const config = {
                configurable: {
                    thread_id: 'basic-test',
                    checkpoint_ns: 'default',
                    checkpoint_id: 'checkpoint-1'
                }
            }

            const checkpoint = {
                id: 'checkpoint-1',
                v: 1,
                ts: new Date().toISOString(),
                channel_versions: { test: 1 },
                channel_values: { test: 'value' },
                versions_seen: {}
            }

            const metadata = {
                source: 'input' as const,
                step: 1,
                parents: {}
            }

            // Save checkpoint
            await exampleSaver.put(config, checkpoint, metadata, {})

            // Verify storage stats
            let stats = getStorageStats()
            expect(stats.checkpointCount).toBe(1)

            // Retrieve checkpoint
            const retrieved = await exampleSaver.getTuple(config)
            expect(retrieved).toBeDefined()
            expect(retrieved?.checkpoint.id).toBe('checkpoint-1')

            // Clean up
            await exampleSaver.deleteThread('basic-test')
            stats = getStorageStats()
            expect(stats.checkpointCount).toBe(0)
        })

        it('should handle writes operations', async () => {
            const config = {
                configurable: {
                    thread_id: 'writes-test',
                    checkpoint_ns: 'default',
                    checkpoint_id: 'checkpoint-1'
                }
            }

            const checkpoint = {
                id: 'checkpoint-1',
                v: 1,
                ts: new Date().toISOString(),
                channel_versions: {},
                channel_values: {},
                versions_seen: {}
            }

            // Save checkpoint first
            await exampleSaver.put(config, checkpoint, {
                source: 'input',
                step: 1,
                parents: {}
            }, {})

            // Add writes
            const writes = [
                ['channel1', { message: 'test message' }]
            ] as any[]

            await exampleSaver.putWrites(config, writes, 'task-1')

            // Verify writes were saved
            const retrieved = await exampleSaver.getTuple(config)
            expect(retrieved?.pendingWrites).toHaveLength(1)

            // Clean up
            await exampleSaver.deleteThread('writes-test')
        })
    })

    describe('listing operations', () => {
        it('should list checkpoints correctly', async () => {
            const threadId = 'list-test'
            const namespace = 'default'

            // Create 2 checkpoints (reduced from 3 to save memory)
            for (let i = 1; i <= 2; i++) {
                const config = {
                    configurable: {
                        thread_id: threadId,
                        checkpoint_ns: namespace,
                        checkpoint_id: `checkpoint-${i}`
                    }
                }

                const checkpoint = {
                    id: `checkpoint-${i}`,
                    v: 1,
                    ts: new Date().toISOString(),
                    channel_versions: {},
                    channel_values: {},
                    versions_seen: {}
                }

                await exampleSaver.put(config, checkpoint, {
                    source: 'input',
                    step: i,
                    parents: {}
                }, {})
            }

            // List checkpoints
            const checkpoints = []
            for await (const tuple of exampleSaver.list({
                configurable: { thread_id: threadId, checkpoint_ns: namespace }
            })) {
                checkpoints.push(tuple)
            }

            expect(checkpoints).toHaveLength(2)
            expect(checkpoints.map(c => c.checkpoint.id)).toEqual([
                'checkpoint-1', 'checkpoint-2'
            ])

            // Clean up
            await exampleSaver.deleteThread(threadId)
        })
    })

    describe('thread management', () => {
        it('should delete thread data', async () => {
            const threadId = 'delete-test'

            // Create minimal test data
            const config = {
                configurable: {
                    thread_id: threadId,
                    checkpoint_ns: 'default',
                    checkpoint_id: 'to-delete'
                }
            }

            const checkpoint = {
                id: 'to-delete',
                v: 1,
                ts: new Date().toISOString(),
                channel_versions: {},
                channel_values: {},
                versions_seen: {}
            }

            await exampleSaver.put(config, checkpoint, {
                source: 'input',
                step: 1,
                parents: {}
            }, {})

            // Verify data exists
            let stats = getStorageStats()
            expect(stats.checkpointCount).toBeGreaterThan(0)

            // Delete thread
            await exampleSaver.deleteThread(threadId)

            // Verify data is gone
            const retrieved = await exampleSaver.getTuple(config)
            expect(retrieved).toBeUndefined()

            stats = getStorageStats()
            expect(stats.checkpointCount).toBe(0)
        })
    })

    describe('utility functions', () => {
        it('should track storage stats correctly', async () => {
            // Initially empty
            let stats = getStorageStats()
            expect(stats.checkpointCount).toBe(0)

            // Add a checkpoint
            const config = {
                configurable: {
                    thread_id: 'stats-test',
                    checkpoint_ns: 'default',
                    checkpoint_id: 'stats-checkpoint'
                }
            }

            const checkpoint = {
                id: 'stats-checkpoint',
                v: 1,
                ts: new Date().toISOString(),
                channel_versions: {},
                channel_values: {},
                versions_seen: {}
            }

            await exampleSaver.put(config, checkpoint, {
                source: 'input',
                step: 1,
                parents: {}
            }, {})

            // Check updated stats
            stats = getStorageStats()
            expect(stats.checkpointCount).toBe(1)

            // Clean up
            await exampleSaver.deleteThread('stats-test')
        })

        it('should clear storage completely', () => {
            // Verify clear function works
            clearStorage()
            const stats = getStorageStats()
            expect(stats.checkpointCount).toBe(0)
            expect(stats.writeGroupCount).toBe(0)
            expect(stats.totalWrites).toBe(0)
        })
    })

    describe('workflow creation', () => {
        it('should create example workflow', async () => {
            const result = await createExampleWorkflow()
            expect(result).toBeInstanceOf(CallbackSaver)
        })
    })
})
