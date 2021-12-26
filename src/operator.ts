import { isLeft } from 'fp-ts/lib/Either';
import { serializeError } from 'serialize-error';
import { DatabaseHandler } from './databasehandler';
import { DatabaseSpec, DatabaseStatus, DatabaseResource, ServerSpec, ResolvedServerSpec, ServerSpecReferencedAttribute } from './resources';
import { getLogger, Logger } from './logger';

import Operator, { ResourceEvent } from '@dot-i/k8s-operator';
import * as k8s from '@kubernetes/client-node';

class ServerResolveError extends Error {
    public reason: string;

    constructor(reason: string) {
        super();
        this.reason = reason;
    }
}

interface KubernetesObjectWithSpec extends k8s.KubernetesObject {
    spec: unknown;
    status?: unknown;
}

const kubernetesObjectHasSpec = (obj: unknown): obj is KubernetesObjectWithSpec => {
    return typeof obj === 'object' && !!obj && obj.hasOwnProperty('spec');
};

// const UserSpec = t.type({
//     name: t.string,
//     database: t.intersection([
//         t.type({
//             name: t.string,
//         }),
//         t.partial({
//             namespace: t.string,
//         }),
//     ]),
// });

// type UserSpec = t.TypeOf<typeof UserSpec>;

// const UserStatus = t.partial({
//     createdName: t.string,
//     error: t.partial({
//         message: t.string,
//         code: t.string,
//     }),
// });

// type UserStatus = t.TypeOf<typeof UserStatus>;

// const UserResource = t.intersection([
//     t.type({
//         spec: UserSpec,
//     }),
//     t.partial({
//         status: UserStatus,
//     }),
// ]);

// type UserResource = t.TypeOf<typeof UserResource>;

const resolveServerSpecReferencedAttribute = async (referencedAttributed: ServerSpecReferencedAttribute): Promise<string> => {
    if (typeof referencedAttributed.value === 'string') {
        return referencedAttributed.value;
    }

    throw new ServerResolveError('No target set');
};

const resolveServerSpec = async (spec: ServerSpec): Promise<ResolvedServerSpec> => {
    let rootUsername: string;
    try {
        rootUsername = await resolveServerSpecReferencedAttribute(spec.rootUsername);
    } catch (err) {
        if (err instanceof ServerResolveError) {
            throw new ServerResolveError(`Unable to resolve referenced value for rootUsername: ${err.reason}`);
        }
        throw err;
    }

    let rootPassword: string;
    try {
        rootPassword = await resolveServerSpecReferencedAttribute(spec.rootPassword);
    } catch (err) {
        if (err instanceof ServerResolveError) {
            throw new ServerResolveError(`Unable to resolve referenced value for rootPassword: ${err.reason}`);
        }
        throw err;
    }

    return {
        dbType: spec.dbType,
        host: spec.host,
        port: spec.port,
        rootUsername,
        rootPassword,
    };
};

// interface UserHandlerProps {
//     user: UserSpec;
//     userStatus: UserStatus;
//     server: ResolvedServerSpec;
// }

// abstract class UserHandler {
//     readonly user: UserSpec;
//     readonly userStatus: UserStatus;
//     readonly database: DatabaseSpec;
//     readonly server: ResolvedServerSpec;

//     constructor(props: UserHandlerProps) {
//         this.user = props.user;
//         this.server = props.server;
//         this.userStatus = props.userStatus;
//     }
//     public abstract apply(resourceEventType: ResourceEventType): Promise<UserStatus>;
//     public abstract connect(): Promise<void>;
//     public abstract cleanup(): Promise<void>;

//     public static forDbType(props: UserHandlerProps): UserHandler {
//         switch (props.server.dbType) {
//             case 'postgres':
//                 return new PgUserHandler(props);
//         }
//         throw new Error(`Unknown dbType`);
//     }
// }

// class PgUserHandler extends UserHandler {
//     readonly client: PgClient;

//     constructor(props: UserHandlerProps) {
//         super(props);
//         this.client = new PgClient({
//             user: this.server.rootUsername,
//             password: this.server.rootPassword,
//             host: this.server.host,
//             database: 'postgres',
//             port: this.server.port,
//         });
//     }

//     public async connect(): Promise<void> {
//         this.client.connect();
//     }

//     public async cleanup(): Promise<void> {
//         this.client.end();
//     }

