
import "./public/css/theme.css"
import "@fontsource/roboto";


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

