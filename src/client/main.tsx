/**
 * @file main.tsx
 * @description Application entry point and root component setup
 * @module client
 *
 * Initializes the React application with context providers:
 * - Main: Root component with ThemeContext and ProjectContext
 * - Global styles: Theme CSS and Roboto font imports
 * - Toast notifications: React hot toast integration
 * - Context initialization: Sets up theme and project state
 *
 * Key features:
 * - useCreateReducer for state management
 * - Nested context providers for global state
 * - React 18 createRoot API
 * - Error boundary ready
 */

import "./public/css/theme.css"
import "@fontsource/roboto";

// Initialize fetch middleware to auto-prepend API base URL
import {initializeFetchMiddleware} from "./utils/fetchMiddleware";
initializeFetchMiddleware();

import {useCreateReducer} from "./hooks/useCreateReducer";
import {
    ThemeContext,
    ThemeContextDefaultValue,
    ThemeContextType
} from "./hooks/contexts/ThemeContext";
import {
    ProjectContext,
    ProjectContextDefaultValue,
    ProjectContextType,
} from "./hooks/contexts/ProjectContext";
import {createRoot} from "react-dom/client";
import {App} from "./App";
import {Toaster} from "react-hot-toast";


// App component
export const Main = () => {


    const Theme = useCreateReducer<ThemeContextType>({
        initialState: ThemeContextDefaultValue
    });

    const Project = useCreateReducer<ProjectContextType>({
        initialState: ProjectContextDefaultValue,
    });



    return (
        <ThemeContext.Provider value={Theme} >
            <ProjectContext.Provider value={Project} >
                <Toaster />
                <App/>
            </ProjectContext.Provider>
        </ThemeContext.Provider>
    );
};


// Get the root element
const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}
createRoot(root).render(
    <Main />
);
// Render the app
