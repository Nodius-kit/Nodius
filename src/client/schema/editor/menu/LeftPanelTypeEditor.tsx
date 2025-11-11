/**
 * @file LeftPanelTypeEditor.tsx
 * @description Custom data type definition and management editor
 * @module dashboard/Editor
 *
 * Allows users to create and manage custom data types for their project:
 * - Define new data types with multiple fields
 * - Edit existing type definitions
 * - Delete unused types
 * - Search and filter types by name
 * - Configure field types (string, number, boolean, object, array, enum, etc.)
 *
 * Features:
 * - Inline type editing with live validation
 * - Support for complex nested types (objects, arrays)
 * - Reference to other custom types and enums
 * - Field-level configuration (required, default values)
 * - Type usage tracking (prevents deletion of types in use)
 * - Import/export type definitions
 *
 * Types defined here can be used in entry types, node configurations,
 * and throughout the workflow system for type-safe data handling.
 */

import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import {allDataTypes, DataTypeClass, DataTypeConfig} from "../../../../utils/dataType/dataType";
import {Binary, FileUp, ListTree, Plus, Search, Trash2, X, Info, AlertCircle} from "lucide-react";

import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {deepCopy} from "../../../../utils/objectUtils";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {api_type_delete} from "../../../../utils/requests/type/api_type.type";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {Fade} from "../../../component/animate/Fade";
import {InputTransparent} from "../../../component/form/InputTransparent";
import {ResponsiveTable} from "../../../component/ResponsiveTable";
import {Input} from "../../../component/form/Input";
import {Select} from "../../../component/form/Select";
import {SelectTransparent} from "../../../component/form/SelectTransparent";

interface LeftPanelTypeEditorProps {

}

