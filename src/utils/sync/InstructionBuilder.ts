// Operation types enum (using short codes for minimal JSON)
import {deepCopy} from "../objectUtils";
import {GraphInstructions} from "./wsObject";

export enum OpType {
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
    ARR_MOVE = 17,     // arrayMove (move element from index to new index)
    OBJ_MOVE = 18,     // objectMove (move from source path to destination path)
    OBJ_INSERT = 19,  // objectInsert (new: move from source path and insert into destination array at index)
}

// Instruction interface (using short keys for minimal JSON)
export interface Instruction {
    o: OpType;      // operation
    p?: string[];   // path (keys) - also source path for OBJ_MOVE
    v?: any;        // value
    i?: number;     // index
    l?: number;     // length
    s?: string;     // search string (for replace)
    r?: string;     // replacement string
    f?: number;     // from_index (new: for ARR_MOVE)
    t?: number;     // to_index (new: for ARR_MOVE)
    d?: string[];   // destination path (for OBJ_MOVE)
}

// Result type for error handling
type Result<T> = { success: true; value: T } | { success: false; error: string };

// Instruction builder class with fluent API
export class InstructionBuilder {
    public instruction: Instruction;

    constructor() {
        this.instruction = { o: OpType.SET, p: [] };
    }

    /**
     * Creates a deep copy of the current instruction builder
     * @returns A new InstructionBuilder instance with the same state
     */
    clone(): InstructionBuilder {
        const cloned = new InstructionBuilder();

        // Deep clone the instruction object
        cloned.instruction = deepCopy(this.instruction);

        return cloned;
    }

    getValue<T = any>(): T|undefined {
        return this.instruction.v as T;
    }

    // Append a key to the path
    key(k: string): this {
        this.instruction.p!.push(k);
        return this;
    }

    // Append an index to the path
    index(idx: number): this {
        this.instruction.p!.push(`${idx}`);
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
        this.instruction.v = undefined;
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

    // Move element from one index to another in array
    arrayMove(fromIndex: number, toIndex: number): Instruction {
        this.instruction.o = OpType.ARR_MOVE;
        this.instruction.f = fromIndex;
        this.instruction.t = toIndex;
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

    // Move object from source path to destination path
    objectMove(destinationPath: string[]): Instruction {
        this.instruction.o = OpType.OBJ_MOVE;
        this.instruction.d = destinationPath;
        return this.instruction;
    }

    // Insert moved value into destination array (move from source)
    objectInsert(destinationPath: string[], index?: number): Instruction {
        this.instruction.o = OpType.OBJ_INSERT;
        this.instruction.d = destinationPath;
        this.instruction.i = index;
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

export type BeforeApplyInstruction = (objectBeingApplied?:any) => boolean;
export type BeforeApplyInstructionWithContext = (currentGraphInstrution:GraphInstructions, objectBeingApplied?:any) => boolean;

// Decoder: Apply instruction to an object
export function applyInstruction<T = any>(target: T, instruction: Instruction | string, beforeApply?: BeforeApplyInstruction): Result<T> {
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
                if (!beforeApply?.(parent)) break;
                if (lastKey && parent != null) {
                    parent[lastKey] = inst.v;
                } else {
                    result = inst.v;
                }
                break;

            case OpType.REM:
                if (lastKey && parent != null) {
                    if (!beforeApply?.(parent)) break;
                    if (Array.isArray(parent)) {
                        const idx = parseInt(lastKey);
                        if (!isNaN(idx)) {
                            parent.splice(idx, 1);
                        }
                    } else {
                        delete parent[lastKey];
                    }
                } else {
                    return {success: false, error: 'Cannot remove root element'};
                }
                break;

            case OpType.ARR_ADD:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayAdd operation'};
                }
                current.push(inst.v);
                break;

            case OpType.ARR_INS:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayInsertAtIndex operation'};
                }
                if (inst.i == null || inst.i < 0 || inst.i > current.length) {
                    return {success: false, error: `Invalid index ${inst.i} for array of length ${current.length}`};
                }
                current.splice(inst.i, 0, inst.v);
                break;

            case OpType.ARR_POP:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayPop operation'};
                }
                if (current.length === 0) {
                    return {success: false, error: 'Cannot pop from empty array'};
                }
                current.pop();
                break;

            case OpType.ARR_SHIFT:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayShift operation'};
                }
                if (current.length === 0) {
                    return {success: false, error: 'Cannot shift from empty array'};
                }
                current.shift();
                break;

