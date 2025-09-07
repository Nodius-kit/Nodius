import {HtmlObject} from "./HtmlBuildType";
import {useEffect, useState} from "nodius_jsx/jsx-runtime";

interface HtmlBuilderComponentPropertiesProps {
    selectedObject: HtmlObject,
    invokeUpdate: () => void,
}

export const HtmlBuilderComponentProperties = ({selectedObject, invokeUpdate}: HtmlBuilderComponentPropertiesProps) => {
    const [newCssKey, setNewCssKey] = useState("");
    const [newCssValue, setNewCssValue] = useState("");
    const [newEventName, setNewEventName] = useState("");
    const [newEventCall, setNewEventCall] = useState("");

    const updateCssProperty = (oldKey: string, newKey: string, newValue: string) => {
        if (!selectedObject.css) selectedObject.css = {};

        // Remove old key if it changed
        if (oldKey !== newKey && selectedObject.css[oldKey] !== undefined) {
            delete selectedObject.css[oldKey];
        }

        // Set new key/value
        if (newKey.trim()) {
            selectedObject.css[newKey] = newValue;
        }

        invokeUpdate();
    };

    const removeCssProperty = (cssKey: string) => {
        if (selectedObject.css && selectedObject.css[cssKey] !== undefined) {
            delete selectedObject.css[cssKey];
            invokeUpdate();
        }
    };

    const addCssProperty = () => {
        if (newCssKey.trim()) {
            if (!selectedObject.css) selectedObject.css = {};
            selectedObject.css[newCssKey] = newCssValue;
            setNewCssKey("");
            setNewCssValue("");
            invokeUpdate();
        }
    };

    const updateEvent = (index: number, newName: string, newCall: string) => {
        if (!selectedObject.events) return;

        selectedObject.events[index] = {
            name: newName,
            call: newCall
        };
        invokeUpdate();
    };

    const removeEvent = (index: number) => {
        if (selectedObject.events) {
            selectedObject.events.splice(index, 1);
            invokeUpdate();
        }
    };

    const addEvent = () => {
        if (newEventName.trim()) {
            if (!selectedObject.events) selectedObject.events = [];
            selectedObject.events.push({
                name: newEventName,
                call: newEventCall
            });
            setNewEventName("");
            setNewEventCall("");
            invokeUpdate();
        }
    };


    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            gap: "15px",
            padding: "10px",
            fontSize: "12px"
        }}>
            {/* CSS Properties Section */}
            <div>
                <h3 style={{margin: "0 0 8px 0", fontSize: "14px"}}>CSS Properties</h3>

                {selectedObject.type == "text" ? (
                    <div>
                         <textarea
                             value={selectedObject.content}
                             onInput={(e) => {
                                 selectedObject.content = (e.target as HTMLInputElement).value;
                                 invokeUpdate();
                             }}
                             style={{
                                 width: "100%",
                                 height: "40px",
                                 padding: "2px",
                                 fontSize: "11px",
                                 resize: "vertical",
                                 fontFamily: "monospace"
                             }}
                             placeholder="Your text here"
                         />
                    </div>
                ) : ""   }

                {/* Existing CSS Properties */}
                <div style={{display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px"}}>
                    <input
                        type="text"
                        value={selectedObject.tag}
                        onInput={(e) => {
                            selectedObject.tag = (e.target as HTMLInputElement).value;
                            invokeUpdate();
                        }}
                        style={{width: "60px", padding: "2px", fontSize: "11px"}}
                        placeholder="tag"
                    />

                    {/* don't work also */}
                    {Object.entries(selectedObject.css).map(([cssKey, cssValue], i) => (
                        <div key={i} style={{display: "flex", alignItems: "center", gap: "5px"}}>
                            <input
                                type="text"
                                value={cssKey}
                                onInput={(e) => updateCssProperty(cssKey, (e.target as HTMLInputElement).value, cssValue as string)}
                                style={{width: "60px", padding: "2px", fontSize: "11px"}}
                                placeholder="property"
                            />
                            <span style={{fontSize: "10px"}}>:</span>
                            <input
                                type="text"
                                value={cssValue as string}
                                onInput={(e) => updateCssProperty(cssKey, cssKey, (e.target as HTMLInputElement).value)}
                                style={{flex: 1, padding: "2px", fontSize: "11px"}}
                                placeholder="value"
                            />
                            <button
                                onClick={() => removeCssProperty(cssKey)}
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    padding: "0",
                                    fontSize: "10px",
                                    backgroundColor: "#ff4444",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer"
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add New CSS Property */}
                <div style={{display: "flex", alignItems: "center", gap: "5px", padding: "5px", backgroundColor: "#f5f5f5", borderRadius: "3px"}}>
                    <input
                        type="text"
                        value={newCssKey}
                        onInput={(e) => setNewCssKey((e.target as HTMLInputElement).value)}
                        style={{width: "60px", padding: "2px", fontSize: "11px"}}
                        placeholder="property"
                    />
                    <span style={{fontSize: "10px"}}>:</span>
                    <input
                        type="text"
                        value={newCssValue}
                        onInput={(e) => setNewCssValue((e.target as HTMLInputElement).value)}
                        style={{flex: 1, padding: "2px", fontSize: "11px"}}
                        placeholder="value"
                    />
                    <button
                        onClick={addCssProperty}
                        style={{
                            width: "20px",
                            height: "20px",
                            padding: "0",
                            fontSize: "10px",
                            backgroundColor: "#44aa44",
                            color: "white",
                            border: "none",
                            borderRadius: "2px",
                            cursor: "pointer"
                        }}
                    >
                        +
                    </button>
                </div>
            </div>

            {/* JavaScript Events Section */}
            <div>
                <h3 style={{margin: "0 0 8px 0", fontSize: "14px"}}>JS Events</h3>

                {/* Existing Events */}
                <div style={{display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px"}}>
                    {/* work */}
                    {(selectedObject.events ?? []).map((eventKey, i) => (
                        <div key={i} style={{display: "flex", flexDirection: "column", gap: "3px", padding: "5px", backgroundColor: "#f9f9f9", borderRadius: "3px"}}>
                            <div style={{display: "flex", alignItems: "center", gap: "5px"}}>
                                <span style={{fontSize: "10px", width: "15px"}}>{i}:</span>
                                <input
                                    type="text"
                                    value={eventKey.name}
                                    onChange={(e) => updateEvent(i, (e.target as HTMLInputElement).value, eventKey.call)}
                                    style={{width: "50px", padding: "2px", fontSize: "11px"}}
                                    placeholder="event"
                                />
                                <button
                                    onClick={() => removeEvent(i)}
                                    style={{
                                        width: "20px",
                                        height: "20px",
                                        padding: "0",
                                        fontSize: "10px",
                                        backgroundColor: "#ff4444",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "2px",
                                        cursor: "pointer"
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                            <textarea
                                value={eventKey.call}
                                onInput={(e) => updateEvent(i, eventKey.name, (e.target as HTMLInputElement).value)}
                                style={{
                                    width: "100%",
                                    height: "40px",
                                    padding: "2px",
                                    fontSize: "11px",
                                    resize: "vertical",
                                    fontFamily: "monospace"
                                }}
                                placeholder="JavaScript code..."
                            />
                        </div>
                    ))}
                </div>

                {/* Add New Event */}
                <div style={{display: "flex", flexDirection: "column", gap: "3px", padding: "5px", backgroundColor: "#f5f5f5", borderRadius: "3px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "5px"}}>
                        <input
                            type="text"
                            value={newEventName}
                            onChange={(e) => setNewEventName((e.target as HTMLInputElement).value)}
                            style={{width: "50px", padding: "2px", fontSize: "11px"}}
                            placeholder="event"
                        />
                        <button
                            onClick={addEvent}
                            style={{
                                width: "20px",
                                height: "20px",
                                padding: "0",
                                fontSize: "10px",
                                backgroundColor: "#44aa44",
                                color: "white",
                                border: "none",
                                borderRadius: "2px",
                                cursor: "pointer"
                            }}
                        >
                            +
                        </button>
                    </div>

                    <textarea
                        value={newEventCall}
                        onInput={(e) => setNewEventCall((e.target as HTMLInputElement).value)}
                        style={{
                            width: "100%",
                            height: "40px",
                            padding: "2px",
                            fontSize: "11px",
                            resize: "vertical",
                            fontFamily: "monospace"
                        }}
                        placeholder="JavaScript code..."
                    />
                </div>
            </div>
        </div>
    );
};