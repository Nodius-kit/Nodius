import {createElement, useContext, useEffect, useRef} from "react";
import {useDynamicClass} from "../../hooks/useDynamicClass";
import {useStableProjectRef} from "../../hooks/useStableProjectRef";
import {ProjectContext} from "../../hooks/contexts/ProjectContext";

interface domEventSwitch {
    applyClass: HTMLElement[];
    checkbox: HTMLInputElement;
}

interface WorkflowDisplay {
    nodeId:string,
    container: HTMLElement;
    wfButton?: HTMLButtonElement;
    domEventSwitch?: domEventSwitch;
}

interface WorkflowCallback {
    start: () => void;
    stop: () => void;
}

interface useWorkflowActionRendererProps {
    workflowCallback:WorkflowCallback
}

export const useWorkflowActionRenderer = ({
    workflowCallback
}: useWorkflowActionRendererProps) => {

    const workflowDisplay = useRef<WorkflowDisplay[]>([]);

    const Project = useContext(ProjectContext);
    const projectRef = useStableProjectRef();

    const callback = useRef<WorkflowCallback>(undefined);

    useEffect(() => {
        callback.current = workflowCallback;
    }, [workflowCallback])

    const actionClass = useDynamicClass(`
        & {
            position: absolute;
            top: -46px;
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
        }
        & .switchLabel {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 22px;
        }
        & .label {
            font-size: 12px;
            font-weight: 600;
            color: var(--nodius-text-primary);
            cursor: pointer;
            user-select: none;
        }
        
        & input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        & .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--nodius-grey-600);
            transition: var(--nodius-transition-default);
            border-radius: 22px;
        }
        & .slider.checked {
            background-color: var(--nodius-success-main);
        }
        
        & .sliderBefore {
            position: absolute;
            content: '';
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: var(--nodius-transition-default);
            border-radius: 50%;
            transform: translateX(0);
        }
        & .sliderBefore.checked {
            transform: translateX(18px);
        }
        
        & button {
            padding: 4px 12px;
            background-color: var(--nodius-primary-main);
            color: var(--nodius-primary-contrastText);
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: var(--nodius-transition-default);
        }
        & button:hover {
            background-color: var(--nodius-primary-dark);
        }
        
        & .rotate {
        
        }
    
    `);

    useEffect(() => {
        updateWorkFlowButton();
    }, [Project.state.workFlowState]);

    const updateWorkFlowButton = () => {
        for(const display of workflowDisplay.current) {
            if (display.wfButton) {
                if (Project.state.workFlowState.active) {
                    if (Project.state.workFlowState.executing) {
                        display.wfButton.innerHTML = `
                            <div class="rotate">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            </div>
                        `;
                    } else {
                        display.wfButton.textContent = "Dispose";
                    }

                    display.wfButton.onclick = (e) => {
                        e.stopPropagation();
                        if (!callback.current) return;
                        callback.current.stop();
                    }
                } else {
                    display.wfButton.textContent = "Start WorkFlow";
                    display.wfButton.onclick = (e) => {
                        e.stopPropagation();
                        if (!callback.current) return;
                        callback.current.start();
                    }
                }
            }

            if (display.domEventSwitch) {
                if(getMainRenderOfNode(display.nodeId)?.htmlRender.isWorkflowMode()) {
                    for(const element of display.domEventSwitch.applyClass) {
                        if(!element.classList.contains("checked")) {
                            element.classList.add("checked");
                        }
                    }
                    display.domEventSwitch.checkbox.checked = true;
                } else {
                    for(const element of display.domEventSwitch.applyClass) {
                        if(element.classList.contains("checked")) {
                            element.classList.remove("checked");
                        }
                    }
                    display.domEventSwitch.checkbox.checked = false;
                }
                display.domEventSwitch.checkbox.onclick = (e) => {
                    const render = getMainRenderOfNode(display.nodeId);
                    if(!render) return;
                    render.htmlRender.setWorkflowMode(!render.htmlRender.isWorkflowMode());
                    updateWorkFlowButton();
                }
            }
        }

    }

    const getMainRenderOfNode = (nodeId:string) => {
        const display = workflowDisplay.current.find((c) => c.nodeId === nodeId);
        if(!display) return undefined;
        const renders = projectRef.current.state.getHtmlRenderOfNode(display.nodeId);
        const mainRender = renders.find((r) => r.renderId === "");
        return mainRender;
    }


    const renderWorkflowAction = (nodeKey:string, nodeContainer:HTMLElement) => {
        const container = document.createElement('div');
        container.className = actionClass;

        let domEventSwitch:domEventSwitch|undefined = undefined;

        if(projectRef.current.state.editedNodeConfig && nodeKey === "0") {

            const switchLabel = document.createElement("label");
            switchLabel.className = "switchLabel";

            const checkbox = document.createElement("input");
            checkbox.id = "workflow-checkbox-" + nodeKey;

            const slider = document.createElement("span");
            slider.className = "slider";

            const sliderBefore = document.createElement("span");
            sliderBefore.className = "sliderBefore";

            const label = document.createElement("label");
            label.className = "label";
            label.innerHTML = "DOM Event";
            label.htmlFor = checkbox.id;

            slider.appendChild(sliderBefore);
            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(slider);

            container.appendChild(label);
            container.appendChild(switchLabel);

            domEventSwitch = {
                applyClass: [slider, sliderBefore],
                checkbox: checkbox
            }
        }


        let wfButton: HTMLButtonElement|undefined = undefined;
        if(nodeKey === "root") {
            wfButton = document.createElement("button");
            container.appendChild(wfButton);


        }
        if(wfButton || domEventSwitch) {
            nodeContainer.appendChild(container);
            workflowDisplay.current.push({
                container: container,
                wfButton: wfButton,
                domEventSwitch: domEventSwitch,
                nodeId: nodeKey,
            });
        }
        updateWorkFlowButton();

    }

    const disposeWorkflowAction = (nodeId:string) => {
        const display = workflowDisplay.current.find((c) => c.nodeId === nodeId);
        if(!display) return;
        display.container.remove();
        workflowDisplay.current =  workflowDisplay.current.filter((c) => c.nodeId !== nodeId);
    }



    return {
        renderWorkflowAction,
        disposeWorkflowAction,
        updateWorkFlowButton
    }
}