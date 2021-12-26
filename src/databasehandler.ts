import { Client as PgClient } from 'pg';
import { DatabaseSpec, DatabaseStatus, ResolvedServerSpec } from './resources';
import { Logger } from './logger';

import { ResourceEventType } from '@dot-i/k8s-operator';

export interface DatabaseHandlerProps {
    database: DatabaseSpec;
    databaseStatus: DatabaseStatus;
    server: ResolvedServerSpec;
    logger: Logger;
}

export abstract class DatabaseHandler {
    readonly database: DatabaseSpec;
    readonly databaseStatus: DatabaseStatus;
    readonly server: ResolvedServerSpec;
    readonly logger: Logger;

    constructor(props: DatabaseHandlerProps) {
        this.database = props.database;
        this.server = props.server;
        this.databaseStatus = props.databaseStatus;
        this.logger = props.logger;
    }
    public abstract apply(resourceEventType: ResourceEventType): Promise<DatabaseStatus>;
    public abstract connect(): Promise<void>;
    public abstract cleanup(): Promise<void>;

    public static forDbType(props: DatabaseHandlerProps): DatabaseHandler {
        switch (props.server.dbType) {
            case 'postgres':
                return new PgDatabaseHandler(props);
        }
        throw new Error(`Unknown dbType`);
    }
}

export class PgDatabaseHandler extends DatabaseHandler {
    readonly client: PgClient;

    constructor(props: DatabaseHandlerProps) {
        super(props);
        this.client = new PgClient({
            user: this.server.rootUsername,
            password: this.server.rootPassword,
            host: this.server.host,
            database: 'postgres',
            port: this.server.port,
        });
    }

    public async connect(): Promise<void> {
        this.client.connect();
    }

    public async cleanup(): Promise<void> {
        this.client.end();
    }

    public async apply(resourceEventType: ResourceEventType): Promise<DatabaseStatus> {
        if (this.databaseStatus.createdName && this.databaseStatus.createdName !== this.database.name) {
            this.logger.error('Database already created with a different name', {
                createdWithName: this.databaseStatus.createdName,
                requestedName: this.database.name,
            });
            return {
                ...this.databaseStatus,
                error: {
                    code: 'CannotModifyName',
                    message: `Database already created with name ${this.databaseStatus.createdName}.`,
                },
            };
        }

        this.logger.info('Apply PgDatabaseHandler', {
            database: this.database,
            databaseStatus: this.databaseStatus,
        });
        switch (resourceEventType) {
            case ResourceEventType.Added:
                await this.added();
                return {
                    ...this.databaseStatus,
                    createdName: this.database.name,
                    error: {},
                };
            case ResourceEventType.Modified:
                await this.modified();
                return {
                    ...this.databaseStatus,
                    error: {},
                };
            case ResourceEventType.Deleted:
                await this.deleted();
                return {
                    createdName: '',
                    error: {},
                };
        }
    }

    protected async added(): Promise<void> {
        this.logger.info('Added');
        try {
            await this.client.query(`CREATE DATABASE ${this.database.name}`);
        } catch (err) {
            console.error(err);
        }
    }

    protected async modified(): Promise<void> {
        this.logger.info('Modified');
        // Do not do modification, patch the database object with an error message
    }

    protected async deleted(): Promise<void> {
        this.logger.info('Deleted');
        await this.client.query(`DROP DATABASE ${this.database.name}`);
    }
}
