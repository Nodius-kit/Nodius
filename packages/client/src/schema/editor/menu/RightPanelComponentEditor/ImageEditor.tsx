import {CurrentEditObject} from "../RightPanelComponentEditor";
import {Instruction, InstructionBuilder} from "@nodius/utils";
import {memo, useCallback, useContext} from "react";
import {ThemeContext} from "../../../../hooks/contexts/ThemeContext";
import {useDynamicClass} from "../../../../hooks/useDynamicClass";
import {EditableDiv} from "../../../../component/form/EditableDiv";
import {Image, FileText, FolderOpen} from "lucide-react";
import {openImageManager} from "../../../../utils/imageManagerHelper";
import {Button} from "../../../../component/form/Button";

export interface ImageEditorProps {
    object: CurrentEditObject;
    onUpdate: (instr: Instruction | Instruction[]) => Promise<boolean>;
}

export const ImageEditor = memo(({
    object,
    onUpdate
}: ImageEditorProps) => {
    const Theme = useContext(ThemeContext);

    const imageEditorContainerClass = useDynamicClass(`
        & {
            border-radius: 10px;
            border: 1px solid ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.1)};
            background-color: ${Theme.state.reverseHexColor(Theme.state.background[Theme.state.theme].default, 0.02)};
            box-shadow: var(--nodius-shadow-1);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            transition: var(--nodius-transition-default);
        }
        &:hover {
            box-shadow: var(--nodius-shadow-2);
        }
    `);

    const fieldClass = useDynamicClass(`
        & {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    `);

    const labelClass = useDynamicClass(`
        & {
            font-weight: 600;
            font-size: 14px;
            color: var(--nodius-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `);

    const urlFieldClass = useDynamicClass(`
        & {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        & > div:first-child {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        & > div:first-child > div {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `);

    const imagePreviewClass = useDynamicClass(`
        & {
            width: 100%;
            max-height: 200px;
            border-radius: 8px;
            border: 2px solid var(--nodius-background-paper);
            object-fit: contain;
            background-color: var(--nodius-background-default);
            padding: 8px;
        }
    `);

    /*const browseButtonClass = useDynamicClass(`
        & {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 16px;
            border: 1px solid var(--nodius-primary-main);
            border-radius: 8px;
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.1)};
            color: var(--nodius-primary-main);
            cursor: pointer;
            transition: var(--nodius-transition-default);
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
        }
        &:hover {
            background-color: ${Theme.state.changeOpacity(Theme.state.primary[Theme.state.theme].main, 0.2)};
            transform: translateY(-1px);
            box-shadow: var(--nodius-shadow-1);
        }
        &:active {
            transform: translateY(0);
        }
    `);*/

    const updateAlt = async (newAlt: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("content").index(0).set(newAlt);
        await onUpdate(newInstruction.instruction);
    };

    const updateSrc = async (newSrc: string) => {
        const newInstruction = new InstructionBuilder(object.instruction);
        newInstruction.key("content").index(1).set(newSrc);
        await onUpdate(newInstruction.instruction);
    };

    const handleOpenImageManager = useCallback(async () => {
        await openImageManager({
            workspace: 'root', // You can make this configurable based on your needs
            nodeId: object.object.identifier || 'image-editor',
            mode: 'select',
            onSelect: async (imageUrl: string, imageToken: string, imageName: string) => {
                // Update the image src when user selects an image
                await updateSrc(imageUrl);
            }
        });
    }, [object.object.identifier, updateSrc]);

    if (object.object.type !== "image") return null;

    const imageContent = object.object.content as [string, string];
    const [alt, src] = imageContent;

    return (
        <div className={imageEditorContainerClass}>
            {/* Image Preview */}
            {src && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <img
                        src={src}
                        alt={alt}
                        className={imagePreviewClass}
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
            )}

            {/* Alt Text Field */}
            <div className={fieldClass}>
                <label className={labelClass}>
                    <FileText height={16} width={16} />
                    Alt Text
                </label>
                <EditableDiv
                    value={alt}
                    placeholder="Enter image alt text..."
                    onChange={updateAlt}
                    style={{
                        width: "100%",
                        padding: "12px",
                        border: "1px solid var(--nodius-background-paper)",
                        borderRadius: "8px",
                        backgroundColor: "var(--nodius-background-default)",
                        color: "var(--nodius-text-primary)",
                        fontSize: "14px"
                    }}
                />
            </div>

            {/* Image URL Field with Browse Button */}
            <div className={fieldClass}>
                <label className={labelClass}>
                    <Image height={16} width={16} />
                    Image URL
                </label>
                <div className={urlFieldClass}>
                    <EditableDiv
                        value={src}
                        placeholder="Enter image URL or click Browse..."
                        onChange={updateSrc}
                        style={{
                            padding: "12px",
                            border: "1px solid var(--nodius-background-paper)",
                            borderRadius: "8px",
                            backgroundColor: "var(--nodius-background-default)",
                            color: "var(--nodius-text-primary)",
                            fontFamily: "'Fira Code', monospace",
                            fontSize: "14px"
                        }}
                    />
                    <Button
                        onClick={handleOpenImageManager}
                        size={"small"}
                        variant={"outlined"}
                        title="Browse and manage stored images"
                    >
                        <FolderOpen height={18} width={18} />
                    </Button>
                </div>
            </div>
        </div>
    );
});
ImageEditor.displayName = "ImageEditor";