//     public async apply(resourceEventType: ResourceEventType): Promise<UserStatus> {
//         if (this.userStatus.createdName && (this.userStatus.createdName !== this.user.name)) {
//             this.logger.error('User already created with a different name', {
//                 createdWithName: this.userStatus.createdName,
//                 requestedName: this.user.name,
//             });
//             return {
//                 ...this.userStatus,
//                 error: {
//                     code: 'CannotModifyName',
//                     message: `User already created with name ${this.userStatus.createdName}.`,
//                 },
//             }
//         }

//         this.logger.info('Apply PgUserHandler', {
//             user: this.user,
//             userStatus: this.userStatus,
//         });
//         switch (resourceEventType) {
//             case ResourceEventType.Added:
//                 await this.added();
//                 return {
//                     ...this.userStatus,
//                     createdName: this.user.name,
//                     error: {},
//                 };
//             case ResourceEventType.Modified:
//                 await this.modified();
//                 return {
//                     ...this.userStatus,
//                     error: {},
//                 }
//             case ResourceEventType.Deleted:
//                 await this.deleted();
//                 return {
//                     createdName: '',
//                     error: {},
//                 }
//         }
//     }

//     protected async added(): Promise<void> {
//         this.logger.info('Added');
//         try {
//             await this.client.query(`CREATE ROLE ${this.user.name}`);
//         } catch (err) {
//             console.error(err);
//         }
//     }

//     protected async modified(): Promise<void> {
//         this.logger.info('Modified');
//         // Do not do modification, patch the user object with an error message
//     }

//     protected async deleted(): Promise<void> {
//         this.logger.info('Deleted');
//         await this.client.query(`DROP ROLE ${this.user.name}`);
//     }
// }

export class DbOperator extends Operator {
    protected log: Logger;

    constructor(logger?: Logger) {
        const log = logger ?? getLogger(undefined);
        super(log);
        this.log = log;
    }

    public async getServer(namespace: string, name: string): Promise<ResolvedServerSpec | undefined> {
        this.log.info('getServer', {
            args: {
                namespace,
                name,
            },
        });

        const customClient = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);

        let resource: k8s.KubernetesObject;
        try {
            const apiResponse = await customClient.getNamespacedCustomObject('db-operator.plumdog.co.uk', 'v1', namespace, 'serverconfigs', name);
            resource = apiResponse.body;
        } catch (err) {
            if (err instanceof k8s.HttpError) {
                if (err.body.reason === 'NotFound') {
                    this.log.info('ServerConfig not found', {
                        namespace,
                        name,
                    });
                    return undefined;
                }
            }

            this.log.error('Unknown error', {
                err: serializeError(err),
            });

            throw err;
        }

        this.log.info('Got resource');

        if (!kubernetesObjectHasSpec(resource)) {
            this.log.error('Resource has no spec', {
                namespace,
                name,
            });
            return;
        }

        const result = ServerSpec.decode(resource.spec);

        if (isLeft(result)) {
            this.log.error('Resource spec is malformed', {
                namespace,
                name,
            });
            return;
        }

        const spec = result.right;

        this.log.info('Resolving server spec', {
            spec,
        });

