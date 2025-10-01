import {memo, useContext, useEffect} from "react";
import {ThemeContext, ThemeContextType} from "./ThemeContext";


interface ThemeContextParserProps {}

export const ThemeContextParser = memo(({}: ThemeContextParserProps) => {
    const Theme = useContext(ThemeContext);

    useEffect(() => {
        const root = document.documentElement;

        // Set theme mode
        root.setAttribute('data-nodius-theme', Theme.state.theme);

        const toDos:Partial<keyof ThemeContextType>[] = ["primary","secondary","text","info","background","success","warning","error", "shadow"];

        toDos.forEach((toDo) => {
            Object.entries((Theme.state as any)[toDo][Theme.state.theme]).forEach(([key, value]) => {
                root.style.setProperty(`--nodius-${toDo}-${key}`, value as any);
            });
        })
        toDos.forEach((toDo) => {
            Object.entries((Theme.state as any)[toDo][Theme.state.theme == "light" ? "dark" : "light"]).forEach(([key, value]) => {
                root.style.setProperty(`--nodius-reverse-${toDo}-${key}`, value as any);
            });
        })


        // Set all color palette variables
        Object.entries(Theme.state.color).forEach(([colorName, colorShades]) => {
            Object.entries(colorShades).forEach(([shade, color]) => {
                root.style.setProperty(`--nodius-${colorName}-${shade}`, color);
            });
        });

        Object.entries(Theme.state.transition).forEach(([type, transition]) => {
            root.style.setProperty(`--nodius-transition-${type}`, transition);
        });

        document.body.style.color = "var(--nodius-text-primary)"



    }, [Theme.state.theme, Theme.state.primary, Theme.state.color]);

    return <></>
});
ThemeContext.displayName = "ThemeContext";