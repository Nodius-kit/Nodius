import {useCallback, useRef, useState} from "react";
import {SchemaNodeInfo, WorkFlowState} from "../SchemaDisplay";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";

interface NodesInfoTypeDomEventSwitch {
    container: HTMLElement;
    checkbox: HTMLInputElement;
    slider: HTMLSpanElement;
    sliderBefore: HTMLSpanElement;
}

interface NodesInfoTypeWorkflowPanel {
    container: HTMLElement;
    checkbox: HTMLInputElement;
    slider: HTMLSpanElement;
    sliderBefore: HTMLSpanElement;
    button: HTMLButtonElement;
}

interface nodesInfoType {
    domEventSwitch?: NodesInfoTypeDomEventSwitch;
    workflowPanel?: NodesInfoTypeWorkflowPanel;
}

// Reusable style helper functions
const createPanelContainer = (top: string = '-48px'): HTMLDivElement => {
    const container = document.createElement('div');
    container.style.cssText = `
        position: absolute;
        top: ${top};
        right: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 10px;
        background-color: var(--nodius-background-paper);
        border-radius: 8px;
        border: 1px solid var(--nodius-primary-dark);
        box-shadow: var(--nodius-shadow-2);
        z-index: 10;
        transition: var(--nodius-transition-default);
        pointer-events: all;
    `;
    return container;
};

const createLabel = (text: string, htmlFor?: string): HTMLLabelElement => {
    const label = document.createElement('label');
    if (htmlFor) label.htmlFor = htmlFor;
    label.textContent = text;
    label.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: var(--nodius-text-primary);
        cursor: pointer;
        user-select: none;
    `;
    return label;
};

const createSwitch = (id: string, checked: boolean): {
    switchLabel: HTMLLabelElement;
    checkbox: HTMLInputElement;
    slider: HTMLSpanElement;
    sliderBefore: HTMLSpanElement;
} => {
    const switchLabel = document.createElement('label');
    switchLabel.style.cssText = `
        position: relative;
        display: inline-block;
        width: 40px;
        height: 22px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = checked;
    checkbox.style.cssText = `
        opacity: 0;
        width: 0;
        height: 0;
    `;

    const slider = document.createElement('span');
    slider.style.cssText = `
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: ${checked ? 'var(--nodius-success-main)' : 'var(--nodius-grey-600)'};
        transition: var(--nodius-transition-default);
        border-radius: 22px;
    `;

    const sliderBefore = document.createElement('span');
    sliderBefore.style.cssText = `
        position: absolute;
        content: '';
        height: 16px;
        width: 16px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: var(--nodius-transition-default);
        border-radius: 50%;
        transform: ${checked ? 'translateX(18px)' : 'translateX(0)'};
    `;

    slider.appendChild(sliderBefore);
    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    return { switchLabel, checkbox, slider, sliderBefore };
};

