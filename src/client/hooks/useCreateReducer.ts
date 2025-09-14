// Extracts property names from initial state of reducer to allow typesafe dispatch objects

// Returns the Action Type for the dispatch object to be used for typing in things like context
import {useMemo, useReducer} from "react";

export type ActionType<T> =
    | { type: 'reset' }
    | { type?: 'change'; field: string; value: any };

export type Dispatch<A> = (value: A) => void;

// Returns a typed dispatch and state
export const useCreateReducer = <T>({ initialState }: { initialState: T }) => {


    const reducer = (state: T, action: ActionType<T>) => {
        if (!action.type) return { ...state, [action.field]: action.value };

        if (action.type === 'reset') return initialState;

        throw new Error();
    };

    const [state, dispatch] = useReducer(reducer, initialState);


    return useMemo(() => ({ state, dispatch }), [state, dispatch]);
};