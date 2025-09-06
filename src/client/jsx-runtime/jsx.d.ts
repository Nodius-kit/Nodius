import type { VNode } from './index.js';
import {CSSProperties} from "./jsx-runtime";


export type Ref<T> =
    | { current: T | null }
    | ((instance: T | null) => void)
    | null;

// Custom HTML attribute types
interface HTMLProps {
    className?: string;
    id?: string;
    style?: CSSProperties;
    onClick?: (e: MouseEvent) => void;
    onSubmit?: (e: Event) => void;
    onChange?: (e: Event) => void;
    onInput?: (e: Event) => void;
    onFocus?: (e: Event) => void;
    onBlur?: (e: Event) => void;
    onMouseOver?: (e: MouseEvent) => void;
    onMouseOut?: (e: MouseEvent) => void;
    onMouseDown?: (e: MouseEvent) => void;
    onMouseUp?: (e: MouseEvent) => void;
    onKeyDown?: (e: MouseEvent) => void;
    onKeyUp?: (e: MouseEvent) => void;
    onKeyPress?: (e: MouseEvent) => void;
    title?: string;
    children?: any;
    ref?: Ref<HTMLElement>;
    [key: string]: any; // Allow any other attributes
}

interface InputProps extends HTMLProps {
    type?: string;
    value?: string | number;
    placeholder?: string;
    disabled?: boolean;
    checked?: boolean;
    name?: string;
    required?: boolean;
    min?: number;
    max?: number;
    step?: number;
    ref?: Ref<HTMLInputElement>;
}

interface ButtonProps extends HTMLProps {
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    ref?: Ref<HTMLButtonElement>;
}

interface ImgProps extends HTMLProps {
    src?: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    loading?: 'eager' | 'lazy';
    ref?: Ref<HTMLImageElement>;
}

interface AnchorProps extends HTMLProps {
    href?: string;
    target?: string;
    rel?: string;
    ref?: Ref<HTMLAnchorElement>;
}

interface FormProps extends HTMLProps {
    action?: string;
    method?: 'GET' | 'POST';
    encType?: string;
    ref?: Ref<HTMLFormElement>;
}

interface LabelProps extends HTMLProps {
    htmlFor?: string;
    ref?: Ref<HTMLLabelElement>;
}

interface SelectProps extends HTMLProps {
    multiple?: boolean;
    size?: number;
    value?: string;
    name?: string;
    ref?: Ref<HTMLSelectElement>;
}

interface TextareaProps extends HTMLProps {
    rows?: number;
    cols?: number;
    placeholder?: string;
    value?: string;
    name?: string;
    ref?: Ref<HTMLTextAreaElement>;
}

interface OptionProps extends HTMLProps {
    value?: string | number;
    selected?: boolean;
    disabled?: boolean;
    ref?: Ref<HTMLOptionElement>;
}

// JSX Type Declarations
declare global {
    namespace JSX {
        interface IntrinsicElements {
            // Common HTML elements with specific props
            a: AnchorProps;
            button: ButtonProps;
            img: ImgProps;
            input: InputProps;
            form: FormProps;
            label: LabelProps;
            select: SelectProps;
            textarea: TextareaProps;
            option: OptionProps;

            // All other HTML elements with basic props
            div: HTMLProps;
            span: HTMLProps;
            p: HTMLProps;
            h1: HTMLProps;
            h2: HTMLProps;
            h3: HTMLProps;
            h4: HTMLProps;
            h5: HTMLProps;
            h6: HTMLProps;
            ul: HTMLProps;
            ol: HTMLProps;
            li: HTMLProps;
            table: HTMLProps;
            thead: HTMLProps;
            tbody: HTMLProps;
            tfoot: HTMLProps;
            tr: HTMLProps;
            td: HTMLProps;
            th: HTMLProps;
            section: HTMLProps;
            article: HTMLProps;
            header: HTMLProps;
            footer: HTMLProps;
            nav: HTMLProps;
            aside: HTMLProps;
            main: HTMLProps;
            figure: HTMLProps;
            figcaption: HTMLProps;
            details: HTMLProps;
            summary: HTMLProps;
            dialog: HTMLProps;
            canvas: HTMLProps;
            video: HTMLProps;
            audio: HTMLProps;
            source: HTMLProps;
            track: HTMLProps;
            embed: HTMLProps;
            object: HTMLProps;
            param: HTMLProps;
            iframe: HTMLProps;
            fieldset: HTMLProps;
            legend: HTMLProps;
            optgroup: HTMLProps;
            datalist: HTMLProps;
            output: HTMLProps;
            progress: HTMLProps;
            meter: HTMLProps;
            code: HTMLProps;
            pre: HTMLProps;
            kbd: HTMLProps;
            samp: HTMLProps;
            var: HTMLProps;
            sub: HTMLProps;
            sup: HTMLProps;
            i: HTMLProps;
            b: HTMLProps;
            u: HTMLProps;
            s: HTMLProps;
            small: HTMLProps;
            strong: HTMLProps;
            em: HTMLProps;
            mark: HTMLProps;
            del: HTMLProps;
            ins: HTMLProps;
            q: HTMLProps;
            cite: HTMLProps;
            abbr: HTMLProps;
            dfn: HTMLProps;
            time: HTMLProps;
            address: HTMLProps;
            blockquote: HTMLProps;
            hr: HTMLProps;
            br: HTMLProps;
            wbr: HTMLProps;
            area: HTMLProps;
            map: HTMLProps;
            col: HTMLProps;
            colgroup: HTMLProps;
            caption: HTMLProps;
            ruby: HTMLProps;
            rt: HTMLProps;
            rp: HTMLProps;
            bdi: HTMLProps;
            bdo: HTMLProps;
            template: HTMLProps;
            slot: HTMLProps;

            // Basic SVG support
            svg: HTMLProps & {
                viewBox?: string;
                width?: number | string;
                height?: number | string;
                fill?: string;
                stroke?: string;
            };
            path: HTMLProps & {
                d?: string;
                fill?: string;
                stroke?: string;
            };
            circle: HTMLProps & {
                cx?: number | string;
                cy?: number | string;
                r?: number | string;
                fill?: string;
                stroke?: string;
            };
            rect: HTMLProps & {
                x?: number | string;
                y?: number | string;
                width?: number | string;
                height?: number | string;
                fill?: string;
                stroke?: string;
            };
            line: HTMLProps & {
                x1?: number | string;
                y1?: number | string;
                x2?: number | string;
                y2?: number | string;
                stroke?: string;
            };
            text: HTMLProps & {
                x?: number | string;
                y?: number | string;
                fill?: string;
                fontSize?: number | string;
            };
            g: HTMLProps;
            defs: HTMLProps;
            use: HTMLProps;
        }

        interface Element extends VNode {}

        interface ElementAttributesProperty {
            props: {};
        }

        interface ElementChildrenAttribute {
            children: {};
        }
    }
}