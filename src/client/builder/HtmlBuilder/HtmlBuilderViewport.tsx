import {CSSProperties, PropsWithChildren, useMemo, useState} from "nodius_jsx/jsx-runtime";
import {useElementSize} from "../../jsx-runtime/customHooks/useElementSize";

const VIEWPORT_PRESETS = {
    // Phones
    "iPhone 14 Pro": { width: 393, height: 852, category: "phone" },
    "iPhone SE": { width: 375, height: 667, category: "phone" },
    "Samsung Galaxy S21": { width: 384, height: 854, category: "phone" },
    "Pixel 7": { width: 412, height: 915, category: "phone" },

    // Tablets
    "iPad Pro 12.9": { width: 1024, height: 1366, category: "tablet" },
    "iPad Air": { width: 820, height: 1180, category: "tablet" },
    "Surface Pro 7": { width: 912, height: 1368, category: "tablet" },

    // Desktop
    "Desktop HD": { width: 1920, height: 1080, category: "desktop" },
    "Desktop FHD+": { width: 2560, height: 1440, category: "desktop" },
    "Desktop 4K": { width: 3840, height: 2160, category: "desktop" },

    // TV/Cinema
    "TV 4K": { width: 3840, height: 2160, category: "tv" },
    "Cinema 21:9": { width: 2560, height: 1080, category: "tv" },

    // Aspect Ratios
    "16:9": { width: 1920, height: 1080, category: "aspect" },
    "16:10": { width: 1920, height: 1200, category: "aspect" },
    "4:3": { width: 1024, height: 768, category: "aspect" },
    "1:1": { width: 1080, height: 1080, category: "aspect" },
    "9:16": { width: 1080, height: 1920, category: "aspect" },
} as const;

type PresetName = keyof typeof VIEWPORT_PRESETS;
type Orientation = "portrait" | "landscape";

interface HtmlBuilderViewportProps {
    defaultPreset?: PresetName;
    defaultOrientation?: Orientation;
    defaultZoom?: number;
    showControls?: boolean;
}

export const HtmlBuilderViewport = ({
    children,
    defaultPreset = "Desktop HD",
    defaultOrientation = "landscape",
    defaultZoom = 100,
    showControls = true
}:PropsWithChildren<HtmlBuilderViewportProps>) => {

    const mainElement = useElementSize();

    const [selectedPreset, setSelectedPreset] = useState<PresetName>(defaultPreset);
    const [customWidth, setCustomWidth] = useState<number>(VIEWPORT_PRESETS[defaultPreset].width);
    const [customHeight, setCustomHeight] = useState<number>(VIEWPORT_PRESETS[defaultPreset].height);
    const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);
    const [isCustom, setIsCustom] = useState<boolean>(false);


    const viewportDimensions = useMemo(() => {
        const width = isCustom ? customWidth : VIEWPORT_PRESETS[selectedPreset].width;
        const height = isCustom ? customHeight : VIEWPORT_PRESETS[selectedPreset].height;

        if (orientation === "portrait") {
            return {
                width: height,
                height: width
            };
        } else {
            return {
                width: width,
                height: height
            };
        }
    }, [selectedPreset, customWidth, customHeight, orientation, isCustom]);


    const viewPortContainerStyle = useMemo(() => {
        const style:CSSProperties = {};

        style.position = "absolute";
        style.overflow = "hidden";

        if(!mainElement.bounds) return style;

        style.height = viewportDimensions.height + "px";
        style.width = viewportDimensions.width + "px";


        style.boxShadow = "rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px";


        const scaleX = mainElement.bounds.width / viewportDimensions.width;
        const scaleY = mainElement.bounds.height / viewportDimensions.height;


        style.zoom = Math.min(scaleX, scaleY);

        return style;
    }, [viewportDimensions, mainElement.bounds]);

    return (

        <div style={{width:"100%", height:"100%", display:"flex", flexDirection: "column" as const, position:'relative'}}>

            {showControls && (
                <div style={{
                    borderBottom:"1px solid gray",
                    padding: "12px 16px",
                    display:"flex",
                    alignItems:"center",
                    gap:"16px",
                    flexWrap:"wrap",
                    minHeight:"60px"
                }}>
                    {/* Preset selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '14px', fontWeight: 500 }}>Preset:</label>
                        <select
                            value={isCustom ? 'custom' : selectedPreset}
                            onChange={(e) => {
                                const value = (e.target as HTMLInputElement).value;
                                if (value !== 'custom') {
                                    setSelectedPreset(value as PresetName);
                                    setCustomWidth(VIEWPORT_PRESETS[value as PresetName].width);
                                    setCustomHeight(VIEWPORT_PRESETS[value as PresetName].height);
                                    setIsCustom(false);
                                }
                            }}
                            style={{
                                padding: '4px 8px',
                                border: `1px solid gray`,
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        >
                            <optgroup label="Phones">
                                {Object.entries(VIEWPORT_PRESETS)
                                    .filter(([_, preset]) => preset.category === 'phone')
                                    .map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                            </optgroup>
                            <optgroup label="Tablets">
                                {Object.entries(VIEWPORT_PRESETS)
                                    .filter(([_, preset]) => preset.category === 'tablet')
                                    .map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                            </optgroup>
                            <optgroup label="Desktop">
                                {Object.entries(VIEWPORT_PRESETS)
                                    .filter(([_, preset]) => preset.category === 'desktop')
                                    .map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                            </optgroup>
                            <optgroup label="TV/Cinema">
                                {Object.entries(VIEWPORT_PRESETS)
                                    .filter(([_, preset]) => preset.category === 'tv')
                                    .map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                            </optgroup>
                            <optgroup label="Aspect Ratios">
                                {Object.entries(VIEWPORT_PRESETS)
                                    .filter(([_, preset]) => preset.category === 'aspect')
                                    .map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                            </optgroup>
                            <option value="custom">Custom</option>
                        </select>
                    </div>

                    {/* Custom dimensions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="number"
                            value={customWidth}
                            onInput={(e) => {
                                const value = parseInt((e.target as HTMLInputElement).value);
                                setCustomWidth(value);
                                setIsCustom(true);
                            }}
                            style={{
                                width: '80px',
                                padding: '4px 8px',
                                border: `1px solid gray`,
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        />
                        <span style={{ fontSize: '14px' }}>×</span>
                        <input
                            type="number"
                            value={customHeight}
                            onInput={(e) => {
                                const value = parseInt((e.target as HTMLInputElement).value);
                                setCustomHeight(value);
                                setIsCustom(true);
                            }}
                            style={{
                                width: '80px',
                                padding: '4px 8px',
                                border: `1px solid gray`,
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        />
                    </div>

                    {/* Orientation toggle */}
                    <button
                        onClick={() => {
                            setOrientation(prev => prev === "landscape" ? "portrait" : "landscape");
                        }}
                        style={{
                            padding: '4px 12px',
                            border: `1px solid gray`,
                            borderRadius: '4px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        {orientation === 'landscape' ? '🖥️' : '📱'} {orientation}
                    </button>



                    {/* Actual size display */}
                    <div style={{
                        marginLeft: 'auto',
                        fontSize: '14px',
                        color: '#6b7280'
                    }}>
                        {Math.round(viewportDimensions.width)} × {Math.round(viewportDimensions.height)}px
                    </div>
                </div>
            )}
            <div style={{flex:"1", display:"flex", alignItems: 'center', justifyContent: 'center', position:"relative"}} ref={mainElement.refCallBack}>
                <div style={viewPortContainerStyle}>
                    {children}
                </div>
            </div>
        </div>
    )
}