export const LeftPanelTypeEditor = memo((
    {

    }:LeftPanelTypeEditorProps
) => {

    const Project = useContext(ProjectContext);

    const [searchValue, setSearchValue] = useState<string>("");

    const [editingClass, setEditingClass] = useState<DataTypeClass>();

    const [newlyCreatedTypeIds, setNewlyCreatedTypeIds] = useState<Set<string>>(new Set());

    const Theme = useContext(ThemeContext);

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

    const addTypePromptAbortController = useRef<AbortController>(undefined);
    const addTypePrompt = async () => {
        const name = prompt("name:");
        if(name == undefined) {
            return;
        }
        if(addTypePromptAbortController.current) {
            addTypePromptAbortController.current.abort();
        }
        addTypePromptAbortController.current = new AbortController();


        const body: Omit<DataTypeClass, "_key"> = {
            name: name,
            types: [],
            workspace: "root",
            description: "",
        }
        const response = await fetch(`/api/type/create`, {
            method: "POST",
            signal: addTypePromptAbortController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if(response.status === 200) {
            const json:DataTypeClass = await response.json();
            Project.dispatch({
                field: "dataTypes",
                value: [...(Project.state.dataTypes ?? []), json]
            })
            // Mark as newly created
            setNewlyCreatedTypeIds(prev => new Set(prev).add(json._key));
            if(!editingClass) {
                setEditingClass(json);
            }
        }
    }

    const addTypeFromJsonPromptAbortController = useRef<AbortController>(undefined);
    const addTypeFromJsonPrompt = async () => {
        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json,.json';
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const jsonData = JSON.parse(text);

                if (addTypeFromJsonPromptAbortController.current) {
                    addTypeFromJsonPromptAbortController.current.abort();
                }
                addTypeFromJsonPromptAbortController.current = new AbortController();

                // Track all created types to avoid collisions
                const usedNames = new Set((Project.state.dataTypes ?? []).map(dt => dt.name.toLowerCase()));
                const createdTypes: DataTypeClass[] = [];

                // Helper function to get unique name
                const getUniqueName = (baseName: string): string => {
                    let name = baseName;
                    let counter = 0;
                    while (usedNames.has(name.toLowerCase())) {
                        counter++;
                        name = baseName + '-' + counter;
                    }
                    usedNames.add(name.toLowerCase());
                    return name;
                };

                // Helper function to detect data type from value
                const detectType = (value: any): string => {
                    if (value === null || value === undefined) return 'str';
                    if (typeof value === 'boolean') return 'bool';
                    if (typeof value === 'number') {
                        return Number.isInteger(value) ? 'int' : 'db';
                    }
                    if (typeof value === 'string') return 'str';
                    if (Array.isArray(value)) {
                        // Return type of first element if array not empty
                        return value.length > 0 ? detectType(value[0]) : 'str';
                    }
                    // Complex object - will need its own type
                    return 'dataType';
                };

                // Recursive function to create types from JSON structure
                const createTypeFromObject = async (obj: any, typeName: string): Promise<DataTypeClass> => {
                    const uniqueName = getUniqueName(typeName);
                    const types: DataTypeClass['types'] = [];

                    for (const [key, value] of Object.entries(obj)) {
                        const isArray = Array.isArray(value);
                        const actualValue = isArray ? value[0] : value;
                        let typeId = detectType(actualValue);
                        let nestedTypeKey: string | undefined;

                        // If it's a complex object, create a nested type
                        if (typeId === 'dataType' && actualValue && typeof actualValue === 'object') {
                            const nestedType = await createTypeFromObject(actualValue, key);
                            createdTypes.push(nestedType);
                            nestedTypeKey = nestedType._key;
                        }

                        types.push({
                            name: key,
                            typeId: nestedTypeKey ? 'dataType' : typeId,
                            isArray: isArray,
                            required: false,
                            defaultValue: nestedTypeKey ? nestedTypeKey : (
                                actualValue !== null && actualValue !== undefined && !isArray && typeId !== 'dataType'
                                    ? String(actualValue)
                                    : undefined
                            )
                        });
                    }

                    // Create the type via API
                    const body: Omit<DataTypeClass, "_key"> = {
                        name: uniqueName,
                        types: types,
                        workspace: "root",
                        description: "Generated from JSON",
                    };

                    const response = await fetch(`/api/type/create`, {
                        method: "POST",
                        signal: addTypeFromJsonPromptAbortController.current!.signal,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    });

                    if (response.status === 200) {
                        const createdType: DataTypeClass = await response.json();
                        return createdType;
                    } else {
                        throw new Error('Failed to create type: ' + uniqueName);
                    }
                };

                // Process root level
                const rootTypeName = getUniqueName('untitled');
                const rootTypes: DataTypeClass['types'] = [];

                // Process each root key
                for (const [key, value] of Object.entries(jsonData)) {
                    const isArray = Array.isArray(value);
                    const actualValue = isArray ? value[0] : value;
                    let typeId = detectType(actualValue);
                    let nestedTypeKey: string | undefined;

                    // If it's a complex object, create a nested type
                    if (typeId === 'dataType' && actualValue && typeof actualValue === 'object') {
                        const nestedType = await createTypeFromObject(actualValue, key);
                        createdTypes.push(nestedType);
                        nestedTypeKey = nestedType._key;
                    }

                    rootTypes.push({
                        name: key,
                        typeId: nestedTypeKey ? 'dataType' : typeId,
                        isArray: isArray,
                        required: false,
                        defaultValue: nestedTypeKey ? nestedTypeKey : (
                            actualValue !== null && actualValue !== undefined && !isArray && typeId !== 'dataType'
                                ? String(actualValue)
                                : undefined
                        )
                    });
                }

                // Create root type
                const rootBody: Omit<DataTypeClass, "_key"> = {
                    name: rootTypeName,
                    types: rootTypes,
                    workspace: "root",
                    description: "Generated from JSON (root)",
                };

                const rootResponse = await fetch(`/api/type/create`, {
                    method: "POST",
                    signal: addTypeFromJsonPromptAbortController.current.signal,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(rootBody)
                });

                if (rootResponse.status === 200) {
                    const rootType: DataTypeClass = await rootResponse.json();
                    createdTypes.push(rootType);

                    // Update state with all created types
                    Project.dispatch({
                        field: "dataTypes",
                        value: [...(Project.state.dataTypes ?? []), ...createdTypes]
                    });

                    // Mark all created types as new
                    setNewlyCreatedTypeIds(prev => {
                        const newSet = new Set(prev);
                        createdTypes.forEach(type => newSet.add(type._key));
                        return newSet;
                    });

                    // Set the root type as the editing class
                    setEditingClass(rootType);

                    console.log('Created types:', createdTypes.map(t => t.name).join(', '));
                } else {
                    throw new Error('Failed to create root type');
                }

            } catch (error) {
                console.error('Error processing JSON:', error);
                alert('Failed to process JSON: ' + (error as Error).message);
            }

            // Cleanup
            fileInput.remove();
        });

        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
    }

    const nextClassUpdateExecution = useRef<Record<string, {timeout: NodeJS.Timeout, abort:AbortController}>>({});
    const requestEditingClassUpdate = (newEditingClass:DataTypeClass) => {
        if(!Project.state.dataTypes) return;
        setEditingClass(newEditingClass);
        Project.dispatch({
            field: "dataTypes",
            value: (Project.state.dataTypes.map((type) => {
                if (type._key === newEditingClass._key) {
                    return newEditingClass
                }
                return type;
            }))
        });

        if( newEditingClass.name.length > 2 && !(Project.state.dataTypes??[]).some((d) => d._key !== newEditingClass._key && d.name.toLowerCase() == newEditingClass.name)) {
            if(nextClassUpdateExecution.current[newEditingClass._key]) {
                clearTimeout(nextClassUpdateExecution.current[newEditingClass._key].timeout);
                nextClassUpdateExecution.current[newEditingClass._key].abort.abort();
            }
            const fixedClass = deepCopy(newEditingClass);
            const abort = new AbortController();
            nextClassUpdateExecution.current[newEditingClass._key] = {timeout: setTimeout(async () => {
                    const response = await fetch(`/api/type/update`, {
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
        if(!editingClass || !Project.state.dataTypes) return;
        if(deleteClassAbortController.current) {
            deleteClassAbortController.current.abort();
        }
        deleteClassAbortController.current = new AbortController();

        const body:api_type_delete = {
            key: editingClass._key,
            workspace: "root",
        }

        const response = await fetch(`/api/type/delete`, {
            method: "POST",
            signal: deleteClassAbortController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if(response.status === 200) {
            // Find current index before deletion
            const currentIndex = Project.state.dataTypes.findIndex(d => d._key === editingClass._key);
            const newDataType = Project.state.dataTypes.filter((d) => d._key !== editingClass._key);

            Project.dispatch({
                field: "dataTypes",
                value: newDataType
            });

            // Remove from newly created set if present
            setNewlyCreatedTypeIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(editingClass._key);
                return newSet;
            });

            // Select next index, or previous if at end, or undefined if none left
            if (newDataType.length > 0) {
                const nextIndex = currentIndex < newDataType.length ? currentIndex : currentIndex - 1;
                setEditingClass(newDataType[Math.max(0, nextIndex)]);
            } else {
                setEditingClass(undefined);
            }
        }
    }

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
            margin-bottom: 16px;
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


        const dataType = allDataTypes[0];

        const temporaryName = "Temporary";
        let temporyId = 0;

        while(newEditingClass.types.some((t) => t.name.toLowerCase() === (temporaryName+"-"+temporyId).toLowerCase())) {
            temporyId++;
        }


        newEditingClass.types.push({
            typeId: dataType.id,
            name: temporaryName+"-"+temporyId,
            isArray: false,
            required: false,
        });

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
                                                  valid={!(Project.state.dataTypes??[]).some((d) => d._key !== editingClass?._key && d.name.toLowerCase() == editingClass?.name)}/>

                                <div>
                                    <Trash2 color={"var(--nodius-red-500)"} style={{cursor:"pointer"}} onClick={deleteClass}/>
                                </div>
                            </div>

                            {(editingClass?.name.length ?? 2) < 2 ? (
                                <p style={{color:"var(--nodius-red-500)",fontSize:"16px", fontWeight:"300"}}>Name must be at least 2 characters long.</p>
                            ) : (Project.state.dataTypes??[]).some((d) => d._key !== editingClass?._key && d.name.toLowerCase() == editingClass?.name) ? (
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
                                const newArrayType = editingClass.types;
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
                                        <th>Data Type</th>
                                        <th>Default Value</th>
                                        <th style={{textAlign:"center"}}>Is Array</th>
                                        <th style={{textAlign:"center", width:"200px"}}>Actions</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {(editingClass?.types??[]).mapOrElse((type, i) => {
                                            const dataType = allDataTypes.find((dt) => dt.id === type.typeId);
                                            return (
                                                <tr key={i}>
                                                    <td>
                                                        <InputTransparent
                                                            value={type.name }
                                                            setValue={(value) => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                    if(i2 === i) {
                                                                        return {
                                                                            ...t,
                                                                            name: value.replace(/[^a-zA-Z0-9-_]/g, "")
                                                                        }
                                                                    } else {
                                                                        return t;
                                                                    }
                                                                });
                                                                requestEditingClassUpdate(newEditingClass);
                                                            }}
                                                            style={{
                                                                fontSize:"16px", fontWeight:"500", flex:"1",
                                                                borderColor: (editingClass?.types??[]).some((d, i2) => i2 !== i && d.name.toLowerCase() == type.name) ? "var(--nodius-red-500)" : undefined
                                                            }}
                                                            minLength={2}
                                                            valid={!(editingClass?.types??[]).some((d, i2) => i2 !== i && d.name.toLowerCase() == type.name)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <SelectTransparent
                                                            value={dataType?.id ?? "unknow"}
                                                            setValue={(value) => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                    if(i2 === i) {
                                                                        return {
                                                                            ...t,
                                                                            typeId: value
                                                                        }
                                                                    } else {
                                                                        return t;
                                                                    }
                                                                });
                                                                requestEditingClassUpdate(newEditingClass);
                                                            }}
                                                            options={[...allDataTypes.map((dt) => ({
                                                                label: dt.name,
                                                                value: dt.id,
                                                            })), {
                                                                label:"Unknown",
                                                                value: "unknown",
                                                                disabled: true,
                                                            }]}
                                                        />
                                                    </td>
                                                    <td>
                                                        {dataType?.listDefaultValue ? (
                                                            dataType.listDefaultValue ? (
                                                                <Select
                                                                    options={[...dataType.listDefaultValue(preparedType[dataType.id]), {
                                                                        disabled: true,
                                                                        value:"null",
                                                                        label: "None"
                                                                    }]}
                                                                    value={type.defaultValue ?? "null"}
                                                                    endIcon={<X style={{cursor:"pointer", opacity:"0.5"}} size={16} onClick={() => {
                                                                        if(!editingClass) return;
                                                                        const newEditingClass = {...editingClass};
                                                                        newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                            if(i2 === i) {
                                                                                return {
                                                                                    ...t,
                                                                                    defaultValue: undefined
                                                                                }
                                                                            } else {
                                                                                return t;
                                                                            }
                                                                        });
                                                                        requestEditingClassUpdate(newEditingClass);
                                                                    }} />}

                                                                    onChange={(value) => {
                                                                        if(!editingClass) return;
                                                                        const newEditingClass = {...editingClass};
                                                                        newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                            if(i2 === i) {
                                                                                return {
                                                                                    ...t,
                                                                                    defaultValue: value
                                                                                } as DataTypeConfig
                                                                            } else {
                                                                                return t;
                                                                            }
                                                                        });
                                                                        requestEditingClassUpdate(newEditingClass);
                                                                    }}
                                                                    selectStyle={{height:"32px", padding:"2px 0px 2px 12px"}}
                                                                />
                                                            ) : (
                                                                <Input
                                                                    type={"text"}
                                                                    inputStyle={{height:"32px"}}
                                                                    containerStyle={{
                                                                        borderColor:type.defaultValue != undefined && type.defaultValue != "" && (
                                                                            type.isArray ? type.defaultValue.split("|").some((v) => !dataType?.is(v) )
                                                                                :
                                                                                !dataType?.is(type.defaultValue)
                                                                        ) ? "var(--nodius-red-500)" : undefined
                                                                    }}
                                                                    value={type.defaultValue}
                                                                    endIcon={<X style={{cursor:"pointer", opacity:"0.5"}} size={16} onClick={() => {
                                                                        if(!editingClass) return;
                                                                        const newEditingClass = {...editingClass};
                                                                        newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                            if(i2 === i) {
                                                                                return {
                                                                                    ...t,
                                                                                    defaultValue: undefined
                                                                                }
                                                                            } else {
                                                                                return t;
                                                                            }
                                                                        });
                                                                        requestEditingClassUpdate(newEditingClass);
                                                                    }} />}
                                                                    onChange={(value) => {
                                                                        if(!editingClass) return;
                                                                        const newEditingClass = {...editingClass};
                                                                        newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                            if(i2 === i) {
                                                                                return {
                                                                                    ...t,
                                                                                    defaultValue: value
                                                                                }
                                                                            } else {
                                                                                return t;
                                                                            }
                                                                        });
                                                                        requestEditingClassUpdate(newEditingClass);
                                                                    }}
                                                                />
                                                            )
                                                        ):null}
                                                    </td>
                                                    <td style={{textAlign:"center"}}>
                                                        <input
                                                            type={"checkbox"}
                                                            checked={type.isArray}
                                                            onChange={() => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.types = newEditingClass.types.map((t, i2) => {
                                                                    if(i2 === i) {
                                                                        return {
                                                                            ...t,
                                                                            isArray: !t.isArray,
                                                                        }
                                                                    } else {
                                                                        return t;
                                                                    }
                                                                });
                                                                requestEditingClassUpdate(newEditingClass);
                                                            }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{display:"flex", flexDirection:"row", gap:"8px", justifyContent:"center"}}>
                                                            <Trash2 color={"var(--nodius-red-500)"} style={{cursor:"pointer"}} onClick={() => {
                                                                if(!editingClass) return;
                                                                const newEditingClass = {...editingClass};
                                                                newEditingClass.types = newEditingClass.types.filter((t, i2) => i2 !== i);
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
                        <Binary height={24} width={24} color="white"/>
                    </div>
                    <div style={{display:"flex", flexDirection:"column", flex:"1"}}>
                        <h5 style={{fontSize:"18px", fontWeight:"600", margin:"0"}}>Data Types</h5>
                        <p style={{fontSize:"12px", opacity:"0.7", margin:"0"}}>Define custom data structures</p>
                    </div>
                    <div style={{display:"flex", gap:"8px"}}>
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
                            onClick={addTypeFromJsonPrompt}
                            title="Import from JSON"
                        >
                            <FileUp height={20} width={20} color="white"/>
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
                            onClick={addTypePrompt}
                            title="Create new data type"
                        >
                            <Plus height={20} width={20} color="white"/>
                        </div>
                    </div>
                </div>

                {/* Info Card */}
                <div className={infoCardClass}>
                    <div className="info-header">
                        <Info height={18} width={18}/>
                        <span>What are Data Types?</span>
                    </div>
                    <div className="info-content">
                        Data types define the structure of complex data objects with multiple fields. Each field can have its own type, validation rules, and default values.
                    </div>
                </div>

                {/* Search Bar */}
                <Input
                    type={"text"}
                    placeholder={"Search data types..."}
                    value={searchValue}
                    onChange={(value) => setSearchValue(value)}
                    startIcon={<Search height={18} width={18}/>}
                />

                {/* Data Types List */}
                <div style={{padding:"0px", height:"100%", width:"100%", position:"relative"}}>
                    <div style={{position:"absolute", inset:"0px", overflowY:"auto", paddingRight:"4px"}}>
                        {searchedDataTypes ? (
                            searchedDataTypes.length > 0 ? (
                                <div style={{display:"flex", flexDirection:"column", gap:"8px"}}>
                                    {searchedDataTypes.map((dataType, i) => (
                                        <div
                                            key={i}
                                            className={`${dataTypeSelectionButtonClass} ${editingClass?._key === dataType._key ? "active" : ""}`}
                                            onClick={() => {
                                                setEditingClass(dataType);
                                                // Remove from newly created set when clicked
                                                if (newlyCreatedTypeIds.has(dataType._key)) {
                                                    setNewlyCreatedTypeIds(prev => {
                                                        const newSet = new Set(prev);
                                                        newSet.delete(dataType._key);
                                                        return newSet;
                                                    });
                                                }
                                            }}
                                        >
                                            <div style={{display:"flex", alignItems:"center", gap:"8px"}}>
                                                <span style={{fontWeight:"500", fontSize:"14px"}}>{dataType.name}</span>
                                                {newlyCreatedTypeIds.has(dataType._key) && (
                                                    <span style={{
                                                        fontSize:"11px",
                                                        fontWeight:"600",
                                                        padding:"2px 6px",
                                                        backgroundColor:"var(--nodius-success-main)",
                                                        color:"var(--nodius-success-contrastText)",
                                                        borderRadius:"4px"
                                                    }}>
                                                        New!
                                                    </span>
                                                )}
                                            </div>
                                            {dataType.description && (
                                                <span style={{fontSize:"12px", opacity:"0.7"}}>
                                                    {dataType.description}
                                                </span>
                                            )}
                                            <span style={{fontSize:"12px", opacity:"0.6"}}>
                                                {dataType.types.length} {dataType.types.length === 1 ? 'field' : 'fields'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={emptyStateClass}>
                                    <AlertCircle className="empty-icon" height={48} width={48}/>
                                    <div className="empty-title">No Data Types Found</div>
                                    <div className="empty-description">
                                        {searchValue ? `No data types match "${searchValue}". Try a different search term.` : "No data types created yet. Click the + button to create your first data type."}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div style={{padding:"20px", textAlign:"center", opacity:"0.6"}}>
                                Loading data types...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>

    )
});
LeftPanelTypeEditor.displayName = "LeftPanelTypeEditor";