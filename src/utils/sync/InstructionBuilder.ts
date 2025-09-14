// Operation types enum (using short codes for minimal JSON)
enum OpType {
    SET = 1,           // elementSet
    REM = 2,           // elementRemove
    ARR_ADD = 3,       // arrayAdd
    ARR_INS = 4,       // arrayInsertAtIndex
    STR_REP = 5,       // stringReplace
    STR_REP_ALL = 6,   // stringReplaceAll
    ARR_POP = 7,       // arrayPop
    ARR_SHIFT = 8,     // arrayShift
    ARR_UNSHIFT = 9,   // arrayUnshift
    STR_APP = 10,      // stringAppend
    STR_REM = 11,      // stringRemove
    STR_REP_AT = 12,   // stringReplaceAt
    BOOL_TOG = 13,     // boolToggle
    ARR_REM_IDX = 14,  // arrayRemoveIndex
    DICT_MERGE = 15,   // dictMerge
    STR_INS = 16,      // stringInsert
}

// Instruction interface (using short keys for minimal JSON)
interface Instruction {
    o: OpType;      // operation
    p?: string[];   // path (keys)
    v?: any;        // value
    i?: number;     // index
    l?: number;     // length
    s?: string;     // search string (for replace)
    r?: string;     // replacement string
}

// Result type for error handling
type Result<T> = { success: true; value: T } | { success: false; error: string };

// Instruction builder class with fluent API
export class InstructionBuilder {
    private instruction: Instruction;

    constructor() {
        this.instruction = { o: OpType.SET };
    }

    // Set the path using keys
    keys(...keys: string[]): this {
        this.instruction.p = keys;
        return this;
    }

    // Set the index for operations that need it
    index(idx: number): this {
        this.instruction.i = idx;
        return this;
    }

    // === Basic Operations ===

    // Set/replace element at path
    set(value: any): Instruction {
        this.instruction.o = OpType.SET;
        this.instruction.v = value;
        return this.instruction;
    }

    // Remove element at path
    remove(): Instruction {
        this.instruction.o = OpType.REM;
        return this.instruction;
    }

    // === Array Operations ===

    // Add element to array
    arrayAdd(value: any): Instruction {
        this.instruction.o = OpType.ARR_ADD;
        this.instruction.v = value;
        return this.instruction;
    }

    // Insert at specific index in array
    arrayInsertAtIndex(index: number, value: any): Instruction {
        this.instruction.o = OpType.ARR_INS;
        this.instruction.i = index;
        this.instruction.v = value;
        return this.instruction;
    }

    // Remove last element from array
    arrayPop(): Instruction {
        this.instruction.o = OpType.ARR_POP;
        return this.instruction;
    }

    // Remove first element from array
    arrayShift(): Instruction {
        this.instruction.o = OpType.ARR_SHIFT;
        return this.instruction;
    }

    // Add element to beginning of array
    arrayUnshift(value: any): Instruction {
        this.instruction.o = OpType.ARR_UNSHIFT;
        this.instruction.v = value;
        return this.instruction;
    }

    // Remove element at index from array
    arrayRemoveIndex(index: number): Instruction {
        this.instruction.o = OpType.ARR_REM_IDX;
        this.instruction.i = index;
        return this.instruction;
    }

    // === String Operations ===

    // Insert string at index
    insertString(index: number, text: string): Instruction {
        this.instruction.o = OpType.STR_INS;
        this.instruction.i = index;
        this.instruction.v = text;
        return this.instruction;
    }

    // Append string at the end
    stringAppend(text: string): Instruction {
        this.instruction.o = OpType.STR_APP;
        this.instruction.v = text;
        return this.instruction;
    }

    // Remove substring at index with length
    stringRemove(index: number, length: number): Instruction {
        this.instruction.o = OpType.STR_REM;
        this.instruction.i = index;
        this.instruction.l = length;
        return this.instruction;
    }

    // Replace substring at index with new string
    stringReplaceAt(index: number, length: number, replacement: string): Instruction {
        this.instruction.o = OpType.STR_REP_AT;
        this.instruction.i = index;
        this.instruction.l = length;
        this.instruction.v = replacement;
        return this.instruction;
    }

    // Replace first occurrence of search string
    stringReplace(search: string, replacement: string): Instruction {
        this.instruction.o = OpType.STR_REP;
        this.instruction.s = search;
        this.instruction.r = replacement;
        return this.instruction;
    }

    // Replace all occurrences of search string
    stringReplaceAll(search: string, replacement: string): Instruction {
        this.instruction.o = OpType.STR_REP_ALL;
        this.instruction.s = search;
        this.instruction.r = replacement;
        return this.instruction;
    }

    // === Boolean Operations ===

    // Toggle boolean value
    boolToggle(): Instruction {
        this.instruction.o = OpType.BOOL_TOG;
        return this.instruction;
    }

    // === Object Operations ===

    // Merge dictionaries/objects
    dictMerge(value: Record<string, any>): Instruction {
        this.instruction.o = OpType.DICT_MERGE;
        this.instruction.v = value;
        return this.instruction;
    }
}

// Factory function to create instruction builder
export function createInstruction(): InstructionBuilder {
    return new InstructionBuilder();
}

