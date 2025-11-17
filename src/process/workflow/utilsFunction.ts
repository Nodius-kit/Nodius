let language = "en";
export const ENV_SETLANGUAGE = (newLang:string) => language = newLang;

export const MONTHIDTONAME = (month:string, upper?:boolean) => {
    const name= {
        'fr': ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre" ],
        'en': ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
    }
    if(month) {
        let ret = (name as any)[language][parseInt(month.substring(1)) - 1];
        if(upper) {
            ret = ret.charAt(0).toUpperCase() + ret.slice(1);
        }
        return ret;
    } else {
        return undefined;
    }
}

export const FORMATNUMBER = (value: number, decimal:number = 1, sign:boolean = false, color:boolean=false) => {
    let v = formatIBCS(value, decimal, sign);
    if(color) {
        v = `<span style="color:${value >= 0 ? '#819FF7' : '#FA5858'}">${v}</span>`;
    }
    return v;
}

const formatIBCS = (value: any, decimal = 1, sign:boolean = false): string => {
    if (value === null) {
        return "";
    }


    const thresholds = [
        { threshold: 1e9, suffix: 'B' },
        { threshold: 1e6, suffix: 'M' },
        { threshold: 1e3, suffix: 'K' },
    ];

    for (const { threshold, suffix } of thresholds) {
        if (Math.abs(value) >= threshold) {
            const temp = value / threshold;
            let ret = temp.toFixed(decimal).replace(/\.0$/, '') + suffix;
            if(sign && value != 0) {
                ret = (value > 0 ? "+" : "") + ret;
            }
            return ret;
        }
    }

    // Handle numbers less than 1000 here
    let ret = decimal === 0 ? Math.round(value).toString() : value.toFixed(decimal);
    if(sign && value != 0) {
        ret = (value > 0 ? "+" : "") + ret;
    }
    return ret;
};

/**
 * Returns the absolute value of a number.
 * @param value - The number for which you want the absolute value.
 * @returns The absolute value of the number.
 */
export const ABS = (value: number): number => {
    return Math.abs(value);
};

/**
 * Returns e (the base of natural logarithms) raised to the power of the given number.
 * @param exponent - The exponent to raise e to.
 * @returns e raised to the power of the exponent.
 */
export const EXP = (exponent: number): number => {
    return Math.exp(exponent);
};

/**
 * Returns the smallest integer greater than or equal to a number.
 * @param value - The number to round up.
 * @returns The smallest integer greater than or equal to the value.
 */
export const CEILING = (value: number): number => {
    return Math.ceil(value);
};

/**
 * Returns the largest integer less than or equal to a number.
 * @param value - The number to round down.
 * @returns The largest integer less than or equal to the value.
 */
export const FLOOR = (value: number): number => {
    return Math.floor(value);
};

/**
 * Returns the natural logarithm (base e) of a number.
 * @param value - The number for which you want the natural logarithm.
 * @returns The natural logarithm of the number.
 */
export const LN = (value: number): number => {
    return Math.log(value);
};

/**
 * Returns the base-10 logarithm of a number.
 * @param value - The number for which you want the base-10 logarithm.
 * @returns The base-10 logarithm of the number.
 */
export const LOG = (value: number): number => {
    return Math.log10(value);
};

/**
 * Returns the power of a number raised to another number.
 * @param base - The base number.
 * @param exponent - The exponent.
 * @returns The base raised to the exponent.
 */
export const POWER = (base: number, exponent: number): number => {
    return Math.pow(base, exponent);
};

/**
 * Rounds a number to a certain number of decimal places.
 * @param value - The number to round.
 * @param precision - The number of decimal places.
 * @returns The rounded number.
 */
export const ROUND = (value: number, precision: number): number => {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
};

/**
 * Returns 1 if the number is positive, -1 if negative, and 0 if the number is 0.
 * @param value - The number to check.
 * @returns 1, -1, or 0 based on the sign of the number.
 */
export const SIGN = (value: number): number => {
    return Math.sign(value);
};

/**
 * Returns the square of a number.
 * @param value - The number to square.
 * @returns The square of the number.
 */
export const SQUARE = (value: number): number => {
    return Math.pow(value, 2);
};

