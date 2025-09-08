
import "./public/css/theme.css"
import {render, useCallback, useEffect, useRef, useState} from "nodius_jsx/jsx-runtime";



import {HtmlBuilder} from "./builder/HtmlBuilder/HtmlBuilder";
import {HtmlClass} from "./builder/HtmlBuilder/HtmlBuildType";
import {WebGpuExample} from "./schema/motor/webGpuExample";

// App component
export const App = () => {

    const [htmlClassListing, setHtmlClassListing] = useState<HtmlClass[]>([]);
    const [htmlClassEditing, setHtmlClassEditing] = useState<HtmlClass|undefined>(undefined);
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>("default");

    useEffect(() => {
        retrieveCategories();
        retrieveHtmlClass();
    }, [selectedCategory]);

    const retrieveCategoriesAbort = useRef<AbortController|undefined>(undefined);
    const retrieveCategories = async () => {
        if(retrieveCategoriesAbort.current) {
            retrieveCategoriesAbort.current.abort();
        }
        retrieveCategoriesAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/categories`, {
            method: "POST",
            signal: retrieveCategoriesAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if(response.status === 200) {
            const json = await response.json();
            setAvailableCategories(json);
        }
    };

    const retrieveHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const retrieveHtmlClass = async () => {
        if(retrieveHtmlClassAbort.current) {
            retrieveHtmlClassAbort.current.abort();
        }
        retrieveHtmlClassAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/list/${selectedCategory}`, {
            method: "POST",
            signal: retrieveHtmlClassAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if(response.status === 200) {
            const json = await response.json();
            console.log(json);
            setHtmlClassListing(json);
        }
    }

    const closeClass = useCallback(() => {
        setHtmlClassEditing(undefined);
    }, []);
    const updateHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const updateClass = useCallback(async () => {

        if(!htmlClassEditing) return;
        if(updateHtmlClassAbort.current) {
            updateHtmlClassAbort.current.abort();
        }
        updateHtmlClassAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/update`, {
            method: "POST",
            signal: updateHtmlClassAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                htmlClass: htmlClassEditing,
            }),
        });
        if(response.status === 200) {
        }
    }, [htmlClassEditing]);

    const deleteHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const deleteClass = async (htmlClass:HtmlClass) => {
        if(deleteHtmlClassAbort.current) {
            deleteHtmlClassAbort.current.abort();
        }
        deleteHtmlClassAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/delete`, {
            method: "POST",
            signal: deleteHtmlClassAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                key: htmlClass._key,
            }),
        });
        if(response.status === 200) {
            await retrieveHtmlClass();
        }
    };



    const createHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const createClass = async () => {
        if(createHtmlClassAbort.current) {
            createHtmlClassAbort.current.abort();
        }
        createHtmlClassAbort.current = new AbortController();

        const className = prompt("New html class name:");
        if(!className || className.trim().length === 0) return;

        const newClass:Omit<HtmlClass, "_key"> = {
            type: "content",
            category: "default",
            permission: 0,
            object: {
                type: "block",
                tag: "div",
                css: {height:"100%", width:"100%"},
                id: 0
            },
            name: className
        }

        const response = await fetch(`http://localhost:8426/api/htmlclass/create`, {
            method: "POST",
            signal: createHtmlClassAbort.current.signal,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                htmlClass: newClass
            }),
        });
        if(response.status === 200) {
            await retrieveHtmlClass();
        }
    };

    return (
        <div style={{width: "100vw", height: "100vh"}}>

            {htmlClassEditing == undefined ? (
                <div style={{padding:"15px"}}>
                    <div>
                        <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px"}}>
                            <h3 style={{margin: 0}}>Html Class:</h3>
                            <select 
                                value={selectedCategory} 
                                onChange={(e) => setSelectedCategory((e.target as HTMLSelectElement).value)}
                                style={{
                                    padding: "5px",
                                    fontSize: "14px",
                                    border: "1px solid #ccc",
                                    borderRadius: "3px"
                                }}
                            >
                                {availableCategories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <table style={{width:"100%"}}>
                            <thead>
                                <tr>
                                    <th>token</th>
                                    <th>action</th>
                                </tr>
                            </thead>
                            <tbody>
                            {htmlClassListing.map((htmlClass, i) => (
                                <tr key={i}>
                                    <td>
                                        {htmlClass.name} |{htmlClass._key} | {htmlClass.type} | {htmlClass.category}
                                    </td>
                                    <td>
                                        <button onClick={() => setHtmlClassEditing(htmlClass)}>edit</button>
                                        <button onClick={() => deleteClass(htmlClass)}>delete</button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        <button onClick={createClass}>Create new html class</button>
                    </div>
                </div>
            ) : (
                <HtmlBuilder htmlClass={htmlClassEditing} closeClass={closeClass} updateClass={updateClass} />
            )}
            <div style={{width:"100%", height: "100%"}}>
                <WebGpuExample />
            </div>

        </div>
    );
};


// Get the root element
const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element not found');
}

// Render the app
render(<App /> as Element, root);


