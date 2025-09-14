import {ActionType, Dispatch} from "../useCreateReducer";
import {createContext} from "react";

export interface ProjectContextProps {
    state: ProjectContextType;
    dispatch: Dispatch<ActionType<ProjectContextType>>
}

export const ProjectContext = createContext<ProjectContextProps>(undefined!);

export interface ProjectContextType {
    loader: {
        active: boolean;
        opaque: boolean;
    },
}
export const ProjectContextDefaultValue: ProjectContextType = {
    loader: {
        active: false,
        opaque: true,
    }
}