/**
 * Returns the square root of a number.
 * @param value - The number for which you want the square root.
 * @returns The square root of the number.
 */
export const SQRT = (value: number): number => {
    return Math.sqrt(value);
};

/**
 * Returns the Unicode code point of the first character in a string.
 * @param str - The input string.
 * @returns The code point of the first character.
 */
export const CODEPOINT = (str: string): number => {
    return str.codePointAt(0) || -1;
};

/**
 * Finds the position of a substring within a string.
 * @param haystack - The string to search within.
 * @param needle - The substring to find.
 * @param startIndex - The starting index to begin searching.
 * @returns The index of the first occurrence, or -1 if not found.
 */
export const FINDSTRING = (haystack: string, needle: string, startIndex: number = 0): number => {
    return haystack.indexOf(needle, startIndex);
};

/**
 * Converts a number to a hexadecimal string.
 * @param value - The number to convert.
 * @returns The hexadecimal representation of the number.
 */
export const HEX = (value: number): string => {
    return value.toString(16).toUpperCase();
};

/**
 * Returns the length of a string.
 * @param str - The input string.
 * @returns The length of the string.
 */
export const LEN = (str: string): number => {
    return str.length;
};

/**
 * Returns the first characters of a string.
 * @param str - The input string.
 * @param length - The number of characters to return.
 * @returns The first characters of the string.
 */
export const LEFT = (str: string, length: number): string => {
    return str.substring(0, length);
};

/**
 * Converts a string to lowercase.
 * @param str - The input string.
 * @returns The string in lowercase.
 */
export const LOWER = (str: string): string => {
    return str.toLowerCase();
};

/**
 * Trims whitespace from the beginning of a string.
 * @param str - The input string.
 * @returns The string without leading whitespace.
 */
export const LTRIM = (str: string): string => {
    return str.trimStart();
};

/**
 * Replaces all occurrences of a substring within a string.
 * @param str - The original string.
 * @param search - The substring to replace.
 * @param replacement - The replacement substring.
 * @returns The string with the replacements applied.
 */
export const REPLACE = (str: string, search: string, replacement: string): string => {
    return str.replace(new RegExp(search, 'g'), replacement);
};

/**
 * Replaces all occurrences of a substring within a string.
 * @param str - The original string.
 * @param search - The substring to replace.
 * @param replacement - The replacement substring.
 * @returns The string with all occurrences replaced.
 */
export const REPLACEALL = (str: string, search: string, replacement: string): string => {
    return str.split(search).join(replacement);
};

/**
 * Reverses the characters in a string.
 * @param str - The input string.
 * @returns The reversed string.
 */
export const REVERSE = (str: string): string => {
    return str.split('').reverse().join('');
};

/**
 * Returns the last characters of a string.
 * @param str - The input string.
 * @param length - The number of characters to return.
 * @returns The last characters of the string.
 */
export const RIGHT = (str: string, length: number): string => {
    return str.substring(str.length - length);
};

/**
 * Trims whitespace from the end of a string.
 * @param str - The input string.
 * @returns The string without trailing whitespace.
 */
export const RTRIM = (str: string): string => {
    return str.trimEnd();
};

/**
 * Returns a substring from a string.
 * @param str - The input string.
 * @param start - The starting index.
 * @param length - The number of characters to return.
 * @returns The substring.
 */
export const SUBSTRING = (str: string, start: number, length: number): string => {
    return str.substring(start, start + length);
};

/**
 * Trims whitespace from both ends of a string.
 * @param str - The input string.
 * @returns The string without leading or trailing whitespace.
 */
export const TRIM = (str: string): string => {
    return str.trim();
};

/**
 * Converts a string to uppercase.
 * @param str - The input string.
 * @returns The string in uppercase.
 */
export const UPPER = (str: string): string => {
    return str.toUpperCase();
};

/**
 * Adds an interval to a date.
 * @param date - The original date.
 * @param interval - The type of interval ("year", "month", "day", etc.).
 * @param amount - The number of intervals to add.
 * @returns The new date.
 */
