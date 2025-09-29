import { CallbackSaver, CallbackSaverConfig, CallbackSaverError } from '../src'

describe('CallbackSaver Error Handling', () => {
    describe('CallbackSaverError', () => {
        it('should create error with message only', () => {
            const error = new CallbackSaverError('Test error message')
            expect(error.message).toBe('Test error message')
            expect(error.name).toBe('CallbackSaverError')
            expect(error.cause).toBeUndefined()
        })

        it('should create error with message and cause', () => {
            const cause = new Error('Original error')
            const error = new CallbackSaverError('Wrapper error', cause)
            expect(error.message).toBe('Wrapper error')
            expect(error.cause).toBe(cause)
        })

        it('should be instanceof Error', () => {
            const error = new CallbackSaverError('Test')
            expect(error).toBeInstanceOf(Error)
            expect(error).toBeInstanceOf(CallbackSaverError)
        })
    })

    describe('configuration validation', () => {
        it('should work with minimal required configuration', () => {
            const config: CallbackSaverConfig = {
                getCheckpoint: jest.fn(),
                putCheckpoint: jest.fn(),
                getWrites: jest.fn(),
                putWrites: jest.fn(),
                listCheckpoints: jest.fn(),
                deleteThread: jest.fn()
            }

            expect(() => new CallbackSaver(config)).not.toThrow()
        })

        it('should throw when thread_id is missing', async () => {
            const config: CallbackSaverConfig = {
                getCheckpoint: jest.fn(),
                putCheckpoint: jest.fn(),
                getWrites: jest.fn(),
                putWrites: jest.fn(),
                listCheckpoints: jest.fn(),
                deleteThread: jest.fn()
            }

            const saver = new CallbackSaver(config)

            await expect(saver.getTuple({
                configurable: {}
            })).rejects.toThrow('thread_id is required')
        })

        it('should wrap callback errors', async () => {
            const config: CallbackSaverConfig = {
                getCheckpoint: jest.fn().mockRejectedValue(new Error('Database down')),
                putCheckpoint: jest.fn(),
                getWrites: jest.fn(),
                putWrites: jest.fn(),
                listCheckpoints: jest.fn(),
                deleteThread: jest.fn()
            }

            const saver = new CallbackSaver(config)

            await expect(saver.getTuple({
                configurable: { thread_id: 'test', checkpoint_ns: 'test' }
            })).rejects.toThrow(CallbackSaverError)
        })
    })

    describe('namespace handling', () => {
        it('should use default namespace when not specified', async () => {
            const config: CallbackSaverConfig = {
                getCheckpoint: jest.fn(),
                putCheckpoint: jest.fn(),
                getWrites: jest.fn(),
                putWrites: jest.fn(),
                listCheckpoints: jest.fn(),
                deleteThread: jest.fn()
            }

            const saver = new CallbackSaver(config)

            const checkpoint = {
                id: 'test',
                v: 1,
                ts: '',
                channel_versions: {},
                channel_values: {},
                versions_seen: {}
            }

            await saver.put(
                { configurable: { thread_id: 'test' } },
                checkpoint,
                { source: 'input', step: 1, parents: {} },
                {}
            )

            expect(config.putCheckpoint).toHaveBeenCalledWith(
                expect.objectContaining({
                    namespace: 'default'
                })
            )
        })
    })
})