const createButton = (text: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
        padding: 4px 12px;
        background-color: var(--nodius-primary-main);
        color: var(--nodius-primary-contrastText);
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--nodius-transition-default);
    `;
    button.onmouseenter = () => {
        button.style.backgroundColor = 'var(--nodius-primary-dark)';
    };
    button.onmouseleave = () => {
        button.style.backgroundColor = 'var(--nodius-primary-main)';
    };
    return button;
};

const updateSwitchState = (slider: HTMLSpanElement, sliderBefore: HTMLSpanElement, checked: boolean) => {
    slider.style.backgroundColor = checked ? 'var(--nodius-success-main)' : 'var(--nodius-grey-600)';
    sliderBefore.style.transform = checked ? 'translateX(18px)' : 'translateX(0)';
};


export const useNodeActionButton = () => {

    const nodesInfo = useRef<Record<string, nodesInfoType>>({});

    const projectRef = useStableProjectRef();

    const callBackWhenChanged = useRef<((nodeId:string) => void)>(undefined);

    const [workflowState, setWorkflowState] = useState<WorkFlowState>({
        active: true
    });

    const setCallBackWhenNodeChange = (callback:((nodeId:string) => void)) => callBackWhenChanged.current = callback;

    const createActionButton = (schema:SchemaNodeInfo) => {
        if(nodesInfo.current[schema.node._key]) {
            updateActionButton(schema);
        } else {

            let wfSwitch:NodesInfoTypeDomEventSwitch|undefined;
            let wfPanel:NodesInfoTypeWorkflowPanel|undefined;

            if((projectRef.current.state.editedNodeConfig && schema.node._key === "0") || (!projectRef.current.state.editedNodeConfig && schema.node._key === "root")) {

                // Create DOM Event Switch Panel
                const switchContainer = createPanelContainer('-48px');
                const label = createLabel('Enable DOM Event', 'workflowModeSwitch');
                const { switchLabel, checkbox, slider, sliderBefore } = createSwitch(
                    'workflowModeSwitch',
                    schema.htmlRenderContext.htmlRender.isWorkflowMode()
                );

                checkbox.onclick = (e) => clickOnCheckbox(e, nodesInfo.current[schema.node._key], schema);

                switchContainer.appendChild(label);
                switchContainer.appendChild(switchLabel);
                schema.element.appendChild(switchContainer);

                wfSwitch = {
                    checkbox: checkbox,
                    container: switchContainer,
                    slider: slider,
                    sliderBefore: sliderBefore,
                };
            }

            if((!projectRef.current.state.editedNodeConfig && schema.node._key === "root")) {
                // Create Workflow State Panel
                const workflowPanel = createPanelContainer('-96px');
                const workflowLabel = createLabel('Workflow Active', 'workflowActiveSwitch');
                const workflowSwitchElements = createSwitch(
                    'workflowActiveSwitch',
                    workflowState.active
                );

                const executeButton = createButton('Reset');
                executeButton.onclick = (e) => {
                    e.stopPropagation();
                    console.log('Workflow executed!');
                    // Add your execution logic here
                };

                workflowSwitchElements.checkbox.onclick = (e) => {
                    e.stopPropagation();
                    const newActiveState = !workflowState.active;
                    setWorkflowState({ active: newActiveState });
                    workflowSwitchElements.checkbox.checked = newActiveState;
                    updateSwitchState(workflowSwitchElements.slider, workflowSwitchElements.sliderBefore, newActiveState);
                };

                workflowPanel.appendChild(workflowLabel);
                workflowPanel.appendChild(workflowSwitchElements.switchLabel);
                workflowPanel.appendChild(executeButton);
                schema.element.appendChild(workflowPanel);

                wfPanel = {
                    checkbox: workflowSwitchElements.checkbox,
                    container: workflowPanel,
                    slider: workflowSwitchElements.slider,
                    sliderBefore: workflowSwitchElements.sliderBefore,
                    button: executeButton,
                };
            }

            nodesInfo.current[schema.node._key] = {
                domEventSwitch: wfSwitch,
                workflowPanel: wfPanel
            }
        }
    }

    const updateActionButton = (schema:SchemaNodeInfo) => {
        const nodeInfo = nodesInfo.current[schema.node._key];
        if(nodeInfo) {
            // Update DOM Event Switch
            if(nodeInfo.domEventSwitch) {
                const isChecked = schema.htmlRenderContext.htmlRender.isWorkflowMode();
                updateSwitchState(nodeInfo.domEventSwitch.slider, nodeInfo.domEventSwitch.sliderBefore, isChecked);
            }

            // Update Workflow Panel Switch
            if(nodeInfo.workflowPanel) {
                updateSwitchState(nodeInfo.workflowPanel.slider, nodeInfo.workflowPanel.sliderBefore, workflowState.active);
            }
        }
    }

    const clickOnCheckbox = (e:MouseEvent, node:nodesInfoType, schema:SchemaNodeInfo) => {
        e.stopPropagation();
        const isChecked = !schema.htmlRenderContext.htmlRender.isWorkflowMode();
        node.domEventSwitch!.checkbox.checked = isChecked;
        updateSwitchState(node.domEventSwitch!.slider, node.domEventSwitch!.sliderBefore, isChecked);
        schema.htmlRenderContext.htmlRender.setWorkflowMode(isChecked).then((s) => {
            callBackWhenChanged.current?.(schema.node._key);
        })
    }

    const clearActionButton = (nodeId:string) => {
        const nodeInfo = nodesInfo.current[nodeId];
        if(nodeInfo) {
            nodeInfo.domEventSwitch?.container.remove();
            nodeInfo.workflowPanel?.container.remove();
            delete nodesInfo.current[nodeId];
        }
    }

    return {
        createActionButton,
        updateActionButton,
        clearActionButton,
        setCallBackWhenNodeChange,
        workflowState,
        setWorkflowState
    }
}