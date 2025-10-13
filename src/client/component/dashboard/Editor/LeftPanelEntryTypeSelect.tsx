import React, {memo, useContext, useEffect, useMemo, useRef, useState} from "react";
import {allDataTypes, DataTypeClass} from "../../../../utils/dataType/dataType";
import {Cable, ChevronDown, ChevronUp, Search} from "lucide-react";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {Graph, NodeTypeEntryType} from "../../../../utils/graph/graphType";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {Collapse} from "../../animate/Collapse";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {findFirstNodeByType} from "../../../../utils/graph/nodeUtils";
import {Input} from "../../form/Input";


interface LeftPanelEntryTypeSelectProps {
    graph?:Graph
}

export const LeftPanelEntryTypeSelect = memo((
    {
        graph
    }:LeftPanelEntryTypeSelectProps
) => {

    const [dataTypes, setDataTypes] = useState<DataTypeClass[]|undefined>(undefined);
    const [searchValue, setSearchValue] = useState<string>("");

    const [showSelect, setShowSelect] = useState<boolean>(false);

    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);

    const searchedDataTypes: DataTypeClass[]|undefined = useMemo(() => dataTypes ? dataTypes.filter((data) => data.name.toLowerCase().includes(searchValue.toLowerCase())) : undefined,[dataTypes, searchValue]);

    const currentEntryType:DataTypeClass|undefined = useMemo(() => {
        if(!Project.state.graph || !dataTypes) {
            return undefined;
        }

        const node = findFirstNodeByType<NodeTypeEntryType>(Project.state.graph, "entryType");
        if(node && node.data) {
            return dataTypes.find((type) => type._key === node.data!._key);
        }
        return undefined;

    }, [Project.state.graph, dataTypes]);

    useEffect(() => {
        retrieveDataType();
        prepareDataType();
    }, []);

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
                newPreparedType[data.id] = await data.prepare(preparedTypeAbortController.current[data.id]);
            }
        }
        setPreparedType(newPreparedType);
    }

    const retrieveDataTypeAbordController = useRef<AbortController>(undefined);
    const retrieveDataType = async () => {
        if(retrieveDataTypeAbordController.current) {
            retrieveDataTypeAbordController.current.abort();
        }
        retrieveDataTypeAbordController.current = new AbortController();
        const response = await fetch(`http://localhost:8426/api/type/list`, {
            method: "POST",
            signal: retrieveDataTypeAbordController.current.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                workspace: "root"
            })
        });
        if(response.status === 200) {
            const json:DataTypeClass[] = await response.json();
            setDataTypes(json);
        }else {
            setDataTypes([]);
        }
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

    const setEntryType = (dataType:DataTypeClass) => {

    }

    return (
        <>

            <div style={{display:"flex", flexDirection:"column", gap:"16px", padding:"8px", height:"100%", width:"100%"}}>

                <div style={{display:"flex", flexDirection:"row", gap:"10px",alignItems:"center", borderBottom:"2px solid var(--nodius-background-paper)", paddingBottom:"5px"}}>
                    <Cable height={26} width={26}/>
                    <h5 style={{fontSize:"16px", fontWeight:"400"}}>Graph Input Data</h5>
                </div>


                <div style={{padding:"5px", height:"100%", width:"100%", position:"relative"}}>
                    <div style={{position:"absolute", inset:"0px", overflowY:"auto"}}>
                        <div style={{display:"flex", flexDirection:"column", maxHeight:"50%"}}>
                            <div className={`${selectInputDataButton} ${showSelect ? "active" : "inactive"}`} onClick={!showSelect ? () => setShowSelect(!showSelect) : undefined}>
                                <div style={{display:"flex", flexDirection:"row", justifyContent:"space-between"}}>
                                    <p>Select Input Data </p>
                                    <div className={"close"}>
                                        {showSelect ? (
                                            <ChevronUp onClick={() => setShowSelect(!showSelect)} />
                                        ) : (
                                            <ChevronDown />
                                        )}
                                    </div>
                                </div>
                                <Collapse in={showSelect} >
                                    <div>
                                        <Input
                                            type={"text"}
                                            placeholder={"Search Data Types..."}
                                            value={searchValue}
                                            onChange={(value) => setSearchValue(value)}
                                            startIcon={<Search height={18} width={18}/>}
                                        />
                                        {searchedDataTypes ? (
                                            searchedDataTypes.map((dataType, i) => (
                                                <div
                                                    key={i}
                                                    className={`${dataTypeSelectionButtonClass} ${currentEntryType?._key === dataType._key ? "active" : ""}`}
                                                    onClick={() => setEntryType(dataType)}
                                                    style={{marginTop:i > 0 ? "6px" : "0px"}}
                                                >
                                                    {dataType.name}
                                                </div>
                                            ))
                                        ) : "loading"}
                                    </div>
                                </Collapse>
                            </div>

                            <div>
                                {currentEntryType ? (
                                    <div>
                                        type selected {currentEntryType.name}, {currentEntryType.description}
                                        <button>
                                            see the type in the edit tab
                                        </button>

                                    </div>
                                ) : (
                                    <div>
                                        no type selected
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>

    )
});
LeftPanelEntryTypeSelect.displayName = "LeftPanelEntryTypeSelect";