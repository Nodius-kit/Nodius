const LEN = (object: any): number => {
    if (Array.isArray(object)) {
        return object.length;
    }
    return 0;
};


export const HtmlUtility = {
    "LEN": LEN,
}

Object.entries(HtmlUtility).forEach(([key, value]) => {
    (window as any)[key] = value;
});