import {CSSProperties, useContext, useMemo} from "react";
import {ThemeContext} from "./contexts/ThemeContext";

export type DynamicCssListing = {
    [K in keyof CSSProperties]?: string[];
};

const cssNativeColors = [
    "black", "white", "red", "lime", "blue",
    "cyan", "aqua", "magenta", "fuchsia", "yellow",
    "gray", "grey", "silver", "maroon", "olive",
    "green", "purple", "teal", "navy",

    "aliceblue", "antiquewhite", "aquamarine", "azure", "beige", "bisque",
    "blanchedalmond", "blueviolet", "brown", "burlywood", "cadetblue",
    "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
    "crimson", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
    "darkgrey", "darkgreen", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
    "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
    "dodgerblue", "firebrick", "floralwhite", "forestgreen", "gainsboro",
    "ghostwhite", "gold", "goldenrod", "greenyellow", "honeydew",
    "hotpink", "indianred", "indigo", "ivory", "khaki",
    "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
    "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray",
    "lightgrey", "lightgreen", "lightpink", "lightsalmon", "lightseagreen",
    "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
    "lightyellow", "limegreen", "linen", "mediumaquamarine", "mediumblue",
    "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
    "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
    "mintcream", "mistyrose", "moccasin", "navajowhite", "oldlace",
    "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
    "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
    "peru", "pink", "plum", "powderblue", "rosybrown",
    "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
    "seashell", "sienna", "skyblue", "slateblue", "slategray",
    "slategrey", "snow", "springgreen", "steelblue", "tan",
    "thistle", "tomato", "turquoise", "violet", "wheat",
    "whitesmoke", "yellowgreen"
];

const aditionalCss:string[] = ["auto", "inherit", "initial", "revert", "revert-layer", "unset"];

const css: DynamicCssListing = {
    display: [
        'flex', 'grid', 'block', 'inline', 'inline-block', 'none',
        'table', 'inline-flex', 'inline-grid', 'flow-root', 'contents', 'list-item',
        'inherit', 'initial', 'unset', 'revert', 'revert-layer'
    ],
    position: ['relative', 'absolute', 'fixed', 'sticky', 'static', 'inherit', 'initial', 'unset'],
    flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
    justifyContent: ['center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch'],
    alignItems: ['center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
    alignContent: ['center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'stretch'],
    placeItems: ['center', 'start', 'end', 'stretch'],
    flexWrap: ['wrap', 'nowrap', 'wrap-reverse'],
    flex: [],
    flexGrow: [],
    flexShrink: [],
    flexBasis: ['auto', '*px', '*%', '*rem'],
    order: [],
    gap: ['0', '*px', '*rem', "*%"],

    gridTemplateColumns: ['none', 'auto', '1fr'],
    gridTemplateRows: ['none', 'auto', '1fr'],
    gridColumn: [],
    gridRow: [],
    gridAutoFlow: ['row', 'column', 'dense', 'row dense'],
    gridAutoRows: ['auto', 'min-content', 'max-content', '1fr'],
    gridAutoColumns: ['auto', 'min-content', 'max-content', '1fr'],

    width: ['auto', '*px', '*%', 'fit-content', 'min-content', 'max-content'],
    height: ['auto', '*px', '*%', 'fit-content', 'min-content', 'max-content'],
    minWidth: ['*px', '*rem', "*%", 'fit-content'],
    maxWidth: ['*px', '*rem', "*%"],
    minHeight: ['*px', '*rem', "*%"],
    maxHeight: ['*px', '*rem', "*%"],
    boxSizing: ['content-box', 'border-box'],
    padding: ['*px', '*rem', "*%"],
    margin: ['*px', '*rem', "*%", 'auto'],

    border: ['none', '*px solid *color*', '*px dashed *color*'],
    borderRadius: [ '*px', '*%', '*rem', '50%'],
    borderWidth: ['*px', '*%', '*rem', 'thin', 'medium', 'thick'],
    borderStyle: ['solid', 'dashed', 'dotted', 'double', 'none', 'groove', 'ridge', 'inset', 'outset'],
    borderColor: ['transparent', 'currentColor', '*color*'],

    backgroundColor: ['transparent', 'currentColor', '*color*'],
    backgroundImage: [],
    backgroundSize: ['cover', 'contain', '*%', 'auto'],
    backgroundPosition: ['center', 'top', 'bottom', 'left', 'right'],
    backgroundRepeat: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'],
    backgroundAttachment: ['scroll', 'fixed', 'local'],
    backgroundClip: ['border-box', 'padding-box', 'content-box', 'text'],

    color: ["*color*", "currentColor"],
    fontSize: ['*px', '*rem', 'xx-small', 'small', 'medium', 'large', 'xx-large'],
    fontWeight: ['normal', 'bold', 'lighter', 'bolder'],
    fontStyle: ['normal', 'italic', 'oblique'],
    fontVariant: ['normal', 'small-caps'],
    fontFamily: ['sans-serif', 'serif', 'monospace', 'Arial', 'Helvetica', 'Georgia', 'Courier', 'roboto', 'cousine'],
    lineHeight: ['normal', '*px', '*rem'],
    textAlign: ['left', 'center', 'right', 'justify', 'start', 'end'],
    textDecoration: ['none', 'underline', 'line-through', 'overline', 'underline dotted'],
    textTransform: ['none', 'uppercase', 'lowercase', 'capitalize'],
    letterSpacing: ['normal', '*px'],
    whiteSpace: ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'],

    opacity: [],
    boxShadow: [],
    filter: [
        'none',
        'blur(*px)',
        'brightness(*)',
        'contrast(*)',
        'grayscale(*)',
        'sepia(*)',
        'hue-rotate(*deg)',
    ],
    transform: [
        'none',
        'scale(*)',
        'rotate(*deg)',
        'translateX(*px)',
        'translateY(*px)',
        'skewX(*deg)',
        'skewY(*deg)',
    ],
    transformOrigin: ['center', 'top', 'bottom', 'left', 'right'],
    transition: ["--var(--nodius-transition-default)"],
    transitionTimingFunction: ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'],

    cursor: [
        'pointer', 'default', 'grab', 'grabbing', 'not-allowed',
        'text', 'move', 'help', 'wait', 'crosshair', 'var(--*)'
    ],
    overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    overflowX: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    overflowY: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    zIndex: ['auto'],
    aspectRatio: [],
    objectFit: ['contain', 'cover', 'fill', 'none', 'scale-down'],
    float: ['none', 'left', 'right', 'inline-start', 'inline-end'],
    clear: ['none', 'left', 'right', 'both', 'inline-start', 'inline-end'],
    visibility: ['visible', 'hidden', 'collapse'],
    pointerEvents: ['auto', 'none', "all"],
    userSelect: ['auto', 'none', 'text', 'all'],
    resize: ['none', 'both', 'horizontal', 'vertical'],

};

const plainCss: Record<string, string[]> = Object.fromEntries(
    Object.entries(css).map(([key, value]) => [key.replace(/[A-Z]/g, match => "-" + match.toLowerCase()), value ?? []])
)

export const useDynamicCssListing = () => {

    const Theme = useContext(ThemeContext);

    const variableColor:string[] = useMemo(() => Object.entries(Theme.state.color)
            .flatMap(([key, value]) =>
                Object.keys(value).map(force => `var(--nodius-${key}-${force})`)
    ), [Theme.state.color]);

    return {
        availableCss: plainCss,
        variableColor: [...variableColor, ...cssNativeColors],
        aditionalCss: aditionalCss
    };
}