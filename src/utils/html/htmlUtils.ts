import {HtmlObject} from "./htmlType";
import {InstructionBuilder} from "../sync/InstructionBuilder";
import {deepCopy} from "../objectUtils";

export const searchElementWithIdentifier = (identifier:string, object:HtmlObject, instruction?:InstructionBuilder):HtmlObject|undefined => {
    const _identifier = identifier.includes("-") ? identifier.split("-")[0] : identifier; // remove array identifier addon
    if(object.identifier === _identifier) {
        return object;
    }
    if(object.type === "block") {
        instruction?.key("content");
        return object.content ? searchElementWithIdentifier(_identifier, object.content, instruction) : undefined;
    } else if(object.type === "list") {
        instruction?.key("content");
        for(let i = 0; i < object.content.length; i++) {
            const currentObject = object.content[i];
            const currentInstruction = instruction?.clone();
            currentInstruction?.index(i);
            const ret = searchElementWithIdentifier(_identifier, currentObject, currentInstruction);
            if(ret != undefined) {
                if(instruction) {
                    instruction.instruction = deepCopy(currentInstruction!.instruction);
                }
                return ret;
            }
        }
    } else if(object.type === "array") {
        instruction?.key("content");
        if(object.content.noContent) {
            const currentInstruction = instruction?.clone();
            currentInstruction?.key("noContent")
            const ret = searchElementWithIdentifier(_identifier, object.content.noContent, currentInstruction);
            if(ret != undefined) {
                if(instruction) {
                    instruction.instruction = deepCopy(currentInstruction!.instruction);
                }
                return ret;
            }
        } else if(object.content.content) {
            const currentInstruction = instruction?.clone();
            currentInstruction?.key("content")
            const ret = searchElementWithIdentifier(_identifier, object.content.content, currentInstruction);
            if(ret != undefined) {
                if(instruction) {
                    instruction.instruction = deepCopy(currentInstruction!.instruction);
                }
                return ret;
            }
        }
    }
    return undefined;
}

export const travelObject = (object:HtmlObject, callback:(object:HtmlObject) => boolean) : boolean => {
    if(!callback(object)) {
        return false;
    }
    if(object.type === "block" && object.content) {
        return travelObject(object.content, callback);
    } else if (object.type === "list") {
        for(let i = 0; i < object.content.length; i++) {
            if(!travelObject(object.content[i], callback)) {
                return false;
            }
        }
    } else if(object.type === "array") {
        if(object.content.content && !travelObject(object.content.content, callback)) {
            return false;
        }
        if(object.content.noContent && !travelObject(object.content.noContent, callback)) {
            return false;
        }
    }
    return true;
}