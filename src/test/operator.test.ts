import * as k8s from '@dot-i/k8s-operator/node_modules/@kubernetes/client-node';
import { ResourceEventType } from '@dot-i/k8s-operator';
import { DbOperator } from '../operator';
import { Logger } from '../logger';
import * as databasehandler from '../databasehandler';
import { KubernetesObject } from '@kubernetes/client-node';

jest.mock('@dot-i/k8s-operator/node_modules/@kubernetes/client-node');
jest.mock('../databasehandler');

const getMockLogger = () => ({
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
});

const getMockGetNamespacedCustomObject = (): jest.Mock => {
    const getNamespacedCustomObjectMock = jest.fn();
    const mockKubeConfig = jest.fn(() => ({
        loadFromDefault: jest.fn(),
        makeApiClient: () => ({
            getNamespacedCustomObject: getNamespacedCustomObjectMock,
        }),
    }));

    (k8s.KubeConfig as unknown as jest.Mock).mockImplementation(mockKubeConfig);

    return getNamespacedCustomObjectMock;
};

describe('DbOperator getServer', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterAll(() => {
        jest.resetModules();
    });

    test('getServer success', async () => {
        const mock = getMockGetNamespacedCustomObject();
        mock.mockImplementation(() => {
            return Promise.resolve({
                body: {
                    spec: {
                        dbType: 'postgres',
                        host: 'myserverhost',
                        port: 5432,
                        rootUsername: {
                            value: 'myrootusername',
                        },
                        rootPassword: {
                            value: 'myrootpassword',
                        },
                    },
                },
            });
        });

        const operator = new DbOperator();
        const server = await operator.getServer('mynamespace', 'servername');
        expect(server).toEqual({
            dbType: 'postgres',
            host: 'myserverhost',
            port: 5432,
            rootUsername: 'myrootusername',
            rootPassword: 'myrootpassword',
        });
        expect(mock).toHaveBeenCalledWith('db-operator.plumdog.co.uk', 'v1', 'mynamespace', 'serverconfigs', 'servername');
    });

    test('getServer malformed', async () => {
        getMockGetNamespacedCustomObject().mockImplementation(() => {
            return Promise.resolve({
                body: {
                    spec: {
                        thisSpecIs: 'malformed',
                    },
                },
            });
        });

        const operator = new DbOperator();
        const server = await operator.getServer('mynamespace', 'servername');
        expect(server).toBe(undefined);
    });
});

describe('DbOperator getDatabase', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('getDatabase success', async () => {
        const mock = getMockGetNamespacedCustomObject();
        mock.mockImplementation(() => {
            return Promise.resolve({
                body: {
                    spec: {
                        name: 'mydatabase',
                        server: {
                            name: 'myservername',
                        },
                    },
                },
            });
        });

        const operator = new DbOperator();
        const server = await operator.getDatabase('mynamespace', 'dbname');
        expect(server).toEqual({
            spec: {
                name: 'mydatabase',
                server: {
                    name: 'myservername',
                },
            },
        });
        expect(mock).toHaveBeenCalledWith('db-operator.plumdog.co.uk', 'v1', 'mynamespace', 'databases', 'dbname');
    });

    test('getDatabase malformed', async () => {
        getMockGetNamespacedCustomObject().mockImplementation(() => {
            return Promise.resolve({
                body: {
                    spec: {
                        thisSpecIs: 'malformed',
                    },
                },
            });
        });

        const operator = new DbOperator();
        const server = await operator.getDatabase('mynamespace', 'dbname');
        expect(server).toBe(undefined);
    });
});

describe('DbOperator watchDatabase', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('watchDatabase success', async () => {
        const mock = getMockGetNamespacedCustomObject();
        mock.mockImplementation(() => {
            return Promise.resolve({
                body: {
                    spec: {
                        dbType: 'postgres',
                        host: 'myserverhost',
                        port: 5432,
                        rootUsername: {
                            value: 'myrootusername',
                        },
                        rootPassword: {
                            value: 'myrootpassword',
                        },
                    },
                },
            });
        });

        const mockDatabaseHandler = {
            connect: jest.fn(),
            apply: jest.fn().mockImplementation(() => {
                return Promise.resolve({
                    createdName: 'mydatabase',
                    error: {},
                });
            }),
            cleanup: jest.fn(),
        };

        const mockForDbType = databasehandler.DatabaseHandler.forDbType as unknown as jest.Mock;
        mockForDbType.mockImplementation(() => mockDatabaseHandler);

        const mockLogger = getMockLogger();

        const operator = new DbOperator(mockLogger as Logger);

        const mockSetResourceStatus = jest.fn().mockImplementation(() => {
            return Promise.resolve({});
        });
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        operator.setResourceStatus = mockSetResourceStatus;

        await operator.watchDatabase({
            meta: {
                name: 'mydatabase',
                id: 'db1234',
                resourceVersion: 'v1',
                apiVersion: 'v1',
                kind: 'database',
            },
            type: ResourceEventType.Added,
            object: {
                metadata: {
                    namespace: 'mynamespace',
                },
                spec: {
                    name: 'mydatabase',
                    server: {
                        name: 'myservername',
                    },
                },
            } as KubernetesObject,
        });

        expect(mockSetResourceStatus).toHaveBeenCalledWith(
            {
                name: 'mydatabase',
                id: 'db1234',
                resourceVersion: 'v1',
                apiVersion: 'v1',
                kind: 'database',
            },
            {
                createdName: 'mydatabase',
                error: {},
            },
        );

        expect(mockForDbType).toHaveBeenCalledWith({
            database: {
                name: 'mydatabase',
                server: {
                    name: 'myservername',
                },
            },
            databaseStatus: {},
            logger: mockLogger,
            server: {
                dbType: 'postgres',
                host: 'myserverhost',
                port: 5432,
                rootPassword: 'myrootpassword',
                rootUsername: 'myrootusername',
            },
        });
        expect(mockDatabaseHandler.apply).toHaveBeenCalledWith('ADDED');
    });
});
