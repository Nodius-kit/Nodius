import { useMemo, useReducer } from "react";

// Creates a union type for each field-value pair in T
export type ActionType<T> =
    | { type: 'reset' }
    | { [K in keyof T]: { type?: 'change'; field: K; value: T[K] } }[keyof T];

export type Dispatch<A> = (value: A) => void;

export const useCreateReducer = <T extends Record<string, any>>({
                                                                    initialState
                                                                }: {
    initialState: T
}) => {
    const reducer = (state: T, action: ActionType<T>): T => {
        if (action.type === 'reset') return initialState;

        if (!action.type || action.type === 'change') {
            // TypeScript knows field is keyof T and value is T[field]
            return {
                ...state,
                [action.field]: action.value
            } as T;
        }

        throw new Error('Unknown action type');
    };

    const [state, dispatch] = useReducer(reducer, initialState);

    return useMemo(() => ({ state, dispatch }), [state]);
};