            case OpType.ARR_UNSHIFT:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayUnshift operation'};
                }
                current.unshift(inst.v);
                break;

            case OpType.ARR_REM_IDX:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayRemoveIndex operation'};
                }
                if (inst.i == null || inst.i < 0 || inst.i >= current.length) {
                    return {success: false, error: `Invalid index ${inst.i} for array of length ${current.length}`};
                }
                current.splice(inst.i, 1);
                break;
            case OpType.ARR_MOVE:
                if (!beforeApply?.(parent)) break;
                if (!Array.isArray(current)) {
                    return {success: false, error: 'Target is not an array for arrayMove operation'};
                }
                if (inst.f == null || inst.t == null || inst.f < 0 || inst.f >= current.length || inst.t < 0 || inst.t > current.length) {
                    return {
                        success: false,
                        error: `Invalid from_index ${inst.f} or to_index ${inst.t} for array of length ${current.length}`
                    };
                }
                if (inst.f === inst.t) {
                    break; // No-op if indices are the same
                }
                const [element] = current.splice(inst.f, 1);
                current.splice(inst.t, 0, element);
                break;
            case OpType.STR_INS:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for insertString operation'};
                }
                if (inst.i == null || inst.i < 0 || inst.i > current.length) {
                    return {success: false, error: `Invalid index ${inst.i} for string of length ${current.length}`};
                }
                const newStr = current.slice(0, inst.i) + inst.v + current.slice(inst.i);
                if (lastKey && parent != null) {
                    parent[lastKey] = newStr;
                } else {
                    result = newStr as T;
                }
                break;

            case OpType.STR_APP:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for stringAppend operation'};
                }
                if (lastKey && parent != null) {
                    parent[lastKey] = current + inst.v;
                } else {
                    result = (current + inst.v) as T;
                }
                break;

            case OpType.STR_REM:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for stringRemove operation'};
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i >= current.length) {
                    return {success: false, error: `Invalid index ${inst.i} or length ${inst.l} for string`};
                }
                const removed = current.slice(0, inst.i) + current.slice(inst.i + inst.l);
                if (lastKey && parent != null) {
                    parent[lastKey] = removed;
                } else {
                    result = removed as T;
                }
                break;

            case OpType.STR_REP_AT:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for stringReplaceAt operation'};
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i >= current.length) {
                    return {success: false, error: `Invalid index ${inst.i} or length ${inst.l} for string`};
                }
                const replaced = current.slice(0, inst.i) + inst.v + current.slice(inst.i + inst.l);
                if (lastKey && parent != null) {
                    parent[lastKey] = replaced;
                } else {
                    result = replaced as T;
                }
                break;

            case OpType.STR_REP:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for stringReplace operation'};
                }
                if (inst.s == null || inst.r == null) {
                    return {success: false, error: 'Missing search or replacement string'};
                }
                const replacedOnce = current.replace(inst.s, inst.r);
                if (lastKey && parent != null) {
                    parent[lastKey] = replacedOnce;
                } else {
                    result = replacedOnce as T;
                }
                break;

            case OpType.STR_REP_ALL:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'string') {
                    return {success: false, error: 'Target is not a string for stringReplaceAll operation'};
                }
                if (inst.s == null || inst.r == null) {
                    return {success: false, error: 'Missing search or replacement string'};
                }
                const replacedAll = current.replaceAll(inst.s, inst.r);
                if (lastKey && parent != null) {
                    parent[lastKey] = replacedAll;
                } else {
                    result = replacedAll as T;
                }
                break;

            case OpType.BOOL_TOG:
                if (!beforeApply?.(parent)) break;
                if (typeof current !== 'boolean') {
                    return {success: false, error: 'Target is not a boolean for boolToggle operation'};
                }
                if (lastKey && parent != null) {
                    parent[lastKey] = !current;
                } else {
                    result = (!current) as T;
                }
                break;

            case OpType.DICT_MERGE:
                if (!beforeApply?.(parent)) break;
                if (lastKey && parent != null) {
                    if (typeof parent[lastKey] !== 'object' || parent[lastKey] == null || Array.isArray(parent[lastKey])) {
                        parent[lastKey] = {};
                    }
                    parent[lastKey] = {...parent[lastKey], ...inst.v};
                } else {
                    if (typeof result !== 'object' || result == null || Array.isArray(result)) {
                        result = {} as T;
                    }
                    result = {...result, ...inst.v} as T;
                }
                break;
            case OpType.OBJ_MOVE: {
                if (inst.d == null || !Array.isArray(inst.d)) {
                    return {success: false, error: 'Missing or invalid destination path for objectMove operation'};
                }

                // Navigate to source (must exist fully)
                let sourceParent: any = null;
                let sourceCurrent: any = result;
                let sourceLastKey: string | undefined = undefined;

                if (inst.p && inst.p.length > 0) {
                    for (let i = 0; i < inst.p.length - 1; i++) {
                        const key = inst.p[i];
                        if (sourceCurrent == null || typeof sourceCurrent !== 'object') {
                            return {
                                success: false,
                                error: `Cannot navigate source path: ${inst.p.slice(0, i + 1).join('.')} - parent is not an object`
                            };
                        }
                        if (!(key in sourceCurrent)) {
                            return {
                                success: false,
                                error: `Source key not found: ${key} at path ${inst.p.slice(0, i).join('.')}`
                            };
                        }
                        sourceParent = sourceCurrent;
                        sourceCurrent = sourceCurrent[key];
                    }
                    sourceLastKey = inst.p[inst.p.length - 1];
                    if (sourceCurrent == null || typeof sourceCurrent !== 'object' || !(sourceLastKey in sourceCurrent)) {
                        return {
                            success: false,
                            error: `Source key not found: ${sourceLastKey} at path ${inst.p.slice(0, -1).join('.')}`
                        };
                    }
                    sourceParent = sourceCurrent;
                    sourceCurrent = sourceCurrent[sourceLastKey];
                } else {
                    return {success: false, error: 'Cannot move root element'};
                }

                let valueToMove = sourceCurrent;

                // Remove from source
                if (!beforeApply?.(sourceParent)) break;
                if (sourceLastKey && sourceParent != null) {
                    if (Array.isArray(sourceParent)) {
                        const idx = parseInt(sourceLastKey);
                        if (!isNaN(idx)) {
                            sourceParent.splice(idx, 1);
                        }
                    } else {
                        delete sourceParent[sourceLastKey];
                    }
                }

                // Navigate to destination (intermediates must exist, but final key can be created)
                let destParent: any = null;
                let destCurrent: any = result;
                let destLastKey: string | undefined = undefined;

                if (inst.d.length > 0) {
                    for (let i = 0; i < inst.d.length - 1; i++) {
                        const key = inst.d[i];
                        if (destCurrent == null || typeof destCurrent !== 'object') {
                            return {
                                success: false,
                                error: `Cannot navigate destination path: ${inst.d.slice(0, i + 1).join('.')} - parent is not an object`
                            };
                        }
                        if (!(key in destCurrent)) {
                            return {
                                success: false,
                                error: `Destination key not found: ${key} at path ${inst.d.slice(0, i).join('.')}`
                            };
                        }
                        destParent = destCurrent;
                        destCurrent = destCurrent[key];
                    }
                    destLastKey = inst.d[inst.d.length - 1];
                    destParent = destCurrent;
                } else {
                    // Move to root
                    result = valueToMove as T;
                    break;
                }

                // Set at destination
                if (!beforeApply?.(destParent)) break;
                if (destLastKey && destParent != null) {
                    destParent[destLastKey] = valueToMove;
                } else {
                    result = valueToMove as T;
                }
                break;
            }
            case OpType.OBJ_INSERT: {
                if (inst.d == null || !Array.isArray(inst.d)) {
                    return { success: false, error: 'Missing or invalid destination path for objectInsert operation' };
                }

                // Navigate to destination array FIRST (intermediates must exist, but array can be empty)
                let destParent: any = null;
                let destCurrent: any = result;
                let destLastKey: string | undefined = undefined;

                if (inst.d.length > 0) {
                    for (let i = 0; i < inst.d.length - 1; i++) {
                        const key = inst.d[i];
                        if (destCurrent == null || typeof destCurrent !== 'object') {
                            return {
                                success: false,
                                error: `Cannot navigate destination path: ${inst.d.slice(0, i + 1).join('.')} - parent is not an object`
                            };
                        }
                        if (!(key in destCurrent)) {
                            return {
                                success: false,
                                error: `Destination key not found: ${key} at path ${inst.d.slice(0, i).join('.')}`
                            };
                        }
                        destParent = destCurrent;
                        destCurrent = destCurrent[key];
                    }
                    destLastKey = inst.d[inst.d.length - 1];
                    destParent = destCurrent;
                    if (destLastKey && destParent != null) {
                        if (destParent == null || typeof destParent !== 'object' || !(destLastKey in destParent)) {
                            return {
                                success: false,
                                error: `Destination key not found: ${destLastKey} at path ${inst.d.slice(0, -1).join('.')}`
                            };
                        }
                        destCurrent = destParent[destLastKey];
                    }
                } else {
                    // Cannot insert into root unless root is array, but for simplicity, assume path provided
                    return { success: false, error: 'Destination path must be provided for objectInsert' };
                }

                // Check if destination is an array
                if (!Array.isArray(destCurrent)) {
                    return { success: false, error: 'Destination is not an array for objectInsert operation' };
                }

                // Validate index against ORIGINAL destination length (before any potential removal if same array)
                if (inst.i != null) {
                    if (inst.i < 0 || inst.i > destCurrent.length) {
                        return { success: false, error: `Invalid index ${inst.i} for array of length ${destCurrent.length}` };
                    }
                }

                // Now navigate to source and remove
                let sourceParent: any = null;
                let sourceCurrent: any = result;
                let sourceLastKey: string | undefined = undefined;

                if (inst.p && inst.p.length > 0) {
                    for (let i = 0; i < inst.p.length - 1; i++) {
                        const key = inst.p[i];
                        if (sourceCurrent == null || typeof sourceCurrent !== 'object') {
                            return {
                                success: false,
                                error: `Cannot navigate source path: ${inst.p.slice(0, i + 1).join('.')} - parent is not an object`
                            };
                        }
                        if (!(key in sourceCurrent)) {
                            return {
                                success: false,
                                error: `Source key not found: ${key} at path ${inst.p.slice(0, i).join('.')}`
                            };
                        }
                        sourceParent = sourceCurrent;
                        sourceCurrent = sourceCurrent[key];
                    }
                    sourceLastKey = inst.p[inst.p.length - 1];
                    if (sourceCurrent == null || typeof sourceCurrent !== 'object' || !(sourceLastKey in sourceCurrent)) {
                        return {
                            success: false,
                            error: `Source key not found: ${sourceLastKey} at path ${inst.p.slice(0, -1).join('.')}`
                        };
                    }
                    sourceParent = sourceCurrent;
                    sourceCurrent = sourceCurrent[sourceLastKey];
                } else {
                    return { success: false, error: 'Cannot move root element' };
                }

                const valueToMove = sourceCurrent;

                // Remove from source
                if (!beforeApply?.(sourceParent)) break;
                if (sourceLastKey && sourceParent != null) {
                    if (Array.isArray(sourceParent)) {
                        const idx = parseInt(sourceLastKey);
                        if (!isNaN(idx)) {
                            sourceParent.splice(idx, 1);
                        }
                    } else {
                        delete sourceParent[sourceLastKey];
                    }
                }

                // Insert at index or push (JS splice will handle appends gracefully if index == original length and removal shortened the array)
                if (!beforeApply?.(destParent)) break;
                if (inst.i != null) {
                    destCurrent.splice(inst.i, 0, valueToMove);
                } else {
                    destCurrent.push(valueToMove);
                }
                break;
            }
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
            case OpType.ARR_MOVE:
                if (inst.f == null || inst.t == null) {
                    return { success: false, error: 'Missing from_index or to_index for operation' };
                }
                break;
            case OpType.OBJ_MOVE:
                if (inst.d == null || !Array.isArray(inst.d)) {
                    return { success: false, error: 'Missing destination path for operation' };
                }
                break;
            case OpType.OBJ_INSERT:
                if (inst.d == null || !Array.isArray(inst.d)) {
                    return { success: false, error: 'Missing destination path for operation' };
                }
                if (inst.i != null && (typeof inst.i !== 'number' || inst.i < 0)) {
                    return { success: false, error: 'Invalid index for operation' };
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

// Helper function to navigate to path (similar to applyInstruction navigation)
function getAtPath(
    target: any,
    path: string[] | undefined,
    requireLastExists: boolean = true
): Result<{ parent: any; lastKey: string | undefined; current: any }> {
    let current: any = target;
    let parent: any = null;
    let lastKey: string | undefined = undefined;

    if (!path || path.length === 0) {
        return { success: true, value: { parent: null, lastKey: undefined, current } };
    }

    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (current == null || typeof current !== 'object') {
            return {
                success: false,
                error: `Cannot navigate path: ${path.slice(0, i + 1).join('.')} - parent is not an object`
            };
        }
        if (i === path.length - 1) {
            lastKey = key;
            if (requireLastExists && !(key in current)) {
                return {
                    success: false,
                    error: `Key not found: ${key} at path ${path.slice(0, i).join('.')}`
                };
            }
            parent = current;
            current = key in current ? current[key] : undefined;
        } else {
            if (!(key in current)) {
                return {
                    success: false,
                    error: `Key not found: ${key} at path ${path.slice(0, i).join('.')}`
                };
            }
            current = current[key];
        }
    }
    return { success: true, value: { parent, lastKey, current } };
}

