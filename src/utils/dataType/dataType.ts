export interface DataTypeChecking {
    id: string,
    name: string,
    is: (object: string) => boolean,
    canHaveDefaultValues: boolean,

    prepare?: (abortController:AbortController, dataTypes?:DataTypeClass[], enumTypes?:EnumClass[]) => Promise<any>,
    listDefaultValue?: (object:any) => { value: string; label: string, disabled?: boolean }[]
}

export const allDataTypes: DataTypeChecking[] = [
    {
        id: "int",
        name: "Integer",
        is: (object: string) => /^-?\d+$/.test(object),
        canHaveDefaultValues: true,
    },
    {
        id: "str",
        name: "String",
        is: (object: string) => true,
        canHaveDefaultValues: true,
    },
    {
        id: "bool",
        name: "Boolean",
        is: (object: string) => /^(true|false)$/i.test(object),
        canHaveDefaultValues: true,
    },
    {
        id: "db",
        name: "Double",
        is: (object: string) => /^-?\d+(\.\d+)?$/.test(object),
        canHaveDefaultValues: true,
    },
    {
        id: "color",
        name: "Color",
        is: (object: string) => {
            // Check hex color (#RGB, #RRGGBB, #RRGGBBAA)
            const hexPattern = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
            // Check rgb/rgba
            const rgbPattern = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;
            // Check hsl/hsla
            const hslPattern = /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;
            // Check named colors (basic set)

            return hexPattern.test(object) ||
                rgbPattern.test(object) ||
                hslPattern.test(object) ||
                cssNativeColors.includes(object.toLowerCase());
        },
        canHaveDefaultValues: true,
    },
    {
        id: "filePath",
        name: "File Path",
        is: (object: string) => {
            // Check for common file path patterns (Windows, Unix/Linux, Mac)
            // This is a basic check - you might want to make it more strict
            const windowsPath = /^([a-zA-Z]:)?[\\\/]?([^\\\/\0<>:"|?*]+[\\\/])*[^\\\/\0<>:"|?*]*$/;
            const unixPath = /^(\/)?([^\/\0]+\/)*[^\/\0]*$/;

            return object.length > 0 && (windowsPath.test(object) || unixPath.test(object));
        },
        canHaveDefaultValues: true,
    },
    {
        id: "url",
        name: "URL",
        is: (object: string) => {
            if (typeof object !== 'string') return false;
            try {
                new URL(object);
                return true;
            } catch {
                // Also accept protocol-relative URLs
                if (object.startsWith('//')) {
                    try {
                        new URL('https:' + object);
                        return true;
                    } catch {
                        return false;
                    }
                }
                return false;
            }
        },
        canHaveDefaultValues: true
    },
    {
        id: "dateTime",
        name: "DateTime",
        is: (object: string) => {

            // Check if it's a valid date string
            if (typeof object === 'string') {
                const date = new Date(object);
                return !isNaN(date.getTime()) && object.length > 0;
            }
            return false;
        },
        canHaveDefaultValues: true,
    },
    {
        id: "dataType",
        name: "Data Type",
        is: (object:string) => true,
        canHaveDefaultValues: true,
        prepare: async (abortController, dataTypes) => {
            /*const response = await fetch(`http://localhost:8426/api/type/list`, {
                method: "POST",
                signal: abortController.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspace: "root"
                })
            });
            if(response.status === 200) {
                const json:DataTypeClass[] = await response.json();
                return json;
            }
            return [];*/
            return dataTypes ?? [];
        },
        listDefaultValue: (object:DataTypeClass[]|undefined) => object ? object.map((o) => ({value: o._key, label:o.name})) : []
    },
    {
        id: "enum",
        name: "Enum",
        is: (object:string) => true,
        canHaveDefaultValues: true,
        prepare: async (abortController, dataTypes,enumTypes) => {
            /*const response = await fetch(`http://localhost:8426/api/enum/list`, {
                method: "POST",
                signal: abortController.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspace: "root"
                })
            });
            if(response.status === 200) {
                const json:EnumClass[] = await response.json();
                return json;
            }
            return [];*/
            return enumTypes;
        },
        listDefaultValue: (object:EnumClass[]|undefined) => object ? object.map((o) => ({value: o._key, label:o.name})) : []
    }
] as const;

// Extract the literal types from the array
export type DataType = typeof allDataTypes[number]['id'];

export interface DataTypeConfig {
    name: string,
    typeId: DataType,
    defaultValue?: string,
    required: boolean,
    isArray: boolean,
}

export interface DataTypeClass {
    _key:string,
    workspace: string,
    types:DataTypeConfig[],
    name: string,
    description:string,
}

export interface EnumClass {
    _key:string,
    workspace: string,
    enum:string[],
    name: string,
    description:string,
}


const cssNativeColors = [
    "black", "white", "red", "lime", "blue",
    "cyan", "aqua", "magenta", "fuchsia", "yellow",
    "gray", "grey", "silver", "maroon", "olive",
    "green", "purple", "teal", "navy",

    "aliceblue", "antiquewhite", "aquamarine", "azure", "beige", "bisque",
    "blanchedalmond", "blueviolet", "brown", "burlywood", "cadetblue",
    "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
    "crimson", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
    "darkgrey", "darkgreen", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
    "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
    "dodgerblue", "firebrick", "floralwhite", "forestgreen", "gainsboro",
    "ghostwhite", "gold", "goldenrod", "greenyellow", "honeydew",
    "hotpink", "indianred", "indigo", "ivory", "khaki",
    "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
    "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray",
    "lightgrey", "lightgreen", "lightpink", "lightsalmon", "lightseagreen",
    "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
    "lightyellow", "limegreen", "linen", "mediumaquamarine", "mediumblue",
    "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
    "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
    "mintcream", "mistyrose", "moccasin", "navajowhite", "oldlace",
    "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
    "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
    "peru", "pink", "plum", "powderblue", "rosybrown",
    "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
    "seashell", "sienna", "skyblue", "slateblue", "slategray",
    "slategrey", "snow", "springgreen", "steelblue", "tan",
    "thistle", "tomato", "turquoise", "violet", "wheat",
    "whitesmoke", "yellowgreen"
];