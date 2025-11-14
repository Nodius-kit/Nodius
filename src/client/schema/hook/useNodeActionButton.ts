import {useCallback, useRef} from "react";
import {SchemaNodeInfo} from "../SchemaDisplay";

interface nodesInfoType {
    workflowSwitch: {
        container: HTMLElement;
        checkbox: HTMLInputElement;
        slider: HTMLSpanElement;
        sliderBefore: HTMLSpanElement;
    }
}

export const useNodeActionButton = () => {

    const nodesInfo = useRef<Record<string, nodesInfoType>>({});

    const callBackWhenChanged = useRef<((nodeId:string) => void)>(undefined);

    const setCallBackWhenNodeChange = (callback:((nodeId:string) => void)) => callBackWhenChanged.current = callback;

    const createActionButton = (schema:SchemaNodeInfo) => {
        if(nodesInfo.current[schema.node._key]) {
            updateActionButton(schema);
        } else {
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
            label.textContent = 'Execute WorkFlow';
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
            switchContainer.appendChild(label);
            switchContainer.appendChild(switchLabel);
            schema.element.appendChild(switchContainer);
            nodesInfo.current[schema.node._key] = {
                workflowSwitch: {
                    checkbox: checkbox,
                    container: switchContainer,
                    slider: slider,
                    sliderBefore: sliderBefore,
                }
            }

            checkbox.onclick = (e) => clickOnCheckbox(e, nodesInfo.current[schema.node._key], schema);
        }
    }

    const updateActionButton = (schema:SchemaNodeInfo) => {
        const nodeInfo = nodesInfo.current[schema.node._key];
        if(nodeInfo) {
            nodeInfo.workflowSwitch.checkbox.checked = schema.htmlRenderContext.htmlRender.isWorkflowMode();
            nodeInfo.workflowSwitch.checkbox.onclick = (e) => clickOnCheckbox(e, nodeInfo, schema);
        }
    }

    const clickOnCheckbox = (e:MouseEvent, node:nodesInfoType, schema:SchemaNodeInfo) => {
        e.stopPropagation();
        const isChecked = !schema.htmlRenderContext.htmlRender.isWorkflowMode();
        node.workflowSwitch.checkbox.checked = isChecked;
        if (isChecked) {
            node.workflowSwitch.slider.style.backgroundColor = 'var(--nodius-success-main)';
            node.workflowSwitch.sliderBefore.style.transform = 'translateX(18px)';
        } else {
            node.workflowSwitch.slider.style.backgroundColor = 'var(--nodius-grey-600)';
            node.workflowSwitch.sliderBefore.style.transform = 'translateX(0)';
        }
        schema.htmlRenderContext.htmlRender.setWorkflowMode(isChecked).then((s) => {
            callBackWhenChanged.current?.(schema.node._key);
        })
    }

    const clearActionButton = (nodeId:string) => {
        const nodeInfo = nodesInfo.current[nodeId];
        if(nodeInfo) {
            nodeInfo.workflowSwitch.container.remove();
        }
    }

    return {
        createActionButton,
        updateActionButton,
        clearActionButton,
        setCallBackWhenNodeChange,
    }
}