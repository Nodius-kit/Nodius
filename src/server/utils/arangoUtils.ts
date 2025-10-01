import {db} from "../server";
import {Collection, DocumentCollection} from "arangojs/collections";
import { randomBytes } from "crypto";
import {aql} from "arangojs";

/**
 * Ensure a collection exists, otherwise create it.
 * @param name - The name of the collection
 * @returns The collection instance
 */
export async function ensureCollection(
    name: string
): Promise<DocumentCollection> {
    const collection = db.collection(name);

    const exists = await collection.exists();
    if (!exists) {
        await collection.create();
    }
    return collection as DocumentCollection;
}

/**
* Generate a random token string.
* @param length - Token length (default 64)
*/
function generateToken(length: number = 64): string {
    return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

/**
 * Ensure a unique token not present in the given collection.
 * Assumes the collection has a `token` field.
 *
 * @param collection - The ArangoDB collection
 * @param length - Token length (default 64)
 */
export async function createUniqueToken(
    collection: DocumentCollection<any>,
    length: number = 64
): Promise<string> {
    let token: string;
    let exists = true;

    while (exists) {
        token = generateToken(length);

        const cursor = await db.query(aql`
      FOR doc IN ${collection}
        FILTER doc.token == ${token}
        LIMIT 1
        RETURN doc._key
    `);

        exists = cursor.hasNext;
    }

    return token!;
}

type ArangoMetaKeys = "_key" | "_id" | "_rev";

export function safeArangoObject<T extends Record<string, any>>(
    object: T
): Omit<T, ArangoMetaKeys> {
    // We need a mutable copy if we want to avoid mutating caller’s object
    const { _key, _id, _rev, ...rest } = object;
    return rest;
}