// Function to get the inverse instruction
export function getInverseInstruction(target: any, instruction: Instruction | string): Result<Instruction> {
    try {
        const inst: Instruction = typeof instruction === 'string' ? JSON.parse(instruction) : instruction;

        const valid = validateInstruction(inst);
        if (!valid.success) {
            return valid as { success: false; error: string };
        }

        let nav: Result<{ parent: any; lastKey: string | undefined; current: any }>;
        let inverse: Instruction;

        switch (inst.o) {
            case OpType.SET: {
                nav = getAtPath(target, inst.p, false);
                if (!nav.success) return nav;
                const { parent, lastKey, current } = nav.value;
                if (parent !== null && lastKey !== undefined && !(lastKey in parent)) {
                    // Path did not exist, inverse is remove
                    inverse = { o: OpType.REM, p: inst.p ? [...inst.p] : undefined };
                } else {
                    // Path existed, inverse is set back to old value
                    inverse = { o: OpType.SET, p: inst.p ? [...inst.p] : undefined, v: deepCopy(current) };
                }
                break;
            }

            case OpType.REM: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { parent, lastKey, current } = nav.value;
                if (lastKey === undefined) {
                    return { success: false, error: 'Cannot inverse remove on root element' };
                }
                const old = deepCopy(current);
                if (Array.isArray(parent)) {
                    const idx = parseInt(lastKey);
                    if (isNaN(idx)) {
                        return { success: false, error: 'Invalid array index for remove inverse' };
                    }
                    inverse = { o: OpType.ARR_INS, p: inst.p ? inst.p.slice(0, -1) : undefined, i: idx, v: old };
                } else {
                    inverse = { o: OpType.SET, p: inst.p ? [...inst.p] : undefined, v: old };
                }
                break;
            }

            case OpType.ARR_ADD: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayAdd inverse' };
                }
                inverse = { o: OpType.ARR_REM_IDX, p: inst.p ? [...inst.p] : undefined, i: current.length };
                break;
            }

            case OpType.ARR_INS: {
                // No need for state beyond validation
                inverse = { o: OpType.ARR_REM_IDX, p: inst.p ? [...inst.p] : undefined, i: inst.i };
                break;
            }

            case OpType.ARR_POP: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayPop inverse' };
                }
                if (current.length === 0) {
                    return { success: false, error: 'Cannot inverse pop from empty array' };
                }
                const old = deepCopy(current[current.length - 1]);
                inverse = { o: OpType.ARR_ADD, p: inst.p ? [...inst.p] : undefined, v: old };
                break;
            }

            case OpType.ARR_SHIFT: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayShift inverse' };
                }
                if (current.length === 0) {
                    return { success: false, error: 'Cannot inverse shift from empty array' };
                }
                const old = deepCopy(current[0]);
                inverse = { o: OpType.ARR_UNSHIFT, p: inst.p ? [...inst.p] : undefined, v: old };
                break;
            }

            case OpType.ARR_UNSHIFT: {
                inverse = { o: OpType.ARR_SHIFT, p: inst.p ? [...inst.p] : undefined };
                break;
            }

            case OpType.ARR_REM_IDX: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (!Array.isArray(current)) {
                    return { success: false, error: 'Target is not an array for arrayRemoveIndex inverse' };
                }
                if (inst.i == null || inst.i < 0 || inst.i >= current.length) {
                    return { success: false, error: `Invalid index ${inst.i} for array of length ${current.length}` };
                }
                const old = deepCopy(current[inst.i]);
                inverse = { o: OpType.ARR_INS, p: inst.p ? [...inst.p] : undefined, i: inst.i, v: old };
                break;
            }

            case OpType.ARR_MOVE: {
                inverse = { o: OpType.ARR_MOVE, p: inst.p ? [...inst.p] : undefined, f: inst.t, t: inst.f };
                break;
            }

            case OpType.STR_INS: {
                inverse = { o: OpType.STR_REM, p: inst.p ? [...inst.p] : undefined, i: inst.i, l: (inst.v as string).length };
                break;
            }

            case OpType.STR_APP: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringAppend inverse' };
                }
                inverse = { o: OpType.STR_REM, p: inst.p ? [...inst.p] : undefined, i: current.length, l: (inst.v as string).length };
                break;
            }

            case OpType.STR_REM: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringRemove inverse' };
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i + inst.l > current.length) {
                    return { success: false, error: `Invalid index or length for string of length ${current.length}` };
                }
                const oldText = current.slice(inst.i, inst.i + inst.l);
                inverse = { o: OpType.STR_INS, p: inst.p ? [...inst.p] : undefined, i: inst.i, v: oldText };
                break;
            }

            case OpType.STR_REP_AT: {
                nav = getAtPath(target, inst.p, true);
                if (!nav.success) return nav;
                const { current } = nav.value;
                if (typeof current !== 'string') {
                    return { success: false, error: 'Target is not a string for stringReplaceAt inverse' };
                }
                if (inst.i == null || inst.l == null || inst.i < 0 || inst.i + inst.l > current.length) {
                    return { success: false, error: `Invalid index or length for string of length ${current.length}` };
                }
                const oldText = current.slice(inst.i, inst.i + inst.l);
                inverse = { o: OpType.STR_REP_AT, p: inst.p ? [...inst.p] : undefined, i: inst.i, l: (inst.v as string).length, v: oldText };
                break;
            }

            case OpType.STR_REP: {
                inverse = { o: OpType.STR_REP, p: inst.p ? [...inst.p] : undefined, s: inst.r, r: inst.s };
                break;
            }

            case OpType.STR_REP_ALL: {
                inverse = { o: OpType.STR_REP_ALL, p: inst.p ? [...inst.p] : undefined, s: inst.r, r: inst.s };
                break;
            }

            case OpType.BOOL_TOG: {
                inverse = { o: OpType.BOOL_TOG, p: inst.p ? [...inst.p] : undefined };
                break;
            }

            case OpType.DICT_MERGE: {
                nav = getAtPath(target, inst.p, false);
                if (!nav.success) return nav;
                let { current } = nav.value;
                if (current == null || Array.isArray(current) || typeof current !== 'object') {
                    current = {};
                }
                const inverseV: Record<string, any> = {};
                for (const key in inst.v) {
                    if (Object.hasOwn(current, key)) {
                        inverseV[key] = deepCopy(current[key]);
                    } else {
                        inverseV[key] = undefined;
                    }
                }
                inverse = { o: OpType.DICT_MERGE, p: inst.p ? [...inst.p] : undefined, v: inverseV };
                break;
            }

            case OpType.OBJ_MOVE: {
                if (!inst.d) {
                    return { success: false, error: 'Missing destination for objectMove inverse' };
                }
                inverse = { o: OpType.OBJ_MOVE, p: [...inst.d], d: inst.p ? [...inst.p] : undefined };
                break;
            }

            case OpType.OBJ_INSERT: {
                if (!inst.d) {
                    return { success: false, error: 'Missing destination for objectInsert inverse' };
                }
                nav = getAtPath(target, inst.d, true);
                if (!nav.success) return nav;
                const { current: destCurrent } = nav.value;
                if (!Array.isArray(destCurrent)) {
                    return { success: false, error: 'Destination is not an array for objectInsert inverse' };
                }
                const index = inst.i !== undefined ? inst.i : destCurrent.length;
                if (index < 0 || index > destCurrent.length) {
                    return { success: false, error: `Invalid index ${index} for array of length ${destCurrent.length}` };
                }
                const newSourcePath = [...inst.d, `${index}`];
                inverse = { o: OpType.OBJ_MOVE, p: newSourcePath, d: inst.p ? [...inst.p] : undefined };
                break;
            }

            default:
                return { success: false, error: `Unknown operation type: ${inst.o}` };
        }

        return { success: true, value: inverse };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get inverse instruction: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Example usage and tests
