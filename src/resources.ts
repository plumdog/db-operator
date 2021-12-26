import * as t from 'io-ts';

export const DatabaseSpec = t.type({
    name: t.string,
    server: t.intersection([
        t.type({
            name: t.string,
        }),
        t.partial({
            namespace: t.string,
        }),
    ]),
});

export type DatabaseSpec = t.TypeOf<typeof DatabaseSpec>;

export const DatabaseStatus = t.partial({
    createdName: t.string,
    error: t.partial({
        message: t.string,
        code: t.string,
    }),
});

export type DatabaseStatus = t.TypeOf<typeof DatabaseStatus>;

export const DatabaseResource = t.intersection([
    t.type({
        spec: DatabaseSpec,
    }),
    t.partial({
        status: DatabaseStatus,
    }),
]);

export type DatabaseResource = t.TypeOf<typeof DatabaseResource>;

export const ServerSpecReferencedAttribute = t.partial({
    value: t.string,
});

export type ServerSpecReferencedAttribute = t.TypeOf<typeof ServerSpecReferencedAttribute>;

export const ServerSpec = t.type({
    dbType: t.string,
    host: t.string,
    port: t.number,
    rootUsername: ServerSpecReferencedAttribute,
    rootPassword: ServerSpecReferencedAttribute,
});

export type ServerSpec = t.TypeOf<typeof ServerSpec>;

export interface ResolvedServerSpec extends Omit<ServerSpec, 'rootUsername' | 'rootPassword'> {
    rootUsername: string;
    rootPassword: string;
}
