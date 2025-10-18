import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import {allDataTypes, DataTypeClass, DataTypeConfig} from "../../../../utils/dataType/dataType";
import {Cable, ChevronDown, ChevronUp, Search, Info, FileText, AlertCircle, Check, Edit3} from "lucide-react";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {Edge, Graph, Node, NodeTypeEntryType} from "../../../../utils/graph/graphType";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {Collapse} from "../../animate/Collapse";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {findFirstNodeByType, findFirstNodeWithId, findNodeConnected} from "../../../../utils/graph/nodeUtils";
import {Input} from "../../form/Input";
import {InstructionBuilder} from "../../../../utils/sync/InstructionBuilder";
import {GraphInstructions} from "../../../../utils/sync/wsObject";
import {Fade} from "../../animate/Fade";


interface LeftPanelEntryTypeSelectProps {
    graph?:Graph
}

// Recursive JSON Editor Component for Entry Type Fields
interface RecursiveFieldEditorProps {
    field: DataTypeConfig;
    value: any;
    onChange: (value: any) => void;
    depth?: number;
    allDataTypes: DataTypeClass[] | undefined;
}

const RecursiveFieldEditor = memo(({
    field,
    value,
    onChange,
    depth = 0,
    allDataTypes
}: RecursiveFieldEditorProps) => {
    const Theme = useContext(ThemeContext);
    const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

    const fieldContainerClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            border-radius: 8px;
            padding: 12px;
            margin-left: ${depth * 16}px;
            margin-bottom: 8px;
        }

        & .field-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            cursor: pointer;
            user-select: none;
        }

        & .field-label {
            font-weight: 500;
            font-size: 13px;
            flex: 1;
        }

        & .field-type-badge {
            background-color: var(--nodius-primary-main);
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }

        & .field-required {
            color: var(--nodius-error-main);
            font-size: 11px;
        }

        & .nested-fields {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
        }
    `);

    // Check if this field's type is a DataType (recursive case)
    const isNestedDataType = field.typeId === "dataType";
    const nestedDataType = isNestedDataType && allDataTypes
        ? allDataTypes.find(dt => dt._key === field.defaultValue)
        : undefined;

    // For arrays, handle multiple values
    const isArray = field.isArray;
    const arrayValues = isArray && Array.isArray(value) ? value : (isArray ? [] : null);

    const handleValueChange = (newValue: any, index?: number) => {
        if (isArray && index !== undefined) {
            const newArray = [...(arrayValues || [])];
            newArray[index] = newValue;
            onChange(newArray);
        } else {
            onChange(newValue);
        }
    };

    const addArrayItem = () => {
        if (isArray) {
            const newArray = [...(arrayValues || []), nestedDataType ? {} : ""];
            onChange(newArray);
        }
    };

    const removeArrayItem = (index: number) => {
        if (isArray && arrayValues) {
            const newArray = arrayValues.filter((_, i) => i !== index);
            onChange(newArray);
        }
    };

    const renderPrimitiveInput = (currentValue: any, index?: number) => {
        const validTypes = allDataTypes?.filter(dt => !["dataType", "enum"].includes(dt._key)) || [];

        return (
            <Input
                type={field.typeId === "int" || field.typeId === "db" ? "number" : "text"}
                value={currentValue || ""}
                onChange={(val) => handleValueChange(val, index)}
                placeholder={`Enter ${field.name}${field.required ? " (required)" : ""}`}
            />
        );
    };

    const renderNestedObject = (currentValue: any, index?: number) => {
        if (!nestedDataType) return null;

        return (
            <div className="nested-fields">
                {nestedDataType.types.map((nestedField, i) => (
                    <RecursiveFieldEditor
                        key={i}
                        field={nestedField}
                        value={currentValue?.[nestedField.name]}
                        onChange={(newVal) => {
                            const updatedObj = { ...(currentValue || {}), [nestedField.name]: newVal };
                            handleValueChange(updatedObj, index);
                        }}
                        depth={depth + 1}
                        allDataTypes={allDataTypes}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className={fieldContainerClass}>
            <div className="field-header" onClick={() => isNestedDataType && setIsExpanded(!isExpanded)}>
                {isNestedDataType && (
                    isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />
                )}
                <span className="field-label">{field.name}</span>
                <span className="field-type-badge">
                    {isArray ? "Array<" : ""}{nestedDataType ? nestedDataType.name : field.typeId}{isArray ? ">" : ""}
                </span>
                {field.required && <span className="field-required">*required</span>}
            </div>

            {isNestedDataType && isExpanded ? (
                isArray ? (
                    <div>
                        {arrayValues?.map((item, idx) => (
                            <div key={idx} style={{ marginBottom: "8px", position: "relative" }}>
                                <button
                                    onClick={() => removeArrayItem(idx)}
                                    style={{
                                        position: "absolute",
                                        right: "8px",
                                        top: "8px",
                                        background: "var(--nodius-error-main)",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        padding: "4px 8px",
                                        cursor: "pointer",
                                        fontSize: "11px",
                                        zIndex: 1
                                    }}
                                >
                                    Remove
                                </button>
                                {renderNestedObject(item, idx)}
                            </div>
                        ))}
                        <button
                            onClick={addArrayItem}
                            style={{
                                background: "var(--nodius-primary-main)",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontSize: "12px",
                                marginTop: "8px"
                            }}
                        >
                            + Add Item
                        </button>
                    </div>
                ) : (
                    renderNestedObject(value)
                )
            ) : (
                isArray ? (
                    <div>
                        {arrayValues?.map((item, idx) => (
                            <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                {renderPrimitiveInput(item, idx)}
                                <button
                                    onClick={() => removeArrayItem(idx)}
                                    style={{
                                        background: "var(--nodius-error-main)",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        padding: "4px 8px",
                                        cursor: "pointer",
                                        fontSize: "11px"
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addArrayItem}
                            style={{
                                background: "var(--nodius-primary-main)",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontSize: "12px"
                            }}
                        >
                            + Add Item
                        </button>
                    </div>
                ) : (
                    renderPrimitiveInput(value)
                )
            )}
        </div>
    );
});
RecursiveFieldEditor.displayName = "RecursiveFieldEditor";

export const LeftPanelEntryTypeSelect = memo((
    {
        graph
    }:LeftPanelEntryTypeSelectProps
) => {

    const [searchValue, setSearchValue] = useState<string>("");

    const [showSelect, setShowSelect] = useState<boolean>(false);
    const [showJsonEditor, setShowJsonEditor] = useState<boolean>(false);
    const [editorData, setEditorData] = useState<Record<string, any>>({});

    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);

    const searchedDataTypes: DataTypeClass[]|undefined = useMemo(() => Project.state.dataTypes ? Project.state.dataTypes.filter((data) => data.name.toLowerCase().includes(searchValue.toLowerCase())) : undefined,[Project.state.dataTypes, searchValue]);


    useEffect(() => {
        prepareDataType();
    }, [Project.state.dataTypes, Project.state.enumTypes]);

    const [preparedType, setPreparedType] = useState<Record<string, any>>({});
    const preparedTypeAbortController = useRef<Record<string, AbortController>>({});
    const prepareDataType = async () => {
        const newPreparedType:Record<string, any> = {};
        for(const data of allDataTypes) {
            if(data.prepare) {
                if(preparedTypeAbortController.current[data.id]) {
                    preparedTypeAbortController.current[data.id].abort();
                }
                preparedTypeAbortController.current[data.id] = new AbortController();
                newPreparedType[data.id] = await data.prepare(preparedTypeAbortController.current[data.id], Project.state.dataTypes, Project.state.enumTypes);
            }
        }
        setPreparedType(newPreparedType);
    }

    const selectInputDataButton = useDynamicClass(`
        & {
            background-color: var(--nodius-background-paper);
            padding: 5px 15px;
            border-radius:8px;
            box-shadow: var(--nodius-shadow-1);
            transition: var(--nodius-transition-default);
            display: flex;
            flex-direction: column;
        }
        
        &.inactive:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.background[Theme.state.theme].paper, 0.1, "negative")};
            cursor: pointer;
        }
        
        
        & .close {
            cursor: pointer;
            border-radius: 50%;
        }
    `);

    const dataTypeSelectionButtonClass = useDynamicClass(`
        & {
            width: 100%;
            cursor: pointer;
            padding: 10px 12px;
            border-radius: 8px;
            transition: var(--nodius-transition-default);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
            box-shadow: var(--nodius-shadow-1);
        }

        &.active {
            background-color: var(--nodius-primary-main);
            box-shadow: var(--nodius-shadow-2);
        }

        &.active:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.primary[Theme.state.theme].main, 0.1, "positive")};
        }
    `);

    const infoCardClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.04)};
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 16px;
        }

        & .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--nodius-primary-main);
            font-weight: 500;
            font-size: 14px;
        }

        & .info-content {
            font-size: 13px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }
    `);

    const selectedTypeCardClass = useDynamicClass(`
        & {
            background: linear-gradient(135deg,
                ${Theme.state.reverseHexColor(Theme.state.primary[Theme.state.theme].main, 0.08)} 0%,
                ${Theme.state.reverseHexColor(Theme.state.primary[Theme.state.theme].main, 0.04)} 100%);
            border: 2px solid var(--nodius-primary-main);
            border-radius: 12px;
            padding: 20px;
            margin-top: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        & .type-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 12px;
            border-bottom: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
        }

        & .type-badge {
            background-color: var(--nodius-primary-main);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        & .type-name {
            font-size: 18px;
            font-weight: 600;
        }

        & .type-description {
            font-size: 14px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }

        & .view-button {
            background-color: var(--nodius-primary-main);
            color: white;
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: var(--nodius-transition-default);
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
        }

        & .view-button:hover {
            background-color: ${Theme.state.changeBrightness(Theme.state.primary[Theme.state.theme].main, 0.15, "positive")};
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const emptyStateClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
            border-radius: 12px;
            padding: 32px 20px;
            margin-top: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            text-align: center;
        }

        & .empty-icon {
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.3)};
        }

        & .empty-title {
            font-size: 16px;
            font-weight: 600;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.7)};
        }

        & .empty-description {
            font-size: 13px;
            line-height: 1.6;
            color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.5)};
            max-width: 300px;
        }
    `);

    const setEntryType = async (dataType:DataTypeClass) => {
        if(!Project.state.graph) return;
        //let nodeType = findFirstNodeByType<NodeTypeEntryType>(Project.state.graph, "entryType");
        const nodeRoot = findFirstNodeWithId(Project.state.graph, "root")!;

        if(!nodeRoot || nodeRoot.handles["0"] == undefined || nodeRoot.handles["0"].point.length == 0) return;

        const connectedNodeToEntry = findNodeConnected(Project.state.graph, nodeRoot, "in");
        let nodeType = connectedNodeToEntry.find((n) => n.type === "entryType") as Node<NodeTypeEntryType>;



        if(nodeType) {
            if(nodeType.data!._key === dataType._key) {
                return;
            }
            const instruction = new InstructionBuilder();
            instruction.key("data").key("_key").set(dataType._key);

            const instructions:Array<GraphInstructions> = [{
                nodeId: nodeType._key,
                i: instruction.instruction,
                noRedraw: true
            }];
            const output = await Project.state.updateGraph!(instructions);

        } else {
            const uniqueId = await Project.state.generateUniqueId!(2);
            if(!uniqueId) return;

            const nodeKey = uniqueId[0];
            const edgeKey = uniqueId[1];

            const height = 500;
            const width = 300;
            nodeType = {
                _key: nodeKey,
                graphKey: Project.state.graph._key,
                sheet: nodeRoot.sheet,
                type: "entryType",
                handles: {
                    0: {
                        position: "fix",
                        point: [
                            {
                                id: "0",
                                type: "out",
                                accept: "entryType"
                            }
                        ]
                    }
                },
                posX: nodeRoot.posX - (width+100) ,
                posY: (nodeRoot.size.height/2)-(height/2),
                size: {
                    width: 300,
                    height: 500,
                    dynamic: true,
                },
                data: {
                    _key: dataType._key
                }
            } as Node<NodeTypeEntryType>;

            const edge:Edge = {
                _key: edgeKey,
                source: nodeKey,
                target: nodeRoot._key,
                sheet: nodeType.sheet,
                graphKey: Project.state.graph._key,
                sourceHandle: "0",
                undeletable: true,
                targetHandle: nodeRoot.handles["0"].point[0].id, // we target the center point of the root node
                style: "curved"
            }

            const output = await Project.state.batchCreateElements!([nodeType], [edge]);

        }
    }

    // Empty function for saving changes - to be implemented by user
    const handleSaveChanges = (data: Record<string, any>) => {
        // TODO: Implement save logic here
        console.log("Save changes:", data);
    }

    const handleFieldChange = (fieldName: string, value: any) => {
        setEditorData(prev => ({
            ...prev,
            [fieldName]: value
        }));
    }

    return (
        <>

            <Fade in={showJsonEditor} timeout={200} unmountOnExit>
                <div style={{
                    position:"absolute",
                    height:"100%",
                    width:"calc(100vw - 100%)",
                    backgroundColor:"var(--nodius-background-paper)",
                    top: "0",
                    left:"100%",
                    zIndex:"1",
                    boxShadow: "rgba(0, 0, 0, 0.35) 0px 0px 6px 0px inset",
                }}>
                    <div style={{
                        margin: "16px",
                        padding: "16px",
                        background: Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02),
                        borderRadius: "8px",
                        border: `1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)}`
                    }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "16px",
                            paddingBottom: "12px",
                            borderBottom: `2px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)}`
                        }}>
                            <h6 style={{margin: 0, fontSize: "15px", fontWeight: 600}}>
                                Configure Entry Data
                            </h6>
                            <button
                                onClick={() => handleSaveChanges(editorData)}
                                style={{
                                    background: "var(--nodius-success-main)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    padding: "8px 16px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    transition: "var(--nodius-transition-default)"
                                }}
                            >
                                Save Changes
                            </button>
                        </div>

                        <div style={{
                            overflowY: "auto",
                            paddingRight: "8px"
                        }}>
                            {Project.state.currentEntryDataType && Project.state.currentEntryDataType.types.map((field, index) => (
                                <RecursiveFieldEditor
                                    key={index}
                                    field={field}
                                    value={editorData[field.name]}
                                    onChange={(value) => handleFieldChange(field.name, value)}
                                    allDataTypes={Project.state.dataTypes}
                                />
                            ))}
                        </div>

                        {Project.state.currentEntryDataType && Project.state.currentEntryDataType.types.length === 0 && (
                            <div style={{
                                textAlign: "center",
                                padding: "32px",
                                opacity: 0.6,
                                fontSize: "14px"
                            }}>
                                This data type has no fields defined yet.
                            </div>
                        )}
                    </div>
                </div>
            </Fade>
            <div style={{display:"flex", flexDirection:"column", gap:"16px", padding:"16px", height:"100%", width:"100%"}}>

                {/* Header Section */}
                <div style={{
                    display:"flex",
                    flexDirection:"row",
                    gap:"12px",
                    alignItems:"center",
                    borderBottom:"2px solid var(--nodius-primary-main)",
                    paddingBottom:"12px"
                }}>
                    <div style={{
                        background: "var(--nodius-primary-main)",
                        borderRadius: "8px",
                        padding: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
                        <Cable height={24} width={24} color="white"/>
                    </div>
                    <div style={{display:"flex", flexDirection:"column"}}>
                        <h5 style={{fontSize:"18px", fontWeight:"600", margin:"0"}}>Entry Data Type</h5>
                        <p style={{fontSize:"12px", opacity:"0.7", margin:"0"}}>Configure graph input requirements</p>
                    </div>
                </div>

                {/* Info Card - What is Entry Data Type */}
                <div className={infoCardClass}>
                    <div className="info-header">
                        <Info height={18} width={18}/>
                        <span>What is an Entry Data Type?</span>
                    </div>
                    <div className="info-content">
                        An entry data type defines the required input data structure that this graph expects to receive when executed.
                        It ensures your workflow receives the correct data format to function properly.
                    </div>
                </div>

                {/* Main Content */}
                <div style={{padding:"0px", height:"100%", width:"100%", position:"relative"}}>
                    <div style={{position:"absolute", inset:"0px", overflowY:"auto", paddingRight:"4px"}}>
                        <div style={{display:"flex", flexDirection:"column"}}>

                            {/* Data Type Selector */}
                            <div className={`${selectInputDataButton} ${showSelect ? "active" : "inactive"}`} onClick={!showSelect ? () => setShowSelect(!showSelect) : undefined}>
                                <div style={{display:"flex", flexDirection:"row", justifyContent:"space-between", alignItems:"center"}}>
                                    <div style={{display:"flex", alignItems:"center", gap:"8px"}}>
                                        <Search height={18} width={18}/>
                                        <p style={{margin:"0", fontWeight:"500"}}>
                                            {Project.state.currentEntryDataType ? "Change Data Type" : "Select Data Type"}
                                        </p>
                                    </div>
                                    <div className={"close"} style={{display:"flex", alignItems:"center"}}>
                                        {showSelect ? (
                                            <ChevronUp onClick={() => setShowSelect(!showSelect)} height={20} width={20}/>
                                        ) : (
                                            <ChevronDown height={20} width={20}/>
                                        )}
                                    </div>
                                </div>
                                <Collapse in={showSelect}>
                                    <div style={{marginTop:"12px", display:"flex", flexDirection:"column", gap:"8px"}}>
                                        <Input
                                            type={"text"}
                                            placeholder={"Search data types..."}
                                            value={searchValue}
                                            onChange={(value) => setSearchValue(value)}
                                            startIcon={<Search height={18} width={18}/>}
                                        />
                                        <div style={{maxHeight:"300px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"8px", marginTop:"8px"}}>
                                            {searchedDataTypes ? (
                                                searchedDataTypes.length > 0 ? (
                                                    searchedDataTypes.map((dataType, i) => (
                                                        <div
                                                            key={i}
                                                            className={`${dataTypeSelectionButtonClass} ${Project.state.currentEntryDataType?._key === dataType._key ? "active" : ""}`}
                                                            onClick={async () => await setEntryType(dataType)}
                                                        >
                                                            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                                                                <span style={{fontWeight:"500", fontSize:"14px"}}>
                                                                    {dataType.name}
                                                                </span>
                                                                {Project.state.currentEntryDataType?._key === dataType._key && (
                                                                    <Check height={18} width={18}/>
                                                                )}
                                                            </div>
                                                            {dataType.description && (
                                                                <span style={{fontSize:"12px", opacity:"0.7"}}>
                                                                    {dataType.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{padding:"20px", textAlign:"center", opacity:"0.6"}}>
                                                        No data types found matching "{searchValue}"
                                                    </div>
                                                )
                                            ) : (
                                                <div style={{padding:"20px", textAlign:"center", opacity:"0.6"}}>
                                                    Loading data types...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Collapse>
                            </div>

                            {/* Selected Type Display or Empty State */}
                            {Project.state.currentEntryDataType ? (
                                <div className={selectedTypeCardClass}>
                                    <div className="type-header">
                                        <div style={{flex:1}}>
                                            <div className="type-badge">
                                                <Check height={14} width={14}/>
                                                Active
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="type-name">{Project.state.currentEntryDataType.name}</div>
                                        {Project.state.currentEntryDataType.description && (
                                            <div className="type-description" style={{marginTop:"8px"}}>
                                                {Project.state.currentEntryDataType.description}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className="view-button"
                                        onClick={() => setShowJsonEditor(!showJsonEditor)}
                                    >
                                        <Edit3 height={16} width={16}/>
                                        {showJsonEditor ? "Hide" : "Edit"} Type Values
                                    </button>
                                </div>
                            ) : (
                                <div className={emptyStateClass}>
                                    <AlertCircle className="empty-icon" height={48} width={48}/>
                                    <div className="empty-title">No Entry Type Selected</div>
                                    <div className="empty-description">
                                        This graph currently has no entry data type configured.
                                        Select a data type above to define what input this graph expects.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
});
LeftPanelEntryTypeSelect.displayName = "LeftPanelEntryTypeSelect";