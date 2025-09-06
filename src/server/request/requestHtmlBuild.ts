import {HttpServer, Request, Response} from "../http/HttpServer";
import {createUniqueToken, ensureCollection, safeArangoObject} from "../utils/arangoUtils";
import {DocumentCollection} from "arangojs/collections";
import {db} from "../server";
import {aql} from "arangojs";
import {HtmlClass} from "../../client/builder/HtmlBuilder/HtmlBuildType";



export class requestHtmlBuild {
    public static init = async (app:HttpServer) => {
        const class_collection:DocumentCollection = await ensureCollection("nodius_html_class");

        app.post("/api/htmlclass/list", async (req: Request, res: Response) => {
            const cursor = await db.query(aql`
                FOR doc IN nodius_html_class
                  RETURN doc
              `);

            res.status(200).json(await cursor.all());
        })

        app.post("/api/htmlclass/create", async (req: Request, res: Response) => {
            const token = await createUniqueToken(class_collection);
            await class_collection.save({
                _key: token,
                ...safeArangoObject(req.body.htmlClass ?? {}),
            });
            res.status(200).json({token: token});
        });
        app.post("/api/htmlclass/update", async (req: Request, res: Response) => {
            if(req.body.htmlClass) {
                const htmlClass = req.body.htmlClass as HtmlClass;
                await class_collection.update({
                    _key: htmlClass._key
                },{
                    ...safeArangoObject(req.body.htmlClass ?? {})
                }, {
                    returnNew: true
                });
                res.status(200).end();
            }
        });
        app.post("/api/htmlclass/delete", async (req: Request, res: Response) => {
            if(req.body.key) {
                await class_collection.remove({
                    _key: req.body.key,
                });
                res.status(200).end();
            } else {
                res.status(400).end();
            }
        })
    }
}