/*
    // Example 1: String insertion
    const inst1 = createInstruction().key("name").insertString(10, "bla");
    console.log("Instruction 1:", encodeInstruction(inst1));

    // Example 2: Array operations
    const data = {
        users: ["Alice", "Bob"],
        config: {
            theme: "dark",
            enabled: true
        }
    };

    const inst2 = createInstruction().key("users").arrayAdd("Charlie");
    const result1 = applyInstruction(data, inst2);
    console.log("After adding Charlie:", result1);

    // Example 3: Boolean toggle
    const inst3 = createInstruction().key("config").key("enabled").boolToggle();
    const result2 = applyInstruction(data, inst3);
    console.log("After toggling enabled:", result2);

    // Example 4: Dictionary merge
    const inst4 = createInstruction().key("config").dictMerge({
        fontSize: 14,
        language: "en"
    });
    const result3 = applyInstruction(data, inst4);
    console.log("After merging config:", result3);

    // Example 5: Batch operations
    const instructions = [
        createInstruction().key("users").arrayAdd("David"),
        createInstruction().key("config").key("theme").set("light"),
        createInstruction().key("version").set(2)
    ];


    const batchResult = applyInstructions(data, instructions);
    console.log("After batch operations:", batchResult);


    const data = { items: ['a', 'b', 'c', 'd'] };

    // Move 'b' (index 1) to index 3 (after 'd', but since length=4, it inserts at 3, shifting 'c' and 'd')
    const inst = createInstruction().key("items").arrayMove(1, 3);
    const result = applyInstruction(data, inst);
    console.log(result); // { success: true, value: { items: ['a', 'c', 'd', 'b'] } }

    // Encoded instruction (minimal JSON)
    console.log(encodeInstruction(inst)); // {"o":17,"p":["items"],"f":1,"t":3}
*/