
import "./public/css/theme.css"
import {FunctionComponent, render, useCallback, useEffect, useRef, useState} from "./jsx-runtime/jsx-runtime";
import {HtmlBuilder} from "./builder/HtmlBuilder/HtmlBuilder";
import {HtmlClass, HtmlObject} from "./builder/HtmlBuilder/HtmlBuildType";


// App component
export const App = () => {

    const [htmlClassListing, setHtmlClassListing] = useState<HtmlClass[]>([]);
    const [htmlClassEditing, setHtmlClassEditing] = useState<HtmlClass|undefined>(undefined);

    useEffect(() => {
        retrieveHtmlClass();
    }, []);

    const retrieveHtmlClassAbort = useRef<AbortController|undefined>(undefined);
    const retrieveHtmlClass = async () => {
        if(retrieveHtmlClassAbort.current) {
            retrieveHtmlClassAbort.current.abort();
        }
        retrieveHtmlClassAbort.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/htmlclass/list`, {
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
        console.log(htmlClassEditing);
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
            const json = await response.json();
            setHtmlClassListing(json);
        }
    }, []);

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
            ) : (
                <HtmlBuilder htmlClass={htmlClassEditing} closeClass={closeClass} updateClass={updateClass} />
            )}
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