        return await resolveServerSpec(spec);
    }

    public async getDatabase(namespace: string, name: string): Promise<DatabaseResource | undefined> {
        this.log.info('getDatabase', {
            args: {
                namespace,
                name,
            },
        });

        const customClient = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);

        this.log.info('Got custom client');

        let resource: k8s.KubernetesObject;
        try {
            const apiResponse = await customClient.getNamespacedCustomObject('db-operator.plumdog.co.uk', 'v1', namespace, 'databases', name);
            resource = apiResponse.body;
        } catch (err) {
            if (err instanceof k8s.HttpError) {
                if (err.body.reason === 'NotFound') {
                    this.log.info('Database not found', {
                        namespace,
                        name,
                    });
                    return undefined;
                }
            }

            this.log.error('Unknown error', {
                err: serializeError(err),
            });

            throw err;
        }

        this.log.info('Got resource');

        if (!kubernetesObjectHasSpec(resource)) {
            this.log.error('Resource has no spec', {
                namespace,
                name,
            });
            return;
        }

        const result = DatabaseResource.decode(resource);

        if (isLeft(result)) {
            this.log.error('Resource is malformed', {
                namespace,
                name,
            });
            return;
        }

        return result.right;
    }

    public async watchDatabase(e: ResourceEvent): Promise<void> {
        const obj = e.object;
        const metadata = obj.metadata;

        if (!kubernetesObjectHasSpec(obj)) {
            throw new Error('Missing spec');
        }

        const parsed = DatabaseSpec.decode(obj.spec);

        if (isLeft(parsed)) {
            throw new Error('Malfored spec');
        }

        const spec = parsed.right;
        const sourceNamespace: string | undefined = spec.server.namespace ?? metadata?.namespace ?? e.meta?.namespace;

        if (typeof sourceNamespace === 'undefined') {
            this.log.warn('Unable to determine source namespace', {
                metadata,
            });
            return;
        }

        const statusParsed = DatabaseStatus.decode(obj.status ?? {});

        if (isLeft(statusParsed)) {
            throw new Error('Malfored status');
        }

        const status = statusParsed.right;

        const server = await this.getServer(sourceNamespace, spec.server.name);
        if (typeof server === 'undefined') {
            this.log.info('Server not found, nothing to do');
            // TODO: wait for a bit
            // TODO: set error status on the database object
            return;
        }

        this.log.info('Got resolved server', {
            server: {
                ...server,
                rootPassword: '****',
            },
        });

        let databaseHandler;

        try {
            databaseHandler = DatabaseHandler.forDbType({
                database: spec,
                databaseStatus: status,
                server,
                logger: this.log,
            });
        } catch (err) {
            this.log.warn('Unknown dbType', {
                server,
            });
            return;
        }

        try {
            let newStatus: DatabaseStatus;
            await databaseHandler.connect();
            try {
                newStatus = await databaseHandler.apply(e.type);
            } finally {
                await databaseHandler.cleanup();
            }
            this.log.info('Resulting status', {
                status,
                newStatus,
            });
            const result = await this.setResourceStatus(e.meta, newStatus);
            if (!result) {
                this.log.warn('Failed to set status');
                return;
            }
            this.log.info('Status set');
        } catch (err) {
            console.error('Unable to apply');
            console.error(err);
        }
    }

    // public async watchUser(e: ResourceEvent): Promise<void> {
    //     const obj = e.object;
    //     const metadata = obj.metadata;
    //     const resourceNamespace = metadata?.namespace ?? e.meta?.namespace;

    //     if (typeof resourceNamespace === 'undefined') {
    //         this.log.warn('Unable to determine source namespace', {
    //             metadata,
    //         });
    //         return;
    //     }

    //     const parsed = UserResource.decode(obj);

    //     if (isLeft(parsed)) {
    //         throw new Error('Malfored resource');
    //     }

    //     const resource = parsed.right;

    //     const spec = resource.spec;
    //     const status = resource.status;

    //     const database = await this.getDatabase(spec.database.namespace ?? resourceNamespace, spec.database.name)

    //     if (typeof database === 'undefined') {
    //         this.log.info('Database not found, nothing to do');
    //         // TODO: wait for a bit
    //         // TODO: set error status on the database object
    //         return;
    //     }

    //     const server = await this.getServer(database.spec.server.namespace ?? resourceNamespace, database.spec.server.name);

    //     this.log.info('Got resolved server', {
    //         server: {
    //             ...server,
    //             rootPassword: '****',
    //         },
    //     });

    //     let userHandler;

    //     try {
    //         userHandler = UserHandler.forDbType({
    //             user: spec,
    //             userStatus: status,
    //             database,
    //             server,
    //         });
    //     } catch (err) {
    //         this.log.warn('Unknown dbType', {
    //             server,
    //         });
    //         return;
    //     }

    //     try {
    //         let newStatus: UserStatus;
    //         await userHandler.connect();
    //         try {
    //             newStatus = await userHandler.apply(e.type);
    //         } finally {
    //             await userHandler.cleanup();
    //         }
    //         this.log.info('Resulting status', {
    //             status,
    //             newStatus,
    //         });
    //         const result = await this.setResourceStatus(e.meta, newStatus);
    //         if (!result) {
    //             this.log.warn('Failed to set status')
    //             return;
    //         }
    //         this.log.info('Status set');
    //     } catch (err) {
    //         console.error('Unable to apply');
    //         console.error(err);
    //     }
    // }

    protected async init() {
        await this.watchResource('db-operator.plumdog.co.uk', 'v1', 'databases', this.watchDatabase);
    }
}