export const DATEADD = (date: Date, interval: string, amount: number): Date => {
    const newDate = new Date(date);
    switch (interval.toLowerCase()) {
        case 'year':
            newDate.setFullYear(newDate.getFullYear() + amount);
            break;
        case 'month':
            newDate.setMonth(newDate.getMonth() + amount);
            break;
        case 'day':
            newDate.setDate(newDate.getDate() + amount);
            break;
        case 'hour':
            newDate.setHours(newDate.getHours() + amount);
            break;
        case 'minute':
            newDate.setMinutes(newDate.getMinutes() + amount);
            break;
        case 'second':
            newDate.setSeconds(newDate.getSeconds() + amount);
            break;
    }
    return newDate;
};

/**
 * Returns the difference between two dates.
 * @param date1 - The first date.
 * @param date2 - The second date.
 * @param interval - The type of interval ("year", "month", "day", etc.).
 * @returns The difference between the two dates in the specified interval.
 */
export const DATEDIFF = (date1: Date, date2: Date, interval: string): number => {
    const diff = date2.getTime() - date1.getTime();
    switch (interval.toLowerCase()) {
        case 'year':
            return date2.getFullYear() - date1.getFullYear();
        case 'month':
            return (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
        case 'day':
            return Math.floor(diff / (1000 * 60 * 60 * 24));
        case 'hour':
            return Math.floor(diff / (1000 * 60 * 60));
        case 'minute':
            return Math.floor(diff / (1000 * 60));
        case 'second':
            return Math.floor(diff / 1000);
    }
    return 0;
};

/**
 * Returns a specific part of a date (year, month, day, etc.).
 * @param date - The date.
 * @param part - The part of the date to return ("year", "month", "day", etc.).
 * @returns The requested part of the date.
 */
export const DATEPART = (date: Date, part: string): number => {
    switch (part.toLowerCase()) {
        case 'year':
            return date.getFullYear();
        case 'month':
            return date.getMonth() + 1;
        case 'day':
            return date.getDate();
        case 'hour':
            return date.getHours();
        case 'minute':
            return date.getMinutes();
        case 'second':
            return date.getSeconds();
    }
    return 0;
};

/**
 * Returns the day of the date.
 * @param date - The date.
 * @returns The day of the date.
 */
export const DAY = (date: Date): number => {
    return date.getDate();
};

/**
 * Returns the current date and time.
 * @returns The current date and time.
 */
export const GETDATE = (): Date => {
    return new Date();
};

/**
 * Returns the current date and time in UTC.
 * @returns The current date and time in UTC.
 */
export const GETUTCDATE = (): Date => {
    return new Date(new Date().toUTCString());
};

/**
 * Returns the month of the given date.
 * @param date - The date.
 * @returns The month of the date (1-12).
 */
export const MONTH = (date: Date): number => {
    return date.getMonth() + 1;
};

/**
 * Returns the year of the given date.
 * @param date - The date.
 * @returns The year of the date.
 */
export const YEAR = (date: Date): number => {
    return date.getFullYear();
};

/**
 * Returns the minute of the given date.
 * @param date - The date.
 * @returns The minute of the date.
 */
export const MINUTE = (date: Date): number => {
    return date.getMinutes();
};

/**
 * Returns the second of the given date.
 * @param date - The date.
 * @returns The second of the date.
 */
export const SECONDE = (date: Date): number => {
    return date.getSeconds();
};

/**
 * Checks if a value is null or undefined.
 * @param value - The value to check.
 * @returns True if the value is null or undefined, otherwise false.
 */
export const ISNULL = (value: any): boolean => {
    return value === null || value === undefined;
};

export const utilsFunctionList =  {
    ABS, EXP, CEILING, FLOOR, LN, LOG, POWER, ROUND, SIGN, SQUARE, SQRT,
    CODEPOINT, FINDSTRING, HEX, LEN, LEFT, LOWER, LTRIM, REPLACE, REPLACEALL, REVERSE, RIGHT, RTRIM, SUBSTRING, TRIM, UPPER,
    DATEADD, DATEDIFF, DATEPART, DAY, GETDATE, GETUTCDATE, MONTH, YEAR, MINUTE, SECONDE,
    ISNULL,
    MONTHIDTONAME, FORMATNUMBER
}