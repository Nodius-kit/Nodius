
import {memo, useContext, useState} from "react";
import {ProjectContext} from "../../../hooks/contexts/ProjectContext";
import {ThemeContext} from "../../../hooks/contexts/ThemeContext";
import {Input} from "../../form/Input";
import {Collapse} from "../../animate/Collapse";
import {ChevronDown, ChevronUp, Trash2} from "lucide-react";
import {useDynamicClass} from "../../../hooks/useDynamicClass";
import {allDataTypes, DataTypeClass, DataTypeConfig, EnumClass} from "../../../../utils/dataType/dataType";

// Recursive JSON Editor Component for Entry Type Fields
interface LeftPanelEntryTypeSelectRecursiveFieldEditorProps {
    field: DataTypeConfig;
    value: any;
    onChange: (value: any) => void;
    depth?: number;
    dataTypeClasses: DataTypeClass[] | undefined; // User-defined data types
    enumTypes?: EnumClass[];
}

export const LeftPanelEntryTypeSelectRecursiveFieldEditor = memo(({
                                       field,
                                       value,
                                       onChange,
                                       depth = 0,
                                       dataTypeClasses,
                                       enumTypes
                                   }: LeftPanelEntryTypeSelectRecursiveFieldEditorProps) => {
    const Theme = useContext(ThemeContext);
    const Project = useContext(ProjectContext);
    const [isExpanded, setIsExpanded] = useState<boolean>(depth < 2); // Auto-expand first 2 levels

    // Validation function
    const validateValue = (val: any, typeId: string): boolean => {
        if (val === null || val === undefined || val === "") return false;

        // For enum type, check separately
        if (typeId === "enum") {
            // Get enum from field.defaultValue which contains the enum _key
            const enumDef = enumTypes?.find(e => e._key === field.defaultValue);
            if (!enumDef) return false;
            return enumDef.enum.includes(String(val));
        }

        // Find the type definition in the imported allDataTypes (from dataType.ts)
        // allDataTypes is a const array of DataTypeChecking objects
        const typeDef = allDataTypes.find(t => t.id === typeId);
        if (!typeDef) return false;

        // Use the .is() function from DataTypeChecking
        return typeDef.is(String(val));
    };

    // Check if this field's type is a DataType (recursive case)
    const isNestedDataType = field.typeId === "dataType";
    // dataTypeClasses is DataTypeClass[], used for finding nested data types
    const nestedDataType = isNestedDataType && dataTypeClasses
        ? dataTypeClasses.find(dt => dt._key === field.defaultValue)
        : undefined;

    // Check if current value is valid
    const isValid = !isNestedDataType && value !== null && value !== undefined && value !== ""
        ? validateValue(value, field.typeId)
        : true;

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
        // Validate the current value
        const itemIsValid = currentValue !== null && currentValue !== undefined && currentValue !== ""
            ? validateValue(currentValue, field.typeId)
            : true;

        // Boolean type - use checkbox
        if (field.typeId === "bool") {
            return (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                        type="checkbox"
                        checked={currentValue === "true" || currentValue === true}
                        onChange={(e) => handleValueChange(e.target.checked ? "true" : "false", index)}
                        style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer"
                        }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--nodius-text-primary)" }}>
                        {currentValue === "true" || currentValue === true ? "True" : "False"}
                    </span>
                </div>
            );
        }

        // Enum type - use select dropdown
        if (field.typeId === "enum") {
            const enumDef = enumTypes?.find(e => e._key === field.defaultValue);
            return (
                <select
                    value={currentValue || ""}
                    onChange={(e) => handleValueChange(e.target.value, index)}
                    style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: !itemIsValid ? "2px solid var(--nodius-error-main)" : "1px solid var(--nodius-grey-300)",
                        backgroundColor: "var(--nodius-background-paper)",
                        color: "var(--nodius-text-primary)",
                        fontSize: "13px",
                        width: "100%",
                        cursor: "pointer"
                    }}
                >
                    <option value="">Select an option...</option>
                    {enumDef?.enum.map((enumValue, i) => (
                        <option key={i} value={enumValue}>{enumValue}</option>
                    ))}
                </select>
            );
        }

        // Number types
        if (field.typeId === "int" || field.typeId === "db") {
            return (
                <div style={{ position: "relative", width: "100%" }}>
                    <Input
                        type="number"
                        value={currentValue || ""}
                        onChange={(val) => handleValueChange(val, index)}
                        placeholder={`Enter ${field.name}${field.required ? " (required)" : ""}`}
                        style={{
                            borderColor: !itemIsValid ? "var(--nodius-error-main)" : undefined,
                            borderWidth: !itemIsValid ? "2px" : undefined
                        }}
                    />
                    {!itemIsValid && currentValue && (
                        <span style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: "11px",
                            color: "var(--nodius-error-main)",
                            fontWeight: 500
                        }}>
                            Invalid {field.typeId}
                        </span>
                    )}
                </div>
            );
        }

        // Color type - add color picker
        if (field.typeId === "color") {
            return (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                        type="color"
                        value={currentValue && validateValue(currentValue, "color") ? currentValue : "#000000"}
                        onChange={(e) => handleValueChange(e.target.value, index)}
                        style={{
                            width: "50px",
                            height: "38px",
                            border: "1px solid var(--nodius-grey-300)",
                            borderRadius: "6px",
                            cursor: "pointer"
                        }}
                    />
                    <Input
                        type="text"
                        value={currentValue || ""}
                        onChange={(val) => handleValueChange(val, index)}
                        placeholder={`Enter color (hex, rgb, etc.)`}
                        style={{
                            flex: 1,
                            borderColor: !itemIsValid ? "var(--nodius-error-main)" : undefined,
                            borderWidth: !itemIsValid ? "2px" : undefined
                        }}
                    />
                    {!itemIsValid && currentValue && (
                        <span style={{
                            fontSize: "11px",
                            color: "var(--nodius-error-main)",
                            fontWeight: 500,
                            whiteSpace: "nowrap"
                        }}>
                            Invalid color
                        </span>
                    )}
                </div>
            );
        }

        // Default: text input with validation
        return (
            <div style={{ position: "relative", width: "100%" }}>
                <Input
                    type="text"
                    value={currentValue || ""}
                    onChange={(val) => handleValueChange(val, index)}
                    placeholder={`Enter ${field.name}${field.required ? " (required)" : ""}`}
                    style={{
                        borderColor: !itemIsValid ? "var(--nodius-error-main)" : undefined,
                        borderWidth: !itemIsValid ? "2px" : undefined
                    }}
                />
                {!itemIsValid && currentValue && (
                    <span style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "11px",
                        color: "var(--nodius-error-main)",
                        fontWeight: 500
                    }}>
                        Invalid {field.typeId}
                    </span>
                )}
            </div>
        );
    };

    const renderNestedObject = (currentValue: any, index?: number) => {
        if (!nestedDataType) return null;

        return (
            <div className="nested-fields">
                {nestedDataType.types.map((nestedField, i) => (
                    <LeftPanelEntryTypeSelectRecursiveFieldEditor
                        key={i}
                        field={nestedField}
                        value={currentValue?.[nestedField.name]}
                        onChange={(newVal) => {
                            const updatedObj = { ...(currentValue || {}), [nestedField.name]: newVal };
                            handleValueChange(updatedObj, index);
                        }}
                        depth={depth + 1}
                        dataTypeClasses={dataTypeClasses}
                        enumTypes={enumTypes}
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

            {isNestedDataType ? (
                isArray ? (
                    <Collapse in={isExpanded}>
                        <div>
                            {arrayValues?.map((item, idx) => (
                                <div key={idx} style={{ marginBottom: "12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                                        <span style={{ fontSize: "12px", color: "var(--nodius-text-secondary)", fontWeight: 500 }}>
                                            Item {idx + 1}
                                        </span>
                                        <button
                                            onClick={() => removeArrayItem(idx)}
                                            style={{
                                                background: "var(--nodius-error-main)",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "4px",
                                                padding: "4px 4px",
                                                cursor: "pointer",
                                                fontSize: "11px"
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
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
                    </Collapse>
                ) : (
                    <Collapse in={isExpanded}>
                        {renderNestedObject(value)}
                    </Collapse>
                )
            ) : (
                isArray ? (
                    <div>
                        {arrayValues?.map((item, idx) => (
                            <div key={idx} style={{ marginBottom: "12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    <span style={{ fontSize: "12px", color: "var(--nodius-text-secondary)", fontWeight: 500 }}>
                                        Item {idx + 1}
                                    </span>
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
                                {renderPrimitiveInput(item, idx)}
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
LeftPanelEntryTypeSelectRecursiveFieldEditor.displayName = "RecursiveFieldEditor";