/// <reference types="@webgpu/types" />

import {HtmlClass} from "./src/utils/html/htmlType";
import {Schema} from "./src/utils/schema/schemaType";

declare global {
    type Language = "fr" | "en";
    interface Window {
        nodius: {
            storage: {
                htmlClass: Map<string, HtmlClass>,
                graphs: Map<string, Schema>,
            }
        }
    }
}

export {};