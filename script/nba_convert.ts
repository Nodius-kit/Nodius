import {aql, Database} from "arangojs";
import fs from "fs";
import {randomBytes} from "crypto";
import {DocumentCollection} from "arangojs/collections";
import escapeHTML from "escape-html";
import {Graph, Node, NodeTypeHtmlConfig} from "packages/utils/src/graph/graphType";
import { HtmlClass } from "packages/utils/src/html/htmlType";
import { createNodeFromConfig } from "packages/utils/src/graph/nodeUtils";

const dbUrl = "http://127.0.0.1:8529";
const dbUser = "root";
const dbPass = "azerty";
const dbName = "nodius";

const document_name = "converted_nba"

const db = new Database({
    url: dbUrl,
    auth: {username: dbUser, password: dbPass},
    databaseName: dbName
});

function generateToken(length: number = 64): string {
    return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

async function createUniqueToken(
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

async function ensureCollection(
    name: string,
): Promise<DocumentCollection> {
    const collection = db.collection(name);

    const exists = await collection.exists();
    if (!exists) {
        await collection.create();
    }
    return collection as DocumentCollection;
}

const convert = async () => {

    const nba_data = await fs.readFileSync("nba.json", "utf8");
    const nba_json = JSON.parse(nba_data);

    //create graph key
    const graph_collection = await ensureCollection("nodius_graph");
    const graph_key = await createUniqueToken(graph_collection);

    //create html key
    const html_collection = await ensureCollection("nodius_html_class");
    const html_key = await createUniqueToken(html_collection);

    // delete previous one if exist
    let cursor = await db.query(aql`
      FOR doc IN nodius_graphs
        FILTER doc.name == ${escapeHTML(document_name+"-graph")}
        REMOVE doc IN nodius_graphs
    `);

    cursor = await db.query(aql`
      FOR doc IN nodius_html_class
        FILTER doc.name == ${escapeHTML(document_name+"-graph")}
        REMOVE doc IN nodius_html_class
    `);


    // create graph
    const graph:Omit<Graph, "sheets" | "_sheets"> = {
        name: document_name+"-graph",
        _key: graph_key,
        category: "default",
        htmlKeyLinked: html_key,
        version: 0,
        permission: 0,
        workspace: "root",
        lastUpdatedTime: Date.now(),
        createdTime: Date.now(),
        sheetsList: {0: "main"}
    }
    await graph_collection.save(graph);

    const rootNodeKey = graph_key+"-root";

    const html_class:Omit<HtmlClass, "object"> = {
        _key: html_key,
        version: 0,
        permission: 0,
        category: "default",
        name: "document_name",
        lastUpdatedTime: Date.now(),
        createdTime: Date.now(),
        workspace: "root",
        htmlNodeKey: rootNodeKey,
        graphKeyLinked: graph_key,
    }
    await html_collection.save(html_class);

    const node_collection = await ensureCollection("nodius_nodes");

    const nodeRoot = createNodeFromConfig<any>(
        NodeTypeHtmlConfig,
        rootNodeKey,
        graph_key,
        "0"
    );
    nodeRoot.data = {
        "domEvents": [
            {
                "name": "load",
                "call": "[!]CALL-HANDLE-2"
            }
        ],
        "type": "block",
        "name": "Container",
        "delimiter": true,
        "tag": "div",
        "css": [
            {
                "selector": "&",
                "rules": [
                    [
                        "height",
                        "100%"
                    ],
                    [
                        "width",
                        "100%"
                    ]
                ]
            }
        ],
        "identifier": "root",
        "content": {
            "type": "html",
            "domEvents": [],
            "name": "Html",
            "identifier": "rooy",
            "css": [
                {
                    "selector": "&",
                    "rules": [
                        [
                            "height",
                            "100%"
                        ]
                    ]
                }
            ],
            "tag": "div",
            "content": `<div>\n  {{result}}\n</div>`
        }
    };
    await node_collection.save(nodeRoot);


}

convert();