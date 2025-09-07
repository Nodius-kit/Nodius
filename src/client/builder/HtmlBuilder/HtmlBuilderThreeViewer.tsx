import {HtmlObject} from "./HtmlBuildType";
import {CSSProperties, Fragment} from "nodius_jsx/jsx-runtime";

interface HtmlBuilderThreeViewerProps {
    object:HtmlObject,
    selectedObject: HtmlObject,
    setSelectedObject: (newObject: HtmlObject) => void,
    removeObject: (object:HtmlObject) => void,
}

export const HtmlBuilderThreeViewer = (
    {
        selectedObject,
        setSelectedObject,
        object,
        removeObject
    }:HtmlBuilderThreeViewerProps) => {


    const renderHiearchy = (object:HtmlObject) => {

        const titleStyle:CSSProperties = {};
        titleStyle.display = "flex";
        titleStyle.justifyContent = "space-between";
        if(object.id === selectedObject.id) {
            titleStyle.backgroundColor = "#CCC"; // is not reset
        } else {
            titleStyle.cursor = "pointer";
        }

        return (
            <div>
                <div onClick={() => {
                    setSelectedObject(object);
                }} style={titleStyle}>
                    { object.type + ' ('+object.tag+')'}
                    {object.id != 0 ? (
                        <span style={{cusor:"pointer"}} onClick={() => removeObject(object)}>S</span>
                    ) : null}
                </div>
                {
                    object.content != undefined && typeof object.content  !== "string"? (
                        <div style={{paddingLeft:"2px"}}>
                            {Array.isArray(object.content)
                                ? object.content.map((item: HtmlObject, i) => (
                                    <Fragment key={item.id}>
                                        <span data-i={i}></span>
                                        <span>test</span>
                                        {renderHiearchy(item)}
                                    </Fragment>
                                ))
                                : renderHiearchy(object.content)}
                        </div>
                    ) : null
                }
            </div>
        )
    }

    return (
        <div style={{"display":"flex", flexDirection:"column", height:"100%", width:"100%", overflowY:"auto"}}>
            {renderHiearchy(object)}
        </div>
    )
}