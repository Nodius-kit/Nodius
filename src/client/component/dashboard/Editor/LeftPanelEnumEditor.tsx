import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import {allDataTypes, DataTypeClass, EnumClass} from "../../../../utils/dataType/dataType";
import {Binary, FileUp, List, ListTree, Plus, Search, Trash2, X, Info, AlertCircle} from "lucide-react";
import {Input} from "../../form/Input";
import {Fade} from "../../animate/Fade";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {InputTransparent} from "../../form/InputTransparent";
import {deepCopy} from "../../../../utils/objectUtils";
import {api_type_delete} from "../../../../utils/requests/type/api_type.type";
import {ResponsiveTable} from "../../form/ResponsiveTable";
import {SelectTransparent} from "../../form/SelectTransparent";

interface LeftPanelEnumEditorProps {

}

export const LeftPanelEnumEditor = memo((
    {

    }:LeftPanelEnumEditorProps
) => {

    const [enums, setEnums] = useState<EnumClass[]|undefined>(undefined);
    const [searchValue, setSearchValue] = useState<string>("");

    const [editingClass, setEditingClass] = useState<EnumClass>();

    const Theme = useContext(ThemeContext);

    const searchedEnum: EnumClass[]|undefined = useMemo(() => enums ? enums.filter((data) => data.name.toLowerCase().includes(searchValue.toLowerCase())) : undefined,[enums, searchValue]);

    useEffect(() => {
        retrieveEnum();
    }, []);

    const retrieveEnumAbordController = useRef<AbortController>(undefined);
    const retrieveEnum = async () => {
        if(retrieveEnumAbordController.current) {
            retrieveEnumAbordController.current.abort();
        }
        retrieveEnumAbordController.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/enum/list`, {
            method: "POST",
            signal: retrieveEnumAbordController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspace: "root"
            })
        });
        if(response.status === 200) {
            const json:EnumClass[] = await response.json();
            setEnums(json);
            if(!editingClass && json.length > 0) {
                setEditingClass(json[0]);
            }
        }else {
            setEnums([]);
        }
    }

    const addEnumPromptAbortController = useRef<AbortController>(undefined);
    const addEnumPrompt = async () => {
        const name = prompt("name:");
        if(name == undefined) {
            return;
        }
        if(addEnumPromptAbortController.current) {
            addEnumPromptAbortController.current.abort();
        }
        addEnumPromptAbortController.current = new AbortController();


        const body: Omit<EnumClass, "_key"> = {
            name: name,
            enum: [],
            workspace: "root",
            description: "",
        }
        const response = await fetch(`http://localhost:8426/api/enum/create`, {
            method: "POST",
            signal: addEnumPromptAbortController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if(response.status === 200) {
            const json:EnumClass = await response.json();
            setEnums([...(enums ?? []), json]);
            if(!editingClass) {
                setEditingClass(json);
            }
        }
    }

    const addEnumFromJsonPromptAbortController = useRef<AbortController>(undefined);
    const addEnumFromJsonPrompt = async () => {

    }

    const nextClassUpdateExecution = useRef<Record<string, {timeout: NodeJS.Timeout, abort:AbortController}>>({});
    const requestEditingClassUpdate = (newEditingClass:EnumClass) => {
        if(!enums) return;
        setEditingClass(newEditingClass);
        setEnums(enums.map((type) => {
            if(type._key === newEditingClass._key) {
                return newEditingClass
            }
            return type;
        }));

        if( newEditingClass.name.length > 2 && !(enums??[]).some((d) => d._key !== newEditingClass._key && d.name.toLowerCase() == newEditingClass.name)) {
            if(nextClassUpdateExecution.current[newEditingClass._key]) {
                clearTimeout(nextClassUpdateExecution.current[newEditingClass._key].timeout);
                nextClassUpdateExecution.current[newEditingClass._key].abort.abort();
            }
            const fixedClass = deepCopy(newEditingClass);
            const abort = new AbortController();
            nextClassUpdateExecution.current[newEditingClass._key] = {timeout: setTimeout(async () => {
                    const response = await fetch(`http://localhost:8426/api/enum/update`, {
                        method: "POST",
                        signal: abort.signal,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(fixedClass)
                    });
                }, 5000), abort: abort};
        }

    }

    const deleteClassAbortController = useRef<AbortController>(undefined);
    const deleteClass = async () => {
        if(!editingClass || !enums) return;
        if(deleteClassAbortController.current) {
            deleteClassAbortController.current.abort();
        }
        deleteClassAbortController.current = new AbortController();

        const body:api_type_delete = {
            key: editingClass._key,
            workspace: "root",
        }

        const response = await fetch(`http://localhost:8426/api/enum/delete`, {
            method: "POST",
            signal: deleteClassAbortController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if(response.status === 200) {
            const newDataType = enums.filter((d) => d._key !== editingClass._key);
            setEnums(newDataType);
            setEditingClass(newDataType.length > 0 ? newDataType[0] : undefined);
        }
    }

    const enumSelectionButtonClass = useDynamicClass(`
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
            margin-bottom: 16px;
        }

        & .info-header {
            display: flex;
            alignItems: center;
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

    const emptyStateClass = useDynamicClass(`
        & {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.03)};
            border: 2px dashed ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.15)};
            border-radius: 12px;
            padding: 32px 20px;
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

    const addEntry = async () => {
        if(!editingClass) return;
        const newEditingClass = {...editingClass};
        newEditingClass.enum.push("");
        requestEditingClassUpdate(newEditingClass);
    }

    return (
        <>
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
                <Fade in={editingClass != undefined} unmountOnExit={true} timeout={300} >
                    <div style={{height:"100%", width:"100%", position:"relative"}}>
                        <div style={{
                            position:"absolute",
                            top:"0px",
                            left:"0px",
                            width:"calc(100% - 32px)",
                            maxHeight:"100%",
                            overflowY:"auto",
                            margin:"16px",
                            padding:"24px",
                            backgroundColor:"var(--nodius-background-default)",
                            borderRadius:"8px",
                            display:"flex",
                            flexDirection:"column",
                            gap:"8px"
                        }}>
                            <div style={{display:"flex", flexDirection:"row", alignItems:"center", gap:"12px"}}>
                                <InputTransparent value={editingClass?.name ?? ""} setValue={(value) => {
                                    if(!editingClass) return;
                                    const newEditingClass = {...editingClass};
                                    newEditingClass.name = value.replace(/[^a-zA-Z0-9-_]/g, "");
                                    requestEditingClassUpdate(newEditingClass);
                                }} style={{fontSize:"24px", fontWeight:"500", flex:"1"}} minLength={2}
                                                  valid={!(enums??[]).some((d) => d._key !== editingClass?._key && d.name.toLowerCase() == editingClass?.name)}/>

                                <div>
                                    <Trash2 color={"var(--nodius-red-500)"} style={{cursor:"pointer"}} onClick={deleteClass}/>
                                </div>
                            </div>

                            {(editingClass?.name.length ?? 2) < 2 ? (
                                <p style={{color:"var(--nodius-red-500)",fontSize:"16px", fontWeight:"300"}}>Name must be at least 2 characters long.</p>
                            ) : (enums??[]).some((d) => d._key !== editingClass?._key && d.name.toLowerCase() == editingClass?.name) ? (
                                <p>Name '{editingClass?.name} already in use.'</p>
                            ) : null}
                            <InputTransparent value={editingClass?.description ?? ""} setValue={(value) => {
                                if(!editingClass) return;
                                const newEditingClass = {...editingClass};
                                newEditingClass.description = value;
                                requestEditingClassUpdate(newEditingClass);
                            }} style={{fontSize:"16px", fontWeight:"400"}} placeholder={"Data Type description..."}/>

                            <ResponsiveTable draggeable={true} draggeableMoveIndex={(from, to) => {
                                if(!editingClass) return;
                                const newArrayType = editingClass.enum;
                                const [movedItem] = newArrayType.splice(from, 1);
                                newArrayType.splice(to, 0, movedItem);
                                const newEditingClass = {
                                    ...editingClass,
                                    types: newArrayType
                                };
                                setEditingClass(newEditingClass);
                                requestEditingClassUpdate(newEditingClass);
                            }}>
                                <table>
                                    <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th style={{textAlign:"center", width:"200px"}}>Actions</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {(editingClass?.enum??[]).mapOrElse((e, i) => {
                                            return (
                                                <tr key={i}>
                                                    <td>
                                                        <InputTransparent
                                                            value={e }
                                                            setValue={(value) => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.enum = newEditingClass.enum.map((t, i2) => {
                                                                    if(i2 === i) {
                                                                        return value.replace(/[^a-zA-Z0-9-_]/g, "")
                                                                    } else {
                                                                        return t;
                                                                    }
                                                                });
                                                                requestEditingClassUpdate(newEditingClass);
                                                            }}
                                                            placeholder={"[No Name]"}
                                                            style={{
                                                                fontSize:"16px", fontWeight:"500", flex:"1",
                                                                borderColor:(editingClass?.enum??[]).some((d, i2) => i2 !== i && d.toLowerCase() == e) ? "var(--nodius-red-500)" : undefined
                                                            }}
                                                            minLength={2}
                                                            valid={!(editingClass?.enum??[]).some((d, i2) => i2 !== i && d.toLowerCase() == e)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{display:"flex", flexDirection:"row", gap:"8px", justifyContent:"center"}}>
                                                            <Trash2 color={"var(--nodius-red-500)"} style={{cursor:"pointer"}} onClick={() => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.enum = newEditingClass.enum.filter((t, i2) => i2 !== i);
                                                                requestEditingClassUpdate(newEditingClass);
                                                            }}/>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        }
                                        , () => (<tr></tr>))}
                                    </tbody>
                                </table>
                            </ResponsiveTable>

                            <button onClick={addEntry}>
                                <Plus /> Add entry
                            </button>
                        </div>
                    </div>
                </Fade>
            </div>


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
                        <List height={24} width={24} color="white"/>
                    </div>
                    <div style={{display:"flex", flexDirection:"column", flex:"1"}}>
                        <h5 style={{fontSize:"18px", fontWeight:"600", margin:"0"}}>Enumerations</h5>
                        <p style={{fontSize:"12px", opacity:"0.7", margin:"0"}}>Define predefined value sets</p>
                    </div>
                    <div
                        style={{
                            padding:"8px",
                            borderRadius:"8px",
                            backgroundColor: "var(--nodius-primary-main)",
                            display:"flex",
                            alignItems:"center",
                            justifyContent:"center",
                            cursor:"pointer",
                            transition:"var(--nodius-transition-default)"
                        }}
                        onClick={addEnumPrompt}
                        title="Create new enum"
                    >
                        <Plus height={20} width={20} color="white"/>
                    </div>
                </div>

                {/* Info Card */}
                <div className={infoCardClass}>
                    <div className="info-header">
                        <Info height={18} width={18}/>
                        <span>What are Enums?</span>
                    </div>
                    <div className="info-content">
                        Enumerations define a fixed set of allowed values. Use enums to restrict choices and ensure data consistency across your workflow.
                    </div>
                </div>

                {/* Search Bar */}
                <Input
                    type={"text"}
                    placeholder={"Search enums..."}
                    value={searchValue}
                    onChange={(value) => setSearchValue(value)}
                    startIcon={<Search height={18} width={18}/>}
                />

                {/* Enum List */}
                <div style={{padding:"0px", height:"100%", width:"100%", position:"relative"}}>
                    <div style={{position:"absolute", inset:"0px", overflowY:"auto", paddingRight:"4px"}}>
                        {searchedEnum ? (
                            searchedEnum.length > 0 ? (
                                <div style={{display:"flex", flexDirection:"column", gap:"8px"}}>
                                    {searchedEnum.map((enum_, i) => (
                                        <div
                                            key={i}
                                            className={`${enumSelectionButtonClass} ${editingClass?._key === enum_._key ? "active" : ""}`}
                                            onClick={() => setEditingClass(enum_)}
                                        >
                                            <span style={{fontWeight:"500", fontSize:"14px"}}>{enum_.name}</span>
                                            {enum_.description && (
                                                <span style={{fontSize:"12px", opacity:"0.7"}}>
                                                    {enum_.description}
                                                </span>
                                            )}
                                            <span style={{fontSize:"12px", opacity:"0.6"}}>
                                                {enum_.enum.length} {enum_.enum.length === 1 ? 'value' : 'values'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={emptyStateClass}>
                                    <AlertCircle className="empty-icon" height={48} width={48}/>
                                    <div className="empty-title">No Enums Found</div>
                                    <div className="empty-description">
                                        {searchValue ? `No enums match "${searchValue}". Try a different search term.` : "No enums created yet. Click the + button to create your first enum."}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div style={{padding:"20px", textAlign:"center", opacity:"0.6"}}>
                                Loading enums...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>

    )
});
LeftPanelEnumEditor.displayName = "LeftPanelTypeEditor";