// Encoder: Convert instruction to minimal JSON string
export function encodeInstruction(instruction: Instruction): string {
    return JSON.stringify(instruction);
}

// Decoder: Apply instruction to an object
export function applyInstruction<T = any>(target: T, instruction: Instruction | string): Result<T> {
    try {
        // Parse instruction if it's a string
        const inst: Instruction = typeof instruction === 'string'
            ? JSON.parse(instruction)
            : instruction;

        // Clone target to avoid mutations (for immutability)
        let result = structuredClone(target);

        // Navigate to the target element using path
        let current: any = result;
        let parent: any = null;
        let lastKey: string | undefined = undefined;

        if (inst.p && inst.p.length > 0) {
            for (let i = 0; i < inst.p.length - 1; i++) {
                const key = inst.p[i];

                if (current == null || typeof current !== 'object') {
                    return {
                        success: false,
                        error: `Cannot navigate path: ${inst.p.slice(0, i + 1).join('.')} - parent is not an object`
                    };
                }

                if (!(key in current)) {
                    return {
                        success: false,
                        error: `Key not found: ${key} at path ${inst.p.slice(0, i).join('.')}`
                    };
                }

                parent = current;
                current = current[key];
            }

            lastKey = inst.p[inst.p.length - 1];

            // For operations that don't require the key to exist (like SET)
            if (inst.o !== OpType.SET && inst.o !== OpType.DICT_MERGE) {
                if (current == null || typeof current !== 'object' || !(lastKey in current)) {
                    return {
                        success: false,
                        error: `Key not found: ${lastKey} at path ${inst.p.slice(0, -1).join('.')}`
                    };
                }
            }

            parent = current;
            if (lastKey && inst.o !== OpType.SET && inst.o !== OpType.DICT_MERGE) {
                current = current[lastKey];
            }
        }

        // Apply the operation
        switch (inst.o) {
            case OpType.SET:
                if (lastKey && parent != null) {
                    parent[lastKey] = inst.v;
                } else {
                    result = inst.v;
                }
                break;

            case OpType.REM:
                if (lastKey && parent != null) {
                    if (Array.isArray(parent)) {
                        const idx = parseInt(lastKey);
                        if (!isNaN(idx)) {
                            parent.splice(idx, 1);
                        }
                    } else {
                        delete parent[lastKey];
                    }
                } else {
                    return { success: false, error: 'Cannot remove root element' };
                }
                break;

            case OpType.ARR_ADD:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayAdd operation' };
                }
                current.push(inst.v);
                break;

            case OpType.ARR_INS:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayInsertAtIndex operation' };
                }
                if (inst.i == null || inst.i < 0 || inst.i > current.length) {
                    return { success: false, error: `Invalid index ${inst.i} for array of length ${current.length}` };
                }
                current.splice(inst.i, 0, inst.v);
                break;

            case OpType.ARR_POP:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayPop operation' };
                }
                if (current.length === 0) {
                    return { success: false, error: 'Cannot pop from empty array' };
                }
                current.pop();
                break;

            case OpType.ARR_SHIFT:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayShift operation' };
                }
                if (current.length === 0) {
                    return { success: false, error: 'Cannot shift from empty array' };
                }
                current.shift();
                break;

            case OpType.ARR_UNSHIFT:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayUnshift operation' };
                }
                current.unshift(inst.v);
                break;

            case OpType.ARR_REM_IDX:
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayRemoveIndex operation' };
                }
                if (inst.i == null || inst.i < 0 || inst.i >= current.length) {
                    return { success: false, error: `Invalid index ${inst.i} for array of length ${current.length}` };
                }
                current.splice(inst.i, 1);
                break;

            case OpType.STR_INS:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for insertString operation' };
                }
                if (inst.i == null || inst.i < 0 || inst.i > current.length) {
                    return { success: false, error: `Invalid index ${inst.i} for string of length ${current.length}` };
                }
                const newStr = current.slice(0, inst.i) + inst.v + current.slice(inst.i);
                if (lastKey && parent != null) {
                    parent[lastKey] = newStr;
                } else {
                    result = newStr as T;
                }
                break;

            case OpType.STR_APP:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringAppend operation' };
                }
                if (lastKey && parent != null) {
                    parent[lastKey] = current + inst.v;
                } else {
                    result = (current + inst.v) as T;
                }
                break;

            case OpType.STR_REM:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringRemove operation' };
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i >= current.length) {
                    return { success: false, error: `Invalid index ${inst.i} or length ${inst.l} for string` };
                }
                const removed = current.slice(0, inst.i) + current.slice(inst.i + inst.l);
                if (lastKey && parent != null) {
                    parent[lastKey] = removed;
                } else {
                    result = removed as T;
                }
                break;

            case OpType.STR_REP_AT:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringReplaceAt operation' };
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i >= current.length) {
                    return { success: false, error: `Invalid index ${inst.i} or length ${inst.l} for string` };
                }
                const replaced = current.slice(0, inst.i) + inst.v + current.slice(inst.i + inst.l);
                if (lastKey && parent != null) {
                    parent[lastKey] = replaced;
                } else {
                    result = replaced as T;
                }
                break;

            case OpType.STR_REP:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringReplace operation' };
                }
                if (inst.s == null || inst.r == null) {
                    return { success: false, error: 'Missing search or replacement string' };
                }
                const replacedOnce = current.replace(inst.s, inst.r);
                if (lastKey && parent != null) {
                    parent[lastKey] = replacedOnce;
                } else {
                    result = replacedOnce as T;
                }
                break;

            case OpType.STR_REP_ALL:
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringReplaceAll operation' };
                }
                if (inst.s == null || inst.r == null) {
                    return { success: false, error: 'Missing search or replacement string' };
                }
                const replacedAll = current.replaceAll(inst.s, inst.r);
                if (lastKey && parent != null) {
                    parent[lastKey] = replacedAll;
                } else {
                    result = replacedAll as T;
                }
                break;

            case OpType.BOOL_TOG:
                if (typeof current !== 'boolean') {
                    return { success: false, error: 'Target is not a boolean for boolToggle operation' };
                }
                if (lastKey && parent != null) {
                    parent[lastKey] = !current;
                } else {
                    result = (!current) as T;
                }
                break;

            case OpType.DICT_MERGE:
                if (lastKey && parent != null) {
                    if (typeof parent[lastKey] !== 'object' || parent[lastKey] == null || Array.isArray(parent[lastKey])) {
                        parent[lastKey] = {};
                    }
                    parent[lastKey] = { ...parent[lastKey], ...inst.v };
                } else {
                    if (typeof result !== 'object' || result == null || Array.isArray(result)) {
                        result = {} as T;
                    }
                    result = { ...result, ...inst.v } as T;
                }
                break;

            default:
                return { success: false, error: `Unknown operation type: ${inst.o}` };
        }

        return { success: true, value: result };
    } catch (error) {
        return {
            success: false,
            error: `Failed to apply instruction: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Batch instruction application for multiple changes
export function applyInstructions<T = any>(target: T, instructions: (Instruction | string)[]): Result<T> {
    let current = target;

    for (let i = 0; i < instructions.length; i++) {
        const result = applyInstruction(current, instructions[i]);
        if (!result.success) {
            return {
                success: false,
                error: `Failed at instruction ${i}: ${result.error}`
            };
        }
        current = result.value;
    }

    return { success: true, value: current };
}

// Helper function to validate instruction
export function validateInstruction(instruction: Instruction | string): Result<boolean> {
    try {
        const inst: Instruction = typeof instruction === 'string'
            ? JSON.parse(instruction)
            : instruction;

        if (!inst.o || !Object.values(OpType).includes(inst.o)) {
            return { success: false, error: 'Invalid operation type' };
        }

        // Validate required fields based on operation type
        switch (inst.o) {
            case OpType.SET:
            case OpType.ARR_ADD:
            case OpType.ARR_UNSHIFT:
            case OpType.STR_APP:
            case OpType.DICT_MERGE:
                if (inst.v === undefined) {
                    return { success: false, error: 'Missing value for operation' };
                }
                break;

            case OpType.ARR_INS:
            case OpType.ARR_REM_IDX:
            case OpType.STR_INS:
                if (inst.i == null || inst.v === undefined) {
                    return { success: false, error: 'Missing index or value for operation' };
                }
                break;

            case OpType.STR_REM:
            case OpType.STR_REP_AT:
                if (inst.i == null || inst.l == null) {
                    return { success: false, error: 'Missing index or length for operation' };
                }
                break;

            case OpType.STR_REP:
            case OpType.STR_REP_ALL:
                if (!inst.s || inst.r === undefined) {
                    return { success: false, error: 'Missing search or replacement string' };
                }
                break;
        }

        return { success: true, value: true };
    } catch (error) {
        return {
            success: false,
            error: `Invalid instruction format: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Example usage and tests
if (require.main === module) {
    // Example 1: String insertion
    const inst1 = createInstruction().keys("name").insertString(10, "bla");
    console.log("Instruction 1:", encodeInstruction(inst1));

    // Example 2: Array operations
    const data = {
        users: ["Alice", "Bob"],
        config: {
            theme: "dark",
            enabled: true
        }
    };

    const inst2 = createInstruction().keys("users").arrayAdd("Charlie");
    const result1 = applyInstruction(data, inst2);
    console.log("After adding Charlie:", result1);

    // Example 3: Boolean toggle
    const inst3 = createInstruction().keys("config", "enabled").boolToggle();
    const result2 = applyInstruction(data, inst3);
    console.log("After toggling enabled:", result2);

    // Example 4: Dictionary merge
    const inst4 = createInstruction().keys("config").dictMerge({
        fontSize: 14,
        language: "en"
    });
    const result3 = applyInstruction(data, inst4);
    console.log("After merging config:", result3);

    // Example 5: Batch operations
    const instructions = [
        createInstruction().keys("users").arrayAdd("David"),
        createInstruction().keys("config", "theme").set("light"),
        createInstruction().keys("version").set(2)
    ];

    const batchResult = applyInstructions(data, instructions);
    console.log("After batch operations:", batchResult);
}