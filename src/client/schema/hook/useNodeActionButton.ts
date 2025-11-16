import {useCallback, useRef, useState} from "react";
import {SchemaNodeInfo, WorkFlowState} from "../SchemaDisplay";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";

interface NodesInfoTypeDomEventSwitch {
    container: HTMLElement;
    checkbox: HTMLInputElement;
    slider: HTMLSpanElement;
    sliderBefore: HTMLSpanElement;
}

interface nodesInfoType {
    domEventSwitch?: NodesInfoTypeDomEventSwitch
}


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
            if((projectRef.current.state.editedNodeConfig && schema.node._key === "0") || (!projectRef.current.state.editedNodeConfig && schema.node._key === "root")) {

                const switchContainer = document.createElement('div');
                switchContainer.style.cssText = `
                    position: absolute;
                    top: -48px;
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

                const label = document.createElement('label');
                label.htmlFor = 'workflowModeSwitch';
                label.textContent = 'Enable DOM Event';
                label.style.cssText = `
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--nodius-text-primary);
                    cursor: pointer;
                    user-select: none;
                `;

                const switchLabel = document.createElement('label');
                switchLabel.style.cssText = `
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
                `;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'workflowModeSwitch';
                checkbox.checked = schema.htmlRenderContext.htmlRender.isWorkflowMode();


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
                    background-color: var(--nodius-grey-600);
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
                `;

                if (checkbox.checked) {
                    slider.style.backgroundColor = 'var(--nodius-success-main)';
                    sliderBefore.style.transform = 'translateX(18px)';
                } else {
                    slider.style.backgroundColor = 'var(--nodius-grey-600)';
                    sliderBefore.style.transform = 'translateX(0)';
                }

                slider.appendChild(sliderBefore);

                switchLabel.appendChild(checkbox);
                switchLabel.appendChild(slider);

                checkbox.onclick = (e) => clickOnCheckbox(e, nodesInfo.current[schema.node._key], schema);

                switchContainer.appendChild(label);
                switchContainer.appendChild(switchLabel);
                schema.element.appendChild(switchContainer);

                wfSwitch = {
                    checkbox: checkbox,
                    container: switchContainer,
                    slider: slider,
                    sliderBefore: sliderBefore,
                }
            }

            nodesInfo.current[schema.node._key] = {
                domEventSwitch: wfSwitch
            }
        }
    }

    const updateActionButton = (schema:SchemaNodeInfo) => {
        const nodeInfo = nodesInfo.current[schema.node._key];
        if(nodeInfo) {
            if(nodeInfo.domEventSwitch) {
                const isChecked = schema.htmlRenderContext.htmlRender.isWorkflowMode();
                if (isChecked) {
                    nodeInfo.domEventSwitch!.slider.style.backgroundColor = 'var(--nodius-success-main)';
                    nodeInfo.domEventSwitch!.sliderBefore.style.transform = 'translateX(18px)';
                } else {
                    nodeInfo.domEventSwitch!.slider.style.backgroundColor = 'var(--nodius-grey-600)';
                    nodeInfo.domEventSwitch!.sliderBefore.style.transform = 'translateX(0)';
                }
            }
        }
    }

    const clickOnCheckbox = (e:MouseEvent, node:nodesInfoType, schema:SchemaNodeInfo) => {
        e.stopPropagation();
        const isChecked = !schema.htmlRenderContext.htmlRender.isWorkflowMode();
        node.domEventSwitch!.checkbox.checked = isChecked;
        if (isChecked) {
            node.domEventSwitch!.slider.style.backgroundColor = 'var(--nodius-success-main)';
            node.domEventSwitch!.sliderBefore.style.transform = 'translateX(18px)';
        } else {
            node.domEventSwitch!.slider.style.backgroundColor = 'var(--nodius-grey-600)';
            node.domEventSwitch!.sliderBefore.style.transform = 'translateX(0)';
        }
        schema.htmlRenderContext.htmlRender.setWorkflowMode(isChecked).then((s) => {
            callBackWhenChanged.current?.(schema.node._key);
        })
    }

    const clearActionButton = (nodeId:string) => {
        const nodeInfo = nodesInfo.current[nodeId];
        if(nodeInfo) {
            nodeInfo.domEventSwitch?.container.remove();
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