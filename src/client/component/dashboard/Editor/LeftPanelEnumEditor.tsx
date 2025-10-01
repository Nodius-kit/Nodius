import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import {allDataTypes, DataTypeClass, EnumClass} from "../../../../utils/dataType/dataType";
import {Binary, FileUp, List, ListTree, Plus, Search, Trash2, X} from "lucide-react";
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
            padding: 3px 12px;
            border-radius: 6px;
        }
        
        &:hover {
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.08)};
        }
        
        &.active {
            background-color: var(--nodius-primary-main)
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


            <div style={{display:"flex", flexDirection:"column", gap:"16px", padding:"8px", height:"100%", width:"100%"}}>

                <div style={{display:"flex", flexDirection:"row", gap:"10px",alignItems:"center", borderBottom:"2px solid var(--nodius-background-paper)", paddingBottom:"5px"}}>
                    <List height={26} width={26}/>
                    <h5 style={{fontSize:"16px", fontWeight:"400"}}>Enums</h5>
                    <div style={{display:"flex", flex:"1", justifyContent:"right", gap:"8px", flexDirection:"row"}}>
                        <div
                            style={{padding:"4px", borderRadius:"8px", backgroundColor: "var(--nodius-primary-main)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer"}}
                            onClick={addEnumPrompt}
                        >
                            <Plus height={20} width={20} />
                        </div>
                    </div>
                </div>

                <Input
                    type={"text"}
                    placeholder={"Search Enums..."}
                    value={searchValue}
                    onChange={(value) => setSearchValue(value)}
                    startIcon={<Search height={18} width={18}/>}
                />
                <div style={{padding:"5px", height:"100%", width:"100%", position:"relative"}}>
                    <div style={{position:"absolute", inset:"0px", overflowY:"auto"}}>
                        {searchedEnum ? (
                            searchedEnum.map((enum_, i) => (
                                <div
                                    key={i}
                                    className={`${enumSelectionButtonClass} ${editingClass?._key === enum_._key ? "active" : ""}`}
                                    onClick={() => setEditingClass(enum_)}
                                    style={{marginTop:i > 0 ? "6px" : "0px"}}
                                >
                                    {enum_.name}
                                </div>
                            ))
                        ) : "loading"}
                    </div>
                </div>
            </div>
        </>

    )
});
LeftPanelEnumEditor.displayName = "LeftPanelTypeEditor";