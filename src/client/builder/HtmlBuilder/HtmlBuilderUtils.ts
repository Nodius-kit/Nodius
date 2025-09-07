import {HtmlDiv, HtmlList, HtmlObject, HtmlText, HtmlType} from "./HtmlBuildType";
import {deepCopy} from "../../../utils/numericUtils";

export const HtmlBuildTraversal = <T>(object:HtmlObject, callBack:(object:HtmlObject) => T | undefined) : T | undefined => {
    const call:T|undefined = callBack(object);
    if(call != undefined) {
        return call;
    }
    if(object.type == "block" && object.content) {
        return HtmlBuildTraversal(object.content, callBack);
    }
    return undefined;
}



export const darkenElement = (element: HTMLElement, duration: number = 300): void  =>{
    // Sauvegarder les styles originaux
    const originalBackground = element.style.background || '';
    const originalBackgroundColor = element.style.backgroundColor || '';
    const originalTransition = element.style.transition || '';

    // Calculer la couleur assombrie
    const computedStyle = window.getComputedStyle(element);
    const currentBgColor = computedStyle.backgroundColor;

    let darkenedColor: string;
    if (currentBgColor === 'rgba(0, 0, 0, 0)' || currentBgColor === 'transparent') {
        darkenedColor = 'rgba(0, 0, 0, 0.2)'; // Background par défaut
    } else {
        // Parser et assombrir la couleur existante
        darkenedColor = darkenColor(currentBgColor, 0.3);
    }

    // Appliquer la transition
    element.style.transition = `background-color ${duration}ms ease-in-out`;

    // Fonction pour restaurer l'état original
    const restore = () => {
        element.style.background = originalBackground;
        element.style.backgroundColor = originalBackgroundColor;
        element.style.transition = originalTransition;
    };

    // Appliquer l'effet
    requestAnimationFrame(() => {
        element.style.backgroundColor = darkenedColor;

        // Revenir à l'état original
        setTimeout(() => {
            element.style.backgroundColor = currentBgColor;
            setTimeout(restore, duration);
        }, duration);
    });
}

export const darkenColor = (color: string, amount: number): string => {
    // Parse rgba/rgb
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        const [, r, g, b, a] = match;
        const alpha = a ? parseFloat(a) : 1;
        return `rgba(${Math.floor(+r * (1 - amount))}, ${Math.floor(+g * (1 - amount))}, ${Math.floor(+b * (1 - amount))}, ${alpha})`;
    }
    return 'rgba(0, 0, 0, 0.3)'; // Fallback
}


export const deleteObjectById = (obj: HtmlObject, idToDelete: number): boolean => {

    if(obj.type == "block" && obj.content) {
        if(obj.content.id === idToDelete) {
            obj.content = undefined;
            return true;
        }else {
            return deleteObjectById(obj.content, idToDelete);
        }
    } else if(obj.type == "list" && obj.content.length > 0) {
        for(const child of obj.content) {
            if(child.id === idToDelete) {
                obj.content = obj.content.filter((obj) => obj.id !== idToDelete);
                return true;
            } else {
                if(deleteObjectById(child, idToDelete)) {
                    return true;
                }
            }
        }
    }
    return false;
}

export const replaceObjectById = (source: HtmlObject, toReplace: HtmlObject): boolean => {
    // Case 1: block with nested content
    if (source.type === "block") {
        if (source.content && source.content.id === toReplace.id) {
            source.content = toReplace;
            return true;
        } else if(source.content) {
            return replaceObjectById(source.content, toReplace);
        } else {
            return false;
        }
    }

    // Case 2: list with children
    else if (source.type === "list" && Array.isArray(source.content) && source.content.length > 0) {
        for (let i = 0; i < source.content.length; i++) {
            if (source.content[i].id === toReplace.id) {
                source.content[i] = toReplace;
                return true;
            } else {
                if (replaceObjectById(source.content[i], toReplace)) {
                    return true;
                }
            }
        }
    }

    return false;
};

export const convertHtmlObject = (object:HtmlObject, to:HtmlType):HtmlObject => {
    if(object.type === "block" && to === "list") {
        return {
            ...object,
            type:"list",
            content: object.content ? [object.content] : []
        }
    } else if(object.type === "block" && to === "text") {
        return {
            ...object,
            type:"text",
            content: {en: ""}
        }
    } else if(object.type === "text" && to === "block") {
        return {
            ...object,
            type:"block",
            content: {
                ...deepCopy(object)
            }
        }
    } else if(object.type === "text" && to === "list") {
        const newObj = deepCopy(object);
        return {
            ...newObj,
            type:"list",
            content: [
                object
            ]
        }
    } else if(object.type === "list" && to === "text") {
        return {
            ...object,
            type:"text",
            content: {en: ""}
        }
    } else if(object.type === "list" && to === "block") {
        return {
            ...object,
            type:"block",
            content: object.content.length > 0 ? object.content[0] : undefined
        }
    }
    return object;
}