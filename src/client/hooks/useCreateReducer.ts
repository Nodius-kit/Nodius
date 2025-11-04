/**
 * @file useCreateReducer.ts
 * @description Factory hook for creating type-safe reducers with automatic field updates
 * @module client/hooks
 *
 * Creates a reducer with built-in support for field-level updates and reset functionality.
 * Provides type safety by inferring action types from the state structure.
 *
 * Features:
 * - **Type-Safe Actions**: Automatically generates action types for each state field
 * - **Field Updates**: Simple field-level updates without boilerplate
 * - **Reset Support**: Built-in reset action to restore initial state
 * - **Memoization**: Returns memoized state object for performance
 * - **Generic Design**: Works with any record-based state structure
 *
 * Action Types:
 * - { type: 'reset' }: Resets state to initialState
 * - { field: K, value: T[K] }: Updates specific field with type-safe value
 *
 * Benefits over useState:
 * - Better for complex state objects with multiple fields
 * - Automatic type inference for field updates
 * - Single dispatch function for all updates
 * - Built-in reset capability
 *
 * @example
 * const { state, dispatch } = useCreateReducer({
 *   initialState: { count: 0, name: '' }
 * });
 * dispatch({ field: 'count', value: 5 }); // Type-safe
 * dispatch({ type: 'reset' }); // Reset to initial
 */

import {ActionDispatch, useMemo, useReducer} from "react";

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


    // debug react state management
    const d: ActionDispatch<any> = (args:any) => {
        console.log(args);
        console.trace();
        return dispatch(args);
    }

    return useMemo(() => ({ state, dispatch:d }), [state]);
};